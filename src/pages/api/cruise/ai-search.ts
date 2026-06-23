export const prerender = false

import type { APIRoute } from 'astro'

function checkPin(req: Request): boolean {
  const pin = req.headers.get('x-admin-pin')
  const env = import.meta.env.CRUISE_ADMIN_PIN || process.env.CRUISE_ADMIN_PIN || ''
  return !!env && pin === env
}

function getTavilyKey(): string {
  const raw = import.meta.env.TAVILY_API_KEY || process.env.TAVILY_API_KEY || ''
  return raw
}

function getGeminiKeys(): string[] {
  const raw = import.meta.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEYS || '[]'
  try { return JSON.parse(raw) } catch { return [raw].filter(Boolean) }
}

const AFFILIATE: Record<string, string> = {
  'wingontravel.com': 'https://idragon.info/3RVzZ',
  'settour.com.tw':   'https://vbshoptrax.com/track/clicks/4448/c627c2b6980327dbfe9cab248d2596412379128f78e9e2f00f76f6476a0449a8c23ae5a5112d',
  'klook.com':        'https://dreamstore.info/3RVzd',
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
  return '其他'
}

const SEARCH_QUERIES = [
  'site:wingontravel.com 郵輪 2026 特賣優惠價格',
  'site:settour.com.tw 郵輪 2026 特賣優惠',
  'site:klook.com 郵輪 cruise 2026 優惠 香港 台灣',
]

async function tavilySearch(query: string, apiKey: string): Promise<any[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'advanced',
      max_results: 8,
      include_answer: false,
    }),
  })
  if (!res.ok) return []
  const data = await res.json()
  return data.results || []
}

async function geminiParse(text: string, keys: string[]): Promise<any[]> {
  const key = keys[Math.floor(Math.random() * keys.length)]
  const prompt = `
你是郵輪特賣資料解析器。從以下搜尋結果文字中，找出所有明確的郵輪特賣資訊。
每筆必須有：船名、目的地、出發日期（YYYY-MM-DD）、天數、現價（數字）、幣別。
缺少任何一項就跳過那筆。

輸出純 JSON 陣列，每筆格式：
{
  "ship_name": "海洋光譜號",
  "cruise_line": "Royal Caribbean",
  "destination": "日本沖繩",
  "departure_port": "基隆",
  "departure_date": "2026-08-15",
  "duration_nights": 5,
  "cabin_type": "內艙",
  "original_price": 45000,
  "current_price": 32000,
  "price_currency": "TWD",
  "source_url": "https://...",
  "notes": "含港口稅"
}

departure_port 沒提到就填「香港」（永安旅遊）或「基隆」（東南旅遊）。
cabin_type 沒提到就填「內艙」。
original_price 找不到就填 null。
只輸出 JSON，不要說明文字。

---搜尋結果---
${text}
`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 4096, temperature: 0.1, thinkingConfig: { thinkingBudget: 0 } },
      }),
    }
  )
  if (!res.ok) return []
  const data = await res.json()
  const raw = (data?.candidates?.[0]?.content?.parts ?? [])
    .filter((p: any) => !p.thought)
    .map((p: any) => p.text ?? '')
    .join('')
    .trim()

  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) return []
  try { return JSON.parse(match[0]) } catch { return [] }
}

export const POST: APIRoute = async ({ request }) => {
  if (!checkPin(request)) {
    return new Response(JSON.stringify({ error: '密碼錯誤' }), { status: 401 })
  }

  const tavilyKey = getTavilyKey()
  const geminiKeys = getGeminiKeys()

  if (!tavilyKey) return new Response(JSON.stringify({ error: 'Tavily key 未設定' }), { status: 500 })
  if (!geminiKeys.length) return new Response(JSON.stringify({ error: 'Gemini keys 未設定' }), { status: 500 })

  // Search all sources in parallel
  const allResults = await Promise.all(SEARCH_QUERIES.map(q => tavilySearch(q, tavilyKey)))

  // Combine and deduplicate by URL
  const seen = new Set<string>()
  const combined: any[] = []
  for (const batch of allResults) {
    for (const r of batch) {
      if (!seen.has(r.url)) {
        seen.add(r.url)
        combined.push(r)
      }
    }
  }

  if (!combined.length) {
    return new Response(JSON.stringify({ deals: [], message: '搜尋無結果，請稍後再試' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Build text for Gemini
  const text = combined.map(r =>
    `URL: ${r.url}\n標題: ${r.title}\n內容: ${r.content}`
  ).join('\n\n---\n\n')

  const parsed = await geminiParse(text, geminiKeys)

  // Enrich with affiliate URL and source label
  const deals = parsed
    .filter((d: any) => d.ship_name && d.destination && d.departure_date && d.current_price)
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
    .filter((d: any) => d.days_until > 0)  // skip past departures

  return new Response(JSON.stringify({ deals, searched: combined.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
