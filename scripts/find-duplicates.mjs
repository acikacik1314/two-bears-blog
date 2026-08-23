#!/usr/bin/env node
/**
 * find-duplicates.mjs
 *
 * 掃描 src/content/blog/ 下所有文章，找出重複或高度相似標題的文章。
 *
 * 用法：
 *   node scripts/find-duplicates.mjs
 *   node scripts/find-duplicates.mjs --threshold 0.85   # 調整相似度門檻（預設 0.9）
 */

import { readdirSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BLOG_DIR = join(__dirname, '../src/content/blog')

const args = process.argv.slice(2)
const thresholdArg = args.find(a => a.startsWith('--threshold'))
const THRESHOLD = thresholdArg ? parseFloat(thresholdArg.split('=')[1] ?? args[args.indexOf(thresholdArg) + 1]) : 0.9

function extractTitle(content) {
  const m = content.match(/^---[\s\S]*?^title:\s*['"]?(.+?)['"]?\s*$/m)
  return m ? m[1].trim() : ''
}

function extractField(content, field) {
  const m = content.match(new RegExp(`^${field}:\\s*['"]?(.+?)['"]?\\s*$`, 'm'))
  return m ? m[1].trim() : ''
}

function normalize(title) {
  return title
    .toLowerCase()
    .replace(/[，。！？、：；「」『』【】《》〈〉，,.!?:;"'()\s\-_]/g, '')
    .replace(/[零一二三四五六七八九十百千萬億]/g, s => '○一二三四五六七八九十百千萬億'.indexOf(s))
}

// Dice coefficient similarity for character bigrams
function similarity(a, b) {
  const na = normalize(a)
  const nb = normalize(b)
  if (na === nb) return 1
  if (!na || !nb) return 0

  // Check containment first
  if (na.includes(nb) || nb.includes(na)) {
    const shorter = Math.min(na.length, nb.length)
    const longer = Math.max(na.length, nb.length)
    return shorter / longer
  }

  // Bigram Dice coefficient
  const bigrams = s => {
    const set = new Map()
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2)
      set.set(bg, (set.get(bg) ?? 0) + 1)
    }
    return set
  }

  const ba = bigrams(na)
  const bb = bigrams(nb)
  let intersection = 0
  for (const [bg, count] of ba) {
    intersection += Math.min(count, bb.get(bg) ?? 0)
  }
  const total = [...ba.values()].reduce((s, v) => s + v, 0) +
                [...bb.values()].reduce((s, v) => s + v, 0)
  return total === 0 ? 0 : (2 * intersection) / total
}

// Load all articles
const files = readdirSync(BLOG_DIR).filter(f => f.endsWith('.md'))
const articles = files.map(filename => {
  const content = readFileSync(join(BLOG_DIR, filename), 'utf-8')
  return {
    filename,
    title: extractTitle(content),
    pubDate: extractField(content, 'pubDate'),
    prophet: extractField(content, 'prophet'),
    heroImage: extractField(content, 'heroImage'),
  }
}).filter(a => a.title)

console.log(`📚 共掃描 ${articles.length} 篇文章\n`)

// Find duplicates
const groups = []
const matched = new Set()

for (let i = 0; i < articles.length; i++) {
  if (matched.has(i)) continue
  const group = [i]
  for (let j = i + 1; j < articles.length; j++) {
    if (matched.has(j)) continue
    const score = similarity(articles[i].title, articles[j].title)
    if (score >= THRESHOLD) {
      group.push(j)
      matched.add(j)
    }
  }
  if (group.length > 1) {
    matched.add(i)
    groups.push(group)
  }
}

if (groups.length === 0) {
  console.log('✅ 未發現重複文章（相似度門檻：' + THRESHOLD + '）')
  process.exit(0)
}

console.log(`⚠️  發現 ${groups.length} 組重複文章（相似度門檻：${THRESHOLD}）\n`)
console.log('建議保留有 prophet + heroImage 欄位的版本，刪除較不完整的。\n')

for (const [idx, group] of groups.entries()) {
  console.log(`━━━ 第 ${idx + 1} 組 ━━━`)
  for (const i of group) {
    const a = articles[i]
    const flags = [
      a.prophet ? `prophet:${a.prophet}` : '❌ 無prophet',
      a.heroImage ? '✅ heroImage' : '❌ 無heroImage',
    ].join('  ')
    console.log(`  📄 ${a.filename}`)
    console.log(`     標題：${a.title}`)
    console.log(`     日期：${a.pubDate}  ${flags}`)
  }

  // Recommend which to delete
  const withImage = group.filter(i => articles[i].heroImage)
  const withProphet = group.filter(i => articles[i].prophet)
  const keep = withImage.length > 0 ? withImage[0] : (withProphet.length > 0 ? withProphet[0] : group[0])
  const toDelete = group.filter(i => i !== keep)
  console.log(`\n  💡 建議保留：${articles[keep].filename}`)
  for (const d of toDelete) {
    console.log(`  🗑  建議刪除：${articles[d].filename}`)
  }
  console.log()
}
