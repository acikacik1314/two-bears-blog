export const prerender = false

import type { APIContext } from 'astro'

export async function GET({ redirect, cookies, url }: APIContext) {
  const state = crypto.randomUUID()
  cookies.set('oauth_state', state, {
    httpOnly: true,
    path: '/',
    maxAge: 600,
    sameSite: 'lax',
    secure: import.meta.env.PROD,
  })

  const redirectUri = `${url.origin}/api/auth/callback`
  console.log('[auth/google] initiating OAuth, redirect_uri:', redirectUri)

  const params = new URLSearchParams({
    client_id: (import.meta.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID) ?? '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  })

  return redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}
