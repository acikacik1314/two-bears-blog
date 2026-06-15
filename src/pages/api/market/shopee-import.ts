export const prerender = false

import type { APIRoute } from 'astro'
import { supabaseAdmin } from '../../../lib/supabase'

function parseShopeeUrl(url: string): { shopid: string; itemid: string } | null {
  try {
    const u = new URL(url)
    // /product/SHOPID/ITEMID
    const prod = u.pathname.match(/\/product\/(\d+)\/(\d+)/)
    if (prod) return { shopid: prod[1], itemid: prod[2] }
    // /xxx-i.SHOPID.ITEMID or /xxx-i.SHOPID.ITEMID?...
    const i = u.pathname.match(/[.\-]i\.(\d+)\.(\d+)/)
    if (i) return { shopid: i[1], itemid: i[2] }
    // trailing numbers pattern
    const nums = u.pathname.match(/\.(\d{6,})\.(\d{8,})/)
    if (nums) return { shopid: nums[1], itemid: nums[2] }
  } catch {}
  return null
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

  // Fetch Shopee product API
  const apiUrl = `https://shopee.tw/api/v4/item/get?itemid=${ids.itemid}&shopid=${ids.shopid}`
  let product: any
  try {
    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://shopee.tw/',
        'Accept': 'application/json',
        'Accept-Language': 'zh-TW,zh;q=0.9',
        'x-shopee-language': 'zh-Hant',
        'x-sz-sdk-version': '1.5.2.7',
      },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) throw new Error(`蝦皮 API 回傳 ${res.status}`)
    const json = await res.json()
    product = json?.data
    if (!product?.name) throw new Error('找不到商品資料')
  } catch (e: any) {
    return new Response(JSON.stringify({ error: '無法取得蝦皮商品：' + e.message }), { status: 502 })
  }

  const name: string = product.name || '蝦皮商品'
  // Shopee stores price in units of 100000 (e.g. 29900000 = 299 TWD)
  const rawPrice = product.price_min ?? product.price ?? 0
  const price: number = Math.round(rawPrice / 100000)
  const description: string = (product.description || '').slice(0, 800)
  const imageHashes: string[] = (product.images || []).slice(0, 3)

  // Download images and re-upload to Supabase storage
  const imageUrls: string[] = []
  for (const hash of imageHashes) {
    try {
      const imgRes = await fetch(`https://cf.shopee.tw/file/${hash}`, {
        headers: { 'Referer': 'https://shopee.tw/' },
        signal: AbortSignal.timeout(10000),
      })
      if (!imgRes.ok) continue
      const contentType = imgRes.headers.get('content-type') || 'image/jpeg'
      const ext = contentType.includes('webp') ? 'webp' : 'jpg'
      const bytes = new Uint8Array(await imgRes.arrayBuffer())
      const fileName = `shopee/${ids.shopid}_${ids.itemid}_${hash.slice(0, 12)}.${ext}`
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

  return new Response(JSON.stringify({ name, price, description, imageUrls }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
