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
  return handler(context);
}

export const prerender = false;
