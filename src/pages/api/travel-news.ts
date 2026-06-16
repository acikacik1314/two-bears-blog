export const prerender = false;
export const config = { maxDuration: 60 };

import type { APIRoute } from 'astro';
import { getGeminiKeys } from '../../utils/gemini';

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

export type TravelCategory = 'japan-tax' | 'japan-news' | 'thailand-visa' | 'thailand-news';

export interface NewsItem {
  title: string;
  content: string;
  effective_date?: string;
  source: string;
}

export interface TravelNewsResult {
  category: TravelCategory;
  updated_at: string;
  summary: string;
  items: NewsItem[];
  tips: string[];
}

const CATEGORY_CONFIG: Record<TravelCategory, { label: string; prompt: string }> = {
  'japan-tax': {
    label: '日本退稅政策',
    prompt: `你是專為台灣旅客服務的日本旅遊資訊專家。
請用 Google 搜尋「日本消費稅退稅 2025 2026 台灣旅客」「日本免稅制度最新消息」「Japan tax refund tourist 2026」，整理目前最新的日本退稅制度資訊。

重點涵蓋：
- 目前退稅/免稅制度的基本規則（金額門檻、適用商品類別）
- 2025-2026 年的制度調整或即將生效的新規定
- 哪些商品可退稅、哪些不行
- 辦理退稅的流程與注意事項
- 台灣旅客常見疑問（信用卡退稅 vs 現金退稅）

以台灣旅客角度整理，使用繁體中文。`,
  },

  'japan-news': {
    label: '日本旅遊新聞',
    prompt: `你是專為台灣旅客服務的日本旅遊資訊專家。
請用 Google 搜尋「日本旅遊最新消息 2026」「日本觀光 台灣旅客」「Japan travel news 2026」，整理近期最新的日本旅遊資訊。

重點涵蓋：
- 入境規定與簽證（台灣護照免簽現況）
- 熱門景點的最新開放狀況或人潮管制
- 交通票券更新（JR Pass 等）
- 新開幕景點、餐廳、飯店
- 季節性活動或注意事項
- 最新匯率趨勢（日圓動態）

以台灣旅客角度整理，使用繁體中文。`,
  },

  'thailand-visa': {
    label: '泰國免簽政策',
    prompt: `你是專為台灣旅客服務的泰國旅遊資訊專家。
請用 Google 搜尋「泰國免簽 台灣 2025 2026」「Thailand visa free Taiwan」「泰國落地簽最新規定」，整理目前最新的泰國入境政策。

重點涵蓋：
- 台灣護照目前的免簽政策（天數、次數限制）
- 落地簽規定（如有）與所需文件
- 簽證延期申請辦法
- 最近有無政策調整或即將生效的新規定
- 入境時海關常問問題或注意事項
- 往返次數/停留天數的最新限制

以台灣旅客角度整理，使用繁體中文。`,
  },

  'thailand-news': {
    label: '泰國旅遊新聞',
    prompt: `你是專為台灣旅客服務的泰國旅遊資訊專家。
請用 Google 搜尋「泰國旅遊最新消息 2026」「曼谷旅遊 台灣旅客」「Thailand travel news 2026」，整理近期最新的泰國旅遊資訊。

重點涵蓋：
- 安全狀況與旅遊警示
- 熱門景點開放狀況（大皇宮、清邁廟宇等）
- 交通最新資訊（機場捷運、BTS 票價等）
- 新開幕景點、商場、餐廳
- 季節天氣與節慶活動
- 泰銖匯率與消費水平最新狀況

以台灣旅客角度整理，使用繁體中文。`,
  },
};

function buildPrompt(category: TravelCategory): string {
  const cfg = CATEGORY_CONFIG[category];
  const today = new Date().toISOString().slice(0, 10);
  return `${cfg.prompt}

今天日期：${today}。請只回傳 JSON，不要任何說明文字、markdown 程式碼框或 \`\`\`json 標記。

JSON 格式（items 至少 4 筆，tips 至少 3 條）：
{
  "summary": "用 2-3 句話總結目前最重要的資訊，讓讀者一眼掌握重點",
  "items": [
    {
      "title": "標題（簡短有力）",
      "content": "詳細說明（100字以內）",
      "effective_date": "生效日期，如 2026年4月1日；若不適用填空字串",
      "source": "資訊來源網站名稱，如 日本國稅廳、泰國移民局官網、觀光廳等"
    }
  ],
  "tips": [
    "給台灣旅客的實用小提醒，直接說重點，50字以內"
  ]
}`;
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

  let category: TravelCategory;
  try {
    const body = await request.json();
    const cat = String(body.category ?? '');
    if (!(cat in CATEGORY_CONFIG)) {
      return json({ error: '無效的分類' }, 400);
    }
    category = cat as TravelCategory;
  } catch {
    return json({ error: '請求格式錯誤' }, 400);
  }

  const prompt = buildPrompt(category);
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
            temperature: 0.15,
            maxOutputTokens: 4096,
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
    console.error('[travel-news] all keys failed, last error:', lastErr);
    return json({ error: 'AI 搜尋服務暫時無法使用，請稍後再試' }, 502);
  }

  const rawText: string = (geminiData?.candidates?.[0]?.content?.parts ?? [])
    .filter((p: any) => !p.thought)
    .map((p: any) => p.text ?? '')
    .join('')
    .trim();

  if (!rawText) {
    return json({ error: '未能取得資料，請稍後再試' }, 502);
  }

  const stripped = rawText.replace(/```json\s*/g, '').replace(/```/g, '').trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end === -1) {
    console.error('[travel-news] no JSON in:', rawText.slice(0, 200));
    return json({ error: '解析結果失敗，請稍後再試' }, 502);
  }

  try {
    const parsed = JSON.parse(stripped.slice(start, end + 1));
    const today = new Date().toISOString().slice(0, 10);

    const result: TravelNewsResult = {
      category,
      updated_at: today,
      summary: String(parsed.summary ?? '').slice(0, 300),
      items: Array.isArray(parsed.items)
        ? parsed.items.slice(0, 10).map((item: any) => ({
            title: String(item?.title ?? '').slice(0, 80),
            content: String(item?.content ?? '').slice(0, 300),
            effective_date: item?.effective_date ? String(item.effective_date).slice(0, 40) : undefined,
            source: String(item?.source ?? '').slice(0, 60),
          }))
        : [],
      tips: Array.isArray(parsed.tips)
        ? parsed.tips.slice(0, 6).map((t: any) => String(t).slice(0, 100))
        : [],
    };

    return json(result);
  } catch (err) {
    console.error('[travel-news] parse error:', err, '| raw:', rawText.slice(0, 300));
    return json({ error: '解析結果失敗，請稍後再試' }, 502);
  }
};
