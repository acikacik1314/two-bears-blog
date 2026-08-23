#!/usr/bin/env node
/**
 * find-duplicates.mjs
 *
 * 掃描 src/content/blog/ 找出重複/高度相似標題的文章。
 * 預設為 dry-run（只列出，不刪除）。
 *
 * 用法：
 *   node scripts/find-duplicates.mjs              # 只列出，不刪除
 *   node scripts/find-duplicates.mjs --delete     # 自動刪除低分版本
 *   node scripts/find-duplicates.mjs --threshold 0.85
 */

import { readdirSync, readFileSync, unlinkSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BLOG_DIR  = join(__dirname, '../src/content/blog')
const ROOT_DIR  = join(__dirname, '..')

const args        = process.argv.slice(2)
const DELETE_MODE = args.includes('--delete')
const threshArg   = args.find(a => a.startsWith('--threshold'))
const THRESHOLD   = threshArg
  ? parseFloat(threshArg.includes('=') ? threshArg.split('=')[1] : args[args.indexOf(threshArg) + 1])
  : 0.9

// ── helpers ──────────────────────────────────────────────────────────────────

function extractField(content, field) {
  const m = content.match(new RegExp(`^${field}:\\s*['"]?(.+?)['"]?\\s*$`, 'm'))
  return m ? m[1].trim() : ''
}

function normalize(title) {
  return title
    .toLowerCase()
    .replace(/[，。！？、：；「」『』【】《》〈〉,.!?:;"'()\s\-_·•]/g, '')
}

function similarity(a, b) {
  const na = normalize(a)
  const nb = normalize(b)
  if (na === nb) return 1
  if (!na || !nb) return 0
  if (na.includes(nb) || nb.includes(na)) {
    return Math.min(na.length, nb.length) / Math.max(na.length, nb.length)
  }
  // Bigram Dice
  const bigrams = s => {
    const map = new Map()
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2)
      map.set(bg, (map.get(bg) ?? 0) + 1)
    }
    return map
  }
  const ba = bigrams(na), bb = bigrams(nb)
  let inter = 0
  for (const [bg, cnt] of ba) inter += Math.min(cnt, bb.get(bg) ?? 0)
  const total = [...ba.values()].reduce((s, v) => s + v, 0) +
                [...bb.values()].reduce((s, v) => s + v, 0)
  return total === 0 ? 0 : (2 * inter) / total
}

// ── load vercel.json redirects ────────────────────────────────────────────────

const vercelJson = JSON.parse(readFileSync(join(ROOT_DIR, 'vercel.json'), 'utf-8'))
const redirectSources      = new Set()  // slugs that are redirect sources (old URLs)
const redirectDestinations = new Set()  // slugs that are redirect destinations (canonical)

for (const r of vercelJson.redirects ?? []) {
  const srcMatch  = r.source?.match(/^\/blog\/(.+)$/)
  const dstMatch  = r.destination?.match(/^\/blog\/(.+)$/)
  if (srcMatch)  redirectSources.add(srcMatch[1])
  if (dstMatch)  redirectDestinations.add(dstMatch[1])
}

// ── load articles ─────────────────────────────────────────────────────────────

const files    = readdirSync(BLOG_DIR).filter(f => f.endsWith('.md'))
const articles = files.map(filename => {
  const slug    = filename.replace(/\.md$/, '')
  const content = readFileSync(join(BLOG_DIR, filename), 'utf-8')
  const claims  = (content.match(/^\s*- claim:/gm) ?? []).length
  return {
    filename,
    slug,
    title:     extractField(content, 'title'),
    pubDate:   extractField(content, 'pubDate'),
    prophet:   extractField(content, 'prophet'),
    heroImage: extractField(content, 'heroImage'),
    claims,
    length: content.length,
  }
}).filter(a => a.title)

console.log(`📚 共掃描 ${articles.length} 篇文章（門檻：${THRESHOLD}）${DELETE_MODE ? ' ── 自動刪除模式' : ' ── 預覽模式（加 --delete 才會刪除）'}\n`)

// ── scoring ───────────────────────────────────────────────────────────────────

function score(a) {
  let s = 0
  if (redirectDestinations.has(a.slug)) s += 10  // canonical URL
  if (redirectSources.has(a.slug))      s -= 5   // already redirected away
  if (a.heroImage)                      s += 3
  if (a.prophet)                        s += 2
  s += a.claims                                   // +1 per prediction
  s += a.length / 5000                            // minor tiebreaker
  return s
}

// ── find duplicates ───────────────────────────────────────────────────────────

const groups  = []
const matched = new Set()

for (let i = 0; i < articles.length; i++) {
  if (matched.has(i)) continue
  const group = [i]
  for (let j = i + 1; j < articles.length; j++) {
    if (matched.has(j)) continue
    if (similarity(articles[i].title, articles[j].title) >= THRESHOLD) {
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
  console.log('✅ 未發現重複文章')
  process.exit(0)
}

console.log(`⚠️  發現 ${groups.length} 組重複文章\n`)

let deletedCount = 0

for (const [idx, group] of groups.entries()) {
  const scored = group.map(i => ({ i, a: articles[i], s: score(articles[i]) }))
  scored.sort((x, y) => y.s - x.s)
  const keep   = scored[0]
  const toDelete = scored.slice(1)

  console.log(`━━━ 第 ${idx + 1} 組 ━━━`)
  for (const { a, s } of scored) {
    const flags = [
      redirectDestinations.has(a.slug) ? '🔗redirect目的地' : '',
      redirectSources.has(a.slug)      ? '↩redirect來源'   : '',
      a.prophet   ? `prophet:${a.prophet}` : '❌無prophet',
      a.heroImage ? '✅heroImage'          : '❌無heroImage',
      `${a.claims}條預言`,
      `評分:${s.toFixed(1)}`,
    ].filter(Boolean).join('  ')
    console.log(`  📄 ${a.filename}`)
    console.log(`     ${flags}`)
  }
  console.log(`  💡 保留：${keep.a.filename}`)

  for (const { a } of toDelete) {
    const path = join(BLOG_DIR, a.filename)
    if (DELETE_MODE) {
      if (existsSync(path)) {
        unlinkSync(path)
        console.log(`  🗑  已刪除：${a.filename}`)
        deletedCount++
      }
    } else {
      console.log(`  🗑  建議刪除：${a.filename}`)
    }
  }
  console.log()
}

if (DELETE_MODE) {
  console.log(`✅ 完成：共刪除 ${deletedCount} 篇重複文章`)
} else {
  console.log(`ℹ️  以上為預覽，執行 node scripts/find-duplicates.mjs --delete 才會實際刪除`)
}
