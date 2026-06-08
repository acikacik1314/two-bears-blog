export const prerender = false

import type { APIContext } from 'astro'
import { deleteSession } from '../../../utils/session'

export async function GET({ cookies, redirect }: APIContext) {
  const token = cookies.get('sb_session')?.value
  if (token) await deleteSession(token)
  cookies.delete('sb_session', { path: '/' })
  return redirect('/')
}
