/**
 * podcast-to-blog.mjs
 *
 * RSS description → 原文照搬部落格文章（Gemini 只產生 frontmatter）
 *
 * 分兩個模式：
 *   node scripts/podcast-to-blog.mjs            — 主流程（建立草稿）
 *   node scripts/podcast-to-blog.mjs --finalize — 發布後確認，寫 tracking
 *
 * 設計：
 *   - 正文 = RSS description 原文，HTML→Markdown 最小轉換，不重寫
 *   - Gemini 只產生 frontmatter JSON（slug/title/desc/category/prophet/predictions）
 *   - 草稿直接寫入 drafts/（跳過 draft-posts.mjs）
 *   - 去重 key = RSS guid
 *   - 每次最多處理 MAX_EPISODES 集（預設 3）
 *   - 待處理 > 10 集時，寄信通知，不自動全跑
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { homedir } from 'os'

const __dirname      = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT   = join(__dirname, '..')
const DRAFTS_DIR     = join(PROJECT_ROOT, 'drafts')
const BLOG_DIR       = join(PROJECT_ROOT, 'src/content/blog')
const TRACKING       = join(__dirname, 'podcast-sync-tracking.json')
const QUEUE_FILE     = join(__dirname, 'podcast-queue.json')
const DRAFT_TRACKING = join(__dirname, 'draft-tracking.json')
const PROPHETS_TS    = join(PROJECT_ROOT, 'src/data/prophets.ts')

const RSS_URL    = 'https://anchor.fm/s/11310a874/podcast/rss'
const MAX_EP     = parseInt(process.env.MAX_EPISODES ?? '3', 10)
const MAX_DAILY  = parseInt(process.env.MAX_DAILY_EPISODES ?? '6', 10)
const NOTIFY_THRESHOLD = 10
const ADMIN_EMAIL = 'acikacik@gmail.com'
const MAX_AGE_DAYS = 7   // 超過此天數的舊集數自動標記 bypassed，不再處理

// ── Gemini ────────────────────────────────────────────────────────────────────

function getGeminiKeys() {
  const keysFile = join(homedir(), '.claude/api_keys.json')
  try {
    const raw = JSON.parse(readFileSync(keysFile, 'utf-8'))
    const k = raw.gemini
    if (Array.isArray(k) && k.length) return k
    if (typeof k === 'string' && k) return [k]
  } catch {}
  const env = process.env.GEMINI_API_KEYS
  if (env) { try { return JSON.parse(env) } catch {} }
  if (process.env.GEMINI_API_KEY) return [process.env.GEMINI_API_KEY]
  return []
}

function getResendKey() {
  const env = process.env.RESEND_API_KEY
  if (env) return env
  // read from .env.local silently
  try {
    const envFile = readFileSync(join(PROJECT_ROOT, '.env.local'), 'utf-8')
    const match = envFile.match(/^RESEND_API_KEY=(.+)$/m)
    if (match) return match[1].trim()
  } catch {}
  return null
}

const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
]

async function callGeminiJSON(prompt, keys) {
  const shuffled = [...keys].sort(() => Math.random() - 0.5)
  for (const model of GEMINI_MODELS) {
    for (const key of shuffled) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`
        const body = JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 4096,
            temperature: 0.3,
            responseMimeType: 'application/json',
            ...(model.startsWith('gemini-2.5') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          },
        })
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: AbortSignal.timeout(30000),
        })
        if (res.status === 429 || res.status === 503 || res.status === 500) continue
        if (res.status === 404) break
        if (!res.ok) { console.warn(`  Gemini ${model}: HTTP ${res.status}`); continue }
        const data = await res.json()
        const parts = data?.candidates?.[0]?.content?.parts ?? []
        const text = parts.filter(p => !p.thought).map(p => p.text ?? '').join('').trim()
        if (!text) continue
        return JSON.parse(text)
      } catch (e) {
        if (e.name === 'SyntaxError') throw e  // JSON parse error → bad output, don't retry
        continue
      }
    }
  }
  throw new Error('所有 Gemini key/model 組合均失敗')
}

// ── Prophet ID 清單 ───────────────────────────────────────────────────────────

function getProphetIds() {
  try {
    const src = readFileSync(PROPHETS_TS, 'utf-8')
    return [...src.matchAll(/^\s+id:\s+'([^']+)'/gm)].map(m => m[1])
  } catch { return [] }
}

// ── Tracking ──────────────────────────────────────────────────────────────────

function load(path) {
  if (!existsSync(path)) return {}
  return JSON.parse(readFileSync(path, 'utf-8'))
}
function save(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2))
}

// ── RSS ───────────────────────────────────────────────────────────────────────

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

function parseEpisodes(xml) {
  return xml.split('<item>').slice(1).map(item => ({
    guid:        item.match(/<guid[^>]*>([^<]+)<\/guid>/)?.[1]?.trim() ?? '',
    title:       extractCdata('title', item),
    pubDate:     item.match(/<pubDate>([^<]+)<\/pubDate>/)?.[1]?.trim() ?? '',
    descriptionRaw: extractCdata('description', item),
  })).filter(ep => ep.guid && ep.title)
}

function toDateStr(pubDate) {
  try {
    const d = new Date(pubDate)
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  } catch {}
  return new Date().toISOString().slice(0, 10)
}

// ── HTML → Markdown 最小轉換 ──────────────────────────────────────────────────

function htmlToMarkdown(html) {
  let text = html
    // 段落和換行
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    // 粗體斜體
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
    .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**')
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*')
    .replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*')
    // 超連結 → 只保留文字
    .replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1')
    // 移除所有剩餘 HTML 標籤
    .replace(/<[^>]+>/g, '')
    // HTML 實體
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-z]+;/gi, '')
    // 清理空白
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  // 清掉 Spotify 自動附加的推廣尾巴（含追蹤連結）
  // 通常格式：以空行分隔的 "Support this podcast" 或 spotify.com 連結區塊
  text = stripSpotifyTail(text)

  return text
}

function stripSpotifyTail(text) {
  // 常見 Spotify/Anchor 附加尾巴特徵
  const patterns = [
    /\n{1,2}---+\n[\s\S]*$/,
    /\n{1,2}Support this podcast:[\s\S]*$/i,
    /\n{1,2}https?:\/\/anchor\.fm\/[\s\S]*$/i,
    /\n{1,2}https?:\/\/[^\n]*spotify\.com\/[^\n]*\n[\s\S]*$/i,
    /\n{1,2}Become a supporter[\s\S]*$/i,
    /\n{1,2}--- Send in a voice message:[\s\S]*$/i,
    /\n{1,2}本集節目由.*贊助[\s\S]*$/,
    /\n{1,2}廣告合作請洽[\s\S]*$/,
  ]
  for (const p of patterns) {
    const trimmed = text.replace(p, '').trim()
    if (trimmed.length > 100) text = trimmed  // 避免砍掉正文
  }
  return text
}

// ── AI 拒絕偵測（對 RSS description 原文） ───────────────────────────────────

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

// ── Gemini Frontmatter Prompt ─────────────────────────────────────────────────

function buildFrontmatterPrompt(ep, body, prophetIds) {
  const pubDateStr = toDateStr(ep.pubDate)
  return `你是一個部落格編輯助理。以下是一集 podcast 的資訊，請根據此資訊產生文章 frontmatter。

【集數標題】
${ep.title}

【發布日期】
${pubDateStr}

【逐字稿（正文原文，已完整）】
${body.slice(0, 3000)}

---

請以 JSON 格式回傳以下欄位（只回傳 JSON，不要加說明文字）：

{
  "slug": "kebab-case-slug，英文小寫加連字號，簡短描述集數核心主題，不超過 60 字元",
  "title": "文章標題，直接使用 RSS 標題，若超過 60 字元則適當縮短",
  "description": "SEO meta description，1-2 句，80-120 字元，繁體中文",
  "category": "只能從以下選一個：預言、靈性、財經、異象、科技、歷史、社會、宗教。若完全判斷不出來就給空字串",
  "tags": ["繁體中文標籤陣列，最多 6 個"],
  "prophet": "只能是以下列表中完全一致的 ID，若找不到對應者給空字串：${prophetIds.join(', ')}",
  "predictions": [
    { "claim": "具體可驗證的預測，繁體中文，完整一句話", "saidOn": "${pubDateStr}" }
  ]
}

注意事項：
- predictions 只收具體、可在未來驗證真偽的預測。若無預測，給空陣列 []。
- predictions 中的 claim 每條都要是完整獨立的句子，不要截斷。
- 禁止在 predictions 中加入 hits/misses，全部用 pending 格式（已由外部程式處理）。
- slug 必須是合法的 URL slug（只有英文小寫字母、數字、連字號）。
- prophet 一定要完全匹配上面的 ID 列表，不能自創。`
}

// ── YAML 產生 ─────────────────────────────────────────────────────────────────

function yamlStr(s) {
  if (s === null || s === undefined || s === '') return ''
  const str = String(s)
  // Quote pure numbers (YAML would parse '2026' as integer)
  if (/^\d+$/.test(str)) return `'${str}'`
  if (/[:"'#{}[\]|>&*!,]/.test(str) || str.includes('\n') || str.startsWith(' ') || str.endsWith(' ')) {
    return `'${str.replace(/'/g, "''")}'`
  }
  return str
}

function buildDraft(ep, body, fm) {
  const pubDate = toDateStr(ep.pubDate)
  const predictions = Array.isArray(fm.predictions) ? fm.predictions : []
  const tags = Array.isArray(fm.tags) ? fm.tags : []

  let yaml = `---\n`
  yaml += `title: ${yamlStr(fm.title || ep.title)}\n`
  yaml += `description: ${yamlStr(fm.description || '')}\n`
  yaml += `pubDate: '${pubDate}'\n`
  if (fm.category) yaml += `category: ${yamlStr(fm.category)}\n`
  if (fm.prophet) yaml += `prophet: ${yamlStr(fm.prophet)}\n`
  if (tags.length) yaml += `tags:\n${tags.map(t => `- ${yamlStr(t)}`).join('\n')}\n`
  if (predictions.length) {
    yaml += `predictions:\n  pending:\n`
    for (const p of predictions) {
      yaml += `  - claim: ${yamlStr(p.claim)}\n`
      yaml += `    saidOn: '${p.saidOn || pubDate}'\n`
    }
  }
  yaml += `draft: true\n`
  yaml += `---\n\n`
  yaml += body

  return yaml
}

// ── Email 通知 ────────────────────────────────────────────────────────────────

async function sendOverflowEmail(pendingCount) {
  const key = getResendKey()
  if (!key) {
    console.warn(`  ⚠️  RESEND_API_KEY 未設定，無法寄信（待處理 ${pendingCount} 集）`)
    return
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from: 'onboarding@resend.dev',
        to: ADMIN_EMAIL,
        subject: `[兩隻熊] 待處理 Podcast 集數過多：${pendingCount} 集`,
        text: `Podcast 自動轉文章管線偵測到待處理集數已達 ${pendingCount} 集（閾值：${NOTIFY_THRESHOLD}）。\n\n請手動確認並執行：\nnpm run podcast-now\n\n或至 GitHub Actions 手動觸發。`,
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (res.ok) console.log(`  📧 已寄出通知信至 ${ADMIN_EMAIL}`)
    else console.warn(`  ⚠️  寄信失敗：HTTP ${res.status}`)
  } catch (e) {
    console.warn(`  ⚠️  寄信失敗：${e.message}`)
  }
}

// ── 主流程 ────────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(DRAFTS_DIR, { recursive: true })

  const tracking = load(TRACKING)
  const retryable = new Set(['error', 'queued', 'sourced'])
  const skip = (t) => t && !retryable.has(t.status)

  console.log('📡 抓取 Podcast RSS...')
  const xml = await fetchRSS()
  const episodes = parseEpisodes(xml)
  console.log(`  共 ${episodes.length} 集`)

  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000)

  // 超過 MAX_AGE_DAYS 天的集數，一律標記 bypassed（永久跳過，不再積壓）
  let bypassedCount = 0
  for (const ep of episodes) {
    if (skip(tracking[ep.guid])) continue
    const epDate = new Date(ep.pubDate)
    if (!isNaN(epDate.getTime()) && epDate < cutoff) {
      tracking[ep.guid] = { status: 'bypassed', title: ep.title, at: new Date().toISOString() }
      bypassedCount++
    }
  }
  if (bypassedCount > 0) {
    save(TRACKING, tracking)
    console.log(`  📦 ${bypassedCount} 集超過 ${MAX_AGE_DAYS} 天，已標記 bypassed。`)
  }

  // 日發布上限檢查（以台北時間 UTC+8 為基準，避免 UTC 跨日造成一天發兩輪）
  const todayStr = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).slice(0, 10)
  const publishedToday = Object.values(tracking).filter(v =>
    v.status === 'published' && v.publishedAt
      ? new Date(v.publishedAt).toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).slice(0, 10) === todayStr
      : false
  ).length
  console.log(`  今日已發布：${publishedToday} 篇（上限 ${MAX_DAILY}）`)
  if (publishedToday >= MAX_DAILY) {
    console.log(`  ✅ 已達今日上限，停止。`)
    return
  }
  const canPublish = Math.min(MAX_EP, MAX_DAILY - publishedToday)

  // 篩出近 MAX_AGE_DAYS 天待處理的集數
  const pending = episodes.filter(ep => {
    if (skip(tracking[ep.guid])) return false
    const epDate = new Date(ep.pubDate)
    if (!isNaN(epDate.getTime()) && epDate < cutoff) return false
    return true
  })
  console.log(`  近 ${MAX_AGE_DAYS} 天待處理：${pending.length} 集`)

  // 待處理 > 閾值 → 通知（本機用），--force 可略過
  const isForce = process.argv.includes('--force')
  if (pending.length > NOTIFY_THRESHOLD && !isForce) {
    console.log(`  ⚠️  待處理集數（${pending.length}）超過 ${NOTIFY_THRESHOLD}，寄信通知。`)
    console.log(`  （手動觸發請用 npm run podcast-now 或加 --force 旗標跳過通知限制）`)
    await sendOverflowEmail(pending.length)
    return
  }

  const toProcess = pending.slice(0, canPublish)
  if (!toProcess.length) {
    console.log('✅ 沒有新集數，結束。')
    return
  }
  console.log(`  本次處理：${toProcess.length} 集\n`)

  const geminiKeys = getGeminiKeys()
  if (!geminiKeys.length) {
    console.error('❌ 未找到 Gemini API key，無法生成 frontmatter。')
    process.exit(1)
  }

  const prophetIds = getProphetIds()
  const queue = load(QUEUE_FILE)
  let created = 0

  for (const ep of toProcess) {
    console.log(`🎙 ${ep.title}`)

    const rawBody = htmlToMarkdown(ep.descriptionRaw)

    // AI 拒絕偵測（對 RSS description 原文）
    const hitPattern = detectRefusal(rawBody)
    if (hitPattern) {
      console.log(`  ⛔ AI 拒絕內容（命中：「${hitPattern}」），跳過。`)
      tracking[ep.guid] = { status: 'rejected-ai-refusal', hitPattern, title: ep.title, at: new Date().toISOString() }
      save(TRACKING, tracking)
      continue
    }

    // 內容太短
    if (rawBody.length < 150) {
      console.log(`  ⚠️  文字版太短（${rawBody.length} 字），跳過。`)
      tracking[ep.guid] = { status: 'skipped-too-short', chars: rawBody.length, title: ep.title, at: new Date().toISOString() }
      save(TRACKING, tracking)
      continue
    }

    // 嘗試以 per-guid 鎖檔宣告認領（同機競態防護）
    const lockPath = `/tmp/podcast-lock-${ep.guid.replace(/[^a-z0-9]/gi, '')}`
    try {
      writeFileSync(lockPath, String(process.pid), { flag: 'wx' })  // 'wx'：若已存在則拋出
    } catch {
      console.log(`  ⏭  已被同機另一 runner 認領（lock 存在），跳過。`)
      continue
    }

    // 立刻宣告認領（防跨機競態：寫 runner 唯一識別碼）
    const runnerId = `${process.pid}-${Date.now()}`
    tracking[ep.guid] = { status: 'sourced', title: ep.title, at: new Date().toISOString(), _runner: runnerId }
    save(TRACKING, tracking)

    // 呼叫 Gemini 產生 frontmatter JSON
    let fm
    try {
      const prompt = buildFrontmatterPrompt(ep, rawBody, prophetIds)
      fm = await callGeminiJSON(prompt, geminiKeys)
      console.log(`  📝 Gemini frontmatter OK（prophet: ${fm.prophet || '（空）'}）`)
    } catch (e) {
      console.error(`  ❌ Gemini 失敗：${e.message}`)
      tracking[ep.guid] = { status: 'error', title: ep.title, at: new Date().toISOString(), error: e.message }
      save(TRACKING, tracking)
      continue
    }

    // 二次確認：Gemini 回傳後再讀一次 tracking，防跨機競態
    // 只有自己寫的那筆才繼續，其他 runner 寫的就放棄
    const trackingNow = load(TRACKING)
    const claimedBy = trackingNow[ep.guid]?._runner
    if (claimedBy && claimedBy !== runnerId) {
      console.log(`  ⏭  ${ep.guid.slice(0, 8)}… 已被另一 runner 認領，放棄。`)
      try { unlinkSync(lockPath) } catch {}
      continue
    }

    // 產生草稿檔名（slug 優先，fallback 用時間戳）
    const slug = (fm.slug || '').replace(/[^a-z0-9-]/g, '') || `podcast-${Date.now()}`
    const draftFile = `${slug}.md`
    const draftPath = join(DRAFTS_DIR, draftFile)
    const blogPath  = join(BLOG_DIR,   draftFile)

    // 若 slug 已在 content/blog 發布過 → 標記 published 跳過，不重複建草稿
    if (existsSync(blogPath)) {
      console.log(`  ⏭  slug "${slug}" 已在 blog 發布，跳過（標記 published）。`)
      tracking[ep.guid] = { status: 'published', title: ep.title, publishedAt: new Date().toISOString(), draftFile }
      save(TRACKING, tracking)
      try { unlinkSync(lockPath) } catch {}
      continue
    }

    // 若 slug 衝突（已存在草稿），加日期後綴
    const pubDate = toDateStr(ep.pubDate)
    const finalFile = existsSync(draftPath)
      ? `${slug}-${pubDate}.md`
      : draftFile
    const finalPath = join(DRAFTS_DIR, finalFile)

    const content = buildDraft(ep, rawBody, fm)
    writeFileSync(finalPath, content, 'utf-8')

    // 更新 draft-tracking（keyed by guid，讓 publish-drafts 可標記 published）
    const draftTracking = load(DRAFT_TRACKING)
    draftTracking[ep.guid] = {
      status:    'drafted',
      draftFile: finalFile,
      draftedAt: new Date().toISOString(),
    }
    save(DRAFT_TRACKING, draftTracking)

    // 更新 podcast-queue（供 --finalize 用）
    queue[ep.guid] = { draftFile: finalFile, title: ep.title, at: new Date().toISOString() }
    save(QUEUE_FILE, queue)

    created++
    console.log(`  ✅ drafts/${finalFile}（正文 ${rawBody.length} 字）`)

    // 清除 per-guid 鎖檔
    try { unlinkSync(lockPath) } catch {}
  }

  console.log(`\n完成：${created} 集已產生草稿。`)
}

// ── Finalize：發布後確認，更新 podcast-sync-tracking ─────────────────────────

async function finalize() {
  const queue = load(QUEUE_FILE)
  if (!Object.keys(queue).length) {
    console.log('podcast-queue.json 是空的，無需 finalize。')
    return
  }

  const tracking     = load(TRACKING)
  const draftTracking = load(DRAFT_TRACKING)

  for (const [guid, entry] of Object.entries(queue)) {
    // draft-tracking 現在以 guid 為 key
    const dt = draftTracking[guid]
    if (dt?.status === 'published') {
      console.log(`  ✅ 已確認發布：${entry.title}`)
      tracking[guid] = { status: 'published', draftFile: entry.draftFile, title: entry.title, publishedAt: dt.publishedAt }
    } else {
      console.log(`  ⚠️  未確認發布（${dt?.status ?? '不在追蹤中'}）：${entry.title}`)
      tracking[guid] = { status: 'error', draftFile: entry.draftFile, title: entry.title, at: new Date().toISOString() }
    }
  }

  save(TRACKING, tracking)
  save(QUEUE_FILE, {})
  console.log('podcast-sync-tracking.json 已更新。')
}

// ── Entry point ───────────────────────────────────────────────────────────────

const isFinalize = process.argv.includes('--finalize')
if (isFinalize) {
  finalize().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
} else {
  main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
}
