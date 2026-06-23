export const prerender = false

import type { APIRoute } from 'astro'

function checkPin(req: Request): boolean {
  const pin = req.headers.get('x-admin-pin')
  const env = import.meta.env.CRUISE_ADMIN_PIN || process.env.CRUISE_ADMIN_PIN || ''
  return !!env && pin === env
}

function getGeminiKeys(): string[] {
  const raw = import.meta.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEYS || '[]'
  try { return JSON.parse(raw) } catch { return [raw].filter(Boolean) }
}

const AFFILIATE: Record<string, string> = {
  'wingontravel.com': 'https://idragon.info/3RVzZ',
  'settour.com.tw':   'https://vbshoptrax.com/track/clicks/4448/c627c2b6980327dbfe9cab248d2596412379128f78e9e2f00f76f6476a0449a8c23ae5a5112d',
  'klook.com':        'https://dreamstore.info/3RVzd',
  'kkday.com':        'https://twcouponcenter.com/track/clicks/2652/c627c2ba900820d9f19cab248d2596412379128f78efe0f10576f6476a0449a8c23ae5a5112d',
  'colatour.com.tw':  'https://vbtrax.com/track/clicks/9601/c627c2bc9b0523ddfb88ec23d62e994c21695b9633e0eff20761a44125095ff88635aca3163d8e',
  'liontravel.com':   'https://twshop4coupon.com/track/clicks/7983/c627c2bc9b0523ddfb89ec23d62e994c21695b9633e0e1fd0f63a44125095ff88635aca3163d8e',
  'travel.rakuten':   'https://vbshoptrax.com/track/clicks/3786/c627c2bb910723d9f09cab248d2596412379128f78eee1fc0176f6476a0449a8c23ae5a5112d',
}

function affiliateFor(url: string): string {
  for (const [domain, aff] of Object.entries(AFFILIATE)) {
    if (url.includes(domain)) return aff
  }
  return url
}

function sourceLabel(url: string): string {
  if (url.includes('wingontravel')) return '永安旅遊'
  if (url.includes('settour'))     return '東南旅遊'
  if (url.includes('klook'))       return 'Klook'
  if (url.includes('kkday'))       return 'KKday'
  if (url.includes('colatour'))    return '可樂旅遊'
  if (url.includes('liontravel'))  return '雄獅旅遊'
  if (url.includes('rakuten'))     return '樂天旅遊'
  return '其他'
}

// Extract JSON array from Gemini output — handles markdown fences and truncation
function tryParseDealsJson(text: string): any[] {
  const trimmed = text.trim()

  // Try to find a complete [...] array anywhere in the text (handles markdown fences)
  const arrMatch = trimmed.match(/\[[\s\S]*\]/)
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]) } catch {}
  }

  // Truncation repair: find where the array starts, then find last complete object
  const arrayStart = trimmed.indexOf('[')
  if (arrayStart >= 0) {
    const slice = trimmed.slice(arrayStart)
    const lb1 = slice.lastIndexOf('},')
    if (lb1 > 0) {
      try { return JSON.parse(slice.slice(0, lb1 + 1) + ']') } catch {}
    }
    const lb2 = slice.lastIndexOf('}')
    if (lb2 > 0) {
      try { return JSON.parse(slice.slice(0, lb2 + 1) + ']') } catch {}
    }
  }

  return []
}

const MODELS = [
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
]

async function geminiDirectSearch(
  keys: string[]
): Promise<{ content: string, model: string, parsed: any[] } | null> {
  const today = new Date().toISOString().split('T')[0]
  const shuffledKeys = [...keys].sort(() => Math.random() - 0.5)

  const prompt = `今天是 ${today}。請列出以下台灣/香港郵輪旅行社目前的郵輪特賣，出發日期必須在 ${today} 之後，盡量多列：
- 永安旅遊 (wingontravel.com) — 香港出發
- 東南旅遊 (settour.com.tw) — 台灣出發
- 可樂旅遊 (colatour.com.tw) — 台灣出發
- 雄獅旅遊 (liontravel.com) — 台灣出發
- Klook (klook.com) — 郵輪行程
- KKday (kkday.com) — 郵輪行程

每筆輸出格式（純 JSON 陣列，不要其他文字，不要 markdown code block）：
[{"ship_name":"船名","cruise_line":"郵輪公司","destination":"目的地","departure_port":"出發港口","departure_date":"YYYY-MM-DD","duration_nights":天數,"cabin_type":"內艙","original_price":原價或null,"current_price":現價,"price_currency":"TWD或HKD","source_url":"旅行社官網URL","notes":"備註"}]

出發日期必須晚於 ${today}。如果不確定具體日期，填 ${today.slice(0,7)}-28 或更晚。只輸出 JSON 陣列。`

  for (const model of MODELS) {
    for (const key of shuffledKeys) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 8192, temperature: 0.2 },
            }),
          }
        )
        if (res.status === 429 || res.status === 503) continue  // rate limited → try next key
        if (res.status === 404) break                           // model not found → try next model
        if (!res.ok) continue

        const data = await res.json()
        const text = (data?.candidates?.[0]?.content?.parts ?? [])
          .filter((p: any) => !p.thought)
          .map((p: any) => p.text ?? '')
          .join('').trim()

        // Only return if we can actually parse JSON from this response
        const parsed = tryParseDealsJson(text)
        if (parsed.length > 0) {
          return { content: text, model, parsed }
        }
        // Unparseable response — try next key/model
      } catch { continue }
    }
  }
  return null
}

export const POST: APIRoute = async ({ request }) => {
  if (!checkPin(request)) {
    return new Response(JSON.stringify({ error: '密碼錯誤' }), { status: 401 })
  }

  const geminiKeys = getGeminiKeys()
  if (!geminiKeys.length) {
    return new Response(JSON.stringify({ error: 'Gemini keys 未設定' }), { status: 500 })
  }

  const result = await geminiDirectSearch(geminiKeys)

  if (!result) {
    return new Response(JSON.stringify({
      deals: [],
      searched: 0,
      message: '搜尋無結果，所有 Gemini 模型均無法解析，請稍後再試',
    }), { headers: { 'Content-Type': 'application/json' } })
  }

  const { content, model, parsed } = result

  const deals = parsed
    .filter((d: any) => d.destination && d.current_price && Number(d.current_price) > 0)
    .map((d: any) => ({
      ...d,
      affiliate_url: affiliateFor(d.source_url || ''),
      source: sourceLabel(d.source_url || ''),
      discount_pct: d.original_price
        ? Math.round((1 - d.current_price / d.original_price) * 100)
        : null,
      days_until: Math.ceil(
        (new Date(d.departure_date).getTime() - Date.now()) / 86400000
      ),
    }))
    .filter((d: any) => d.days_until > 0)

  return new Response(JSON.stringify({
    deals,
    searched: parsed.length,
    debug: { model, raw_preview: content.slice(0, 400) },
  }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
