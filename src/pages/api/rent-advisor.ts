export const prerender = false;
export const config = { maxDuration: 60 };

import type { APIRoute } from 'astro';
import { getGeminiKeys } from '../../utils/gemini';

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

export interface RentInput {
  budget_twd: number;
  duration: string;
  preferred_countries: string[];
  city_preference: string;
  must_have: string[];
  travel_purpose: string;
}

export interface RentMatch {
  country: string;
  city: string;
  area: string;
  estimated_rent: string;
  reason: string;
}

export interface RentComparison {
  country: string;
  city: string;
  area: string;
  estimated_rent: string;
  verdict: string;
  foreigner_difficulty: '容易' | '中等' | '困難';
}

export interface RentResult {
  best_match: RentMatch;
  comparisons: RentComparison[];
  budget_tips: string[];
  warnings: string[];
}

function buildRentPrompt(input: RentInput): string {
  const today = new Date().toISOString().slice(0, 10);
  const countries = input.preferred_countries.length
    ? input.preferred_countries.join('、')
    : '日本、泰國、韓國';
  const mustHave = input.must_have.length ? input.must_have.join('、') : '無特殊要求';

  return `你是海外租屋顧問，專門服務台灣人。請根據以下條件，搜尋並比較各國租屋行情。

用戶條件：
- 每月租屋預算：NT$${input.budget_twd.toLocaleString()} 台幣
- 租賃時長：${input.duration}
- 想比較的國家：${countries}
- 城市偏好：${input.city_preference}
- 必備條件：${mustHave}
- 旅行目的：${input.travel_purpose}

今天日期：${today}

請用 Google 搜尋最新租屋行情（2025-2026），包含：
「${countries} 短期月租 外國人 2026 台幣換算」「${countries} 租屋行情 外國人辦理」

你的回覆只能是 JSON，不要任何說明文字、markdown 程式碼框或 \`\`\`json 標記。

JSON 格式：
{
  "best_match": {
    "country": "最推薦的國家",
    "city": "城市名稱",
    "area": "推薦區域（如弘大、Sukhumvit、なんば）",
    "estimated_rent": "預估月租（台幣，如 NT$18,000–25,000/月）",
    "reason": "為什麼最符合用戶條件（100字以內，具體說明符合哪些必備條件）"
  },
  "comparisons": [
    {
      "country": "比較國家",
      "city": "城市",
      "area": "推薦區域",
      "estimated_rent": "預估月租（台幣）",
      "verdict": "總結評語（40字以內，如：預算稍微吃緊、外國人難辦理）",
      "foreigner_difficulty": "容易 或 中等 或 困難"
    }
  ],
  "budget_tips": [
    "省錢技巧（60字以內）"
  ],
  "warnings": [
    "注意事項（60字以內，針對外國人租屋的常見陷阱）"
  ]
}

comparisons 列出所有用戶想比較的國家（排除 best_match），budget_tips 3-4 條，warnings 2-3 條。
如果用戶預算在某個城市偏低，請在 verdict 和 warnings 裡誠實說明。`;
}

export const POST: APIRoute = async ({ request }) => {
  const json = (data: object, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });

  const keys = getGeminiKeys();
  if (!keys.length) {
    return json({ error: '伺服器尚未設定 GEMINI_API_KEY' }, 500);
  }

  let input: RentInput;
  try {
    const body = await request.json();
    const budget = Number(body.budget_twd);
    if (!budget || budget < 1000 || budget > 500000) return json({ error: '預算格式錯誤' }, 400);
    input = {
      budget_twd: budget,
      duration: String(body.duration ?? '').slice(0, 20) || '不限',
      preferred_countries: Array.isArray(body.preferred_countries)
        ? body.preferred_countries.slice(0, 5).map(String)
        : [],
      city_preference: String(body.city_preference ?? '').slice(0, 30) || '不限',
      must_have: Array.isArray(body.must_have)
        ? body.must_have.slice(0, 8).map(String)
        : [],
      travel_purpose: String(body.travel_purpose ?? '').slice(0, 40) || '一般旅遊',
    };
  } catch {
    return json({ error: '請求格式錯誤' }, 400);
  }

  const prompt = buildRentPrompt(input);
  const shuffled = [...keys].sort(() => Math.random() - 0.5);
  let lastErr = '';
  let geminiData: any = null;

  for (const key of shuffled) {
    let res: Response;
    try {
      res = await fetch(`${GEMINI_URL}?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
        }),
        signal: AbortSignal.timeout(55000),
      });
    } catch (e) { lastErr = String(e); continue; }
    if (res.status === 429 || res.status === 401 || res.status === 403) { lastErr = `status ${res.status}`; continue; }
    if (!res.ok) { lastErr = `status ${res.status}`; continue; }
    geminiData = await res.json();
    break;
  }

  if (!geminiData) {
    console.error('[rent-advisor] all keys failed:', lastErr);
    return json({ error: 'AI 服務暫時無法使用，請稍後再試' }, 502);
  }

  const rawText: string = (geminiData?.candidates?.[0]?.content?.parts ?? [])
    .filter((p: any) => !p.thought)
    .map((p: any) => p.text ?? '')
    .join('').trim();

  if (!rawText) return json({ error: '未能取得資料，請稍後再試' }, 502);

  const stripped = rawText.replace(/```json\s*/g, '').replace(/```/g, '').trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end === -1) return json({ error: '解析失敗，請稍後再試' }, 502);

  try {
    const parsed = JSON.parse(stripped.slice(start, end + 1));

    const sanitizeMatch = (m: any): RentMatch => ({
      country: String(m?.country ?? '').slice(0, 20),
      city: String(m?.city ?? '').slice(0, 20),
      area: String(m?.area ?? '').slice(0, 40),
      estimated_rent: String(m?.estimated_rent ?? '').slice(0, 60),
      reason: String(m?.reason ?? '').slice(0, 200),
    });

    const sanitizeComp = (c: any): RentComparison => ({
      country: String(c?.country ?? '').slice(0, 20),
      city: String(c?.city ?? '').slice(0, 20),
      area: String(c?.area ?? '').slice(0, 40),
      estimated_rent: String(c?.estimated_rent ?? '').slice(0, 60),
      verdict: String(c?.verdict ?? '').slice(0, 100),
      foreigner_difficulty: ['容易', '中等', '困難'].includes(c?.foreigner_difficulty)
        ? c.foreigner_difficulty
        : '中等',
    });

    const result: RentResult = {
      best_match: sanitizeMatch(parsed.best_match ?? {}),
      comparisons: Array.isArray(parsed.comparisons)
        ? parsed.comparisons.slice(0, 4).map(sanitizeComp)
        : [],
      budget_tips: Array.isArray(parsed.budget_tips)
        ? parsed.budget_tips.slice(0, 4).map((t: any) => String(t).slice(0, 120))
        : [],
      warnings: Array.isArray(parsed.warnings)
        ? parsed.warnings.slice(0, 3).map((w: any) => String(w).slice(0, 120))
        : [],
    };
    return json(result);
  } catch (err) {
    console.error('[rent-advisor] parse error:', err, rawText.slice(0, 200));
    return json({ error: '解析失敗，請稍後再試' }, 502);
  }
};
