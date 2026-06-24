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

function tryParseDealsJson(text: string): any[] {
  const trimmed = text.trim()
  const arrMatch = trimmed.match(/\[[\s\S]*\]/)
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]) } catch {}
  }
  const arrayStart = trimmed.indexOf('[')
  if (arrayStart >= 0) {
    const slice = trimmed.slice(arrayStart)
    const lb1 = slice.lastIndexOf('},')
    if (lb1 > 0) { try { return JSON.parse(slice.slice(0, lb1 + 1) + ']') } catch {} }
    const lb2 = slice.lastIndexOf('}')
    if (lb2 > 0) { try { return JSON.parse(slice.slice(0, lb2 + 1) + ']') } catch {} }
  }
  return []
}

type SearchResult = { content: string, model: string, parsed: any[], source: 'grounding' | 'knowledge' }

// Step 1 of grounding: search + summarise (returns plain text, not JSON)
async function geminiGroundedText(key: string, today: string): Promise<string> {
  const prompt = `今天是 ${today}。請用 Google 搜尋以下台灣/香港郵輪旅行社，找出他們目前在賣的 ${today} 之後出發的郵輪特賣，並列出每筆優惠的詳細資訊：
- 永安旅遊 wingontravel.com（香港出發）
- 東南旅遊 settour.com.tw（台灣出發）
- 可樂旅遊 colatour.com.tw（台灣出發）
- 雄獅旅遊 liontravel.com（台灣出發）
- Klook klook.com 郵輪
- KKday kkday.com 郵輪

每筆請列出：船名、郵輪公司、目的地、出發港口、出發日期、幾晚、艙型、原價、現價、幣別、旅行社官網連結、備註。`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { maxOutputTokens: 4096, temperature: 0.1 },
      }),
    }
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return (data?.candidates?.[0]?.content?.parts ?? [])
    .filter((p: any) => !p.thought)
    .map((p: any) => p.text ?? '')
    .join('').trim()
}

// Step 2 of grounding: convert the text summary to JSON
async function geminiTextToJson(text: string, key: string, today: string): Promise<any[]> {
  const prompt = `把下面的郵輪特賣資訊轉成 JSON 陣列，只輸出 JSON，不要其他文字：

${text}

每筆格式：
{"ship_name":"","cruise_line":"","destination":"","departure_port":"","departure_date":"YYYY-MM-DD","duration_nights":0,"cabin_type":"內艙","original_price":null,"current_price":0,"price_currency":"TWD","source_url":"","notes":""}

規則：
- 出發日期必須在 ${today} 之後，不確定就填 ${today.slice(0,7)}-28
- 找不到的欄位填合理預設值（departure_port 永安填"香港"，其他填"基隆"）
- 只輸出 JSON 陣列`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 8192, temperature: 0.1 },
      }),
    }
  )
  if (!res.ok) return []
  const data = await res.json()
  const raw = (data?.candidates?.[0]?.content?.parts ?? [])
    .filter((p: any) => !p.thought)
    .map((p: any) => p.text ?? '')
    .join('').trim()
  return tryParseDealsJson(raw)
}

// Fallback: knowledge-based (no real search, estimated data)
const KNOWLEDGE_MODELS = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite']

async function geminiKnowledgeSearch(keys: string[], today: string): Promise<SearchResult | null> {
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

  for (const model of KNOWLEDGE_MODELS) {
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
        if (res.status === 429 || res.status === 503) continue
        if (res.status === 404) break
        if (!res.ok) continue
        const data = await res.json()
        const text = (data?.candidates?.[0]?.content?.parts ?? [])
          .filter((p: any) => !p.thought)
          .map((p: any) => p.text ?? '')
          .join('').trim()
        const parsed = tryParseDealsJson(text)
        if (parsed.length > 0) return { content: text, model, parsed, source: 'knowledge' }
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

  const today = new Date().toISOString().split('T')[0]
  const shuffledKeys = [...geminiKeys].sort(() => Math.random() - 0.5)

  let result: SearchResult | null = null

  // ── Try Google Search grounding first (real web data) ──
  for (const key of shuffledKeys) {
    try {
      const groundedText = await geminiGroundedText(key, today)
      if (!groundedText) continue
      const parsed = await geminiTextToJson(groundedText, key, today)
      if (parsed.length > 0) {
        result = { content: groundedText, model: 'gemini-2.5-flash+grounding', parsed, source: 'grounding' }
        break
      }
    } catch { continue }
  }

  // ── Fallback to knowledge if grounding failed ──
  if (!result) {
    result = await geminiKnowledgeSearch(geminiKeys, today)
  }

  if (!result) {
    return new Response(JSON.stringify({
      deals: [], searched: 0,
      message: '搜尋無結果，請稍後再試',
    }), { headers: { 'Content-Type': 'application/json' } })
  }

  const { content, model, parsed, source } = result

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
    source,   // 'grounding' = 真實網路資料, 'knowledge' = AI 推估
    debug: { model, raw_preview: content.slice(0, 500) },
  }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
