export const prerender = false;
import type { APIRoute } from 'astro';
import { callGroq, getGroqKeys } from '../../utils/groq';

const FALLBACK = {
  geopolitical: { score: 70, level: '偏高', note: '地緣政治風險上升中' },
  economic:     { score: 60, level: '中等', note: '市場波動加劇' },
  disaster:     { score: 30, level: '偏低', note: '天災風險相對穩定' },
};

export const GET: APIRoute = async () => {
  if (!getGroqKeys().length) {
    return json(FALLBACK, 3600);
  }

  const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
  const prompt = `今天是 ${today}。請根據全球當前局勢，對以下三個風險類別評分（0-100，越高風險越大），並給一句簡短中文說明（最多15字）。只回傳JSON，不要其他文字：{"geopolitical":{"score":數字,"level":"偏低|中等|偏高|極高","note":"說明"},"economic":{"score":數字,"level":"偏低|中等|偏高|極高","note":"說明"},"disaster":{"score":數字,"level":"偏低|中等|偏高|極高","note":"說明"}}`;

  try {
    const result = await callGroq(
      [{ role: 'user', content: prompt }],
      { maxTokens: 256, temperature: 0.3, json: true }
    );
    if (!result.ok || !result.text) return json(FALLBACK, 3600);
    const m = result.text.match(/\{[\s\S]*\}/);
    if (!m) return json(FALLBACK, 3600);
    return json(JSON.parse(m[0]), 21600);
  } catch {
    return json(FALLBACK, 3600);
  }
};

function json(data: object, maxAge: number) {
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `s-maxage=${maxAge}, stale-while-revalidate=3600`,
    },
  });
}
