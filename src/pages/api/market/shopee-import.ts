export const prerender = false

import type { APIRoute } from 'astro'
import { supabaseAdmin } from '../../../lib/supabase'

function parseShopeeUrl(url: string): { shopid: string; itemid: string } | null {
  try {
    const u = new URL(url)
    const prod = u.pathname.match(/\/product\/(\d+)\/(\d+)/)
    if (prod) return { shopid: prod[1], itemid: prod[2] }
    const i = u.pathname.match(/[.\-]i\.(\d+)\.(\d+)/)
    if (i) return { shopid: i[1], itemid: i[2] }
    const nums = u.pathname.match(/\.(\d{6,})\.(\d{8,})/)
    if (nums) return { shopid: nums[1], itemid: nums[2] }
  } catch {}
  return null
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

async function scrapeShopeeHtml(shopid: string, itemid: string) {
  const pageUrl = `https://shopee.tw/product/${shopid}/${itemid}/`
  const res = await fetch(pageUrl, {
    redirect: 'follow',
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8',
      'Cache-Control': 'no-cache',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Upgrade-Insecure-Requests': '1',
    },
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`頁面回傳 ${res.status}`)
  const html = await res.text()

  let name = '', description = '', price = 0
  const rawImageUrls: string[] = []

  // ── Strategy 1: JSON-LD structured data ────────────────────────
  const ldBlocks = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
  for (const match of ldBlocks) {
    try {
      const ld = JSON.parse(match[1].trim())
      const list: any[] = Array.isArray(ld) ? ld : [ld]
      for (const p of list) {
        if (p['@type'] !== 'Product') continue
        if (p.name) name = decodeHtmlEntities(String(p.name))
        if (p.description) description = decodeHtmlEntities(String(p.description)).slice(0, 800)
        const offer = Array.isArray(p.offers) ? p.offers[0] : p.offers
        if (offer?.price) price = Math.round(parseFloat(offer.price)) || 0
        const imgs: string[] = Array.isArray(p.image) ? p.image : (p.image ? [p.image] : [])
        for (const img of imgs) if (img && typeof img === 'string') rawImageUrls.push(img)
        if (name) break
      }
    } catch {}
    if (name) break
  }

  // ── Strategy 2: Next.js __NEXT_DATA__ ──────────────────────────
  if (!name || !price) {
    const nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
    if (nextMatch) {
      try {
        const nd = JSON.parse(nextMatch[1].trim())
        function findItem(obj: any, depth = 0): any {
          if (depth > 7 || !obj || typeof obj !== 'object' || Array.isArray(obj)) return null
          if (
            obj.name && typeof obj.name === 'string' && obj.name.length > 2 &&
            (obj.price !== undefined || obj.price_min !== undefined) &&
            (obj.images || obj.image)
          ) return obj
          for (const v of Object.values(obj)) {
            const found = findItem(v, depth + 1)
            if (found) return found
          }
          return null
        }
        const item = findItem(nd)
        if (item) {
          if (!name) name = String(item.name || '')
          if (!price) {
            const raw = item.price_min ?? item.price ?? 0
            price = Math.round((typeof raw === 'number' ? raw : parseFloat(raw)) / 100000)
          }
          if (!description) description = String(item.description || '').slice(0, 800)
          if (!rawImageUrls.length) {
            const hashes: string[] = item.images || (item.image ? [item.image] : [])
            for (const h of hashes.slice(0, 3)) rawImageUrls.push(`https://cf.shopee.tw/file/${h}`)
          }
        }
      } catch {}
    }
  }

  // ── Strategy 3: OG meta tags ────────────────────────────────────
  const ogTitle  = html.match(/<meta\s+(?:property|name)="og:title"\s+content="([^"]*)"/)
             || html.match(/<meta\s+content="([^"]*)"\s+(?:property|name)="og:title"/)
  const ogDesc   = html.match(/<meta\s+(?:property|name)="og:description"\s+content="([^"]*)"/)
             || html.match(/<meta\s+content="([^"]*)"\s+(?:property|name)="og:description"/)
  const ogImg    = html.match(/<meta\s+(?:property|name)="og:image"\s+content="([^"]*)"/)
             || html.match(/<meta\s+content="([^"]*)"\s+(?:property|name)="og:image"/)
  const ogPrice  = html.match(/<meta\s+(?:property|name)="og:price:amount"\s+content="([^"]*)"/)
             || html.match(/<meta\s+content="([^"]*)"\s+(?:property|name)="og:price:amount"/)

  if (!name && ogTitle)      name        = decodeHtmlEntities(ogTitle[1])
  if (!description && ogDesc) description = decodeHtmlEntities(ogDesc[1])
  if (!rawImageUrls.length && ogImg) rawImageUrls.push(ogImg[1])
  if (!price && ogPrice)     price       = Math.round(parseFloat(ogPrice[1])) || 0

  // ── Strategy 4: page <title> last resort ────────────────────────
  if (!name) {
    const t = html.match(/<title>([^<]+)<\/title>/)
    if (t) name = decodeHtmlEntities(t[1].replace(/\s*[|–—\-].*$/, '').trim())
  }

  if (!name) throw new Error('無法從頁面提取商品資料，請確認連結是否正確')

  return { name, price, description, rawImageUrls: rawImageUrls.slice(0, 3) }
}

export const POST: APIRoute = async ({ request }) => {
  let body: any
  try { body = await request.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  const { url } = body
  if (!url?.trim()) {
    return new Response(JSON.stringify({ error: '請提供蝦皮網址' }), { status: 400 })
  }

  const ids = parseShopeeUrl(url.trim())
  if (!ids) {
    return new Response(JSON.stringify({ error: '無法解析蝦皮網址，請確認格式正確' }), { status: 400 })
  }

  let scraped: Awaited<ReturnType<typeof scrapeShopeeHtml>>
  try {
    scraped = await scrapeShopeeHtml(ids.shopid, ids.itemid)
  } catch (e: any) {
    return new Response(JSON.stringify({ error: '無法取得蝦皮商品：' + e.message }), { status: 502 })
  }

  // Download images and re-upload to Supabase storage
  const imageUrls: string[] = []
  for (let i = 0; i < scraped.rawImageUrls.length; i++) {
    try {
      const imgRes = await fetch(scraped.rawImageUrls[i], {
        headers: { 'Referer': 'https://shopee.tw/', 'User-Agent': UA },
        signal: AbortSignal.timeout(10000),
      })
      if (!imgRes.ok) continue
      const contentType = imgRes.headers.get('content-type') || 'image/jpeg'
      const ext = contentType.includes('webp') ? 'webp' : contentType.includes('png') ? 'png' : 'jpg'
      const bytes = new Uint8Array(await imgRes.arrayBuffer())
      const fileName = `shopee/${ids.shopid}_${ids.itemid}_${i}.${ext}`
      const { data, error } = await supabaseAdmin.storage
        .from('market-images')
        .upload(fileName, bytes, { contentType, upsert: true })
      if (error) { console.error('shopee img upload:', error.message); continue }
      const { data: urlData } = supabaseAdmin.storage.from('market-images').getPublicUrl(data.path)
      imageUrls.push(urlData.publicUrl)
    } catch (e) {
      console.error('shopee img download:', e)
    }
  }

  return new Response(JSON.stringify({
    name: scraped.name,
    price: scraped.price,
    description: scraped.description,
    imageUrls,
  }), { headers: { 'Content-Type': 'application/json' } })
}
