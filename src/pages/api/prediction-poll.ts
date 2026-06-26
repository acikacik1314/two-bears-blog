export const prerender = false
import type { APIRoute } from 'astro'
import { put, list } from '@vercel/blob'

const KEY = 'prediction-poll.json'

type PollMap = Record<string, { agree: number; disagree: number }>

async function getData(): Promise<PollMap> {
  try {
    const { blobs } = await list({ prefix: KEY, limit: 1 })
    const blob = blobs.find(b => b.pathname === KEY)
    if (!blob) return {}
    const res = await fetch(blob.url, { cache: 'no-store' })
    return await res.json()
  } catch { return {} }
}

export const GET: APIRoute = async () => {
  const data = await getData()
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

export const POST: APIRoute = async ({ request }) => {
  const { predId, vote } = await request.json() as { predId: string; vote: string }
  if (!predId || !['agree', 'disagree'].includes(vote)) {
    return new Response('Bad Request', { status: 400 })
  }
  const data = await getData()
  if (!data[predId]) data[predId] = { agree: 0, disagree: 0 }
  data[predId][vote as 'agree' | 'disagree'] += 1
  await put(KEY, JSON.stringify(data), {
    access: 'public', contentType: 'application/json', addRandomSuffix: false,
  })
  return new Response(JSON.stringify(data[predId]), {
    headers: { 'Content-Type': 'application/json' },
  })
}
