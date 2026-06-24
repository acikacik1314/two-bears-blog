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

// ── Step 1: Grounding → find real listing page URLs ──────────────────────────
async function findListingUrls(key: string): Promise<{ name: string, url: string }[]> {
  const prompt = `用 Google 搜尋以下台灣/香港郵輪旅行社，找出他們目前「郵輪特賣列表頁」的真實 URL（顯示多筆特賣的頁面，不是單一商品頁）：
永安旅遊(wingontravel.com)、東南旅遊(settour.com.tw)、可樂旅遊(colatour.com.tw)、雄獅旅遊(liontravel.com)、Klook(klook.com)郵輪、KKday(kkday.com)郵輪

只輸出 JSON 陣列，不要其他文字：
[{"name":"旅行社名稱","url":"https://...實際找到的網址"}]`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { maxOutputTokens: 1024, temperature: 0.1 },
      }),
    }
  )
  if (!res.ok) return []
  const data = await res.json()
  const text = (data?.candidates?.[0]?.content?.parts ?? [])
    .filter((p: any) => !p.thought)
    .map((p: any) => p.text ?? '')
    .join('').trim()

  try {
    const m = text.match(/\[[\s\S]*\]/)
    if (m) return JSON.parse(m[0])
  } catch {}
  return []
}

// ── Step 2: Jina.ai → render JS page → real content with prices ──────────────
async function fetchWithJina(url: string): Promise<string> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        'Accept': 'text/plain',
        'X-No-Cache': 'true',
        'X-Timeout': '20',
      },
      signal: AbortSignal.timeout(25000),
    })
    if (!res.ok) return ''
    const text = await res.text()
    return text.slice(0, 10000) // cap to avoid token overflow
  } catch { return '' }
}

// ── Step 3: Gemini → parse rendered page content → JSON ──────────────────────
async function parsePageContent(
  pages: { name: string, url: string, content: string }[],
  key: string,
  today: string
): Promise<any[]> {
  const combined = pages
    .filter(p => p.content.length > 200)
    .map(p => `=== ${p.name} (${p.url}) ===\n${p.content.slice(0, 3000)}`)
    .join('\n\n')

  if (!combined) return []

  const prompt = `以下是台灣/香港郵輪旅行社網頁的真實內容（已渲染 JavaScript），今天是 ${today}。
請從中找出所有郵輪特賣，出發日期必須在 ${today} 之後。

${combined}

只輸出 JSON 陣列，不要其他文字，不要 markdown code block：
[{"ship_name":"","cruise_line":"","destination":"","departure_port":"","departure_date":"YYYY-MM-DD","duration_nights":0,"cabin_type":"內艙","original_price":null,"current_price":0,"price_currency":"TWD","source_url":"找到這筆資料的實際頁面URL","notes":""}]

規則：
- current_price 必須是網頁上出現的真實數字
- source_url 填該旅行社的頁面 URL（非空）
- 出發日期必須晚於 ${today}，不確定就填 ${today.slice(0,7)}-28
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

// ── Fallback: knowledge-based (estimated, no real scraping) ──────────────────
const KNOWLEDGE_MODELS = [
  'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite',
]

async function knowledgeFallback(
  keys: string[], today: string
): Promise<{ parsed: any[], model: string } | null> {
  const shuffled = [...keys].sort(() => Math.random() - 0.5)
  const prompt = `今天是 ${today}。請列出以下台灣/香港郵輪旅行社目前的郵輪特賣，出發日期必須在 ${today} 之後：
- 永安旅遊 (wingontravel.com) — 香港出發
- 東南旅遊 (settour.com.tw) — 台灣出發
- 可樂旅遊 (colatour.com.tw) — 台灣出發
- 雄獅旅遊 (liontravel.com) — 台灣出發
- Klook (klook.com) — 郵輪行程
- KKday (kkday.com) — 郵輪行程

只輸出 JSON 陣列，不要 markdown code block：
[{"ship_name":"","cruise_line":"","destination":"","departure_port":"","departure_date":"YYYY-MM-DD","duration_nights":0,"cabin_type":"內艙","original_price":null,"current_price":0,"price_currency":"TWD","source_url":"","notes":""}]`

  for (const model of KNOWLEDGE_MODELS) {
    for (const key of shuffled) {
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
        if (parsed.length > 0) return { parsed, model }
      } catch { continue }
    }
  }
  return null
}

// ── Main ──────────────────────────────────────────────────────────────────────
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

  let parsed: any[] = []
  let source = 'knowledge'
  let debugModel = ''
  let debugUrls: string[] = []

  // ── PRIMARY: Grounding → Jina → Parse ──
  try {
    // 1. Find real listing URLs
    const pages = await findListingUrls(shuffledKeys[0])
    debugUrls = pages.map(p => p.url)

    if (pages.length > 0) {
      // 2. Fetch all pages with Jina.ai in parallel
      const fetched = await Promise.all(
        pages.map(async p => ({
          name: p.name,
          url: p.url,
          content: await fetchWithJina(p.url),
        }))
      )

      const fetchedCount = fetched.filter(p => p.content.length > 200).length

      if (fetchedCount > 0) {
        // 3. Parse real page content
        const key = shuffledKeys[Math.floor(Math.random() * shuffledKeys.length)]
        parsed = await parsePageContent(fetched, key, today)
        if (parsed.length > 0) {
          source = 'jina'
          debugModel = 'gemini-2.5-flash+jina'
        }
      }
    }
  } catch { /* fall through to knowledge fallback */ }

  // ── FALLBACK: knowledge-based ──
  if (parsed.length === 0) {
    const fb = await knowledgeFallback(geminiKeys, today)
    if (fb) {
      parsed = fb.parsed
      source = 'knowledge'
      debugModel = fb.model
    }
  }

  if (parsed.length === 0) {
    return new Response(JSON.stringify({
      deals: [], searched: 0,
      message: '搜尋無結果，請稍後再試',
    }), { headers: { 'Content-Type': 'application/json' } })
  }

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
    // 'jina' = real scraped data  'knowledge' = AI estimated
    source,
    debug: { model: debugModel, urls: debugUrls },
  }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
