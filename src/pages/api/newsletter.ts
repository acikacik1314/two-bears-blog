export const prerender = false

import type { APIContext } from 'astro'
import { getSession, getSubscribers } from '../../utils/session'

const ADMIN_EMAIL = import.meta.env.ADMIN_EMAIL || 'acikacik@gmail.com'

export async function GET({ cookies }: APIContext) {
  const token = cookies.get('sb_session')?.value
  const user = token ? await getSession(token) : null
  if (!user || user.email !== ADMIN_EMAIL) {
    return new Response('Unauthorized', { status: 401 })
  }
  const subscribers = await getSubscribers()
  return new Response(JSON.stringify({ count: subscribers.length, subscribers }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function POST({ request, cookies }: APIContext) {
  const token = cookies.get('sb_session')?.value
  const user = token ? await getSession(token) : null
  if (!user || user.email !== ADMIN_EMAIL) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { subject, html } = await request.json() as { subject: string; html: string }
  const subscribers = await getSubscribers()

  const RESEND_KEY = import.meta.env.RESEND_API_KEY ?? ''
  const FROM = import.meta.env.RESEND_FROM ?? 'TwoBears預言家 <onboarding@resend.dev>'

  let sent = 0
  let failed = 0

  for (const sub of subscribers) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: FROM, to: sub.email, subject, html }),
      })
      if (res.ok) sent++
      else failed++
    } catch {
      failed++
    }
  }

  return new Response(JSON.stringify({ sent, failed }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
