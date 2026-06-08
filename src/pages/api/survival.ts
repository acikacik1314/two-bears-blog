export const prerender = false;
import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return new Response(JSON.stringify({
      geopolitical: { score: 68, level: '偏高', note: '全球局勢持續緊張' },
      economic:     { score: 62, level: '中等', note: '通膨壓力未完全消退' },
      disaster:     { score: 35, level: '偏低', note: '近期無重大天災預警' },
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
  const prompt = `今天是 ${today}。請根據全球當前局勢，對以下三個風險類別評分（0-100，越高風險越大），並給一句簡短中文說明（最多15字）。只回傳JSON：{"geopolitical":{"score":數字,"level":"偏低|中等|偏高|極高","note":"說明"},"economic":{"score":數字,"level":"偏低|中等|偏高|極高","note":"說明"},"disaster":{"score":數字,"level":"偏低|中等|偏高|極高","note":"說明"}}`;

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: AbortSignal.timeout(20000) }
    );
    if (!r.ok) throw new Error('gemini error');
    const d = await r.json();
    const text = d.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('parse error');
    return new Response(m[0], {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 's-maxage=21600, stale-while-revalidate=3600' },
    });
  } catch {
    return new Response(JSON.stringify({
      geopolitical: { score: 70, level: '偏高', note: '地緣政治風險上升中' },
      economic:     { score: 60, level: '中等', note: '市場波動加劇' },
      disaster:     { score: 30, level: '偏低', note: '天災風險相對穩定' },
    }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 's-maxage=3600' } });
  }
};
