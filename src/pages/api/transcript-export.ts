export const prerender = false

import type { APIRoute } from 'astro'
import { getCollection } from 'astro:content'

function findMarker(body: string): string | null {
  for (const m of ['\n## 逐字稿', '\n## 影片逐字稿']) {
    if (body.indexOf(m) > 200) return m
  }
  return null
}

const SEP = '═'.repeat(60)

export const POST: APIRoute = async ({ request }) => {
  let ids: string[] = []
  try {
    const body = await request.json()
    ids = Array.isArray(body.ids) ? body.ids : []
  } catch {
    return new Response(JSON.stringify({ ok: false, error: '格式錯誤' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (ids.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: '未選擇任何逐字稿' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const all = await getCollection('blog')
  const postMap = new Map(all.map(p => [p.id, p]))

  const chunks: string[] = []

  for (const id of ids) {
    const post = postMap.get(id)
    if (!post || post.data.draft || !post.body) continue

    const marker = findMarker(post.body)
    if (!marker) continue

    const transcriptText = post.body.split(marker).slice(1).join(marker).trim()

    const prophet = Array.isArray(post.data.prophet)
      ? post.data.prophet.join('、')
      : (post.data.prophet ?? '（未知）')

    const videoUrl = post.data.youtubeId
      ? `https://www.youtube.com/watch?v=${post.data.youtubeId}`
      : (post.data.rumblePage ?? '（無影片連結）')

    const date = new Date(post.data.pubDate).toLocaleDateString('zh-TW')

    const header = [
      SEP,
      `預言家：${prophet}`,
      `標題：${post.data.title}`,
      `日期：${date}`,
      `影片：${videoUrl}`,
      SEP,
      '',
    ].join('\n')

    chunks.push(header + transcriptText)
  }

  if (chunks.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: '找不到對應逐字稿內容' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const output = chunks.join('\n\n\n')
  const filename = `transcripts-${new Date().toISOString().slice(0, 10)}.txt`

  return new Response(output, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
