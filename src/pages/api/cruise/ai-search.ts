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
  if (url.includes('colatour'))   return '可樂旅遊'
  if (url.includes('liontravel')) return '雄獅旅遊'
  if (url.includes('rakuten'))   return '樂天旅遊'
  return '其他'
}

const SEARCH_QUERIES = [
  'site:wingontravel.com 郵輪 2026 特賣優惠價格',
  'site:settour.com.tw 郵輪 2026 特賣優惠',
  'site:klook.com 郵輪 cruise 2026 優惠 香港 台灣',
  'site:kkday.com 郵輪 cruise 2026 優惠',
  'site:colatour.com.tw 郵輪 2026 特賣優惠',
  'site:liontravel.com 郵輪 2026 特賣優惠',
  'site:travel.rakuten.com.tw 郵輪 2026 特賣優惠',
]

async function geminiDirectSearch(keys: string[]): Promise<{ results: any[], error?: string }> {
  const today = new Date().toISOString().split('T')[0]

  // Try keys until one works
  for (const key of [...keys].sort(() => Math.random() - 0.5)) {
    try {
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

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 8192, temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } },
          }),
        }
      )
      if (res.status === 429 || res.status === 503) continue
      if (!res.ok) continue

      const data = await res.json()
      const text = (data?.candidates?.[0]?.content?.parts ?? [])
        .filter((p: any) => !p.thought)
        .map((p: any) => p.text ?? '')
        .join('').trim()

      return { results: [{ url: 'gemini_direct', title: 'Gemini 知識庫', content: text }] }
    } catch { continue }
  }
  return { results: [], error: '所有 Gemini key 都失敗' }
}

async function geminiParseChunk(text: string, key: string): Promise<any[]> {
  const today = new Date().toISOString().split('T')[0]
  const prompt = `
你是郵輪特賣資料解析器。從以下搜尋結果文字中，盡力找出郵輪特賣資訊。

規則（寬鬆模式）：
- 必須有：目的地（destination）、現價（current_price，純數字）
- 可以猜或填預設值：
  - ship_name：找不到就填「未知船隻」
  - cruise_line：找不到就填「」（空字串）
  - departure_date：找不到就填「2026-12-31」
  - duration_nights：找不到就填 5
  - departure_port：永安/東南旅遊填「香港」，其他填「基隆」
  - cabin_type：找不到就填「內艙」
  - price_currency：看到 NT$/TWD/台幣填「TWD」，HKD/港幣填「HKD」，其他填「TWD」
  - original_price：找不到就填 null
- source_url 填該搜尋結果的 URL
- notes 填任何有用的補充（例如早鳥優惠、含稅等）

只要有目的地和現價就輸出那筆，不要跳過。
今天日期：${today}，出發日期必須在今天之後。

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

只輸出 JSON 陣列，不要任何說明文字，不要 markdown code block。

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
        generationConfig: { maxOutputTokens: 8192, temperature: 0.1, thinkingConfig: { thinkingBudget: 0 } },
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

  const trimmed = raw.trim()

  // Case 1: complete valid JSON array
  const arrMatch = trimmed.match(/\[[\s\S]*\]/)
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]) } catch {}
  }

  // Case 2: truncated array — find last complete object and close the array
  if (trimmed.startsWith('[')) {
    const lastBrace = trimmed.lastIndexOf('},')
    if (lastBrace > 0) {
      try { return JSON.parse(trimmed.slice(0, lastBrace + 1) + ']') } catch {}
    }
    const lastBrace2 = trimmed.lastIndexOf('}')
    if (lastBrace2 > 0) {
      try { return JSON.parse(trimmed.slice(0, lastBrace2 + 1) + ']') } catch {}
    }
  }

  return []
}

async function geminiParse(chunks: any[][], keys: string[]): Promise<{ deals: any[], raw: string }> {
  const allDeals: any[] = []
  const debugLines: string[] = []

  for (let i = 0; i < chunks.length; i++) {
    const key = keys[Math.floor(Math.random() * keys.length)]
    const chunkText = chunks[i].map(r =>
      `URL: ${r.url}\n標題: ${r.title}\n內容: ${r.content}`
    ).join('\n\n---\n\n')

    try {
      const deals = await geminiParseChunk(chunkText, key)
      allDeals.push(...deals)
      debugLines.push(`批次${i+1}: ${deals.length} 筆`)
    } catch (e: any) {
      debugLines.push(`批次${i+1}: 錯誤 ${e.message}`)
    }
  }

  return { deals: allDeals, raw: debugLines.join(', ') }
}

export const POST: APIRoute = async ({ request }) => {
  if (!checkPin(request)) {
    return new Response(JSON.stringify({ error: '密碼錯誤' }), { status: 401 })
  }

  const geminiKeys = getGeminiKeys()

  if (!geminiKeys.length) return new Response(JSON.stringify({ error: 'Gemini keys 未設定' }), { status: 500 })

  // Use Gemini knowledge directly — skip second parsing pass
  const { results: directResults, error: directError } = await geminiDirectSearch(geminiKeys)

  if (!directResults.length) {
    return new Response(JSON.stringify({
      deals: [],
      message: '搜尋無結果，請稍後再試',
      search_errors: directError ? [directError] : [],
    }), { headers: { 'Content-Type': 'application/json' } })
  }

  // The content IS already a JSON array from Gemini — parse it directly
  const rawContent = directResults[0]?.content || ''
  let parsed: any[] = []
  const today = new Date().toISOString().split('T')[0]

  const trimmed = rawContent.trim()
  const arrMatch = trimmed.match(/\[[\s\S]*\]/)
  if (arrMatch) {
    try { parsed = JSON.parse(arrMatch[0]) } catch {}
  }
  if (!parsed.length && trimmed.startsWith('[')) {
    const lb1 = trimmed.lastIndexOf('},')
    if (lb1 > 0) try { parsed = JSON.parse(trimmed.slice(0, lb1 + 1) + ']') } catch {}
    if (!parsed.length) {
      const lb2 = trimmed.lastIndexOf('}')
      if (lb2 > 0) try { parsed = JSON.parse(trimmed.slice(0, lb2 + 1) + ']') } catch {}
    }
  }

  const rawPreview = rawContent.slice(0, 400)
  const parseMethod = arrMatch ? 'full_match' : trimmed.startsWith('[') ? 'truncated_repair' : 'no_match'
  const geminiDebug = `直接解析: ${parsed.length} 筆 (${parseMethod}) rawLen=${rawContent.length}`

  // Enrich with affiliate URL and source label
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
    .filter((d: any) => d.days_until > 0)  // skip past departures

  return new Response(JSON.stringify({
    deals,
    searched: parsed.length,
    debug: { gemini: geminiDebug, raw_preview: rawPreview },
  }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
