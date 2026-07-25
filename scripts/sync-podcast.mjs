/**
 * sync-podcast.mjs
 *
 * 從 Spotify/Anchor RSS 抓新集數，用 Groq Whisper 轉逐字稿，
 * 存成 .md 來源檔供 draft-posts.mjs 處理。
 *
 * 環境變數：
 *   GROQ_API_KEYS        JSON 陣列字串（CI 用）
 *   PODCAST_SOURCE_DIR   來源檔輸出資料夾
 *   MAX_EPISODES         每次最多處理幾集（預設 3）
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'
import { tmpdir, homedir } from 'os'

const __dirname   = dirname(fileURLToPath(import.meta.url))
const RSS_URL     = 'https://anchor.fm/s/11310a874/podcast/rss'
const TRACKING    = join(__dirname, 'podcast-sync-tracking.json')
const OUTPUT_DIR  = process.env.PODCAST_SOURCE_DIR ?? join(__dirname, '../sources/podcasts')
const MAX_EP      = parseInt(process.env.MAX_EPISODES ?? '3', 10)

// ── Groq keys ─────────────────────────────────────────────────────────────────

function getGroqKeys() {
  const env = process.env.GROQ_API_KEYS
  if (env) { try { return JSON.parse(env) } catch {} }
  if (process.env.GROQ_API_KEY) return [process.env.GROQ_API_KEY]
  try {
    const d = JSON.parse(readFileSync(join(homedir(), '.claude/api_keys.json'), 'utf-8'))
    if (Array.isArray(d.groq) && d.groq.length) return d.groq
  } catch {}
  return []
}

// ── Tracking ──────────────────────────────────────────────────────────────────

function getTracking() {
  if (!existsSync(TRACKING)) return {}
  return JSON.parse(readFileSync(TRACKING, 'utf-8'))
}
function saveTracking(data) {
  writeFileSync(TRACKING, JSON.stringify(data, null, 2))
}

// ── RSS 解析 ──────────────────────────────────────────────────────────────────

async function fetchRSS() {
  const res = await fetch(RSS_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RSS reader)' },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`RSS 抓取失敗：${res.status}`)
  return res.text()
}

function extractCdata(tag, str) {
  return str.match(new RegExp(`<${tag}><\\!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`))?.[1]?.trim()
      ?? str.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1]?.trim()
      ?? ''
}

function parseEpisodes(xml) {
  return xml.split('<item>').slice(1).map(item => ({
    title:    extractCdata('title', item),
    guid:     item.match(/<guid[^>]*>([^<]+)<\/guid>/)?.[1]?.trim() ?? '',
    pubDate:  item.match(/<pubDate>([^<]+)<\/pubDate>/)?.[1]?.trim() ?? '',
    audioUrl: item.match(/<enclosure[^>]*url="([^"]+)"/)?.[1] ?? '',
    description: extractCdata('description', item),
  })).filter(ep => ep.guid && ep.audioUrl)
}

function toYYYYMMDD(pubDate) {
  try {
    const d = new Date(pubDate)
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10).replace(/-/g, '')
  } catch {}
  return new Date().toISOString().slice(0, 10).replace(/-/g, '')
}

// ── 音訊下載 + 壓縮 ───────────────────────────────────────────────────────────

async function downloadAudio(url, destPath) {
  console.log('  下載音訊...')
  const res = await fetch(url, { signal: AbortSignal.timeout(180000) })
  if (!res.ok) throw new Error(`音訊下載失敗：${res.status}`)
  const buf = await res.arrayBuffer()
  writeFileSync(destPath, Buffer.from(buf))
  console.log(`  下載完成：${(buf.byteLength / 1024 / 1024).toFixed(1)} MB`)
}

function compressAudio(inputPath, outputPath) {
  console.log('  壓縮音訊（ffmpeg 32kbps mono）...')
  const r = spawnSync('ffmpeg', [
    '-i', inputPath, '-ar', '16000', '-ac', '1', '-b:a', '32k',
    '-f', 'mp3', outputPath, '-y',
  ], { encoding: 'utf-8', timeout: 180000 })
  if (r.status !== 0) throw new Error(`ffmpeg 失敗：${r.stderr?.slice(-300) ?? ''}`)
  const sizeMB = statSync(outputPath).size / 1024 / 1024
  console.log(`  壓縮完成：${sizeMB.toFixed(1)} MB`)
}

// ── Groq Whisper 轉錄 ──────────────────────────────────────────────────────────

async function transcribe(audioPath, keys) {
  console.log('  Groq Whisper 轉錄中...')
  const audioData = readFileSync(audioPath)

  for (const key of keys) {
    try {
      const form = new FormData()
      form.append('file', new Blob([audioData], { type: 'audio/mpeg' }), 'audio.mp3')
      form.append('model', 'whisper-large-v3-turbo')
      form.append('language', 'zh')
      form.append('response_format', 'text')

      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: form,
        signal: AbortSignal.timeout(180000),
      })

      if (res.status === 429 || res.status === 503) { console.warn('  Groq 限流，換 key'); continue }
      if (!res.ok) { console.warn(`  Groq 錯誤 ${res.status}`); continue }
      const text = await res.text()
      if (text?.trim()) {
        console.log(`  轉錄完成：${text.length} 字`)
        return text.trim()
      }
    } catch (e) {
      console.warn(`  Groq key 錯誤：${e.message}`)
    }
  }
  throw new Error('所有 Groq key 均失敗')
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const keys = getGroqKeys()
  if (!keys.length) {
    console.error('❌ 找不到 Groq API key。請設定 GROQ_API_KEYS 環境變數。')
    process.exit(1)
  }

  mkdirSync(OUTPUT_DIR, { recursive: true })
  const tracking = getTracking()

  console.log('📡 抓取 podcast RSS...')
  const xml = await fetchRSS()
  const episodes = parseEpisodes(xml)
  console.log(`  共 ${episodes.length} 集`)

  const newEps = episodes.filter(ep => !tracking[ep.guid]).slice(0, MAX_EP)
  if (!newEps.length) {
    console.log('✅ 沒有新集數，結束。')
    return
  }
  console.log(`  新集數：${newEps.length} 集\n`)

  let created = 0
  for (const ep of newEps) {
    console.log(`🎙 ${ep.title}`)
    const dateStr   = toYYYYMMDD(ep.pubDate)
    const tmpIn     = join(tmpdir(), `podcast-in-${dateStr}.mp3`)
    const tmpOut    = join(tmpdir(), `podcast-out-${dateStr}.mp3`)

    try {
      await downloadAudio(ep.audioUrl, tmpIn)
      compressAudio(tmpIn, tmpOut)
      const transcript = await transcribe(tmpOut, keys)

      const now       = new Date()
      const datePart  = now.toISOString().slice(0, 10).replace(/-/g, '')
      const timePart  = now.toISOString().slice(11, 19).replace(/:/g, '')
      const safeTitle = ep.title.replace(/[/\\?%*:|"<>[\]]/g, '_').slice(0, 50)
      const filename  = `${safeTitle}_${dateStr}-${dateStr}_${datePart}_${timePart}.md`
      const content   = `# ${ep.title}\n> 集數日期：${ep.pubDate}\n\n${transcript}\n`

      writeFileSync(join(OUTPUT_DIR, filename), content, 'utf-8')
      tracking[ep.guid] = { status: 'transcribed', file: filename, at: now.toISOString() }
      saveTracking(tracking)
      created++
      console.log(`  ✅ ${filename}\n`)
    } catch (e) {
      console.error(`  ❌ 失敗：${e.message}\n`)
      tracking[ep.guid] = { status: 'error', error: e.message, at: new Date().toISOString() }
      saveTracking(tracking)
    }

    for (const p of [tmpIn, tmpOut]) { try { unlinkSync(p) } catch {} }
  }

  console.log(`✅ 完成：${created} 集轉成來源檔`)
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
