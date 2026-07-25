/**
 * check-ai-refusals.mjs
 *
 * 掃描 src/content/blog/ 所有文章，找出兩類疑似 AI 拒絕的文章：
 *
 * 【第一類】字串比對：直接出現 AI 拒絕用語（原始拒絕）
 * 【第二類】結構偵測：有 prophet 欄位但 predictions 是空的或不存在
 *           且非影片頁（youtubeId / rumbleId）——Gemini 拒絕後
 *           把拒絕文字加工成「如何應對焦慮」之類的文章，字串比對抓不到
 *
 * 只列清單，不修改或刪除任何文章。
 *
 * 用法：node scripts/check-ai-refusals.mjs
 */

import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BLOG_DIR  = join(__dirname, '../src/content/blog')

// ── 第一類：字串比對 ──────────────────────────────────────────────────────────

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

// ── 第二類：結構偵測工具 ─────────────────────────────────────────────────────

function parseFrontmatter(content) {
  const end = content.indexOf('---', 3)
  if (!content.startsWith('---') || end === -1) return { fm: '', body: content }
  return { fm: content.slice(3, end), body: content.slice(end + 3) }
}

function fmValue(fm, key) {
  // 取單值欄位，如 prophet: '比格斯' 或 prophet: ['A','B']
  const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
  return m ? m[1].trim() : null
}

function hasProphet(fm) {
  const val = fmValue(fm, 'prophet')
  if (!val) return false
  return val !== "''" && val !== '""' && val !== '[]' && val.toLowerCase() !== 'null'
}

function isVideoArticle(fm) {
  return /^youtubeId:\s*.+$/m.test(fm) || /^rumbleId:\s*.+$/m.test(fm)
}

function predictionsEmpty(fm) {
  if (!/^predictions:/m.test(fm)) return true   // predictions 欄位完全不存在
  // 找 predictions: 之後縮進的 list 項目（2 格或 4 格縮排都算）
  const predStart = fm.search(/^predictions:/m)
  const afterPred = fm.slice(predStart)
  const items = afterPred.match(/^\s{2,}- \S/gm)
  return !items || items.length === 0
}

// ── 掃描 ──────────────────────────────────────────────────────────────────────

const files = readdirSync(BLOG_DIR).filter(f => f.endsWith('.md') || f.endsWith('.mdx'))

const stringHits   = []   // 第一類命中
const structHits   = []   // 第二類命中

for (const file of files) {
  const text = readFileSync(join(BLOG_DIR, file), 'utf-8')
  const { fm, body } = parseFrontmatter(text)

  // 第一類：字串比對（只掃 body，不掃 frontmatter）
  const matched = REFUSAL_PATTERNS.filter(p => body.includes(p))
  if (matched.length) stringHits.push({ file, patterns: matched })

  // 第二類：結構偵測（prophet 存在、非影片、predictions 空或不存在）
  if (hasProphet(fm) && !isVideoArticle(fm) && predictionsEmpty(fm)) {
    structHits.push({ file })
  }
}

// ── 輸出 ──────────────────────────────────────────────────────────────────────

console.log(`\n掃描 ${files.length} 篇文章...\n`)

// 第一類
console.log('─── 【第一類】字串比對（直接 AI 拒絕用語） ─────────────────────────')
if (!stringHits.length) {
  console.log('✅ 沒有找到包含 AI 拒絕特徵的文章。')
} else {
  console.log(`⛔ 找到 ${stringHits.length} 篇：\n`)
  for (const { file, patterns } of stringHits) {
    console.log(`  📄 ${file}`)
    for (const p of patterns) console.log(`     命中：「${p}」`)
  }
}

// 第二類
console.log('\n─── 【第二類】結構偵測（有 prophet 但 predictions 空缺） ────────────')
if (!structHits.length) {
  console.log('✅ 沒有找到 prophet 欄位有值但 predictions 為空的文章。')
} else {
  console.log(`⚠️  找到 ${structHits.length} 篇，請人工確認是否為 AI 拒絕寫預言後加工成的文章：\n`)
  for (const { file } of structHits) {
    console.log(`  📄 ${file}`)
  }
  console.log('\n   判斷方法：若文章論述的是「如何應對焦慮」、「讓你心安」等，')
  console.log('   而非實際列出預言人物的具體預言，則高度疑似加工版拒絕。')
}

if (!stringHits.length && !structHits.length) {
  console.log('\n✅ 兩類檢查均通過，沒有發現疑似 AI 拒絕的文章。')
} else {
  console.log('\n⚠️  以上僅列清單，請人工確認後再決定是否刪除或重寫。')
}
