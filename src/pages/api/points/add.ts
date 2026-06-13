export const prerender = false
import type { APIRoute } from 'astro'
import { getSession } from '../../../utils/session'

export const POST: APIRoute = async ({ request, cookies }) => {
  const token = cookies.get('sb_session')?.value
  const user = token ? await getSession(token).catch(() => null) : null
  if (!user) return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

  const body = await request.json().catch(() => ({})) as { amount?: number; reason?: string }
  const amount = Number(body.amount) || 0
  if (amount <= 0) return new Response(JSON.stringify({ ok: false, error: 'Invalid amount' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

  // Stub: points are currently stored client-side in localStorage.
  // This endpoint is reserved for future server-side points integration.
  return new Response(JSON.stringify({ ok: true, amount, reason: body.reason ?? '' }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
