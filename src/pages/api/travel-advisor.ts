export const prerender = false;
export const config = { maxDuration: 60 };

import type { APIRoute } from 'astro';
import { getGeminiKeys } from '../../utils/gemini';

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

export interface AdvisorInput {
  age: number;
  budget: 'low' | 'medium' | 'high';
  duration: 'short' | 'medium' | 'long';
  purpose: string[];
  preferred_countries: string[];
  work_ok: boolean;
  study_ok: boolean;
  has_skill: string;
}

export interface AdvisorMatch {
  type: string;
  country: string;
  reason: string;
  estimated_cost?: string;
  difficulty?: '容易' | '中等' | '困難';
}

export interface AdvisorResult {
  best_match: AdvisorMatch;
  alternatives: AdvisorMatch[];
  action_steps: string[];
  warnings: string[];
}

function buildAdvisorPrompt(input: AdvisorInput): string {
  const today = new Date().toISOString().slice(0, 10);
  const purposeStr = input.purpose.join('、');
  const countriesStr = input.preferred_countries.length
    ? input.preferred_countries.join('、')
    : '無特定偏好';

  const budgetMap = { low: '低預算（每月3萬台幣以下）', medium: '中預算（每月3-8萬台幣）', high: '高預算（每月8萬台幣以上）' };
  const durationMap = { short: '短期（1-6個月）', medium: '中期（6-18個月）', long: '長期（18個月以上）' };

  return `你是台灣人海外生活顧問，請根據以下條件為台灣護照持有人推薦最適合的海外生活方式。

用戶條件：
- 年齡：${input.age} 歲
- 預算：${budgetMap[input.budget]}
- 計劃時長：${durationMap[input.duration]}
- 主要目的：${purposeStr}
- 偏好國家：${countriesStr}
- 接受打工：${input.work_ok ? '是' : '否'}
- 接受留學：${input.study_ok ? '是' : '否'}
- 專業技能：${input.has_skill || '無特定技能'}

今天日期：${today}

請用 Google 搜尋最新資訊，確認推薦方案的最新申請條件與可行性。

你的回覆只能是 JSON，不要任何說明文字、markdown 程式碼框或 \`\`\`json 標記。

JSON 格式：
{
  "best_match": {
    "type": "方案名稱（如打工度假/數位遊牧簽/留學/移民）",
    "country": "國家",
    "reason": "推薦理由（100字以內，說明為何最適合此用戶）",
    "estimated_cost": "預估費用（如申請費+前三個月生活費）",
    "difficulty": "容易 或 中等 或 困難"
  },
  "alternatives": [
    {
      "type": "方案名稱",
      "country": "國家",
      "reason": "推薦理由（60字以內）",
      "estimated_cost": "預估費用",
      "difficulty": "容易 或 中等 或 困難"
    }
  ],
  "action_steps": [
    "第一步：具體行動（50字以內）",
    "第二步：...",
    "第三步：..."
  ],
  "warnings": [
    "注意事項或常見錯誤（50字以內）"
  ]
}

alternatives 提供 2-3 個替代方案，action_steps 提供 3-5 個具體步驟，warnings 提供 2-3 條注意事項。`;
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

  let input: AdvisorInput;
  try {
    const body = await request.json();
    const age = Number(body.age);
    if (!age || age < 18 || age > 80) return json({ error: '年齡不符合範圍' }, 400);
    if (!['low', 'medium', 'high'].includes(body.budget)) return json({ error: '預算格式錯誤' }, 400);
    if (!['short', 'medium', 'long'].includes(body.duration)) return json({ error: '時長格式錯誤' }, 400);
    input = {
      age,
      budget: body.budget,
      duration: body.duration,
      purpose: Array.isArray(body.purpose) ? body.purpose.slice(0, 5).map(String) : [],
      preferred_countries: Array.isArray(body.preferred_countries)
        ? body.preferred_countries.slice(0, 5).map(String)
        : [],
      work_ok: Boolean(body.work_ok),
      study_ok: Boolean(body.study_ok),
      has_skill: String(body.has_skill ?? '').slice(0, 60),
    };
  } catch {
    return json({ error: '請求格式錯誤' }, 400);
  }

  const prompt = buildAdvisorPrompt(input);
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
    console.error('[travel-advisor] all keys failed:', lastErr);
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

    const sanitizeMatch = (m: any): AdvisorMatch => ({
      type: String(m?.type ?? '').slice(0, 40),
      country: String(m?.country ?? '').slice(0, 30),
      reason: String(m?.reason ?? '').slice(0, 200),
      estimated_cost: m?.estimated_cost ? String(m.estimated_cost).slice(0, 80) : undefined,
      difficulty: ['容易', '中等', '困難'].includes(m?.difficulty) ? m.difficulty : undefined,
    });

    const result: AdvisorResult = {
      best_match: sanitizeMatch(parsed.best_match ?? {}),
      alternatives: Array.isArray(parsed.alternatives)
        ? parsed.alternatives.slice(0, 3).map(sanitizeMatch)
        : [],
      action_steps: Array.isArray(parsed.action_steps)
        ? parsed.action_steps.slice(0, 5).map((s: any) => String(s).slice(0, 150))
        : [],
      warnings: Array.isArray(parsed.warnings)
        ? parsed.warnings.slice(0, 3).map((w: any) => String(w).slice(0, 150))
        : [],
    };
    return json(result);
  } catch (err) {
    console.error('[travel-advisor] parse error:', err, rawText.slice(0, 200));
    return json({ error: '解析失敗，請稍後再試' }, 502);
  }
};
