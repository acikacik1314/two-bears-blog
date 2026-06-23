export const prerender = false

import type { APIRoute } from 'astro'

function checkPin(req: Request): boolean {
  const pin = req.headers.get('x-admin-pin')
  const env = import.meta.env.CRUISE_ADMIN_PIN || process.env.CRUISE_ADMIN_PIN || ''
  return !!env && pin === env
}

function getAgnesKey(): string {
  const raw = import.meta.env.AGNES_API_KEYS || process.env.AGNES_API_KEYS || '[]'
  try {
    const keys: string[] = JSON.parse(raw)
    if (!keys.length) return ''
    return keys[Math.floor(Math.random() * keys.length)]
  } catch {
    return raw
  }
}

export const POST: APIRoute = async ({ request }) => {
  if (!checkPin(request)) {
    return new Response(JSON.stringify({ error: '密碼錯誤' }), { status: 401 })
  }

  const { ship_name, destination, duration_nights, current_price, discount_pct, cabin_type } =
    await request.json()

  const apiKey = getAgnesKey()
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Agnes API key 未設定' }), { status: 500 })
  }

  const discountText = discount_pct ? `限時折扣 ${discount_pct}% OFF` : '特惠價'
  const priceText = current_price
    ? `TWD ${Number(current_price).toLocaleString()}`
    : ''

  const prompt = `
Professional cruise travel poster, photorealistic style.
Cruise ship sailing near ${destination}, beautiful ocean scenery, golden hour lighting.
Chinese text overlay on image:
- Top left bold title: "${ship_name}"
- Center large: "${destination} ${duration_nights}晚"
- Bottom right price badge red color: "${priceText}"
- Bottom left badge orange color: "${discountText}"
Cabin type label: "${cabin_type}"
Clean magazine layout, vibrant colors, luxury travel feel.
16:9 aspect ratio, high quality.
`.trim()

  try {
    const res = await fetch('https://apihub.agnes-ai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'agnes-image-2.1-flash',
        prompt,
        n: 1,
        size: '1792x1024',
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      return new Response(JSON.stringify({ error: `Agnes API 錯誤: ${res.status}`, detail: err }), {
        status: 500,
      })
    }

    const data = await res.json()
    const imageUrl: string = data?.data?.[0]?.url || data?.data?.[0]?.b64_json || ''

    if (!imageUrl) {
      return new Response(JSON.stringify({ error: '圖片生成失敗，回傳格式異常', raw: data }), {
        status: 500,
      })
    }

    const isBase64 = !imageUrl.startsWith('http')
    return new Response(
      JSON.stringify({
        url: isBase64 ? `data:image/png;base64,${imageUrl}` : imageUrl,
        is_base64: isBase64,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 })
  }
}
