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

  // Debug: log what env vars we have (without exposing secrets)
  if (url.pathname.includes('github/oauth/callback')) {
    console.log('[keystatic] callback hit:', url.search);
    console.log('[keystatic] clientId present:', !!process.env.KEYSTATIC_GITHUB_CLIENT_ID);
    console.log('[keystatic] clientSecret present:', !!process.env.KEYSTATIC_GITHUB_CLIENT_SECRET);
    console.log('[keystatic] secret present:', !!process.env.KEYSTATIC_SECRET);
    console.log('[keystatic] secret length:', process.env.KEYSTATIC_SECRET?.length ?? 0);

    // Test the token exchange directly and log the raw response
    const code = url.searchParams.get('code');
    if (code) {
      const tokenUrl = new URL('https://github.com/login/oauth/access_token');
      tokenUrl.searchParams.set('client_id', process.env.KEYSTATIC_GITHUB_CLIENT_ID ?? '');
      tokenUrl.searchParams.set('client_secret', process.env.KEYSTATIC_GITHUB_CLIENT_SECRET ?? '');
      tokenUrl.searchParams.set('code', code);
      const tokenRes = await fetch(tokenUrl, { method: 'POST', headers: { Accept: 'application/json' } });
      const tokenData = await tokenRes.json();
      console.log('[keystatic] GitHub token response keys:', Object.keys(tokenData).join(', '));
      console.log('[keystatic] token_type:', tokenData.token_type);
      console.log('[keystatic] has expires_in:', 'expires_in' in tokenData);
      console.log('[keystatic] has refresh_token:', 'refresh_token' in tokenData);
      console.log('[keystatic] error:', tokenData.error ?? 'none');
    }
  }

  return handler(context);
}

export const prerender = false;
