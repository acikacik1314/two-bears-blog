export const prerender = false;
import type { APIRoute } from 'astro';
import { put, list } from '@vercel/blob';
import { callGroq, getGroqKeys } from '../../utils/groq';

const BLOB_PATH = 'prophecy-checks.json';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

type CheckResult = {
  status: 't' | 'f' | 'p';
  reason: string;
  checkedAt: string;
};
type CheckStore = Record<string, CheckResult>;

async function loadStore(): Promise<CheckStore> {
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

async function saveStore(data: CheckStore) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return;
  await put(BLOB_PATH, JSON.stringify(data), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    token,
  });
}

async function runCheck(title: string, description: string, tags: string): Promise<CheckResult | null> {
  const today = new Date().toLocaleDateString('zh-TW');
  const prompt = `你是一個預言事實查核員。今天日期：${today}。

請根據你的知識，判斷以下預言是否已成真：

預言標題：${title}
${description ? `預言摘要：${description}` : ''}
${tags ? `相關標籤：${tags}` : ''}

請嚴格按以下格式回答，不要有任何其他文字：
狀態：[成真|未成真|待觀察]
原因：[一句話說明，30字以內，說明判斷依據]`;

  const result = await callGroq(
    [{ role: 'user', content: prompt }],
    { maxTokens: 128, temperature: 0.2 }
  );

  if (!result.ok || !result.text) return null;

  const lines = result.text.split('\n').map(l => l.trim()).filter(Boolean);
  let status: 't' | 'f' | 'p' = 'p';
  let reason = '';

  for (const line of lines) {
    if (/^狀態[：:]/.test(line)) {
      const val = line.replace(/^狀態[：:]/, '').trim();
      if (val.includes('成真') && !val.includes('未')) status = 't';
      else if (val.includes('未成真')) status = 'f';
      else status = 'p';
    } else if (/^原因[：:]/.test(line)) {
      reason = line.replace(/^原因[：:]/, '').trim();
    }
  }

  if (!reason) {
    reason = result.text.replace(/狀態[：:][^\n]*/g, '').trim().slice(0, 60);
  }

  return { status, reason, checkedAt: new Date().toISOString() };
}

export const GET: APIRoute = async ({ url }) => {
  const slug  = url.searchParams.get('slug') ?? '';
  const title = url.searchParams.get('title') ?? '';
  const desc  = url.searchParams.get('desc') ?? '';
  const tags  = url.searchParams.get('tags') ?? '';

  if (!slug || !title) {
    return new Response('Bad Request', { status: 400 });
  }

  const store = await loadStore();
  const cached = store[slug];
  const now = Date.now();

  if (cached && (now - new Date(cached.checkedAt).getTime()) < CACHE_TTL_MS) {
    return json({ ok: true, ...cached, cached: true });
  }

  if (!getGroqKeys().length) {
    return json({ ok: false, error: 'service not configured' });
  }

  const result = await runCheck(title, desc, tags);
  if (!result) {
    return json({ ok: false, error: 'ai check failed' });
  }

  store[slug] = result;
  try { await saveStore(store); } catch { /* blob unavailable, skip cache */ }

  return json({ ok: true, ...result, cached: false });
};

function json(data: object) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
