export const prerender = false;
import type { APIRoute } from 'astro';
import { put, list } from '@vercel/blob';
import { createHash } from 'crypto';

const CROWN_DIAMOND = 20;
const CROWN_GOLD    = 10;
const CROWN_SILVER  = 3;
const MAX_CONTENT   = 500;
const MAX_NAME      = 30;

interface Comment {
  id: string;
  name: string;
  emailHash: string | null;
  content: string;
  timestamp: string;
  crown: 'diamond' | 'gold' | 'silver' | null;
  userTotal: number;
}

function hasStorage() {
  return !!(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
}

function hashEmail(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex').slice(0, 16);
}

function getCrown(n: number): 'diamond' | 'gold' | 'silver' | null {
  if (n >= CROWN_DIAMOND) return 'diamond';
  if (n >= CROWN_GOLD)    return 'gold';
  if (n >= CROWN_SILVER)  return 'silver';
  return null;
}

async function getComments(slug: string): Promise<Comment[]> {
  if (!hasStorage()) return [];
  try {
    const { blobs } = await list({ prefix: 'comments/posts/' });
    const blob = blobs.find(b => b.pathname === `comments/posts/${slug}.json`);
    if (!blob) return [];
    const r = await fetch(blob.url + `?t=${Date.now()}`);
    return await r.json();
  } catch { return []; }
}

async function getUserStats(): Promise<Record<string, number>> {
  if (!hasStorage()) return {};
  try {
    const { blobs } = await list({ prefix: 'comments/users' });
    const blob = blobs.find(b => b.pathname === 'comments/users.json');
    if (!blob) return {};
    const r = await fetch(blob.url + `?t=${Date.now()}`);
    return await r.json();
  } catch { return {}; }
}

export const GET: APIRoute = async ({ url }) => {
  const slug = url.searchParams.get('slug') ?? '';
  if (!slug) {
    return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });
  }
  const comments = await getComments(slug);
  return new Response(JSON.stringify(comments), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  if (!hasStorage()) {
    return new Response(JSON.stringify({ ok: false, noStorage: true }), { status: 200 });
  }

  let body: any;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }

  const { slug, name, email, content } = body ?? {};

  if (!slug || !name?.trim() || !content?.trim()) {
    return new Response(JSON.stringify({ ok: false, error: '請填寫名稱與留言內容' }), { status: 400 });
  }

  const cleanName    = String(name).trim().slice(0, MAX_NAME);
  const cleanContent = String(content).trim().slice(0, MAX_CONTENT);
  const emailHash    = email && String(email).includes('@') ? hashEmail(String(email)) : null;

  const userStats  = await getUserStats();
  const prev       = emailHash ? (userStats[emailHash] ?? 0) : 0;
  const newCount   = prev + 1;
  const crown      = getCrown(newCount);

  const comment: Comment = {
    id:        `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name:      cleanName,
    emailHash,
    content:   cleanContent,
    timestamp: new Date().toISOString(),
    crown,
    userTotal: newCount,
  };

  const existing = await getComments(slug);
  await put(`comments/posts/${slug}.json`, JSON.stringify([...existing, comment]), {
    access: 'public',
    allowOverwrite: true,
  });

  if (emailHash) {
    userStats[emailHash] = newCount;
    await put('comments/users.json', JSON.stringify(userStats), {
      access: 'public',
      allowOverwrite: true,
    });
  }

  return new Response(JSON.stringify({ ok: true, comment }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
