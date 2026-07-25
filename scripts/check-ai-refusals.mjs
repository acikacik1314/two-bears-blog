/**
 * check-ai-refusals.mjs
 *
 * 掃描 src/content/blog/ 所有文章，列出命中 AI 拒絕特徵的檔名清單。
 * 只列清單，不修改或刪除任何文章。
 *
 * 用法：node scripts/check-ai-refusals.mjs
 */

import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BLOG_DIR  = join(__dirname, '../src/content/blog')

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

const files = readdirSync(BLOG_DIR).filter(f => f.endsWith('.md') || f.endsWith('.mdx'))
const hits = []

for (const file of files) {
  const text = readFileSync(join(BLOG_DIR, file), 'utf-8')
  const fmEnd = text.indexOf('---', 3)
  const body  = fmEnd !== -1 ? text.slice(fmEnd + 3) : text
  const matched = REFUSAL_PATTERNS.filter(p => body.includes(p))
  if (matched.length) hits.push({ file, patterns: matched })
}

console.log(`\n掃描 ${files.length} 篇文章...\n`)

if (!hits.length) {
  console.log('✅ 沒有找到包含 AI 拒絕特徵的文章。')
} else {
  console.log(`⛔ 找到 ${hits.length} 篇疑似包含 AI 拒絕回覆的文章：\n`)
  for (const { file, patterns } of hits) {
    console.log(`  📄 ${file}`)
    for (const p of patterns) console.log(`     命中：「${p}」`)
  }
  console.log('\n⚠️  以上僅列清單，請人工確認後再決定是否刪除。')
}
