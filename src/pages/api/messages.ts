import type { APIRoute } from 'astro';
import { put, list } from '@vercel/blob';

const MAX_PER_DAY = 50;
const MAX_LEN = 40;

function hasStorage() {
  return !!(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
}

function getTWDate() {
  return new Date().toLocaleString('sv', { timeZone: 'Asia/Taipei' }).split(' ')[0];
}

async function getMessages(date: string): Promise<{ text: string; time: string }[]> {
  if (!hasStorage()) return [];
  try {
    const { blobs } = await list({ prefix: 'messages/' });
    const blob = blobs.find(b => b.pathname === `messages/${date}.json`);
    if (!blob) return [];
    const r = await fetch(blob.url);
    return await r.json();
  } catch { return []; }
}

export const GET: APIRoute = async () => {
  const date = getTWDate();
  const messages = await getMessages(date);
  return new Response(JSON.stringify({ messages, date }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  if (!hasStorage()) {
    return new Response(JSON.stringify({ ok: false, noStorage: true }), { status: 200 });
  }
  let text: string;
  try {
    const body = await request.json();
    text = String(body.text ?? '').trim().slice(0, MAX_LEN);
    if (!text || /https?:\/\//i.test(text)) throw new Error();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid' }), { status: 400 });
  }

  const date = getTWDate();
  const messages = await getMessages(date);
  if (messages.length >= MAX_PER_DAY) {
    return new Response(JSON.stringify({ error: 'today is full' }), { status: 429 });
  }

  const time = new Date().toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  messages.push({ text, time });

  try {
    await put(`messages/${date}.json`, JSON.stringify(messages), {
      access: 'public', addRandomSuffix: false,
    });
  } catch {
    return new Response(JSON.stringify({ ok: false, noStorage: true }));
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
