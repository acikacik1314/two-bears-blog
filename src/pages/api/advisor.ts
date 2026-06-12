export const prerender = false;
import type { APIRoute } from 'astro';
import { getGeminiKeys } from '../../utils/gemini';

const SYSTEM_PROMPT = `你是「兩隻熊」旅遊顧問——一位懂旅遊、像朋友一樣的熊。
使用者會告訴你目的地、旅伴、預算，你要推薦 4 間真實存在的飯店。

【最重要的規則：絕對不可虛構飯店】
- 你已啟用 Google 搜尋，請務必基於搜尋到的「真實存在」飯店推薦
- 每間飯店必須附上「正式英文名稱」和「城市」（給後續 TripAdvisor 搜尋用）
- 如果你對某間飯店是否真實存在沒有把握，寧可不推，也絕對不要編造
- 寧可只推 3 間真的，也不要推 4 間有 1 間是假的

【推薦邏輯】
- 根據旅伴（情侶/親子/一個人/長輩）和預算，挑最適合的
- 每間給一句「推薦理由」（為什麼適合這個旅伴和需求）
- 給 2-3 個「適合標籤」（例如：情侶、看富士山、一泊二食）
- 給 2-3 個優點、1-2 個要注意的地方（缺點要誠實，這是兩隻熊的人設）

【語氣】溫暖、像朋友聊天，稱使用者「朋友」。

【輸出格式】嚴格只輸出 JSON，不要任何其他文字、不要 markdown 程式碼框：
{
  "hotels": [
    {
      "name": "中文或慣用名",
      "en": "正式英文名稱",
      "city": "城市",
      "reason": "一句推薦理由",
      "tags": ["標籤1", "標籤2"],
      "pros": ["優點1", "優點2"],
      "cons": ["要注意1"]
    }
  ]
}

【換一批機制】如果使用者要求「再推薦四間」，我會在 prompt 裡附上
「已推薦過：XXX、XXX」，請推薦完全不同的飯店，不要重複。`;

async function fetchWithKey(
  key: string,
  userPrompt: string,
  useGrounding: boolean,
): Promise<Response> {
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: { maxOutputTokens: 1024, temperature: 0.35 },
  };
  if (useGrounding) body.tools = [{ google_search: {} }];

  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    },
  );
}

function extractHotels(data: unknown): unknown[] | null {
  const parts = ((data as any)?.candidates?.[0]?.content?.parts ?? []).filter(
    (p: any) => !p.thought,
  );
  const raw = parts
    .map((p: any) => p.text ?? '')
    .join('')
    .trim();
  if (!raw) return null;

  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  // Direct parse
  try {
    const obj = JSON.parse(cleaned);
    if (Array.isArray(obj?.hotels) && obj.hotels.length) return obj.hotels;
  } catch {}

  // Extract first JSON object
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const obj = JSON.parse(m[0]);
      if (Array.isArray(obj?.hotels) && obj.hotels.length) return obj.hotels;
    } catch {}
  }

  return null;
}

export const POST: APIRoute = async ({ request }) => {
  const keys = getGeminiKeys();
  if (!keys.length) return json({ ok: false, error: '⚠️ AI 尚未啟用，請稍後再試' });

  const body = (await request.json()) as {
    destination?: string;
    companion?: string;
    budget?: string;
    excludeNames?: string[];
  };

  const { destination, companion, budget, excludeNames } = body;
  if (!destination) return new Response('Bad Request', { status: 400 });

  const excludeClause =
    excludeNames?.length
      ? `\n\n已推薦過，請不要重複：${excludeNames.join('、')}`
      : '';

  const userPrompt = `朋友想去：${destination}
旅伴：${companion || '未指定'}
每晚預算（台幣）：${budget || '未指定'}${excludeClause}

請推薦 4 間最適合的飯店。`;

  const shuffled = [...keys].sort(() => Math.random() - 0.5);

  // Round 1: grounding on
  let groundingFailed = false;
  for (const key of shuffled) {
    try {
      const res = await fetchWithKey(key, userPrompt, true);
      if (res.status === 429) continue;
      if (res.status === 400) { groundingFailed = true; break; }
      if (!res.ok) continue;
      const hotels = extractHotels(await res.json());
      if (hotels?.length) return json({ ok: true, hotels, grounded: true });
    } catch {
      continue;
    }
  }

  // Round 2: grounding off (fallback when unsupported or all grounded calls failed)
  for (const key of shuffled) {
    try {
      const res = await fetchWithKey(key, userPrompt, false);
      if (res.status === 429) continue;
      if (!res.ok) continue;
      const hotels = extractHotels(await res.json());
      if (hotels?.length) return json({ ok: true, hotels, grounded: false });
    } catch {
      continue;
    }
  }

  return json({ ok: false, error: '熊熊暫時很忙，請稍後再試 🐻' });
};

function json(data: object) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
}
