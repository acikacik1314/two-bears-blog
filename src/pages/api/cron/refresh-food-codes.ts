import type { APIRoute } from 'astro';
import { put } from '@vercel/blob';
import { scrapeAllCodes } from '../food-codes';

export const GET: APIRoute = async ({ request }) => {
  // Vercel cron auth
  const auth = request.headers.get('authorization');
  const secret = import.meta.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const data = await scrapeAllCodes();
    await put('food-codes/latest.json', JSON.stringify(data), {
      access: 'public',
      addRandomSuffix: false,
    });
    return new Response(JSON.stringify({ ok: true, fetched: data.fetched, count: data.codes.length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
