#!/usr/bin/env node
/**
 * check-draft-staleness.mjs
 *
 * 檢查「最新已發布文章的 pubDate」與「drafts/ 積壓數量」。
 * 若最近發布文章超過 THRESHOLD_DAYS 天前，透過 Resend 寄告警信。
 *
 * 原本是看 draft-tracking.json 的 mtime，但那個檔案只要 draft 有產就會動，
 * 即使 publish 停了也不會觸發告警——改成直接看「最新上線日期」才抓得到真正的問題。
 *
 * crontab 建議：
 *   0 10 * * * /usr/local/bin/node /path/to/scripts/check-draft-staleness.mjs >> /tmp/two-bears-stale.log 2>&1
 */

import { readdirSync, readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname    = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')
const BLOG_DIR     = join(PROJECT_ROOT, 'src/content/blog')
const DRAFTS_DIR   = join(PROJECT_ROOT, 'drafts')
const THRESHOLD_DAYS = 2   // 超過 48h 沒發布就告警

// ── 讀取 .env.local（靜默，不輸出任何 key 值）────────────────────────────────
function getResendKey() {
  try {
    const lines = readFileSync(join(PROJECT_ROOT, '.env.local'), 'utf-8').split('\n')
    for (const line of lines) {
      const m = line.match(/^RESEND_API_KEY=(.+)$/)
      if (m) return m[1].trim()
    }
  } catch {}
  return process.env.RESEND_API_KEY ?? null
}

// ── 找最新已發布文章的 pubDate ────────────────────────────────────────────────
function latestPublishedDate() {
  const files = readdirSync(BLOG_DIR).filter(f => f.endsWith('.md') || f.endsWith('.mdx'))
  let latest = null
  for (const file of files) {
    const content = readFileSync(join(BLOG_DIR, file), 'utf-8')
    const m = content.match(/^pubDate:\s*['"]?(\d{4}-\d{2}-\d{2})['"]?/m)
    if (!m) continue
    const d = new Date(m[1])
    if (!latest || d > latest) latest = d
  }
  return latest
}

// ── 積壓草稿數量 ──────────────────────────────────────────────────────────────
function pendingDraftCount() {
  if (!existsSync(DRAFTS_DIR)) return 0
  return readdirSync(DRAFTS_DIR).filter(f => f.endsWith('.md')).length
}

// ── 主邏輯 ────────────────────────────────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10)
const nowMs  = Date.now()

const latestPub = latestPublishedDate()
if (!latestPub) {
  console.error(`[${today}] ERROR: 找不到任何已發布文章`)
  process.exit(1)
}

const latestPubStr = latestPub.toISOString().slice(0, 10)
const daysSince = Math.floor((nowMs - latestPub.getTime()) / 86_400_000)
const pendingCount = pendingDraftCount()

if (daysSince <= THRESHOLD_DAYS) {
  console.log(`[${today}] OK: 最近發布 ${latestPubStr}（${daysSince} 天前），積壓草稿 ${pendingCount} 篇`)
  process.exit(0)
}

// 超過門檻 → 寄告警信
console.warn(`[${today}] STALE: 最近發布 ${latestPubStr}（${daysSince} 天前），積壓草稿 ${pendingCount} 篇`)

const resendKey = getResendKey()
if (!resendKey) {
  console.error(`[${today}] WARN: 找不到 RESEND_API_KEY，無法寄信`)
  process.exit(1)
}

try {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${resendKey}`,
    },
    body: JSON.stringify({
      from:    'onboarding@resend.dev',
      to:      'acikacik@gmail.com',
      subject: `⚠️ 兩隻熊：已 ${daysSince} 天沒發布文章（積壓 ${pendingCount} 篇）`,
      text: [
        `最近一篇已發布文章日期：${latestPubStr}（${daysSince} 天前）`,
        `drafts/ 積壓草稿：${pendingCount} 篇`,
        ``,
        `publish cron（09:30）可能停擺，請確認：`,
        `  /usr/local/bin/node scripts/publish-drafts.mjs`,
        `  日誌：/tmp/two-bears-publish.log`,
        ``,
        `draft cron（09:00）日誌：/tmp/two-bears-draft.log`,
      ].join('\n'),
    }),
  })

  if (res.ok) {
    console.log(`[${today}] 告警信已送出（${daysSince} 天未發布）`)
  } else {
    const body = await res.text()
    console.error(`[${today}] Resend 錯誤 HTTP ${res.status}：${body.slice(0, 200)}`)
  }
} catch (e) {
  console.error(`[${today}] 寄信失敗：${e.message}`)
}
