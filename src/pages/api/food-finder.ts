export const prerender = false;
export const config = { maxDuration: 60 };

import type { APIRoute } from 'astro';
import { getGeminiKeys } from '../../utils/gemini';

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

export interface Restaurant {
  name: string;
  reason: string;
  trust_score: number;
  trust_reasons: string[];
  has_beef: boolean;
  is_vegetarian: boolean;
  confirmed_open: boolean;
  tags: string[];
}

export interface OmakaseRestaurant extends Restaurant {
  price_range: '1000以下' | '1000-3000' | '3000以上';
}

export interface Souvenir {
  name: string;
  reason: string;
  where_to_buy?: string;
}

export interface AvoidPlace {
  name: string;
  reason: string;
  complaints: string[];
}

export interface FoodResult {
  city: string;
  context: string;
  must_eat: Restaurant[];
  hidden_gems: Restaurant[];
  omakase: OmakaseRestaurant[];
  souvenirs: Souvenir[];
  avoid: AvoidPlace[];
  itinerary_hint: string;
}

function buildPrompt(city: string, context: string): string {
  const isDietaryCtx = context === '不吃牛' || context === '吃素';
  const contextNote = context && !isDietaryCtx ? `情境：${context}。` : '';

  let dietaryInstruction = '';
  if (context === '不吃牛') {
    dietaryInstruction = '\n\n【飲食限制：不吃牛】只推薦完全不含牛肉、牛骨湯、牛油、牛腩、牛雜等牛相關食材的餐廳。所有回傳項目 has_beef 必須為 false。含牛的餐廳一律排除。';
  } else if (context === '吃素') {
    dietaryInstruction = '\n\n【飲食限制：吃素】只推薦有素食選項的餐廳（蛋奶素或全素均可，需明確標示可點素食）。所有回傳項目 is_vegetarian 必須為 true，has_beef 必須為 false。無素食選項的餐廳一律排除。';
  }

  return `你是美食顧問，精通當地飲食文化，擅長分辨真實口碑與觀光陷阱。
請用 Google 搜尋「${city} 美食推薦」「${city} 隱藏版餐廳」「${city} 無菜單料理」「${city} 必買伴手禮」「${city} 地雷餐廳」，整理最值得吃的餐廳與食物。${contextNote}${dietaryInstruction}

【trust_score 評分標準（0-100）】
- 在地人評論比例高 → 加分
- 評論包含具體細節（特定菜名、師傅名、座位描述）→ 加分
- 近期短時間暴增大量五星評論 → 扣分（可能刷評）
- 負評集中在排隊久、停車難 → 不扣分；負評集中在食物本身或服務態度 → 扣分
- 長期穩定好評 → 加分；短期爆紅 → 保持觀望

【停業確認規則（每家必填）】
每家餐廳必須填入 confirmed_open 欄位：
- Google Maps 確認目前正常營業中 → confirmed_open: true
- Google Maps 顯示「已永久歇業」「Permanently closed」→ confirmed_open: false
- Google Maps 顯示「暫停營業」「Temporarily closed」→ confirmed_open: false
- 近期評論或新聞提到已停業、搬遷、結束營業 → confirmed_open: false
- 無法確認是否正常營業 → confirmed_open: false
confirmed_open: false 的餐廳仍可填入 JSON（讓系統自動過濾），但請優先只收錄確定營業的店家。寧可少推薦，不要推薦已關門的餐廳。

【has_beef 規則】
菜單含有牛肉、牛排、牛腩、牛骨湯、牛雜、牛油等牛相關食材 → has_beef: true，否則 false。

你的回覆只能是 JSON，絕對不能有任何說明文字、markdown 程式碼框或 \`\`\`json 標記。

JSON 格式（每個餐廳陣列至少 3 筆）：
{
  "must_eat": [
    {
      "name": "餐廳或食物名稱",
      "reason": "推薦理由，具體說明什麼最好吃、有何特色",
      "trust_score": 85,
      "trust_reasons": ["在地人評論占多數", "負評只集中在排隊"],
      "has_beef": false,
      "is_vegetarian": false,
      "confirmed_open": true,
      "tags": ["在地人", "平價"]
    }
  ],
  "hidden_gems": [
    {
      "name": "隱藏版餐廳名",
      "reason": "為何稱為隱藏版、觀光客不知道在哪裡找",
      "trust_score": 90,
      "trust_reasons": ["當地部落格才提到", "Google Maps 評論數少但質量高"],
      "has_beef": false,
      "is_vegetarian": false,
      "confirmed_open": true,
      "tags": ["當地人才知道", "不需排隊"]
    }
  ],
  "omakase": [
    {
      "name": "無菜單料理名稱",
      "reason": "推薦理由，主廚背景或招牌菜",
      "trust_score": 88,
      "trust_reasons": ["理由"],
      "has_beef": false,
      "is_vegetarian": false,
      "confirmed_open": true,
      "tags": ["需預約", "主廚推薦"],
      "price_range": "1000-3000"
    }
  ],
  "souvenirs": [
    {
      "name": "伴手禮名稱",
      "reason": "為何值得買、送人反應好",
      "where_to_buy": "哪裡買得到"
    }
  ],
  "avoid": [
    {
      "name": "應避開的餐廳或景點食物",
      "reason": "為何避開",
      "complaints": ["常見抱怨1", "常見抱怨2"]
    }
  ],
  "itinerary_hint": "一日美食行程文字建議，說明早中晚各去哪、怎麼安排最順"
}

price_range 只能填以下三種之一："1000以下" / "1000-3000" / "3000以上"（台幣，每人均消）`;
}

function sanitizeRestaurant(r: any): Restaurant {
  return {
    name: String(r?.name ?? '').slice(0, 60),
    reason: String(r?.reason ?? '').slice(0, 200),
    trust_score: Math.min(100, Math.max(0, Number(r?.trust_score ?? 70))),
    trust_reasons: Array.isArray(r?.trust_reasons)
      ? r.trust_reasons.map((s: any) => String(s).slice(0, 80)).slice(0, 4)
      : [],
    has_beef: Boolean(r?.has_beef),
    is_vegetarian: Boolean(r?.is_vegetarian),
    confirmed_open: r?.confirmed_open !== false,
    tags: Array.isArray(r?.tags)
      ? r.tags.map((s: any) => String(s).slice(0, 20)).slice(0, 5)
      : [],
  };
}

function sanitizeOmakase(r: any): OmakaseRestaurant {
  const VALID_RANGES = ['1000以下', '1000-3000', '3000以上'] as const;
  const range = VALID_RANGES.includes(r?.price_range) ? r.price_range : '1000-3000';
  return { ...sanitizeRestaurant(r), price_range: range };
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

  let city = '';
  let context = '';
  try {
    const body = await request.json();
    city = String(body.city ?? '').trim().slice(0, 30);
    context = String(body.context ?? '').trim().slice(0, 20);
  } catch {
    return json({ error: '請求格式錯誤' }, 400);
  }

  if (!city) {
    return json({ error: '請輸入城市名稱' }, 400);
  }

  const prompt = buildPrompt(city, context);
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
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 8192,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
        signal: AbortSignal.timeout(55000),
      });
    } catch (e) {
      lastErr = String(e);
      continue;
    }

    if (res.status === 429 || res.status === 401 || res.status === 403) {
      lastErr = `status ${res.status}`;
      continue;
    }
    if (!res.ok) {
      lastErr = `status ${res.status}`;
      continue;
    }

    geminiData = await res.json();
    break;
  }

  if (!geminiData) {
    console.error('[food-finder] all keys failed, last error:', lastErr);
    return json({ error: 'AI 搜尋服務暫時無法使用，請稍後再試' }, 502);
  }

  const rawText: string = (geminiData?.candidates?.[0]?.content?.parts ?? [])
    .filter((p: any) => !p.thought)
    .map((p: any) => p.text ?? '')
    .join('')
    .trim();

  if (!rawText) {
    return json({ error: '未能取得結果，請換個城市名稱再試' }, 502);
  }

  const stripped = rawText.replace(/```json\s*/g, '').replace(/```/g, '').trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end === -1) {
    console.error('[food-finder] no JSON found in:', rawText.slice(0, 200));
    return json({ error: '解析結果失敗，請稍後再試' }, 502);
  }

  try {
    const parsed = JSON.parse(stripped.slice(start, end + 1));

    const filterOpen = (r: Restaurant) => r.confirmed_open;
    const result: FoodResult = {
      city,
      context,
      must_eat: Array.isArray(parsed.must_eat) ? parsed.must_eat.map(sanitizeRestaurant).filter(filterOpen) : [],
      hidden_gems: Array.isArray(parsed.hidden_gems) ? parsed.hidden_gems.map(sanitizeRestaurant).filter(filterOpen) : [],
      omakase: Array.isArray(parsed.omakase) ? parsed.omakase.map(sanitizeOmakase).filter(filterOpen) : [],
      souvenirs: Array.isArray(parsed.souvenirs)
        ? parsed.souvenirs.map((s: any) => ({
            name: String(s?.name ?? '').slice(0, 60),
            reason: String(s?.reason ?? '').slice(0, 200),
            where_to_buy: s?.where_to_buy ? String(s.where_to_buy).slice(0, 80) : undefined,
          }))
        : [],
      avoid: Array.isArray(parsed.avoid)
        ? parsed.avoid.map((a: any) => ({
            name: String(a?.name ?? '').slice(0, 60),
            reason: String(a?.reason ?? '').slice(0, 200),
            complaints: Array.isArray(a?.complaints)
              ? a.complaints.map((c: any) => String(c).slice(0, 80)).slice(0, 4)
              : [],
          }))
        : [],
      itinerary_hint: String(parsed.itinerary_hint ?? '').slice(0, 400),
    };

    return json(result);
  } catch (err) {
    console.error('[food-finder] parse error:', err, '| raw:', rawText.slice(0, 300));
    return json({ error: '解析結果失敗，請稍後再試' }, 502);
  }
};
