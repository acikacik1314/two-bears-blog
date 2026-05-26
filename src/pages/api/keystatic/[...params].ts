import { makeHandler } from '@keystatic/astro/api';
import keystaticConfig from '../../../../keystatic.config';
import type { APIContext } from 'astro';

const handler = makeHandler({
  config: keystaticConfig,
  clientId: process.env.KEYSTATIC_GITHUB_CLIENT_ID,
  clientSecret: process.env.KEYSTATIC_GITHUB_CLIENT_SECRET,
  secret: process.env.KEYSTATIC_SECRET,
});

export async function ALL(context: APIContext) {
  const url = new URL(context.request.url);

  // Temporary debug endpoint — remove after fixing
  if (url.pathname.endsWith('/github/oauth/debug')) {
    const tokenUrl = new URL('https://github.com/login/oauth/access_token');
    tokenUrl.searchParams.set('client_id', process.env.KEYSTATIC_GITHUB_CLIENT_ID ?? 'MISSING');
    tokenUrl.searchParams.set('client_secret', process.env.KEYSTATIC_GITHUB_CLIENT_SECRET ?? 'MISSING');
    tokenUrl.searchParams.set('code', 'fake_debug_code');
    const tokenRes = await fetch(tokenUrl, { method: 'POST', headers: { Accept: 'application/json' } });
    const tokenData = await tokenRes.json();
    return new Response(JSON.stringify({
      clientIdPresent: !!process.env.KEYSTATIC_GITHUB_CLIENT_ID,
      clientIdLength: process.env.KEYSTATIC_GITHUB_CLIENT_ID?.length ?? 0,
      secretPresent: !!process.env.KEYSTATIC_SECRET,
      secretLength: process.env.KEYSTATIC_SECRET?.length ?? 0,
      githubResponseKeys: Object.keys(tokenData),
      githubError: tokenData.error ?? null,
      hasRefreshToken: 'refresh_token' in tokenData,
      hasExpiresIn: 'expires_in' in tokenData,
      tokenType: tokenData.token_type ?? null,
    }, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return handler(context);
}

export const prerender = false;
