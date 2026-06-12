export const prerender = false;

import type { APIRoute } from 'astro';
import { getGeminiKeys } from '../../utils/gemini';

const MODELS = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];

const rateMap = new Map<string, { count: number; resetAt: number }>();
function checkRate(ip: string): boolean {
  const now = Date.now();
  const rec = rateMap.get(ip);
  if (!rec || rec.resetAt < now) {
    rateMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (rec.count >= 5) return false;
  rec.count++;
  return true;
}

const SYSTEM_PROMPT = `你是「兩隻熊選物助理」，幫台灣用戶解決選擇困難症。

你的角色：
- 泰迪（你）是兩隻熊頻道的主持人，說話風格直接、有觀點、有溫度
- 你不業配，純粹站在用戶角度
- 你了解台灣市場，熟悉台灣買得到的品牌和通路

回答格式（請嚴格依照）：

## 🎯 我幫你分析了什麼
[用一兩句話說明你理解到的需求核心]

## 🏆 最推薦：[產品名稱]
[推薦理由，3-4個重點，說明為什麼這個最適合他的需求]

**適合誰：** [描述最適合的使用情境]
**不適合：** [誠實說什麼情況不推薦這個]
**台灣參考價：** [約NT$XXX，可在哪裡買到]

## 💰 預算更低的選擇：[產品名稱]
[簡短說明，為什麼便宜版也值得考慮，或省在哪裡]
**台灣參考價：** [約NT$XXX]

## ⬆️ 如果預算再高一點：[產品名稱]
[說明升級版多了什麼，值不值得多花]
**台灣參考價：** [約NT$XXX]

## ⚠️ 這些不要選
[1-2個在這個需求下的地雷選項，說明為什麼]

---

🐻 兩隻熊的話：[泰迪的個人建議，用第一人稱，口語化，誠實說出你自己的選擇，可以有點個人觀點]

重要規則：
- 只推薦台灣市場買得到的產品
- 價格要符合台灣市場行情
- 說話要口語自然，不要太正式
- 一定要有「不要選」的避雷建議
- 結尾的「兩隻熊的話」要有個人觀點，不是中性說法
- 禁止使用：首先、其次、最後、總結來說、值得注意的是、不僅如此`;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const ip = clientAddress ?? '0.0.0.0';
  if (!checkRate(ip)) {
    return new Response(JSON.stringify({ error: '請求過於頻繁，請稍後再試（每分鐘限 5 次）' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let messages: Array<{ role: string; parts: Array<{ text: string }> }>;
  let temperature = 0.7;
  let max_tokens = 4096;

  try {
    const body = await request.json() as { messages?: unknown; temperature?: unknown; max_tokens?: unknown };
    messages = body.messages as typeof messages;
    if (typeof body.temperature === 'number') temperature = body.temperature;
    if (typeof body.max_tokens === 'number') max_tokens = body.max_tokens;
  } catch {
    return new Response(JSON.stringify({ error: '請求格式錯誤' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: '請求格式錯誤' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const keys = getGeminiKeys();
  if (!keys.length) {
    return new Response(JSON.stringify({ error: '服務暫時不可用，請稍後再試' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const shuffled = [...keys].sort(() => Math.random() - 0.5);
  const reqBody = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: messages.map(m => ({
      role: m.role === 'model' ? 'model' : 'user',
      parts: m.parts,
    })),
    generationConfig: { maxOutputTokens: max_tokens, temperature },
  });

  for (const model of MODELS) {
    for (const apiKey of shuffled) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: reqBody }
        );
        if (res.status === 429 || res.status === 503) continue; // rate limited → try next key
        if (res.status === 401 || res.status === 403) continue; // auth error → try next key
        if (res.status === 404) break;                          // model not found → try next model
        if (!res.ok) continue;

        const data = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ thought?: boolean; text?: string }> } }> };
        const text = (data?.candidates?.[0]?.content?.parts ?? [])
          .filter((p) => !p.thought)
          .map((p) => p.text ?? '')
          .join('')
          .trim();
        if (text) {
          return new Response(JSON.stringify({ text }), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
      } catch {
        continue;
      }
    }
    // inner loop ended (404 or all keys tried) → outer loop naturally continues to next model
  }

  return new Response(JSON.stringify({ error: '所有 API 通道忙碌，請稍後再試' }), {
    status: 429,
    headers: { 'Content-Type': 'application/json' },
  });
};
