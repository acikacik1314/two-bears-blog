export const prerender = false;
import type { APIRoute } from 'astro';
import { put, list } from '@vercel/blob';
import { createHash } from 'crypto';
import { getSession } from '../../utils/session';

const CROWN_DIAMOND = 20;
const CROWN_GOLD    = 10;
const CROWN_SILVER  = 3;
const MAX_CONTENT   = 500;

interface Comment {
  id: string;
  name: string;
  picture: string | null;
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

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!hasStorage()) {
    return new Response(JSON.stringify({ ok: false, noStorage: true }), { status: 200 });
  }

  // Require Google login
  const token = cookies.get('sb_session')?.value;
  if (!token) {
    return new Response(JSON.stringify({ ok: false, error: '請先登入 Google 帳號才能留言' }), { status: 401 });
  }
  const user = await getSession(token);
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: '登入已過期，請重新登入' }), { status: 401 });
  }

  let body: any;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }

  const { slug, content } = body ?? {};

  if (!slug || !content?.trim()) {
    return new Response(JSON.stringify({ ok: false, error: '請填寫留言內容' }), { status: 400 });
  }

  const cleanContent = String(content).trim().slice(0, MAX_CONTENT);
  const emailHash    = hashEmail(user.email);

  const userStats = await getUserStats();
  const prev      = userStats[emailHash] ?? 0;
  const newCount  = prev + 1;
  const crown     = getCrown(newCount);

  const comment: Comment = {
    id:        `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name:      user.name,
    picture:   user.picture || null,
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

  userStats[emailHash] = newCount;
  await put('comments/users.json', JSON.stringify(userStats), {
    access: 'public',
    allowOverwrite: true,
  });

  return new Response(JSON.stringify({ ok: true, comment }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
