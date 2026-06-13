export const prerender = false;
import type { APIRoute } from 'astro';
import { getGeminiKeys } from '../../utils/gemini';

// ── System prompts ────────────────────────────────────────────────────────────

const CHAT_SYSTEM = `你是「兩隻熊」旅遊顧問——像朋友一樣的熊，正在幫使用者找飯店。
你要透過「一問一答」收集以下資訊，但要像聊天一樣自然，不要像問卷：

【必須收集的資訊】
1. 目的地（城市）
2. 幾個人、什麼關係（情侶/家庭/朋友/獨自/長輩）
3. 想住舒適型還是經濟落腳型
4. 每晚預算
5. 入住與退房日期
6. 特殊偏好（想要或不要的，例如浴缸、大床、近市區、安靜…）

【對話規則】
- 一次只問一個問題，口吻溫暖像朋友，稱對方「朋友」
- 可以針對回答自然追問，但追問要克制，別問太多離題的事
- 如果使用者一句話講了好幾項（例如「台北兩人情侶三千」），就一次吸收，別重複問已經知道的
- 收集到「足夠」資訊就停止發問（至少要有：地點、人數關係、預算、偏好方向）

【何時停止發問、開始推薦】
當你判斷資訊足夠時，嚴格只輸出以下 JSON，無其他文字：
{
  "action": "recommend",
  "summary": {
    "destination": "城市名稱",
    "companions": "幾人什麼關係",
    "adults": 2,
    "children": 0,
    "comfort": "舒適型或經濟型",
    "budget": "每晚預算（只填數字，例如 3000）",
    "checkin": "入住日期 YYYY-MM-DD，沒有則填空字串",
    "checkout": "退房日期 YYYY-MM-DD，沒有則填空字串",
    "dates": "日期描述（若無填未指定）",
    "preferences": "偏好（若無填無）"
  }
}

adults 填成人人數整數（不確定填 1），children 填兒童數整數（通常填 0）。
checkin / checkout 請盡量推算成當年的完整日期，例如「6/20 到 6/22」→ "checkin":"2026-06-20","checkout":"2026-06-22"。

【還要繼續問的時候】
嚴格只輸出以下 JSON，無其他文字：
{
  "action": "ask",
  "question": "下一個問題（一句話，溫暖口吻）"
}

務必嚴格只輸出 JSON，不要 markdown 程式碼框、不要多餘說明。`;

const RECOMMEND_SYSTEM = `你是「兩隻熊」旅遊顧問——一位懂旅遊、像朋友一樣的熊。
使用者會告訴你目的地、旅伴、預算，你要推薦 4 間真實存在的飯店。

【最重要的規則：絕對不可虛構飯店】
- 你已啟用 Google 搜尋，請務必基於搜尋到的「真實存在」飯店推薦
- 每間飯店必須附上「正式英文名稱」和「城市」（給後續 TripAdvisor 搜尋用）
- 如果你對某間飯店是否真實存在沒有把握，寧可不推，也絕對不要編造
- 寧可只推 3 間真的，也不要推 4 間有 1 間是假的

【預算是硬性限制——最重要的規則之二】
- 使用者說的預算是每晚「上限」，不是參考值，也不是彈性區間
- 推薦飯店的每晚最低可訂房價必須在預算 135% 以內（例如預算 3000，上限 4050）
- 換批次時（prompt 有「已推薦過：XXX」）同樣嚴格遵守，不能因為符合預算的已推完就放寬
- 若找不到 4 間符合預算的飯店：寧可只推 2-3 間，絕對不推超出預算的飯店湊數

【推薦邏輯】
- 根據旅伴和預算，挑最適合的
- 每間給一句「推薦理由」
- 給 2-3 個「適合標籤」（例如：情侶、溫泉、近車站）
- 給 2-3 個優點、1-2 個要注意的地方（缺點要誠實）

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

若 prompt 中有「已推薦過：XXX」，請推薦完全不同的飯店。`;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function callGemini(
  key: string,
  systemInstruction: string,
  messages: unknown[],
  useGrounding: boolean,
): Promise<{ ok: boolean; text?: string }> {
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: messages,
    generationConfig: {
      maxOutputTokens: useGrounding ? 1024 : 512,
      temperature: useGrounding ? 0.35 : 0.7,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
  if (useGrounding) body.tools = [{ google_search: {} }];

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(useGrounding ? 25000 : 12000),
      },
    );
    if (!res.ok) return { ok: false };
    const data = await res.json();
    const parts = ((data?.candidates?.[0]?.content?.parts) ?? []).filter(
      (p: any) => !p.thought,
    );
    const text = parts.map((p: any) => p.text ?? '').join('').trim();
    return { ok: !!text, text: text || undefined };
  } catch {
    return { ok: false };
  }
}

function parseJSON(text: string): unknown {
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export const POST: APIRoute = async ({ request }) => {
  const keys = getGeminiKeys();
  if (!keys.length) return json({ ok: false, error: '⚠️ AI 尚未啟用' });

  const body = await request.json() as {
    type: 'chat' | 'recommend';
    messages?: unknown[];
    summary?: Record<string, string>;
    excludeNames?: string[];
  };

  const shuffled = [...keys].sort(() => Math.random() - 0.5);

  // ── Chat phase (no grounding) ─────────────────────────────────────────────
  if (body.type === 'chat') {
    for (const key of shuffled) {
      const r = await callGemini(key, CHAT_SYSTEM, body.messages ?? [], false);
      if (!r.ok || !r.text) continue;

      const parsed = parseJSON(r.text) as any;
      if (!parsed) continue;

      if (parsed.action === 'recommend' && parsed.summary) {
        return json({ ok: true, action: 'recommend', summary: parsed.summary, modelText: r.text });
      }
      if (parsed.action === 'ask' && parsed.question) {
        return json({ ok: true, action: 'ask', question: parsed.question, modelText: r.text });
      }
    }
    return json({ ok: false, error: '熊熊暫時無法回應，請再說一遍 🐻' });
  }

  // ── Recommend phase (with grounding) ─────────────────────────────────────
  if (body.type === 'recommend') {
    const s = body.summary ?? {};
    const exclude = body.excludeNames?.length
      ? `\n\n已推薦過，請不要重複：${body.excludeNames.join('、')}`
      : '';

    const userPrompt = `朋友的需求如下：
目的地：${s.destination || '未指定'}
旅伴：${s.companions || '未指定'}
住宿類型：${s.comfort || '未指定'}
預算：${s.budget || '未指定'}
日期：${s.dates || '未指定'}
特殊偏好：${s.preferences || '無'}${exclude}

請推薦 4 間最適合的飯店。`;

    for (const key of shuffled) {
      const r = await callGemini(
        key, RECOMMEND_SYSTEM,
        [{ role: 'user', parts: [{ text: userPrompt }] }],
        true,
      );
      if (!r.ok || !r.text) continue;
      const parsed = parseJSON(r.text) as any;
      if (parsed?.hotels?.length) return json({ ok: true, hotels: parsed.hotels });
    }
    return json({ ok: false, error: '暫時無法獲得推薦，請稍後再試 🐻' });
  }

  return new Response('Bad Request', { status: 400 });
};

function json(data: object) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
}
