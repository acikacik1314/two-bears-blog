/**
 * publish-drafts.mjs
 *
 * 把 drafts/ 裡的草稿移入 src/content/blog，
 * 跑 build 驗證（含 prophet 防呆），通過後 commit + push。
 *
 * 用法：npm run publish
 */

import {
  readFileSync, writeFileSync, readdirSync,
  existsSync, unlinkSync, mkdirSync,
} from 'fs'
import { join, basename, dirname } from 'path'
import { fileURLToPath } from 'url'
import { tmpdir } from 'os'
import { spawnSync } from 'child_process'

const __dirname  = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')
const BLOG_DIR   = join(PROJECT_ROOT, 'src/content/blog')
const DRAFTS_DIR = join(PROJECT_ROOT, 'drafts')
const TRACKING   = join(__dirname, 'draft-tracking.json')

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

function detectRefusal(content) {
  const fmEnd = content.indexOf('---', 3)
  const body  = fmEnd !== -1 ? content.slice(fmEnd + 3) : content
  return REFUSAL_PATTERNS.find(p => body.includes(p)) ?? null
}

// ── 工具 ──────────────────────────────────────────────────────────────────────

function getTracking() {
  if (!existsSync(TRACKING)) return {}
  return JSON.parse(readFileSync(TRACKING, 'utf-8'))
}
function saveTracking(data) {
  writeFileSync(TRACKING, JSON.stringify(data, null, 2))
}

function run(cmd, opts = {}) {
  return spawnSync(cmd, {
    shell: true,
    cwd: PROJECT_ROOT,
    encoding: 'utf-8',
    stdio: 'inherit',
    ...opts,
  })
}

function runCapture(cmd) {
  return spawnSync(cmd, {
    shell: true,
    cwd: PROJECT_ROOT,
    encoding: 'utf-8',
    stdio: ['inherit', 'pipe', 'pipe'],
  })
}

function removeDraftFlag(content) {
  return content.replace(/^draft: true\r?\n/m, '')
}

function isHeld(content) {
  return /^hold: true\r?\n/m.test(content)
}

// ── 回滾：把已複製進 content/blog 的檔案刪除，drafts/ 保持不動 ──────────────

function rollback(movedFiles) {
  console.log('\n⏪ 回滾中…')
  for (const file of movedFiles) {
    const dest = join(BLOG_DIR, file)
    try { if (existsSync(dest)) unlinkSync(dest) } catch {}
  }
  console.log('   drafts/ 裡的草稿原封不動，請修正問題後重新執行 npm run publish。')
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!existsSync(DRAFTS_DIR)) {
    console.error('❌ drafts/ 資料夾不存在。請先執行 npm run draft。')
    process.exit(1)
  }

  const draftFiles = readdirSync(DRAFTS_DIR).filter(f => f.endsWith('.md'))
  if (draftFiles.length === 0) {
    console.log('📭 drafts/ 是空的，沒有待發布的草稿。')
    return
  }

  // 過濾 hold: true 的凍結草稿
  const heldFiles = draftFiles.filter(f => isHeld(readFileSync(join(DRAFTS_DIR, f), 'utf-8')))
  let publishFiles = draftFiles.filter(f => !heldFiles.includes(f))

  if (heldFiles.length) {
    console.log(`\n⏸  跳過 ${heldFiles.length} 篇凍結草稿（hold: true，待人工裁決）：`)
    heldFiles.forEach(f => console.log(`   🔒 drafts/${f}`))
  }

  // 第二道 AI 拒絕偵測：Gemini 草稿生成後再掃一次
  const refusedFiles = publishFiles.filter(f => {
    const content = readFileSync(join(DRAFTS_DIR, f), 'utf-8')
    return detectRefusal(content) !== null
  })
  if (refusedFiles.length) {
    console.log(`\n⛔ 偵測到 AI 拒絕內容，加 hold 標記，不發布：`)
    for (const f of refusedFiles) {
      const path    = join(DRAFTS_DIR, f)
      const content = readFileSync(path, 'utf-8')
      const hitPat  = detectRefusal(content)
      console.log(`   🚫 drafts/${f}（命中：「${hitPat}」）`)
      // 加 hold: true 讓草稿留著等人工確認，不自動重試
      writeFileSync(path, content.replace(/^---\n/, '---\nhold: true\n'), 'utf-8')
    }
    publishFiles = publishFiles.filter(f => !refusedFiles.includes(f))
  }

  if (publishFiles.length === 0) {
    console.log('\n📭 沒有可發布的草稿（全部凍結或被拒絕）。')
    return
  }

  console.log(`\n📦 準備發布 ${publishFiles.length} 篇草稿：`)
  publishFiles.forEach(f => console.log(`   • drafts/${f}`))

  // 1. 前置檢查：目標路徑是否有衝突
  const conflicts = publishFiles.filter(f => existsSync(join(BLOG_DIR, f)))
  if (conflicts.length) {
    console.error('\n❌ 以下草稿與 content/blog 現有檔案名稱衝突，請先重新命名：')
    conflicts.forEach(f => console.error(`   • ${f}`))
    process.exit(1)
  }

  // 2. 複製草稿到 content/blog（移除 draft: true 旗標）
  console.log('\n📁 複製草稿至 src/content/blog/')
  const movedFiles = []
  for (const file of publishFiles) {
    const src     = join(DRAFTS_DIR, file)
    const dest    = join(BLOG_DIR, file)
    const content = removeDraftFlag(readFileSync(src, 'utf-8'))
    writeFileSync(dest, content, 'utf-8')
    movedFiles.push(file)
    console.log(`   ✅ ${file}`)
  }

  // 3. Build 驗證（含 prophet 防呆，輸出直接顯示在終端機）
  console.log('\n🔨 執行 astro build 驗證…\n')
  const buildResult = run('npm run build')

  if (buildResult.status !== 0) {
    rollback(movedFiles)
    console.error('\n❌ Build 失敗。請根據上方錯誤訊息修正 drafts/ 裡的草稿，再重新執行 npm run publish。')
    console.error('   最常見原因：prophet 欄位的值不在 prophets.ts 名冊中。')
    process.exit(1)
  }

  console.log('\n✅ Build 通過！')

  // 4. git add + commit + push
  console.log('\n📤 提交並推送…')

  // git add 新文章 + tracking 狀態（tracking 要一起 commit，否則 CI 下次跑會重複處理）
  const blogPaths = movedFiles.map(f => `"src/content/blog/${f}"`).join(' ')
  const addResult = run(`git add ${blogPaths} "scripts/draft-tracking.json"`)
  if (addResult.status !== 0) {
    rollback(movedFiles)
    console.error('❌ git add 失敗。')
    process.exit(1)
  }

  // 檢查是否有東西要 commit（防止空 commit）
  const statusResult = runCapture('git diff --cached --name-only')
  if (!statusResult.stdout?.trim()) {
    console.log('ℹ️  沒有新的變更需要 commit（檔案可能已存在於 git history 中）。')
  } else {
    const dateStr   = new Date().toISOString().slice(0, 10)
    const fileList  = movedFiles.map(f => `- ${f}`).join('\n')
    const slugList  = movedFiles.map(f => basename(f, '.md')).join(', ')
    const commitMsg = process.env.CI
      ? `auto: 新增 podcast 文章 ${slugList}\n\nCo-Authored-By: github-actions[bot] <github-actions[bot]@users.noreply.github.com>`
      : `發布 ${movedFiles.length} 篇新文章（${dateStr}）\n\n${fileList}\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`

    // 寫到 tmp 檔案避免 shell 引號問題
    const msgFile = join(tmpdir(), `two-bears-commit-${Date.now()}.txt`)
    writeFileSync(msgFile, commitMsg, 'utf-8')

    const commitResult = run(`git commit -F "${msgFile}"`)
    try { unlinkSync(msgFile) } catch {}

    if (commitResult.status !== 0) {
      rollback(movedFiles)
      console.error('❌ git commit 失敗。')
      process.exit(1)
    }

    const pushResult = run('git push origin main')
    if (pushResult.status !== 0) {
      console.error('❌ git push 失敗（commit 已完成，請手動 push）。')
      process.exit(1)
    }

  }

  // 5. 更新追蹤狀態 + 清空 drafts/
  const tracking = getTracking()
  const now = new Date().toISOString()
  for (const [src, info] of Object.entries(tracking)) {
    if (info.status === 'drafted' && movedFiles.includes(info.draftFile)) {
      tracking[src].status      = 'published'
      tracking[src].publishedAt = now
    }
  }
  saveTracking(tracking)

  for (const file of movedFiles) {
    try { unlinkSync(join(DRAFTS_DIR, file)) } catch {}
  }

  // 6. 社群貼文草稿
  const OUTPUT_DIR = join(PROJECT_ROOT, 'output')
  mkdirSync(OUTPUT_DIR, { recursive: true })
  const draftDate = new Date().toISOString().slice(0, 10)
  const draftPath = join(OUTPUT_DIR, `community-post-draft-${draftDate}.txt`)

  function extractHook(filePath) {
    const raw = readFileSync(filePath, 'utf-8')
    // strip frontmatter
    const body = raw.replace(/^---[\s\S]*?---\s*\n/, '')
    for (const line of body.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('>') || t.startsWith('#') || t === '---' || t.startsWith('!')) continue
      // take up to first 。or first 60 chars
      const cut = t.indexOf('。')
      return cut >= 0 ? t.slice(0, cut + 1) : t.slice(0, 60)
    }
    return ''
  }

  const drafts = movedFiles.map(f => {
    const slug = basename(f, '.md')
    const url  = `https://twobears.vercel.app/blog/${slug}`
    const hook = extractHook(join(BLOG_DIR, f))
    return `${hook}\n\n${url}`
  })
  writeFileSync(draftPath, drafts.join('\n\n---\n\n'), 'utf-8')

  // 7. 最終報告
  console.log('\n🎉 發布完成！')
  console.log(`   本次發布：${movedFiles.length} 篇`)
  movedFiles.forEach(f => {
    const slug = basename(f, '.md')
    console.log(`   • https://twobears.vercel.app/blog/${slug}`)
  })
  console.log(`\n📋 社群草稿：${draftPath}`)
  console.log('\n   Vercel 將在幾分鐘內自動完成部署。')
}

main().catch(e => {
  console.error('Fatal:', e.message)
  process.exit(1)
})
