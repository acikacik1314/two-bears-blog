export const prerender = false;
import type { APIRoute } from 'astro';
import { put, list } from '@vercel/blob';

const BLOB_PATH = 'post-votes.json';

type VoteCounts = { t: number; f: number; p: number }; // true / false / pending
type VoteStore  = Record<string, VoteCounts>;

async function load(): Promise<VoteStore> {
  try {
    const { blobs } = await list({ prefix: BLOB_PATH });
    if (!blobs.length) return {};
    const res = await fetch(blobs[0].url);
    return await res.json();
  } catch {
    return {};
  }
}

async function save(data: VoteStore) {
  await put(BLOB_PATH, JSON.stringify(data), {
    access: 'public',
    addRandomSuffix: false,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
}

export const GET: APIRoute = async ({ url }) => {
  const slug = url.searchParams.get('slug');
  const store = await load();
  if (slug) {
    const v = store[slug] ?? { t: 0, f: 0, p: 0 };
    return json(v);
  }
  return json(store);
};

export const POST: APIRoute = async ({ request }) => {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return json({ ok: false });
  try {
    const { slug, vote } = await request.json() as { slug: string; vote: 't' | 'f' | 'p' };
    if (!slug || !['t', 'f', 'p'].includes(vote)) return new Response('Bad Request', { status: 400 });

    const store = await load();
    if (!store[slug]) store[slug] = { t: 0, f: 0, p: 0 };
    store[slug][vote]++;
    await save(store);
    return json({ ok: true, counts: store[slug] });
  } catch {
    return new Response('Error', { status: 500 });
  }
};

function json(data: object) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
