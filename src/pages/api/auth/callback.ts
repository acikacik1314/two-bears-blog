export const prerender = false

import type { APIContext } from 'astro'
import { createSession, addSubscriber } from '../../../utils/session'

export async function GET({ url, cookies, redirect }: APIContext) {
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const storedState = cookies.get('oauth_state')?.value

  if (!code || !state || state !== storedState) {
    return redirect('/?error=auth_failed')
  }

  cookies.delete('oauth_state', { path: '/' })

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: import.meta.env.GOOGLE_CLIENT_ID ?? '',
        client_secret: import.meta.env.GOOGLE_CLIENT_SECRET ?? '',
        redirect_uri: `${url.origin}/api/auth/callback`,
        grant_type: 'authorization_code',
      }),
    })

    const tokens = await tokenRes.json()
    if (!tokens.access_token) return redirect('/?error=auth_failed')

    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const gu = await userRes.json()

    const user = {
      email: String(gu.email ?? ''),
      name: String(gu.name ?? gu.email ?? ''),
      picture: String(gu.picture ?? ''),
    }

    if (!user.email) return redirect('/?error=auth_failed')

    const token = await createSession(user)
    await addSubscriber(user)

    cookies.set('sb_session', token, {
      httpOnly: true,
      path: '/',
      maxAge: 30 * 86400,
      sameSite: 'lax',
      secure: import.meta.env.PROD,
    })

    return redirect('/')
  } catch {
    return redirect('/?error=auth_failed')
  }
}
