export const prerender = false

import type { APIRoute } from 'astro'
import { load } from 'cheerio'

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
  'settour.com.tw':   'https://afflnk.site/track/clicks/4448/c627c2b6980327dbfe9cab248d2596412379128f78e9e2f00f76f6476a0449a8c23ae5a5112d',
  'klook.com':        'https://dreamstore.info/3RVzd',
  'kkday.com':        'https://twcouponcenter.com/track/clicks/2652/c627c2ba900820d9f19cab248d2596412379128f78efe0f10576f6476a0449a8c23ae5a5112d',
  'colatour.com.tw':  'https://vbshoptrax.com/track/clicks/9762/c627c2bc9b0523ddfb88ec23d62e994c21695b9633e0eff30162a44125095ff88635aca3163d8e',
  'liontravel.com':   'https://affclkr.online/track/clicks/7983/c627c2bc9b0523ddfb89ec23d62e994c21695b9633e0e1fd0f63a44125095ff88635aca3163d8e',
  'travel.rakuten':   'https://vbshoptrax.com/track/clicks/3786/c627c2bb910723d9f09cab248d2596412379128f78eee1fc0176f6476a0449a8c23ae5a5112d',
}

// 列表頁 URL（不做 ?t= 深層連結）
const CRUISE_LISTING_URLS = new Set([
  'https://tour.settour.com.tw/cruise.html',
  'https://www.colatour.com.tw/webDM/theme/promotion/sale.html',
  'https://travel.liontravel.com/category/zh-tw/cruise/index',
])

function affiliateFor(url: string): string {
  for (const [domain, aff] of Object.entries(AFFILIATE)) {
    if (url.includes(domain)) {
      // 支援 ?t= 深層連結（列表頁除外）
      if (aff.includes('/track/clicks/') && !CRUISE_LISTING_URLS.has(url)) {
        return aff + '?t=' + encodeURIComponent(encodeURIComponent(url))
      }
      return aff
    }
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

// ── Verified listing pages (2026-06) ─────────────────────────────────────────
// cheerio:true = structured Cheerio parsing; cheerio:false = Jina + Gemini
const LISTING_PAGES = [
  { name: '東南旅遊', url: 'https://tour.settour.com.tw/cruise.html',                               cheerio: true  },
  { name: '可樂旅遊', url: 'https://www.colatour.com.tw/webDM/theme/promotion/sale.html',           cheerio: true  },
  { name: '雄獅旅遊', url: 'https://search.liontravel.com/zh-tw/%E9%83%B5%E8%BC%AA?fr=ev16575C0101C0801M02', cheerio: false },
]

// Raw HTML fetch for Cheerio-parsed pages
async function fetchRawHTML(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; cruise-bot/1.0)' },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return ''
    return await res.text()
  } catch { return '' }
}

// Jina.ai for SPA pages (renders JavaScript)
async function fetchWithJina(url: string): Promise<string> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { 'Accept': 'text/plain', 'X-No-Cache': 'true', 'X-Timeout': '20' },
      signal: AbortSignal.timeout(25000),
    })
    if (!res.ok) return ''
    return (await res.text()).slice(0, 12000)
  } catch { return '' }
}

// ── Cheerio parser: 東南旅遊 (settour) ────────────────────────────────────────
// Structure: .col-card-50 → a.card-blue-border-box[href], h3.productTitle,
//            ul.productDate li (dates as "MM/DD"), .price small (duration), .price-num
function parseSettour(html: string, today: string): any[] {
  const $ = load(html)
  const currentYear = new Date(today).getFullYear()
  const todayDate = new Date(today)
  const deals: any[] = []

  $('.col-card-50').each((_, el) => {
    const href = $(el).find('a.card-blue-border-box').attr('href')
    if (!href) return

    const priceText = $(el).find('.price-num').text().trim()
    const priceMatch = priceText.match(/[\d,]+/)
    if (!priceMatch) return
    const current_price = parseInt(priceMatch[0].replace(/,/g, ''), 10)
    if (!current_price) return

    const titleText = $(el).find('h3.productTitle').text().trim()
    const durationText = $(el).find('.price small').text().trim()

    // Duration: "4天" → 3 nights
    const durationMatch = durationText.match(/(\d+)/)
    const duration_nights = durationMatch ? parseInt(durationMatch[1], 10) - 1 : 0

    // Ship name / cruise line from 【...】
    const shipMatch = titleText.match(/【([^】]+)】/)
    const shipFull = shipMatch ? shipMatch[1] : ''
    let ship_name = '', cruise_line = ''
    if (shipFull.includes('-')) {
      const dashIdx = shipFull.lastIndexOf('-')
      cruise_line = shipFull.slice(0, dashIdx).trim()
      ship_name = shipFull.slice(dashIdx + 1).trim()
    } else {
      ship_name = shipFull
    }

    // Destination: text after 】 up to verb/duration pattern
    const afterBracket = titleText.replace(/^【[^】]*】/, '').trim()
    const destMatch = afterBracket.match(/^(.+?)(?:自主遊|旅遊|行程|\d+[天日]|[一二三四五六七八九十]+[天日])/)
    const destination = destMatch
      ? destMatch[1].trim()
      : afterBracket.split('（')[0].trim().slice(0, 20)

    // Cabin type: first part of （內艙．二人一室）
    const cabinMatch = titleText.match(/（([^·‧.．）]+)/)
    const cabin_type = cabinMatch ? cabinMatch[1].trim() : '內艙'

    // Departure dates: li items matching MM/DD, infer year — one record per date
    const validDates = $(el).find('ul.productDate li')
      .toArray()
      .map(d => $(d).text().trim())
      .filter(d => /^\d{1,2}\/\d{1,2}$/.test(d))

    if (validDates.length === 0) return

    // GFG prefix = fly+cruise; infer embarkation port from title/notes
    const notesText = $(el).find('h5').text()
    const isFlyAndCruise = /GFG/i.test(href)
    let departure_port = '基隆'
    // 常駐基隆船班：即使是 GFG 連結也從基隆出發
    const isKeelungBased = /莎倫娜|榮耀號|MSC榮耀|麗星/.test(ship_name)
    if (isKeelungBased) {
      departure_port = '基隆'
    } else if (isFlyAndCruise) {
      const allText = titleText + ' ' + notesText
      if (/新加坡/.test(allText))         departure_port = '新加坡'
      else if (/香港/.test(allText))      departure_port = '香港'
      else if (/上海/.test(allText))      departure_port = '上海'
      else if (/天津/.test(allText))      departure_port = '天津'
      else if (/釜山/.test(allText))      departure_port = '釜山'
      else if (/橫濱|東京/.test(allText)) departure_port = '橫濱'
      else if (/高雄/.test(allText))      departure_port = '高雄'
      else                                departure_port = '飛航接駁'
    } else if (/高雄/.test(titleText + notesText)) {
      departure_port = '高雄'
    }

    for (const dateStr of validDates) {
      const [mm, dd] = dateStr.split('/').map(Number)
      const testDate = new Date(`${currentYear}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`)
      const year = testDate < todayDate ? currentYear + 1 : currentYear
      const departure_date = `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`

      const allText = titleText + ' ' + notesText
      deals.push({
        ship_name, cruise_line, destination,
        departure_port,
        departure_date,
        duration_nights,
        cabin_type,
        original_price: null,
        current_price,
        price_currency: 'TWD',
        source_url: href,
        notes: notesText.trim(),
        has_3rd_free:   /第三人免費|第3人免費|三人同行.*免費|三人.{0,5}免費/.test(allText),
        has_kids_free:  /兒童免費|小孩免費|孩童免費/.test(allText),
        has_obc:        /OBC|船上消費額度/.test(allText),
        is_repositioning: /移航/.test(allText),
        is_last_minute: /清倉|最後/.test(allText),
      })
    }
  })

  // Same ship + destination + departure_date → keep lowest price only
  const deduped = new Map<string, any>()
  for (const deal of deals) {
    const key = `${deal.ship_name}|${deal.destination}|${deal.departure_date}`
    const existing = deduped.get(key)
    if (!existing || deal.current_price < existing.current_price) {
      deduped.set(key, deal)
    }
  }
  return [...deduped.values()]
}

// ── Cheerio parser: 可樂旅遊 (colatour) ──────────────────────────────────────
// Structure: #cruise li → a[href], h3.list-name (span=port, em=promo), .list-price strong
// No departure dates on listing page — departure_date left empty (passes filter as null)
function parseColatour(html: string): any[] {
  const $ = load(html)
  const deals: any[] = []

  $('#cruise li').each((_, el) => {
    let href = $(el).find('a').attr('href') || ''
    if (!href) return
    if (href.startsWith('/')) href = 'https://www.colatour.com.tw' + href

    const priceText = $(el).find('.list-price strong').text().trim()
    const current_price = parseInt(priceText.replace(/,/g, ''), 10)
    if (!current_price) return

    const h3 = $(el).find('h3.list-name')
    const spanText = h3.find('span').text().trim()
    // span is sometimes a port ("基隆港出發") and sometimes a category ("地中海郵輪")
    const isPort = /出發|基隆|台北|高雄|台中|台南/.test(spanText)
    const departure_port = isPort
      ? spanText.replace(/出發$/, '').replace(/港$/, '').trim()
      : ''
    const notes = h3.find('em').text().trim()

    h3.find('span, em').remove()
    const mainTitle = h3.text().trim()

    const arrowIdx = mainTitle.indexOf('》')
    const shipPart = arrowIdx >= 0 ? mainTitle.slice(0, arrowIdx).trim() : ''
    const afterArrow = arrowIdx >= 0 ? mainTitle.slice(arrowIdx + 1) : mainTitle

    const destMatch = afterArrow.match(/^(.+?)(?:自主遊|旅遊|行程|\d+日|[一二三四五六七八九十]+日)/)
    const destination = destMatch ? destMatch[1].trim() : afterArrow.slice(0, 20).trim()

    const durationMatch = mainTitle.match(/(\d+)日/)
    const duration_nights = durationMatch ? parseInt(durationMatch[1], 10) - 1 : 0

    deals.push({
      ship_name: shipPart,
      cruise_line: '',
      destination,
      departure_port: departure_port || '基隆',
      departure_date: null,
      duration_nights,
      cabin_type: '內艙',
      original_price: null,
      current_price,
      price_currency: 'TWD',
      source_url: href,
      notes,
    })
  })

  return deals
}

// ── Gemini: parse Jina-rendered content (liontravel) ─────────────────────────
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

  const prompt = `以下是台灣郵輪旅行社網頁的真實抓取內容，今天是 ${today}。
請從中提取郵輪特賣資料。

${combined}

只輸出 JSON 陣列，不要其他文字，不要 markdown code block：
[{"ship_name":"","cruise_line":"","destination":"","departure_port":"","departure_date":"YYYY-MM-DD","duration_nights":0,"cabin_type":"內艙","original_price":null,"current_price":0,"price_currency":"TWD","source_url":"","notes":""}]

嚴格規則（違反規則寧可回傳空陣列）：
- current_price 必須是網頁文字中出現的確切數字，絕對不可以推算或估計
- departure_date 必須是網頁中明確出現的日期，晚於 ${today}；找不到明確日期就跳過這筆
- destination 必須是網頁中出現的文字，不能自己補
- 如果以上三個欄位有任何一個在網頁中找不到確切資料，直接跳過這筆，不要補填
- ship_name、cruise_line 找不到就填空字串，不要猜
- source_url 填該網頁的 URL
- 寧可回傳少幾筆真實資料，也不要回傳任何捏造的資料`

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

  // ── PRIMARY: Cheerio for SSR pages, Jina+Gemini for SPA pages ────────────
  try {
    debugUrls = LISTING_PAGES.map(p => p.url)

    const allParsed: any[] = []
    const geminiPages: { name: string, url: string, content: string }[] = []

    await Promise.all(LISTING_PAGES.map(async p => {
      if (p.cheerio) {
        const rawHtml = await fetchRawHTML(p.url)
        if (rawHtml.length > 500) {
          const deals = p.name === '東南旅遊'
            ? parseSettour(rawHtml, today)
            : parseColatour(rawHtml)
          allParsed.push(...deals)
        }
      } else {
        const content = await fetchWithJina(p.url)
        geminiPages.push({ name: p.name, url: p.url, content })
      }
    }))

    const fetchedForGemini = geminiPages.filter(p => p.content.length > 200)
    let geminiCount = 0
    if (fetchedForGemini.length > 0) {
      const key = shuffledKeys[Math.floor(Math.random() * shuffledKeys.length)]
      const geminiDeals = await parsePageContent(geminiPages, key, today)
      geminiCount = geminiDeals.length
      allParsed.push(...geminiDeals)
    }

    if (allParsed.length > 0) {
      parsed = allParsed
      source = 'scraped'
      debugModel = `cheerio+gemini-2.5-flash(${allParsed.length - geminiCount} cheerio, ${geminiCount} gemini)`
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
      days_until: d.departure_date
        ? Math.ceil((new Date(d.departure_date).getTime() - Date.now()) / 86400000)
        : null,
    }))
    .filter((d: any) => d.days_until === null || d.days_until > 0)

  return new Response(JSON.stringify({
    deals,
    searched: parsed.length,
    source,
    debug: { model: debugModel, urls: debugUrls },
  }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
