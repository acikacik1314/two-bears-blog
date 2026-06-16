export const prerender = false

import type { APIRoute } from 'astro'
import { supabaseAdmin } from '../../../lib/supabase'
import { getGeminiKeys } from '../../../utils/gemini'

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

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

async function extractProductViaGemini(shopid: string, itemid: string) {
  const keys = getGeminiKeys()
  if (!keys.length) throw new Error('No Gemini API keys')

  const shopeeUrl = `https://shopee.tw/product/${shopid}/${itemid}/`
  const prompt = `請用 Google 搜尋這個蝦皮商品頁面並提取商品資訊：${shopeeUrl}

只回傳以下 JSON，不要有任何其他文字或說明：
{"name":"商品完整名稱","price":定價整數（台幣數字，不含符號）,"description":"商品說明100字以內","image_url":"商品主圖完整URL或空字串"}`

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
              thinkingConfig: { thinkingBudget: 0 },
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

      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) continue
      const parsed = JSON.parse(jsonMatch[0])
      if (!parsed.name) continue

      return {
        name: String(parsed.name || ''),
        price: Math.round(Number(parsed.price) || 0),
        description: String(parsed.description || '').slice(0, 800),
        imageUrl: String(parsed.image_url || ''),
      }
    } catch (e) {
      console.error('Gemini shopee extract error:', e)
    }
  }
  throw new Error('AI 無法找到此商品資訊，請確認連結是否正確')
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

  let product: Awaited<ReturnType<typeof extractProductViaGemini>>
  try {
    product = await extractProductViaGemini(ids.shopid, ids.itemid)
  } catch (e: any) {
    return new Response(JSON.stringify({ error: '無法取得商品資料：' + e.message }), { status: 502 })
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
    name: product.name,
    price: product.price,
    description: product.description,
    imageUrls,
  }), { headers: { 'Content-Type': 'application/json' } })
}
