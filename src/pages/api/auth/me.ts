export const prerender = false

import type { APIContext } from 'astro'
import { getSession } from '../../../utils/session'

export async function GET({ cookies }: APIContext) {
  const token = cookies.get('sb_session')?.value
  if (!token) {
    return new Response(JSON.stringify(null), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const user = await getSession(token)
  return new Response(JSON.stringify(user), {
    headers: { 'Content-Type': 'application/json' },
  })
}
