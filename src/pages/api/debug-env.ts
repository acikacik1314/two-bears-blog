export const prerender = false

import type { APIContext } from 'astro'

export async function GET({ cookies }: APIContext) {
  const clientId = (import.meta.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID) ?? ''
  return new Response(JSON.stringify({
    clientIdLength: clientId.length,
    clientIdStart: clientId.slice(0, 12),
    clientIdEnd: clientId.slice(-20),
  }), { headers: { 'Content-Type': 'application/json' } })
}
