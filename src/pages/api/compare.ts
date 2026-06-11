// src/pages/api/compare.ts
// 兩隻熊比價神器 — 後端 API 路由
// Gemini API Key 放在 Vercel 環境變數 GEMINI_API_KEY，前端永遠看不到

export const prerender = false;

import type { APIRoute } from 'astro';

const GEMINI_KEY = import.meta.env.GEMINI_API_KEY;
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// 關鍵字清洗，去掉比價頁面賴售字詞，避免搜尋偏移
function cleanKeyword(raw: string): string {
  const blacklist = /(最便宜|便宜|比價|推薦|哪裡買|去哪買|多少錢|價格|價錢|特價|優惠)/g;
  return raw.replace(blacklist, '').replace(/\s+/g, ' ').trim().slice(0, 50);
}

export const POST: APIRoute = async ({ request }) => {
  const json = (data: object, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });

  if (!GEMINI_KEY) {
    return json({ error: '伺服器尚未設定 GEMINI_API_KEY' }, 500);
  }

  let keyword = '';
  try {
    const body = await request.json();
    keyword = cleanKeyword(String(body.keyword ?? ''));
  } catch {
    return json({ error: '請求格式錯誤' }, 400);
  }

  if (keyword.length < 2) {
    return json({ error: '請輸入至少 2 個字的商品名稱' }, 400);
  }

  const prompt = `你是台灣電商比價助理。請用 Google 搜尋查詢「${keyword}」目前在以下台灣電商平台的定價：
momo購物網、蝦皮商城、酷澎(Coupang台灣)、家樂福線上購物、Yahoo購物中心、台灣樂天市場、小三美日、PChome 24h購物

嚴格遵守以下規則：
1. 只回報實際搜尋到的結果，找不到的平台直接略過，絕對不可以捏造價格或網址
2. price 必須是新台幣的純數字，不含符號、不含逗號
3. spec 必須標示規格與包裝（例如：650ml 單罐、24入箱購、3入組），讓不同包裝可以個別比較，避免單罐和箱購直接比較產生誤導
4. url 必須是搜尋結果中該商品頁的完整網址
5. 每個平台最多回報 1 筆最相關、最便宜的結果
6. 你的回覆只能是 JSON，不要任何說明文字，不要 markdown 程式碼框

JSON 格式：
{"results":[{"platform":"momo購物網","name":"商品完整名稱","price":299,"spec":"24入箱購","url":"https://..."}]}`;

  try {
    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Gemini API error:', res.status, errText);
      return json({ error: 'AI 搜尋服務暫時無法使用，請稍後再試' }, 502);
    }

    const data = await res.json();
    const text: string =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? '')
        .join('') ?? '';

    // Gemini 用了搜尋工具有時會附上 markdown 框，擷取純 JSON 主體
    const stripped = text.replace(/```json|```/g, '').trim();
    const start = stripped.indexOf('{');
    const end = stripped.lastIndexOf('}');
    if (start === -1 || end === -1) {
      return json({ error: 'AI 回傳格式異常，請換個關鍵字再試一次', keyword }, 200);
    }

    const parsed = JSON.parse(stripped.slice(start, end + 1));
    const results = Array.isArray(parsed.results)
      ? parsed.results
          .filter(
            (r: any) =>
              r && r.platform && typeof r.price === 'number' && r.price > 0,
          )
          .map((r: any) => ({
            platform: String(r.platform),
            name: String(r.name ?? ''),
            price: Math.round(r.price),
            spec: String(r.spec ?? ''),
            url: typeof r.url === 'string' && r.url.startsWith('http') ? r.url : '',
          }))
          .sort((a: any, b: any) => a.price - b.price)
      : [];

    return json({ keyword, results });
  } catch (err) {
    console.error('compare API error:', err);
    return json({ error: '比價失敗，請稍後再試' }, 500);
  }
};
