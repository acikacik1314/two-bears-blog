/**
 * draft-posts.mjs
 *
 * 掃描 ~/Downloads/未來人預言家/ 的新文字稿，
 * 透過 Gemini AI 生成部落格草稿，存入 drafts/ 資料夾。
 *
 * 用法：
 *   npm run draft                    單篇（下一篇未處理）
 *   npm run draft-batch -- --limit=10  批次（處理最多 10 篇）
 *   npm run draft -- --all           強制重新處理全部
 *   npm run draft -- --no-dup        停用重複偵測
 *   npm run draft -- --limit=1       只處理 1 篇
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs'
import { join, basename, dirname } from 'path'
import { fileURLToPath } from 'url'
import { homedir } from 'os'

const __dirname  = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')
const BLOG_DIR   = join(PROJECT_ROOT, 'src/content/blog')
const DRAFTS_DIR = join(PROJECT_ROOT, 'drafts')
const SOURCE_DIR = join(homedir(), 'Downloads/未來人預言家')
const PROPHETS_TS = join(PROJECT_ROOT, 'src/data/prophets.ts')
const TRACKING   = join(__dirname, 'draft-tracking.json')

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

const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
]

let apiCallCount = 0
let usedModels   = new Set()

async function callGeminiJSON(prompt, keys) {
  apiCallCount++
  const shuffled = [...keys].sort(() => Math.random() - 0.5)
  for (const model of GEMINI_MODELS) {
    for (const key of shuffled) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`
        const body = JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 8192,
            temperature: 0.65,
            responseMimeType: 'application/json',
            ...(model.startsWith('gemini-2.5') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          },
        })
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        })
        if (res.status === 429 || res.status === 503 || res.status === 500) continue
        if (res.status === 404) break   // model not found → try next model
        if (!res.ok) { console.warn(`  Gemini ${model}: HTTP ${res.status}`); continue }
        const data = await res.json()
        const parts = data?.candidates?.[0]?.content?.parts ?? []
        const text = parts.filter(p => !p.thought).map(p => p.text ?? '').join('').trim()
        if (text) { usedModels.add(model); return text }
      } catch (e) {
        console.warn(`  Gemini ${model} error: ${e.message}`)
        continue
      }
    }
  }
  throw new Error('所有 Gemini 模型/金鑰均失敗')
}

// ── Prophet ID 載入 + 別名比對 ────────────────────────────────────────────────

function loadProphetIds() {
  const ts = readFileSync(PROPHETS_TS, 'utf-8')
  return [...ts.matchAll(/id:\s*['"]([^'"]+)['"]/g)].map(m => m[1])
}

const ALIASES = {
  '比格斯':     ['biggs', 'brandon biggs', 'brandon', 'biggers', 'brandon_biggs'],
  '帕克':       ['parker', 'hamilton parker', 'craig hamilton parker', 'craig', 'craig_hamilton_parker'],
  'KFK':        ['kfk'],
  'ADI':        ['adi', '阿迪', '2062v', 'adi（阿迪）'],
  '2062':       ['2062未來人', '2ch未來人', '2062年未來人'],
  '2075':       ['yj2075', 'yj', '2075未來人'],
  '若海':       ['若海'],
  'jjjkf.j':   ['jjjkf.j', 'jjjkf', 'jjkfj'],
  '巴夏':       ['bashar', 'bashar & seth', 'bashar and seth'],
  '薩洛梅':    ['薩洛梅', '薩洛美', 'salome', 'salomé', 'salomee', 'athos salome', 'athos salomé'],
  '鄭博見':    ['鄭博見', '拿督鄭博見'],
  '麥克蒙尼格': ['mcmoneagle', 'joe mcmoneagle', 'mcmoneagle joe', 'joe_mcmoneagle'],
  '朱迪海文利': ['judy', 'hevenly', 'judy hevenly', 'judy heavenly', '朱迪'],
  'Adam Archon': ['adam archon', 'archon', 'adam_archon'],
  '阿南德':    ['anand'],
  '摩普萊':    ['morphee', 'morphée'],
  'Omnec Onec': ['omnec onec', 'omnec'],
  '國分玲':    ['国分玲', 'kuniwake'],
  '3036':       ['3036', '賽巴斯帝安', 'sebastian'],
  '3906':       ['3906', 'paul amadeus dienach', 'dienach', 'paul dienach', '保羅·阿瑪迪斯·迪納赫', 'chronicles from the future'],
  'amanda-grace': ['amanda grace', '阿曼達·葛瑞絲', '阿曼達', '葛瑞絲', 'amanda', 'grace'],
  'Clif High':  ['clif high', 'cliff high', '克里夫·海', '克里夫', 'clif'],
  'Clifford Mahooty': ['clifford mahooty', 'mahooty', '馬胡提', 'clifford mahooty'],
  'Ian Bremmer': ['ian bremmer', 'bremmer', '布雷默'],
  'David the Medium': ['david the medium', 'david medium', '大衛靈媒', '澳洲大衛', '大衛'],
}

function buildAliasLookup(knownIds) {
  const lookup = {}
  for (const id of knownIds) {
    lookup[id.toLowerCase()] = id
    for (const a of (ALIASES[id] ?? [])) lookup[a.toLowerCase()] = id
  }
  return lookup
}

function matchNames(names, lookup) {
  const matched = new Set()
  const unmatched = []
  for (const name of names) {
    const key = name.toLowerCase().trim()
    if (lookup[key]) { matched.add(lookup[key]); continue }
    let found = null
    for (const [alias, id] of Object.entries(lookup)) {
      if (key.includes(alias) || alias.includes(key)) { found = id; break }
    }
    if (found) matched.add(found)
    else unmatched.push(name)
  }
  return { matched: [...matched], unmatched }
}

// ── 檔名解析 ──────────────────────────────────────────────────────────────────

function parseFilename(filename) {
  // 格式：Prophet_Name_YYYYMMDD-YYYYMMDD_YYYYMMDD_HHMMSS.md
  const base  = basename(filename, '.md')
  const parts = base.split('_')

  let dateRangeIdx = -1
  for (let i = 0; i < parts.length; i++) {
    if (/^\d{8}-\d{8}$/.test(parts[i])) { dateRangeIdx = i; break }
  }

  const prophetParts = dateRangeIdx > 0 ? parts.slice(0, dateRangeIdx) : parts.slice(0, -2)
  const prophetHint  = prophetParts.join(' ')

  let pubDate    = new Date().toISOString().slice(0, 10)
  let dateStart  = pubDate
  let rangeInDays = 0

  if (dateRangeIdx >= 0) {
    const [s, e] = parts[dateRangeIdx].split('-')
    dateStart = `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`
    pubDate   = `${e.slice(0,4)}-${e.slice(4,6)}-${e.slice(6,8)}`
    rangeInDays = Math.round(
      (new Date(pubDate) - new Date(dateStart)) / 86400000
    )
  }

  return { prophetHint, pubDate, dateStart, rangeInDays }
}

// ── 現有文章索引（重複偵測）──────────────────────────────────────────────────

function loadBlogIndex() {
  const files = readdirSync(BLOG_DIR).filter(f => f.endsWith('.md'))
  return files.flatMap(file => {
    try {
      const content = readFileSync(join(BLOG_DIR, file), 'utf-8')
      if (!content.startsWith('---')) return []
      const end = content.indexOf('---', 3)
      if (end === -1) return []
      const fm = content.slice(3, end)
      const title   = (fm.match(/^title\s*:\s*['"]?(.+?)['"]?\s*$/m)?.[1] ?? '').replace(/^'|'$|^"|"$/g, '').replace(/''/g, "'")
      const pubDate = (fm.match(/^pubDate\s*:\s*['"]?(.+?)['"]?\s*$/m)?.[1] ?? '').replace(/^'|'$|^"|"$/g, '')
      const pRaw    = fm.match(/^prophet\s*:(.+)$/m)?.[1]?.trim() ?? ''
      let prophets  = []
      if (pRaw) {
        if (pRaw.trimStart().startsWith('[')) {
          try { prophets = JSON.parse(pRaw.trim()) } catch {}
        } else {
          prophets = [pRaw.replace(/^'|'$|^"|"$/g, '').trim()]
        }
      }
      return [{ file, title, pubDate, prophets }]
    } catch { return [] }
  })
}

// 標題 bigram 相似度（中文 2-char n-gram Dice）
function titleSimilarity(a, b) {
  if (!a || !b || a.length < 2 || b.length < 2) return 0
  const bigrams = str => {
    const s = new Set()
    for (let i = 0; i < str.length - 1; i++) s.add(str.slice(i, i + 2))
    return s
  }
  const sa = bigrams(a), sb = bigrams(b)
  if (!sa.size || !sb.size) return 0
  let inter = 0
  for (const g of sa) if (sb.has(g)) inter++
  return (2 * inter) / (sa.size + sb.size)
}

// 預-AI 重複偵測：相同預言家 + pubDate 前後 3 天（僅抓同日或鄰日）
function checkPreAIDuplicate(prophetIds, pubDate, blogIndex) {
  if (!prophetIds.length) return []
  const targetMs = new Date(pubDate).getTime()
  const WINDOW   = 3 * 86400000
  return blogIndex.filter(post => {
    if (!post.prophets.some(p => prophetIds.includes(p))) return false
    const postMs = new Date(post.pubDate).getTime()
    return !isNaN(postMs) && Math.abs(postMs - targetMs) <= WINDOW
  })
}

// 後-AI 標題相似度偵測
function checkPostAIDuplicate(newTitle, prophetIds, blogIndex) {
  const THRESHOLD = 0.5
  return blogIndex.filter(post => {
    if (prophetIds.length && !post.prophets.some(p => prophetIds.includes(p))) return false
    return titleSimilarity(newTitle, post.title) >= THRESHOLD
  })
}

// ── 追蹤檔 ────────────────────────────────────────────────────────────────────

function getTracking() {
  if (!existsSync(TRACKING)) return {}
  return JSON.parse(readFileSync(TRACKING, 'utf-8'))
}
function saveTracking(data) {
  writeFileSync(TRACKING, JSON.stringify(data, null, 2))
}

// ── Hero 圖片 ─────────────────────────────────────────────────────────────────

const HERO = {
  default:   'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=800&h=450&fit=crop',
  war:       'https://images.unsplash.com/photo-1509347528160-9a9e33742cdb?w=800&h=450&fit=crop',
  space:     'https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?w=800&h=450&fit=crop',
  mystical:  'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&h=450&fit=crop',
  globe:     'https://images.unsplash.com/photo-1614730321146-b6fa6a46bcb4?w=800&h=450&fit=crop',
  lightning: 'https://images.unsplash.com/photo-1505672678657-cc7037095e60?w=800&h=450&fit=crop',
  economy:   'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&h=450&fit=crop',
  nature:    'https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?w=800&h=450&fit=crop',
  disaster:  'https://images.unsplash.com/photo-1547683905-f686c993aae5?w=800&h=450&fit=crop',
}

// ── 核心：處理單一來源文字稿 ──────────────────────────────────────────────────

async function processDraft(sourceFile, keys, knownIds, aliasLookup, blogIndex, skipDup) {
  const raw = readFileSync(join(SOURCE_DIR, sourceFile), 'utf-8')
  const { prophetHint, pubDate, dateStart, rangeInDays } = parseFilename(sourceFile)

  // 從檔名先做別名比對，取得候選 prophet IDs（用於重複偵測）
  const { matched: hintIds } = matchNames([prophetHint], aliasLookup)

  // 長篇編輯標注（> 90 天）
  const isLongCompilation = rangeInDays > 90

  // ── 預-AI 重複偵測 ────────────────────────────────────────────────────────
  if (!skipDup && !isLongCompilation && hintIds.length) {
    const conflicts = checkPreAIDuplicate(hintIds, pubDate, blogIndex)
    if (conflicts.length) {
      return {
        skipped:   true,
        reason:    'duplicate',
        conflicts: conflicts.map(c => `${c.file}（${c.pubDate}）`),
        prophetHint,
        pubDate,
      }
    }
  }

  // 截斷超長文字稿，留足夠 token 給 AI 輸出
  const content = raw.length > 9000 ? raw.slice(0, 9000) + '\n\n[...內容已截斷]' : raw

  const knownIdsList = knownIds.join('、')
  const heroKeys     = Object.keys(HERO).join('、')

  const longNote = isLongCompilation
    ? `\n注意：此文字稿涵蓋 ${rangeInDays} 天的長期編輯（從 ${dateStart} 到 ${pubDate}），請用 pubDate: '${pubDate}' 並在 slug 中反映主要主題，不要包含日期。`
    : ''

  const prompt = `你是「兩隻熊」部落格的專業編輯，專門報導靈性與末日預言。

以下是一份來自「${prophetHint}」的 Podcast 腳本，收錄日期：${pubDate}：${longNote}

---
${content}
---

請完成以下三件事，以 JSON 格式回傳（不要有任何 JSON 以外的文字）：

**第一件：生成部落格文章**
- slug：英文、小寫連字號、描述主題、30字元以內（不要包含日期）
- title：繁體中文、20字以內、要有數字或懸念、不要直接翻譯標題、不要重複預言家名字
- description：繁體中文 SEO 摘要，兩句話說明核心預言，60字以內
- category：從以下選一個：預言、靈性、金融、地緣政治、科技、天災、健康
- tags：繁體中文陣列，3-5 個標籤，例如 ["預言","末日","比格斯"]
- heroImageKey：從以下選最符合主題的一個：${heroKeys}
- body：繁體中文文章正文，500-700 字，格式要求如下：
  - 用**粗體**作為段落小標（不用 # 號）
  - 引述用「某某說：『...』」格式
  - 刪除所有「（過場）」標記
  - 開場直接切入主題，不要廢話

**第二件：識別文中提到的預言家**
- prophetNamesInText：文中提到的預言家名稱（原文照寫，可多個，找不到就空陣列）
- matchedProphetIds：對應到以下名冊的 ID（嚴格只用名冊裡的字串，對應不到就空陣列）
  已知名冊：${knownIdsList}
  常見別名：Brandon Biggs/Biggs→比格斯、Hamilton Parker/Parker→帕克、
  Bashar→巴夏、Joe McMoneagle→麥克蒙尼格、Judy Hevenly/Judy→朱迪海文利、
  Adam Archon→Adam Archon、Morphee→摩普萊、KFK→KFK、ADI/阿迪→ADI、
  薩洛美/薩洛梅/Salomé→薩洛梅、賽巴斯帝安/Sebastian→3036、Dienach→3906、
  Amanda Grace/阿曼達·葛瑞絲/阿曼達→amanda-grace、
  Clif High/克里夫·海→Clif High、Clifford Mahooty/馬胡提→Clifford Mahooty、
  Ian Bremmer/布雷默→Ian Bremmer、David the Medium/大衛靈媒→David the Medium
  ⚠️ 重要：文中被提及的政治人物與公眾人物（普丁、川普、澤倫斯基、拜登、習近平等）是預言的對象，不是預言家，絕對不列入 prophetNamesInText 或 matchedProphetIds
- unidentifiedPeople：文中提到但對應不到名冊的人物（如全新角色）

**第三件：抽取具體預言**
- pendingPredictions：從文中抽取具體、可驗證的預言，上限 12 條
  **每條是純字串**（直接寫預言文字，例如 "富士山將在2026年爆發"，不要包裝成物件或加子欄位）
  **過篩標準（三項缺一不可）**：
  ① 必須是未來將發生的事件（不是已發生的描述或背景說明）
  ② 必須有明確的事件主體 + 可驗證的結果（不能只是感覺或意象）
  ③ 必須有可辨識的驗證標的（有時間框架、具體地點或明確可判斷真偽的事件皆可）
  **不算的例子**：「土耳其像吸血鬼崛起」「黑暗籠罩歐洲」「要保持冥想」
  **算的例子**：「川普將在2027年面臨彈劾」「富士山將在2026年爆發」
  逐字稿具體預言不足 12 條時有幾條回幾條，禁止湊數；超過 12 條時取最重要的 12 條

回傳的 JSON 結構：
{
  "slug": "...",
  "title": "...",
  "description": "...",
  "category": "...",
  "tags": [...],
  "heroImageKey": "...",
  "body": "...",
  "prophetNamesInText": [...],
  "matchedProphetIds": [...],
  "unidentifiedPeople": [...],
  "pendingPredictions": [...]
}`

  const rawResult = await callGeminiJSON(prompt, keys)

  let parsed
  try {
    parsed = JSON.parse(rawResult)
  } catch {
    // 嘗試從回傳中擷取 JSON 區塊
    const m = rawResult.match(/\{[\s\S]+\}/)
    const jsonStr = m ? m[0] : rawResult

    // 修復常見問題：字串內的斷行、tab、control chars
    const repaired = jsonStr
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')  // control chars
      .replace(/(?<=[^\\])\n(?=[^"]*"[^"]*(?:"[^"]*"[^"]*)*$)/g, '\\n')  // 字串內換行
    try {
      parsed = JSON.parse(repaired)
    } catch {
      // 最後手段：嘗試截斷損壞的 pendingPredictions 陣列
      const safeStr = jsonStr.replace(
        /("pendingPredictions"\s*:\s*\[)([\s\S]*?)(\])/,
        (_, open, content, close) => {
          // 只保留到最後一個完整的 '...' 項目
          const items = []
          const re = /'((?:[^'\\]|\\.)*)'/g
          let hit
          while ((hit = re.exec(content)) !== null) items.push(`'${hit[1]}'`)
          // 或取 JSON 字串項目
          const re2 = /"((?:[^"\\]|\\.)*)"/g
          const items2 = []
          while ((hit = re2.exec(content)) !== null) items2.push(`"${hit[1]}"`)
          const best = (items.length >= items2.length ? items : items2)
          return open + best.join(', ') + close
        }
      )
      try {
        parsed = JSON.parse(safeStr)
      } catch (e2) {
        throw new Error(`AI 回傳 JSON 無法修復：${e2.message}  原文前 300 字：${rawResult.slice(0, 300)}`)
      }
    }
  }

  const {
    slug, title, description, category, tags,
    heroImageKey, body,
    prophetNamesInText = [], matchedProphetIds = [],
    unidentifiedPeople = [], pendingPredictions = [],
  } = parsed

  if (!slug || !title || !body) throw new Error('AI 回傳缺少必要欄位（slug/title/body）')

  // 二次驗證：過濾 AI 回傳的 prophet IDs，只保留名冊裡真實存在的
  const verifiedFromAI = matchedProphetIds.filter(id => knownIds.includes(id))
  const { matched: clientMatched, unmatched: clientUnmatched } = matchNames(prophetNamesInText, aliasLookup)
  const allMatchedIds   = [...new Set([...verifiedFromAI, ...clientMatched])]
  const allUnidentified = [...new Set([...unidentifiedPeople, ...clientUnmatched])]
    .filter(name => !verifiedFromAI.some(id => ALIASES[id]?.includes(name.toLowerCase())))

  // 後-AI 標題重複偵測（警示用，不擋）
  const titleConflicts = skipDup ? [] : checkPostAIDuplicate(title, allMatchedIds, blogIndex)

  // Slug 安全化 + 唯一性
  let finalSlug = slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)

  // 與既有 blog 文章 slug 比對（防撞名）
  const existingBlogSlugs = new Set(blogIndex.map(p => p.file.replace(/\.md$/, '')))
  let draftPath = join(DRAFTS_DIR, `${finalSlug}.md`)
  if (existsSync(draftPath) || existingBlogSlugs.has(finalSlug)) {
    finalSlug = `${finalSlug}-${pubDate.replace(/-/g, '')}`
    draftPath  = join(DRAFTS_DIR, `${finalSlug}.md`)
  }

  // 組合 frontmatter
  const heroImage = HERO[heroImageKey] ?? HERO.default
  const safeTitle = title.replace(/'/g, "''")
  const safeDesc  = (description ?? '').replace(/'/g, "''")
  const tagsYaml  = JSON.stringify(tags ?? ['預言'])

  let prophetLine = ''
  if (allMatchedIds.length === 1) {
    prophetLine = `\nprophet: '${allMatchedIds[0]}'`
  } else if (allMatchedIds.length > 1) {
    prophetLine = `\nprophet: ${JSON.stringify(allMatchedIds)}`
  }

  let predictionsBlock = ''
  if (pendingPredictions.length) {
    const items = pendingPredictions
      .map(p => {
        // AI 有時回傳物件（{text: '...', timeframe: '...'}），提取文字
        const str = typeof p === 'string'
          ? p
          : (p?.prediction || p?.text || p?.content || p?.description || p?.summary || JSON.stringify(p))
        return `    - '${String(str).replace(/'/g, "''")}'`
      })
      .join('\n')
    predictionsBlock = `\npredictions:\n  pending:\n${items}`
  }

  const longCompilationNote = isLongCompilation
    ? `\n# 長篇編輯：涵蓋 ${dateStart} 至 ${pubDate}（共 ${rangeInDays} 天）`
    : ''

  const mdContent = `---
title: '${safeTitle}'
description: '${safeDesc}'
pubDate: '${pubDate}'
category: '${category ?? '預言'}'
tags: ${tagsYaml}
heroImage: '${heroImage}'${prophetLine}${predictionsBlock}
draft: true
---
${longCompilationNote}
${body.trim()}
`

  writeFileSync(draftPath, mdContent, 'utf-8')

  return {
    skipped:         false,
    draftFile:       basename(draftPath),
    matchedIds:      allMatchedIds,
    unidentified:    allUnidentified,
    predictionCount: pendingPredictions.length,
    prophetRaw:      prophetNamesInText,
    titleConflicts,
    isLongCompilation,
    pubDate,
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args     = process.argv.slice(2)
  const forceAll = args.includes('--all')
  const skipDup  = args.includes('--no-dup')
  const limitArg = args.find(a => a.startsWith('--limit='))
  const limit    = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity

  if (!existsSync(SOURCE_DIR)) {
    console.error(`❌ 來源資料夾不存在：${SOURCE_DIR}`)
    process.exit(1)
  }

  const keys = getGeminiKeys()
  if (!keys.length) {
    console.error('❌ 找不到 Gemini API key。')
    console.error('   請確認 ~/.claude/api_keys.json 有 "gemini" 欄位，或設定 GEMINI_API_KEY 環境變數。')
    process.exit(1)
  }

  const knownIds    = loadProphetIds()
  const aliasLookup = buildAliasLookup(knownIds)
  const blogIndex   = skipDup ? [] : loadBlogIndex()

  if (!existsSync(DRAFTS_DIR)) mkdirSync(DRAFTS_DIR, { recursive: true })

  const tracking  = getTracking()
  const allFiles  = readdirSync(SOURCE_DIR).filter(f => f.endsWith('.md')).sort()
  const toProcess = (forceAll
    ? allFiles
    : allFiles.filter(f => !tracking[f] || tracking[f].status === 'error'))
    .slice(0, limit)

  if (toProcess.length === 0) {
    const drafted   = Object.values(tracking).filter(v => v.status === 'drafted').length
    const published = Object.values(tracking).filter(v => v.status === 'published').length
    console.log(`✅ 沒有新文字稿。已草稿 ${drafted} 篇｜已發布 ${published} 篇｜共 ${allFiles.length} 篇`)
    return
  }

  console.log(`\n📋 找到 ${toProcess.length} 篇新文字稿（共 ${allFiles.length} 篇）`)
  if (!skipDup) console.log(`   已載入既有文章索引：${blogIndex.length} 篇（重複偵測中）`)
  console.log(`   已知預言家：${knownIds.length} 位（${knownIds.join('、')}）\n`)

  const report     = []
  const duplicates = []

  for (const file of toProcess) {
    console.log(`\n🔄 ${file}`)
    try {
      const result = await processDraft(file, keys, knownIds, aliasLookup, blogIndex, skipDup)

      if (result.skipped) {
        // 疑似重複，跳過
        const reason = `與既有文章重疊：${result.conflicts.join('、')}`
        console.log(`   ⏭  疑似重複，跳過`)
        console.log(`       ${reason}`)
        tracking[file] = { status: 'skipped-duplicate', reason, at: new Date().toISOString() }
        saveTracking(tracking)
        duplicates.push({ file, ...result })
        report.push({ file, ok: false, skipped: true, reason })
        continue
      }

      tracking[file] = {
        status:    'drafted',
        draftFile: result.draftFile,
        draftedAt: new Date().toISOString(),
      }
      saveTracking(tracking)
      report.push({ file, ...result, ok: true })

      console.log(`   ✅ drafts/${result.draftFile}  [${result.pubDate}]`)
      if (result.isLongCompilation) console.log(`   📚 長篇編輯（已標注）`)
      if (result.matchedIds.length)    console.log(`   👤 預言家：${result.matchedIds.join('、')}`)
      if (result.unidentified.length)  console.log(`   ⚠️  未識別：${result.unidentified.join('、')}`)
      if (result.titleConflicts.length) {
        console.log(`   🔶 標題相似警示：${result.titleConflicts.map(c => c.file).join('、')}`)
      }
      console.log(`   📊 預言：${result.predictionCount} 條`)

    } catch (e) {
      console.error(`   ❌ 失敗：${e.message}`)
      tracking[file] = { status: 'error', error: e.message, at: new Date().toISOString() }
      saveTracking(tracking)
      report.push({ file, ok: false, skipped: false, error: e.message })
    }
    await new Promise(r => setTimeout(r, 2000))
  }

  // ── 最終報告 ───────────────────────────────────────────────────────────────
  const ok          = report.filter(r => r.ok)
  const skipped     = report.filter(r => r.skipped)
  const failed      = report.filter(r => !r.ok && !r.skipped)
  const needsHuman  = ok.filter(r => r.unidentified?.length > 0 || r.matchedIds?.length === 0)
  const titleWarns  = ok.filter(r => r.titleConflicts?.length > 0)
  const allUnident  = [...new Set(ok.flatMap(r => r.unidentified ?? []))]

  console.log('\n' + '═'.repeat(60))
  console.log('📋 批次完成報告')
  console.log(`   新增草稿：${ok.length} 篇｜疑似重複跳過：${skipped.length} 篇｜失敗：${failed.length} 篇`)
  console.log(`   Gemini API 呼叫：${apiCallCount} 次（模型：${[...usedModels].join('、') || '無'}）`)

  if (ok.length) {
    console.log('\n✅ 草稿清單：')
    for (const r of ok) {
      const ids   = r.matchedIds?.length ? r.matchedIds.join('、') : '（未識別）'
      const warns = r.titleConflicts?.length ? ' 🔶標題相似' : ''
      const comp  = r.isLongCompilation ? ' 📚長篇' : ''
      console.log(`   • drafts/${r.draftFile}${comp}${warns}`)
      console.log(`     [${r.pubDate}]  預言家：${ids}  |  預言 ${r.predictionCount} 條`)
    }
  }

  if (skipped.length) {
    console.log('\n⏭  疑似重複（已跳過，待你裁決：跳過、合併、或照常新增）：')
    for (const r of skipped) {
      console.log(`   • ${r.file}`)
      console.log(`     ${r.reason}`)
    }
  }

  if (allUnident.length) {
    console.log(`\n⚠️  全批未識別人物（需人工確認 prophet 欄位）：${allUnident.join('、')}`)
    for (const r of needsHuman) {
      const issues = []
      if (r.matchedIds?.length === 0) issues.push('無法自動識別預言家')
      if (r.unidentified?.length)     issues.push(`未識別：${r.unidentified.join('、')}`)
      console.log(`   • drafts/${r.draftFile}：${issues.join('；')}`)
    }
  }

  if (titleWarns.length) {
    console.log('\n🔶 標題相似警示（草稿已生成，請確認是否重複）：')
    for (const r of titleWarns) {
      for (const c of r.titleConflicts) {
        console.log(`   • drafts/${r.draftFile}  ←→  ${c.file}（${c.pubDate}）`)
      }
    }
  }

  if (failed.length) {
    console.log('\n❌ 失敗清單：')
    for (const r of failed) console.log(`   • ${r.file}：${r.error}`)
  }

  if (ok.length) {
    console.log('\n👉 確認 drafts/ 內容後，執行 npm run publish 發布。')
    console.log('   （每批審核完再 publish，不要一次推全部）')
  }
}

main().catch(e => {
  console.error('Fatal:', e.message)
  process.exit(1)
})
