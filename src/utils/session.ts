import { put, list, del } from '@vercel/blob'

export interface SessionUser {
  email: string
  name: string
  picture: string
}

export interface Subscriber {
  email: string
  name: string
  subscribedAt: number
}

export async function createSession(user: SessionUser): Promise<string> {
  const token = crypto.randomUUID()
  await put(`sessions/${token}`, JSON.stringify({ ...user, created: Date.now() }), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
  })
  return token
}

export async function getSession(token: string): Promise<SessionUser | null> {
  if (!token || token.length > 100) return null
  try {
    const { blobs } = await list({ prefix: `sessions/${token}`, limit: 1 })
    const blob = blobs.find(b => b.pathname === `sessions/${token}`)
    if (!blob) return null
    const res = await fetch(blob.url, { cache: 'no-store' })
    const data = await res.json()
    if (Date.now() - data.created > 30 * 86400000) {
      await del(blob.url)
      return null
    }
    return { email: data.email, name: data.name, picture: data.picture }
  } catch {
    return null
  }
}

export async function deleteSession(token: string): Promise<void> {
  if (!token || token.length > 100) return
  try {
    const { blobs } = await list({ prefix: `sessions/${token}`, limit: 1 })
    const blob = blobs.find(b => b.pathname === `sessions/${token}`)
    if (blob) await del(blob.url)
  } catch {}
}

export async function addSubscriber(user: { email: string; name: string }): Promise<void> {
  const existing = await getSubscribers()
  if (existing.some(s => s.email === user.email)) return
  const updated: Subscriber[] = [
    ...existing,
    { email: user.email, name: user.name, subscribedAt: Date.now() },
  ]
  await put('subscribers.json', JSON.stringify(updated), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
  })
}

export async function getSubscribers(): Promise<Subscriber[]> {
  try {
    const { blobs } = await list({ prefix: 'subscribers.json', limit: 1 })
    const blob = blobs.find(b => b.pathname === 'subscribers.json')
    if (!blob) return []
    const res = await fetch(blob.url, { cache: 'no-store' })
    return await res.json()
  } catch {
    return []
  }
}
