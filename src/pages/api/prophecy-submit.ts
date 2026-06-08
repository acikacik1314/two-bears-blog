export const prerender = false

import type { APIContext } from 'astro'
import { getSession } from '../../utils/session'
import { put, list } from '@vercel/blob'

export interface Prophecy {
  id: string
  author: string
  email: string
  content: string
  category: string
  deadline: string
  submittedAt: number
  votes: number
}

const KEY = 'community-prophecies.json'

export async function getAll(): Promise<Prophecy[]> {
  try {
    const { blobs } = await list({ prefix: KEY, limit: 1 })
    const blob = blobs.find(b => b.pathname === KEY)
    if (!blob) return []
    const res = await fetch(blob.url, { cache: 'no-store' })
    return await res.json()
  } catch { return [] }
}

export async function GET() {
  const data = await getAll()
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
}

export async function POST({ request, cookies }: APIContext) {
  const token = cookies.get('sb_session')?.value
  const user = token ? await getSession(token) : null
  if (!user) return new Response('Unauthorized', { status: 401 })

  const body = await request.json() as { content: string; category: string; deadline: string }
  if (!body.content?.trim()) return new Response('Bad Request', { status: 400 })

  const existing = await getAll()
  const newProphecy: Prophecy = {
    id: crypto.randomUUID(),
    author: user.name,
    email: user.email,
    content: body.content.trim(),
    category: body.category || '其他',
    deadline: body.deadline || '',
    submittedAt: Date.now(),
    votes: 0,
  }
  const updated = [newProphecy, ...existing].slice(0, 200)
  await put(KEY, JSON.stringify(updated), {
    access: 'public', contentType: 'application/json', addRandomSuffix: false,
  })
  return new Response(JSON.stringify(newProphecy), { headers: { 'Content-Type': 'application/json' } })
}
