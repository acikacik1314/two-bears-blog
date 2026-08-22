export const prerender = false;

import type { APIRoute } from 'astro';

// Food codes are now updated by GitHub Actions (scripts/refresh-food-codes.mjs).
// This Vercel cron route is kept as a no-op to avoid 404 errors during transition.
export const GET: APIRoute = async () => {
  return new Response(JSON.stringify({ ok: true, message: 'Handled by GitHub Actions' }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
