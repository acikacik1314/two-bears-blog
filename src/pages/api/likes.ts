export const prerender = false;
import type { APIRoute } from 'astro';
import { put, list } from '@vercel/blob';

const BLOB_PATH = 'post-likes.json';
type LikeStore = Record<string, number>;

async function load(): Promise<LikeStore> {
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) return {};
    const { blobs } = await list({ prefix: BLOB_PATH, token });
    if (!blobs.length) return {};
    const res = await fetch(blobs[0].url);
    return await res.json();
  } catch {
    return {};
  }
}

async function save(data: LikeStore) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return;
  await put(BLOB_PATH, JSON.stringify(data), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    token,
  });
}

function json(data: object) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const GET: APIRoute = async ({ url }) => {
  const slug = url.searchParams.get('slug');
  const store = await load();
  if (slug) return json({ count: store[slug] ?? 0 });
  return json(store);
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const { slug } = await request.json() as { slug: string };
    if (!slug) return new Response('Bad Request', { status: 400 });
    const store = await load();
    store[slug] = (store[slug] ?? 0) + 1;
    try { await save(store); } catch { /* blob unavailable */ }
    return json({ ok: true, count: store[slug] });
  } catch {
    return new Response('Error', { status: 500 });
  }
};
