#!/usr/bin/env node
/**
 * refresh-food-codes.mjs
 *
 * 每日由 GitHub Actions 執行：
 *   1. 讀取 src/data/food-codes.json（現有代碼）
 *   2. 爬 callingtaiwan.com.tw + Tavily 搜尋，找新的自動代碼
 *   3. 合併：保留現有 manual 代碼；新 auto 代碼去重後加入
 *   4. 寫回 src/data/food-codes.json
 *   GHA 判斷有差異才 commit + push，觸發 Vercel 自動部署
 *
 * 本機測試：
 *   TAVILY_API_KEY=tvly-xxx node scripts/refresh-food-codes.mjs
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_FILE = join(__dirname, '../src/data/food-codes.json')

const CALLING_TW_URL = 'https://www.callingtaiwan.com.tw/%e5%a4%96%e9%80%81%e5%84%aa%e6%83%a0%e7%b8%bd%e6%95%b4%e7%90%86-foodpanda-ubereats/'
const BRAND_BLOCKLIST = new Set([
  'IHERB', 'FOODPANDA', 'EXPEDIA', 'KLOOK', 'KKDAY', 'ASIAYO',
  'AGODA', 'BOOKING', 'AIRBNB', 'SHOPEE', 'MOMO', 'RAKUTEN',
  'PCHOME', 'CARREFOUR', 'UBEREATS', 'GRABFOOD',
])

async function scrapeCallingTW() {
  try {
    const res = await fetch(CALLING_TW_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TwoBearsBot/1.0)' },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return ''
    const html = await res.text()
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  } catch { return '' }
}

async function tavilySearch(apiKey, query) {
  if (!apiKey) return ''
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        max_results: 5,
        include_domains: ['facebook.com', 'ptt.cc', 'dcard.tw', 'callingtaiwan.com.tw'],
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return ''
    const data = await res.json()
    return (data.results ?? []).map(r => `${r.title ?? ''} ${r.content ?? ''}`).join('\n')
  } catch { return '' }
}

function findAutoCode(text, manualCodes) {
  const found = []
  const seen = new Set()

  for (const m of text.matchAll(/eats-[a-z0-9]{4,10}/gi)) {
    const c = m[0].toLowerCase()
    if (!seen.has(c) && !manualCodes.has(c)) {
      seen.add(c)
      found.push({ platform: 'ubereats', code: c, desc: '網路搜尋代碼，請確認有效性', general: true, source: 'auto' })
    }
  }
  for (const m of text.matchAll(/(?:代碼|折扣碼|優惠碼|promo[\s_-]?code)[：:\s「"]+([A-Za-z0-9_-]{5,14})/gi)) {
    const c = m[1].trim()
    if (/^(http|www|com)/i.test(c)) continue
    const cu = c.toUpperCase()
    if (BRAND_BLOCKLIST.has(cu)) continue
    if (!seen.has(cu) && !manualCodes.has(c.toLowerCase())) {
      seen.add(cu)
      const isPanda = /panda|fp/i.test(text.slice(Math.max(0, m.index - 100), m.index))
      found.push({ platform: isPanda ? 'foodpanda' : 'ubereats', code: cu, desc: '網路搜尋代碼，請確認有效性', general: true, source: 'auto' })
    }
  }
  for (const m of text.matchAll(/(?:點擊|複製|代碼|優惠碼|折扣碼)[：:\s「"(（]+([一-龥]{3,7})/g)) {
    const c = m[1].trim()
    if (!seen.has(c) && !manualCodes.has(c)) {
      seen.add(c)
      const isPanda = /panda|熊貓/i.test(text.slice(Math.max(0, m.index - 150), m.index))
      found.push({ platform: isPanda ? 'foodpanda' : 'ubereats', code: c, desc: '網路搜尋代碼，請確認有效性', general: true, source: 'auto' })
    }
  }
  return found.slice(0, 6)
}

async function main() {
  const existing = JSON.parse(readFileSync(DATA_FILE, 'utf-8'))
  const manualCodes = existing.codes.filter(c => c.source === 'manual')
  const manualKeys = new Set(manualCodes.map(c => c.code.toLowerCase()))

  const apiKey = process.env.TAVILY_API_KEY ?? ''
  const now = new Date()
  const monthLabel = `${now.getFullYear()} ${now.getMonth() + 1}月`

  console.log('📡 抓取代碼來源...')
  const [callingText, uberText, pandaText] = await Promise.all([
    scrapeCallingTW(),
    tavilySearch(apiKey, `UberEats 台灣 優惠代碼 ${monthLabel}`),
    tavilySearch(apiKey, `foodpanda 台灣 優惠代碼 ${monthLabel}`),
  ])

  const autoCodes = findAutoCode(callingText + '\n' + uberText + '\n' + pandaText, manualKeys)
  const deduped = autoCodes.filter(a => !manualKeys.has(a.code.toLowerCase()))
  console.log(`  找到 ${deduped.length} 個新自動代碼`)

  const updated = {
    codes: [...manualCodes, ...deduped],
    fetched: now.toISOString(),
    source: 'repo',
  }

  writeFileSync(DATA_FILE, JSON.stringify(updated, null, 2) + '\n', 'utf-8')
  console.log(`✅ 已更新 src/data/food-codes.json（共 ${updated.codes.length} 筆）`)
}

main().catch(e => { console.error('❌', e); process.exit(1) })
