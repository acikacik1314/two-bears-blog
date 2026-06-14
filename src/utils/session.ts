import { put, list } from '@vercel/blob'

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

// ── HMAC-signed cookie sessions (no external storage) ─────────────

function signingSecret(): string {
  return (
    (import.meta.env.GOOGLE_CLIENT_SECRET as string | undefined) ||
    (process.env.GOOGLE_CLIENT_SECRET as string | undefined) ||
    'dev-only-secret'
  )
}

async function importKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(signingSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

function toB64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function fromB64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (s.length % 4)) % 4)
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export async function createSession(user: SessionUser): Promise<string> {
  const payload = {
    email: user.email,
    name: user.name,
    picture: user.picture,
    exp: Date.now() + 30 * 86400 * 1000,
  }
  const encoded = new TextEncoder().encode(JSON.stringify(payload))
  const key = await importKey()
  const sig = await crypto.subtle.sign('HMAC', key, encoded)
  return `${toB64url(encoded.buffer as ArrayBuffer)}.${toB64url(sig)}`
}

export async function getSession(token: string): Promise<SessionUser | null> {
  if (!token || token.length > 4000) return null
  try {
    const dot = token.lastIndexOf('.')
    if (dot < 1) return null
    const dataPart = token.slice(0, dot)
    const sigPart = token.slice(dot + 1)
    const dataBytes = fromB64url(dataPart)
    const sigBytes = fromB64url(sigPart)
    const key = await importKey()
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, dataBytes)
    if (!valid) return null
    const payload = JSON.parse(new TextDecoder().decode(dataBytes))
    if (!payload.exp || Date.now() > payload.exp) return null
    return { email: String(payload.email), name: String(payload.name), picture: String(payload.picture) }
  } catch {
    return null
  }
}

export async function deleteSession(_token: string): Promise<void> {
  // Cookie deletion in logout.ts is sufficient — no server-side state to clean up
}

// ── Subscriber list (Vercel Blob) — non-critical ──────────────────

export async function addSubscriber(user: { email: string; name: string }): Promise<void> {
  try {
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
  } catch {
    // Blob unavailable — subscriber not saved, login still works
  }
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
