/**
 * podcast-to-blog.mjs
 *
 * 從 Spotify/Anchor RSS 讀取新集數的文字版（description 欄位），
 * 儲存成 .md 來源檔供 draft-posts.mjs 生成部落格文章。
 *
 * 分兩個模式：
 *   node scripts/podcast-to-blog.mjs            — 主流程（建立來源檔）
 *   node scripts/podcast-to-blog.mjs --finalize — 發布後確認，寫 tracking
 *
 * tracking 寫入時機：
 *   - AI 拒絕 / 太短 → 立刻寫（永久跳過）
 *   - 正常集數 → 存入 podcast-queue.json，
 *     等 --finalize 確認發布成功後才寫入 tracking
 *   - status: 'error' 或 'queued' → 下次可重試
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { homedir } from 'os'

const __dirname  = dirname(fileURLToPath(import.meta.url))
const RSS_URL    = 'https://anchor.fm/s/11310a874/podcast/rss'
const TRACKING   = join(__dirname, 'podcast-sync-tracking.json')
const QUEUE_FILE = join(__dirname, 'podcast-queue.json')       // 未 commit，發布後清除
const DRAFT_TRACKING = join(__dirname, 'draft-tracking.json')
const OUTPUT_DIR = process.env.PODCAST_SOURCE_DIR ?? join(homedir(), 'Downloads/未來人預言家')
const MAX_EP     = parseInt(process.env.MAX_EPISODES ?? '5', 10)

// ── AI 拒絕特徵 ───────────────────────────────────────────────────────────────

const REFUSAL_PATTERNS = [
  '我們在此不直接撰寫',
  '為了維護健康的資訊傳播環境',
  '這些內容主要源自於個人的主觀靈性體驗',
  '並非經過科學驗證',
  '我們可以轉而探討',
  '避免強化未經證實的恐慌感',
  '如果您對影片製作與內容創作感興趣',
  '我們可以轉而',
]

function detectRefusal(text) {
  return REFUSAL_PATTERNS.find(p => text.includes(p)) ?? null
}

// ── Tracking ──────────────────────────────────────────────────────────────────

function load(path) {
  if (!existsSync(path)) return {}
  return JSON.parse(readFileSync(path, 'utf-8'))
}
function save(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2))
}

// ── RSS 解析 ──────────────────────────────────────────────────────────────────

async function fetchRSS() {
  const res = await fetch(RSS_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`RSS 抓取失敗：${res.status}`)
  return res.text()
}

function extractCdata(tag, item) {
  return item.match(new RegExp(`<${tag}><\\!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`))?.[1]?.trim()
      ?? item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1]?.trim()
      ?? ''
}

function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '').replace(/\n{3,}/g, '\n\n').trim()
}

function parseEpisodes(xml) {
  return xml.split('<item>').slice(1).map(item => ({
    guid:        item.match(/<guid[^>]*>([^<]+)<\/guid>/)?.[1]?.trim() ?? '',
    title:       extractCdata('title', item),
    pubDate:     item.match(/<pubDate>([^<]+)<\/pubDate>/)?.[1]?.trim() ?? '',
    description: stripHtml(extractCdata('description', item)),
  })).filter(ep => ep.guid && ep.title)
}

function toYYYYMMDD(pubDate) {
  try {
    const d = new Date(pubDate)
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10).replace(/-/g, '')
  } catch {}
  return new Date().toISOString().slice(0, 10).replace(/-/g, '')
}

// ── 主流程 ────────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true })
  const tracking = load(TRACKING)

  // 可重試的狀態
  const retryable = new Set(['error', 'queued'])
  const skip = (t) => t && !retryable.has(t.status)

  console.log('📡 抓取 Podcast RSS...')
  const xml = await fetchRSS()
  const episodes = parseEpisodes(xml)
  console.log(`  共 ${episodes.length} 集`)

  // 最新在前（RSS 預設），直接取前 MAX_EP 集
  const newEps = episodes
    .filter(ep => !skip(tracking[ep.guid]))
    .slice(0, MAX_EP)

  if (!newEps.length) {
    console.log('✅ 沒有新集數，結束。')
    return
  }
  console.log(`  待處理：${newEps.length} 集\n`)

  const queue = load(QUEUE_FILE)
  let created = 0

  for (const ep of newEps) {
    console.log(`🎙 ${ep.title}`)

    // AI 拒絕偵測
    const hitPattern = detectRefusal(ep.description)
    if (hitPattern) {
      console.log(`  ⛔ AI 拒絕內容（命中：「${hitPattern}」），跳過。`)
      tracking[ep.guid] = { status: 'rejected-ai-refusal', hitPattern, title: ep.title, at: new Date().toISOString() }
      save(TRACKING, tracking)
      continue
    }

    // 內容太短
    if (ep.description.length < 150) {
      console.log(`  ⚠️  文字版太短（${ep.description.length} 字），跳過。`)
      tracking[ep.guid] = { status: 'skipped-too-short', chars: ep.description.length, title: ep.title, at: new Date().toISOString() }
      save(TRACKING, tracking)
      continue
    }

    const dateStr  = toYYYYMMDD(ep.pubDate)
    const now      = new Date()
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, '')
    const timePart = now.toISOString().slice(11, 19).replace(/:/g, '')
    const safeTitle = ep.title.replace(/[/\\?%*:|"<>[\]]/g, '_').slice(0, 50)
    const filename  = `${safeTitle}_${dateStr}-${dateStr}_${datePart}_${timePart}.md`
    const content   = `# ${ep.title}\n> 集數日期：${ep.pubDate}\n\n${ep.description}\n`

    writeFileSync(join(OUTPUT_DIR, filename), content, 'utf-8')

    // 立刻寫 "sourced" 進 tracking（不在 retryable 裡）
    // 讓第二個 runner pull 後看到這集已被認領，避免重複處理
    tracking[ep.guid] = { status: 'sourced', sourceFile: filename, title: ep.title, at: now.toISOString() }
    save(TRACKING, tracking)

    // 也存入 queue 供 --finalize 用
    queue[ep.guid] = { sourceFile: filename, title: ep.title, at: now.toISOString() }
    save(QUEUE_FILE, queue)

    created++
    console.log(`  ✅ ${filename} （${ep.description.length} 字）`)
  }

  console.log(`\n完成：${created} 集排入佇列。`)
}

// ── Finalize：發布後確認，寫 tracking ────────────────────────────────────────

async function finalize() {
  const queue = load(QUEUE_FILE)
  if (!Object.keys(queue).length) {
    console.log('podcast-queue.json 是空的，無需 finalize。')
    return
  }

  const tracking     = load(TRACKING)
  const draftTracking = load(DRAFT_TRACKING)

  for (const [guid, entry] of Object.entries(queue)) {
    const dt = draftTracking[entry.sourceFile]
    if (dt?.status === 'published') {
      console.log(`  ✅ 已確認發布：${entry.title}`)
      tracking[guid] = { status: 'published', sourceFile: entry.sourceFile, title: entry.title, publishedAt: dt.publishedAt }
    } else {
      console.log(`  ⚠️  未確認發布（${dt?.status ?? '不在追蹤中'}）：${entry.title}`)
      tracking[guid] = { status: 'error', sourceFile: entry.sourceFile, title: entry.title, at: new Date().toISOString() }
    }
  }

  save(TRACKING, tracking)
  save(QUEUE_FILE, {})  // 清空 queue
  console.log('podcast-sync-tracking.json 已更新。')
}

// ── Entry point ───────────────────────────────────────────────────────────────

const isFinalize = process.argv.includes('--finalize')
if (isFinalize) {
  finalize().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
} else {
  main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
}
