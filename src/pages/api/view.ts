import type { APIRoute } from 'astro';
import { put, list } from '@vercel/blob';

const BLOB_PATH = 'view-counts.json';

async function getViewCounts(): Promise<Record<string, number>> {
  try {
    const { blobs } = await list({ prefix: BLOB_PATH });
    if (blobs.length === 0) return {};
    const res = await fetch(blobs[0].url);
    return await res.json();
  } catch {
    return {};
  }
}

export const GET: APIRoute = async () => {
  const counts = await getViewCounts();
  return new Response(JSON.stringify(counts), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=300',
    },
  });
};

export const POST: APIRoute = async ({ request }) => {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return new Response('OK', { status: 200 });
  }
  try {
    const { slug } = await request.json();
    if (!slug || typeof slug !== 'string') return new Response('Bad Request', { status: 400 });

    const counts = await getViewCounts();
    counts[slug] = (counts[slug] || 0) + 1;

    await put(BLOB_PATH, JSON.stringify(counts), {
      access: 'public',
      addRandomSuffix: false,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    return new Response(JSON.stringify({ views: counts[slug] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response('OK', { status: 200 });
  }
};
