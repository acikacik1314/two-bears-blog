export const prerender = false

import type { APIRoute } from 'astro'
import { supabaseAdmin } from '../../../lib/supabase'
import { getGeminiKeys } from '../../../utils/gemini'

interface ParsedUrl {
  shopid: string
  itemid: string
  productName?: string   // decoded from canonical URL path
  canonicalUrl?: string  // full URL without query params
}

function parseShopeeUrl(url: string): ParsedUrl | null {
  try {
    const u = new URL(url)

    // Canonical: /NAME-i.SHOPID.ITEMID  (e.g. /喬8熊T-i.4839646.5106141952)
    const canon = u.pathname.match(/\/(.+)-i\.(\d+)\.(\d+)$/)
    if (canon) {
      let productName = ''
      try { productName = decodeURIComponent(canon[1]).replace(/-+/g, ' ').trim() } catch {}
      return {
        shopid: canon[2],
        itemid: canon[3],
        productName,
        canonicalUrl: `https://shopee.tw${u.pathname}`,
      }
    }

    // Short: /product/SHOPID/ITEMID
    const prod = u.pathname.match(/\/product\/(\d+)\/(\d+)/)
    if (prod) return { shopid: prod[1], itemid: prod[2] }

    // Alternate: .i.SHOPID.ITEMID or -i.SHOPID.ITEMID anywhere
    const alt = u.pathname.match(/[.\-]i\.(\d+)\.(\d+)/)
    if (alt) return { shopid: alt[1], itemid: alt[2] }

    const nums = u.pathname.match(/\.(\d{6,})\.(\d{8,})/)
    if (nums) return { shopid: nums[1], itemid: nums[2] }
  } catch {}
  return null
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

async function extractProductViaGemini(parsed: ParsedUrl) {
  const keys = getGeminiKeys()
  if (!keys.length) throw new Error('No Gemini API keys')

  // Build the most targeted possible search query
  let searchHint: string
  if (parsed.canonicalUrl) {
    // Canonical URL is indexed by Google — search for it directly
    searchHint = `請搜尋此蝦皮商品頁面並提取資訊：${parsed.canonicalUrl}`
  } else if (parsed.productName) {
    searchHint = `請在 Google 搜尋「site:shopee.tw ${parsed.productName}」並提取商品資訊`
  } else {
    // Only IDs available — search by Shopee canonical ID pattern
    searchHint = `請在 Google 搜尋「site:shopee.tw "i.${parsed.shopid}.${parsed.itemid}"」並提取商品資訊`
  }

  const prompt = `${searchHint}

商品 Shop ID：${parsed.shopid}，Item ID：${parsed.itemid}
${parsed.productName ? `商品名稱線索：${parsed.productName}` : ''}

找到後只回傳以下 JSON，不要其他文字：
{"name":"完整商品名稱","price":台幣售價整數,"description":"商品說明100字內","image_url":"商品主圖完整URL或空字串"}`

  const shuffled = [...keys].sort(() => Math.random() - 0.5)

  for (const key of shuffled) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tools: [{ google_search: {} }],
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 512,
            },
          }),
          signal: AbortSignal.timeout(30000),
        }
      )
      if (res.status === 429 || res.status === 503 || res.status === 401 || res.status === 403) continue
      if (!res.ok) continue

      const data = await res.json()
      const parts = (data?.candidates?.[0]?.content?.parts ?? []).filter((p: any) => !p.thought)
      const text = parts.map((p: any) => p.text ?? '').join('').trim()

      const jsonMatch = text.match(/\{[\s\S]*?\}/)
      if (!jsonMatch) continue
      const parsed2 = JSON.parse(jsonMatch[0])
      // Accept even if we only got a name with no price (price=0 is OK as fallback)
      if (!parsed2.name || String(parsed2.name).trim().length < 2) continue

      return {
        name: String(parsed2.name).trim(),
        price: Math.round(Number(parsed2.price) || 0),
        description: String(parsed2.description || '').slice(0, 800),
        imageUrl: String(parsed2.image_url || ''),
      }
    } catch (e) {
      console.error('Gemini shopee extract key error:', (e as Error).message)
    }
  }

  // If Gemini completely fails but we have the product name from URL, use it
  if (parsed.productName) {
    return {
      name: parsed.productName,
      price: 0,
      description: '',
      imageUrl: '',
    }
  }

  throw new Error('AI 無法找到此商品資訊，請貼上從瀏覽器複製的完整蝦皮商品連結（含商品名稱的那種）')
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

  const parsed = parseShopeeUrl(url.trim())
  if (!parsed) {
    return new Response(JSON.stringify({ error: '無法解析蝦皮網址，請確認格式正確' }), { status: 400 })
  }

  let product: Awaited<ReturnType<typeof extractProductViaGemini>>
  try {
    product = await extractProductViaGemini(parsed)
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 502 })
  }

  // Try to download and re-upload the main image
  const imageUrls: string[] = []
  if (product.imageUrl) {
    try {
      const imgRes = await fetch(product.imageUrl, {
        headers: { 'Referer': 'https://shopee.tw/', 'User-Agent': UA },
        signal: AbortSignal.timeout(12000),
      })
      if (imgRes.ok) {
        const contentType = imgRes.headers.get('content-type') || 'image/jpeg'
        const ext = contentType.includes('webp') ? 'webp' : contentType.includes('png') ? 'png' : 'jpg'
        const bytes = new Uint8Array(await imgRes.arrayBuffer())
        const fileName = `shopee/${parsed.shopid}_${parsed.itemid}_0.${ext}`
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
    name: product.name,
    price: product.price,
    description: product.description,
    imageUrls,
  }), { headers: { 'Content-Type': 'application/json' } })
}
