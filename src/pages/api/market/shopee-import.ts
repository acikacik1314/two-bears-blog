export const prerender = false

import type { APIRoute } from 'astro'
import { supabaseAdmin } from '../../../lib/supabase'

function parseShopeeUrl(url: string): { shopid: string; itemid: string } | null {
  try {
    const u = new URL(url)
    // /product/SHOPID/ITEMID
    const prod = u.pathname.match(/\/product\/(\d+)\/(\d+)/)
    if (prod) return { shopid: prod[1], itemid: prod[2] }
    // /NAME-i.SHOPID.ITEMID
    const canon = u.pathname.match(/-i\.(\d+)\.(\d+)/)
    if (canon) return { shopid: canon[1], itemid: canon[2] }
    // .i.SHOPID.ITEMID or -i.SHOPID.ITEMID anywhere
    const alt = u.pathname.match(/[.\-]i\.(\d+)\.(\d+)/)
    if (alt) return { shopid: alt[1], itemid: alt[2] }
  } catch {}
  return null
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
}

// LINE/Facebook bot UA triggers Shopee's prerender service which returns full OG meta tags
const BOT_UA = 'Mozilla/5.0 (Linux; Android 11; Pixel 3 Build/RQ1A.201205.012; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/87.0.4280.141 Mobile Safari/537.36 Line/11.15.1'
const DL_UA  = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

async function scrapeShopeePrerender(shopid: string, itemid: string) {
  // Use short URL — prerender handles the redirect internally
  const pageUrl = `https://shopee.tw/product/${shopid}/${itemid}/`
  const res = await fetch(pageUrl, {
    redirect: 'follow',
    headers: {
      'User-Agent': BOT_UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-TW,zh;q=0.9',
    },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`頁面回傳 ${res.status}`)
  const html = await res.text()

  // Extract OG meta tags — Shopee's prerender fills these for social bots
  function ogMeta(prop: string): string {
    const m = html.match(new RegExp(`property="${prop}"\\s+content="([^"]*)"`, 'i'))
           || html.match(new RegExp(`content="([^"]*)"`+`\\s+property="${prop}"`, 'i'))
    return m ? decodeHtmlEntities(m[1]) : ''
  }

  const rawTitle = ogMeta('og:title')
  const rawDesc  = ogMeta('og:description')
  const imageUrl = ogMeta('og:image')

  const name = rawTitle.replace(/\s*\|\s*蝦皮購物.*$/, '').trim()
  const description = rawDesc.replace(/\s*購買\s+.+$/, '').trim()

  // Extract price: format is like "T-Shirt(淺藍):$1150" or "$299"
  let price = 0
  const priceMatch = rawDesc.match(/\$(\d[\d,]*)/)
  if (priceMatch) price = parseInt(priceMatch[1].replace(/,/g, ''))

  if (!name) throw new Error('無法提取商品名稱，請確認連結是否正確')

  return { name, price, description, imageUrl }
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

  let scraped: Awaited<ReturnType<typeof scrapeShopeePrerender>>
  try {
    scraped = await scrapeShopeePrerender(ids.shopid, ids.itemid)
  } catch (e: any) {
    return new Response(JSON.stringify({ error: '無法取得商品資料：' + e.message }), { status: 502 })
  }

  // Download main image and re-upload to Supabase
  const imageUrls: string[] = []
  if (scraped.imageUrl) {
    try {
      const imgRes = await fetch(scraped.imageUrl, {
        headers: { 'Referer': 'https://shopee.tw/', 'User-Agent': DL_UA },
        signal: AbortSignal.timeout(12000),
      })
      if (imgRes.ok) {
        const contentType = imgRes.headers.get('content-type') || 'image/jpeg'
        const ext = contentType.includes('webp') ? 'webp' : contentType.includes('png') ? 'png' : 'jpg'
        const bytes = new Uint8Array(await imgRes.arrayBuffer())
        const fileName = `shopee/${ids.shopid}_${ids.itemid}_0.${ext}`
        const { data, error } = await supabaseAdmin.storage
          .from('market-images')
          .upload(fileName, bytes, { contentType, upsert: true })
        if (!error) {
          const { data: urlData } = supabaseAdmin.storage.from('market-images').getPublicUrl(data.path)
          imageUrls.push(urlData.publicUrl)
        }
      }
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
