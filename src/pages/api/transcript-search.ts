export const prerender = false

import type { APIRoute } from 'astro'
import { getCollection } from 'astro:content'

function findMarker(body: string): string | null {
  for (const m of ['\n## 逐字稿', '\n## 影片逐字稿']) {
    if (body.indexOf(m) > 200) return m
  }
  return null
}

function extractContext(text: string, query: string, contextLen = 120): string[] {
  const lower = text.toLowerCase()
  const lowerQ = query.toLowerCase()
  const snippets: string[] = []
  let pos = 0
  while (snippets.length < 5) {
    const idx = lower.indexOf(lowerQ, pos)
    if (idx === -1) break
    const start = Math.max(0, idx - contextLen)
    const end = Math.min(text.length, idx + query.length + contextLen)
    let snippet = text.slice(start, end).replace(/\n+/g, ' ').trim()
    if (start > 0) snippet = '…' + snippet
    if (end < text.length) snippet = snippet + '…'
    snippets.push(snippet)
    pos = idx + query.length
  }
  return snippets
}

export const GET: APIRoute = async ({ url }) => {
  const q = url.searchParams.get('q')?.trim()
  if (!q || q.length < 2) {
    return new Response(JSON.stringify({ ok: false, error: '請輸入至少 2 個字' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const all = await getCollection('blog')
  const results: {
    id: string
    title: string
    prophet: string
    date: string
    videoUrl: string
    snippets: string[]
  }[] = []

  for (const post of all) {
    if (post.data.draft || !post.body) continue
    const marker = findMarker(post.body)
    if (!marker) continue

    const transcriptText = post.body.split(marker).slice(1).join(marker).trim()
    if (!transcriptText.toLowerCase().includes(q.toLowerCase())) continue

    const prophet = Array.isArray(post.data.prophet)
      ? post.data.prophet.join('、')
      : (post.data.prophet ?? '')

    const videoUrl = post.data.youtubeId
      ? `https://www.youtube.com/watch?v=${post.data.youtubeId}`
      : (post.data.rumblePage ?? '')

    results.push({
      id: post.id,
      title: post.data.title,
      prophet,
      date: new Date(post.data.pubDate).toLocaleDateString('zh-TW'),
      videoUrl,
      snippets: extractContext(transcriptText, q),
    })
  }

  results.sort((a, b) => b.date.localeCompare(a.date))

  return new Response(JSON.stringify({ ok: true, q, results }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
