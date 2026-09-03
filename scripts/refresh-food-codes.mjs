#!/usr/bin/env node
/**
 * refresh-food-codes.mjs
 *
 * GitHub Actions が毎日 02:00 台灣時間（UTC 18:00）に実行。
 * callingtaiwan.com.tw の HTML テーブルを cheerio で解析し、
 * src/data/food-codes.json を { ubereats, foodpanda } × { new, existing } 構造で更新。
 *
 * 防護：
 *   - Uber Eats または foodpanda が 0 筆 → 既存 JSON を上書きせず exit 1
 *     （GitHub が失敗メールを送信する）
 *   - coupf.com やその他外部リンクは一切保存しない
 *
 * 本機テスト：
 *   node scripts/refresh-food-codes.mjs
 */

import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as cheerio from 'cheerio'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_FILE = join(__dirname, '../src/data/food-codes.json')

const CALLING_TW_URL =
  'https://www.callingtaiwan.com.tw/%e5%a4%96%e9%80%81%e5%84%aa%e6%83%a0%e7%b8%bd%e6%95%b4%e7%90%86-foodpanda-ubereats/'

// ── 日付パーサー ──────────────────────────────────────────────────────────────
function parseExpiry(raw) {
  if (!raw) return undefined
  const s = raw.trim()
  if (!s || s === '-' || s === '—') return undefined
  if (/兌完|用完|完為止/.test(s)) return undefined
  if (/輸入後.*天/.test(s)) return undefined

  // 範囲 2026/09/04-2026/09/17 → 末尾を採用
  const range = s.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\s*[~～\-]+\s*(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/)
  if (range) {
    return `${range[4]}-${range[5].padStart(2,'0')}-${range[6].padStart(2,'0')}`
  }

  // 単一日付
  const single = s.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/)
  if (single) {
    return `${single[1]}-${single[2].padStart(2,'0')}-${single[3].padStart(2,'0')}`
  }

  return undefined
}

// ── コードの有効性チェック ──────────────────────────────────────────────────
function isValidCode(raw) {
  if (!raw) return false
  const s = raw.trim()
  if (!s || s.length > 30 || s.length < 2) return false
  if (/前往|訂餐|>>|點擊|http|www\./i.test(s)) return false
  return true
}

// ── テーブル行のパース ────────────────────────────────────────────────────────
// 三欄: 有效期限 | 優惠內容 | 優惠碼
// 二欄: 優惠內容 | 優惠碼
function parseTable($, table) {
  const entries = []
  $(table).find('tr').each((_, row) => {
    const cells = $(row).find('td')
    if (cells.length < 2) return

    let expiry, descRaw, codeRaw

    if (cells.length >= 3) {
      expiry  = $(cells[0]).text().trim()
      descRaw = $(cells[1]).text().trim()
      codeRaw = $(cells[2]).text().trim()
    } else {
      expiry  = ''
      descRaw = $(cells[0]).text().trim()
      codeRaw = $(cells[1]).text().trim()
    }

    // coupf.com リンクのテキストを使ってもリンク自体は捨てる → text() で済む
    codeRaw = codeRaw.replace(/\s+/g, ' ').trim()
    descRaw = descRaw.replace(/\s+/g, ' ').trim()

    if (!isValidCode(codeRaw)) return
    if (!descRaw || descRaw.length < 3) return

    const entry = { code: codeRaw, desc: descRaw }
    const expires = parseExpiry(expiry)
    if (expires) entry.expires = expires

    entries.push(entry)
  })
  return entries
}

// ── 見出しテキストのカテゴリ判定 ────────────────────────────────────────────
function isNewCustomer(text) {
  return /新[用戶顧客戶]|首[次筆單]|new[\s_-]?user|first/i.test(text)
}
function isExistingCustomer(text) {
  return /老[顧客用戶]|舊[用戶顧客]|回[饋頭]|existing|returning|回頭客/i.test(text)
}

const SKIP_RE = /foodomo|蝦皮|deliveroo|shopee|grabfood/i

/**
 * cheerio 上で platformKeywords に一致するセクションを探し、
 * new / existing カテゴリ別にコードを返す。
 */
function extractPlatformCodes($, platformKeywords) {
  const result = { new: [], existing: [] }

  let inPlatform = false
  let currentCat = 'existing'

  // h2〜h5 を順に走査
  $('h2, h3, h4, h5').each((_, el) => {
    const text = $(el).text().toLowerCase()
    const tag  = el.tagName.toLowerCase()

    const isPlatform = platformKeywords.some(kw => text.includes(kw))
    const isSkip     = SKIP_RE.test($(el).text())

    // 別プラットフォームの h2/h3 に来たら終了
    if (inPlatform && !isPlatform && isSkip && (tag === 'h2' || tag === 'h3')) {
      return false // cheerio の .each を中断
    }

    if (isPlatform) {
      inPlatform = true
      currentCat = 'existing'
      return
    }

    if (!inPlatform) return

    // サブ見出しでカテゴリ更新
    if (/h[2-5]/.test(tag)) {
      const rawText = $(el).text()
      if (isNewCustomer(rawText))      currentCat = 'new'
      else if (isExistingCustomer(rawText)) currentCat = 'existing'
    }

    // 見出しの次の兄弟からテーブルを収集
    let sibling = $(el).next()
    while (sibling.length) {
      const sibTag = sibling.prop('tagName')?.toLowerCase()
      if (!sibTag) { sibling = sibling.next(); continue }
      if (/h[1-5]/.test(sibTag)) break

      if (sibTag === 'table') {
        result[currentCat].push(...parseTable($, sibling))
      } else {
        // figure / div 内のテーブル
        sibling.find('table').each((_, t) => {
          result[currentCat].push(...parseTable($, t))
        })
      }
      sibling = sibling.next()
    }
  })

  // 重複コード除去（後勝ち）
  for (const cat of ['new', 'existing']) {
    const seen = new Map()
    for (const e of result[cat]) seen.set(e.code.toLowerCase(), e)
    result[cat] = [...seen.values()]
  }

  return result
}

// ── メイン ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('📡 callingtaiwan.com.tw を取得中...')

  let html
  try {
    const res = await fetch(CALLING_TW_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TwoBearsBot/1.0)',
        'Accept-Language': 'zh-TW,zh;q=0.9',
      },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    html = await res.text()
    console.log(`  取得成功（${Math.round(html.length / 1024)} KB）`)
  } catch (e) {
    console.error('❌ 取得失敗:', e.message)
    process.exit(1)
  }

  const $ = cheerio.load(html)

  console.log('🔍 Uber Eats セクションを解析中...')
  const ubereats = extractPlatformCodes($, ['uber eats', 'ubereats', 'uber'])

  console.log('🔍 foodpanda セクションを解析中...')
  const foodpanda = extractPlatformCodes($, ['foodpanda', 'food panda', 'panda'])

  const uberTotal  = ubereats.new.length  + ubereats.existing.length
  const pandaTotal = foodpanda.new.length + foodpanda.existing.length

  console.log(`  Uber Eats:  新顧客 ${ubereats.new.length} 筆、既存顧客 ${ubereats.existing.length} 筆`)
  console.log(`  foodpanda:  新顧客 ${foodpanda.new.length} 筆、既存顧客 ${foodpanda.existing.length} 筆`)

  // ── 防護 ──────────────────────────────────────────────────────────────────
  const errors = []
  if (uberTotal  === 0) errors.push('Uber Eats のコードが 0 件（スクレイピング失敗の可能性）')
  if (pandaTotal === 0) errors.push('foodpanda のコードが 0 件（スクレイピング失敗の可能性）')

  if (errors.length > 0) {
    console.error('❌ 防護により上書きをスキップします:')
    errors.forEach(e => console.error('  -', e))
    process.exit(1)
  }

  const updated = {
    ubereats,
    foodpanda,
    fetched: new Date().toISOString(),
    source: 'callingtaiwan',
  }

  writeFileSync(DATA_FILE, JSON.stringify(updated, null, 2) + '\n', 'utf-8')
  console.log(`✅ src/data/food-codes.json を更新しました`)
  console.log(`   Uber Eats: new=${ubereats.new.length}, existing=${ubereats.existing.length}`)
  console.log(`   foodpanda: new=${foodpanda.new.length}, existing=${foodpanda.existing.length}`)
}

main().catch(e => {
  console.error('❌ 予期しないエラー:', e)
  process.exit(1)
})
