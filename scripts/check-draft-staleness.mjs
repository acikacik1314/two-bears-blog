#!/usr/bin/env node
/**
 * check-draft-staleness.mjs
 *
 * 每次執行時檢查 draft-tracking.json 的最後修改時間。
 * 若超過 THRESHOLD_HOURS 小時未更新，透過 Resend 寄告警信。
 *
 * 設計給 crontab 呼叫（絕對路徑，不依賴 PATH 或 n8n）：
 *   0 10 * * * /usr/local/bin/node /path/to/scripts/check-draft-staleness.mjs >> /tmp/two-bears-stale.log 2>&1
 */

import { statSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname  = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')
const TRACKING   = join(__dirname, 'draft-tracking.json')
const THRESHOLD_HOURS = 48

// ── 讀取 .env.local（靜默，不輸出任何 key 值）────────────────────────────────
function getResendKey() {
  try {
    const envPath = join(PROJECT_ROOT, '.env.local')
    const lines = readFileSync(envPath, 'utf-8').split('\n')
    for (const line of lines) {
      const m = line.match(/^RESEND_API_KEY=(.+)$/)
      if (m) return m[1].trim()
    }
  } catch {}
  return process.env.RESEND_API_KEY ?? null
}

// ── 主邏輯 ────────────────────────────────────────────────────────────────────
const now = Date.now()
const today = new Date().toISOString().slice(0, 10)

let stat
try {
  stat = statSync(TRACKING)
} catch {
  console.error(`[${today}] ERROR: 找不到 ${TRACKING}`)
  process.exit(1)
}

const ageMs    = now - stat.mtimeMs
const ageHours = Math.floor(ageMs / 3_600_000)
const lastUpdated = new Date(stat.mtimeMs).toISOString().replace('T', ' ').slice(0, 16)

if (ageMs <= THRESHOLD_HOURS * 3_600_000) {
  console.log(`[${today}] OK: draft-tracking.json 已在 ${ageHours} 小時前更新（${lastUpdated}）`)
  process.exit(0)
}

// 超過門檻 → 寄告警信
console.warn(`[${today}] STALE: draft-tracking.json 已 ${ageHours} 小時未更新（最後：${lastUpdated}）`)

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
      subject: `⚠️ 兩隻熊：draft 管線停擺 ${ageHours} 小時`,
      text: [
        `draft-tracking.json 已超過 ${ageHours} 小時未更新。`,
        ``,
        `最後更新：${lastUpdated}`,
        `檢查時間：${new Date().toISOString().replace('T', ' ').slice(0, 16)}`,
        ``,
        `請檢查 npm run draft 是否正常執行：`,
        `  cd ${PROJECT_ROOT}`,
        `  /usr/local/bin/node scripts/draft-posts.mjs`,
        ``,
        `日誌位置：/tmp/two-bears-draft.log`,
      ].join('\n'),
    }),
  })

  if (res.ok) {
    console.log(`[${today}] 告警信已送出（ageHours=${ageHours}）`)
  } else {
    const body = await res.text()
    console.error(`[${today}] Resend 錯誤 HTTP ${res.status}：${body.slice(0, 200)}`)
  }
} catch (e) {
  console.error(`[${today}] 寄信失敗：${e.message}`)
}
