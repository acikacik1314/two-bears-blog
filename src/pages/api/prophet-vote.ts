export const prerender = false

import type { APIContext } from 'astro'
import { getSession } from '../../utils/session'
import { put, list } from '@vercel/blob'

const KEY = 'prophet-votes.json'

export interface VoteMap {
  [predictionId: string]: { hit: number; miss: number; pend: number }
}

async function getVotes(): Promise<VoteMap> {
  try {
    const { blobs } = await list({ prefix: KEY, limit: 1 })
    const blob = blobs.find(b => b.pathname === KEY)
    if (!blob) return {}
    const res = await fetch(blob.url, { cache: 'no-store' })
    return await res.json()
  } catch { return {} }
}

export async function GET() {
  const votes = await getVotes()
  return new Response(JSON.stringify(votes), { headers: { 'Content-Type': 'application/json' } })
}

export async function POST({ request, cookies }: APIContext) {
  const token = cookies.get('sb_session')?.value
  const user = token ? await getSession(token).catch(() => null) : null
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { predictionId, vote } = await request.json() as { predictionId: string; vote: string }
  if (!predictionId || !['hit', 'miss', 'pend'].includes(vote)) return new Response('Bad Request', { status: 400 })

  const votes = await getVotes()
  if (!votes[predictionId]) votes[predictionId] = { hit: 0, miss: 0, pend: 0 }
  votes[predictionId][vote as 'hit' | 'miss' | 'pend'] += 1

  await put(KEY, JSON.stringify(votes), { access: 'public', contentType: 'application/json', addRandomSuffix: false })
  return new Response(JSON.stringify(votes[predictionId]), { headers: { 'Content-Type': 'application/json' } })
}
