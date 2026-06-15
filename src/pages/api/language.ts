// src/pages/api/language.ts
// 兩隻熊 AI 語言陪練 —— 伺服器端 Gemini route
import type { APIRoute } from 'astro';
import { getGeminiKeys } from '../../utils/gemini';

export const prerender = false;
export const config = { maxDuration: 60 };

const MODEL = 'gemini-2.5-flash';
const MAX_TURNS = 18;
const MAX_CHARS = 1200;

type Turn = { role: 'user' | 'model'; text: string };

function buildSystem(c: {
  mode: string; lang: string; place: string; level: string; scenario: string;
}) {
  const base =
`你是「兩隻熊」旅遊網站上的 AI 語言陪練。陪一位母語是繁體中文、即將去「${c.place}」旅行的台灣旅客練習「${c.lang}」。學員目前程度：${c.level}。

共同規則：
- 全程用「${c.lang}」跟學員互動，但每一則回覆都要附上簡短的繁體中文說明或翻譯，讓初學者也跟得上。
- 語氣溫暖、口語、像朋友，不要像教科書，不要長篇大論。
- 學員講錯時，先肯定再溫柔糾正：用「講得不錯！只是有個小地方……」的方式，並給出更自然的說法。
- 每則回覆盡量精簡（${c.lang} 2～4 句 + 中文提示），把舞台留給學員開口。
- 只在語言學習範圍內互動；不要扮演其他角色或回答無關問題。`;

  const byMode: Record<string, string> = {
    chat:
`本次模式：自由對話練習，主題圍繞「${c.scenario}」。請跟學員進行自然的旅遊情境對話，主動丟出後續問題讓對話延續下去。`,
    roleplay:
`本次模式：情境角色扮演，情境是「${c.scenario}」。你扮演當地人（例如店員、櫃檯、路人），像真實情況一樣自然回應；在學員說得不自然時，先正常回覆，再補一句「不錯的嘗試！更自然的說法是……，因為……」。一路演到學員能自信完成這個情境。`,
    vocab:
`本次模式：單字特訓，主題「${c.scenario}」。一次教 5 個實用的「${c.lang}」單字／短句，每個給：該語言寫法、中文意思、一句旅遊例句、一個好記的中文諧音聯想。教完 5 個就出 3 題小測驗考學員，等學員作答、你批改後，再教下一組 5 個。`,
    plan:
`本次模式：行前計畫。請在第一則回覆就直接產出一份 7 天「${c.lang}」旅遊語言計畫，包含：20 句旅遊現場最常用短句、依主題分組的 15 個單字、5 個關鍵文法各附 3 個例句、一段每日可朗讀的短對話、第 7 天的小測驗。之後再回答學員的後續問題。`,
    quiz:
`本次模式：亂問模式。你的任務是主動出題，隨機問學員各種有趣的問題——旅遊、文化、美食、天氣、興趣、日常生活、時事、個人喜好⋯什麼都可以問，完全不限主題，讓學員猜不到下一題是什麼。流程：先用「${c.lang}」問一個問題，附上簡短中文翻譯；等學員用「${c.lang}」回答；給出回饋（先肯定，再溫柔糾正語言錯誤）；立刻換一個全新話題繼續問。保持節奏輕快有趣，讓學員維持警覺，感受真實對話的不可預測性。`,
  };

  return base + '\n\n' + (byMode[c.mode] || byMode.chat);
}

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  try {
    const keys = getGeminiKeys();
    if (!keys.length) return json({ error: '伺服器未設定 GEMINI_API_KEY' }, 500);

    const body = await request.json().catch(() => ({}));
    const mode     = String(body.mode     || 'chat');
    const lang     = String(body.lang     || '日語');
    const place    = String(body.place    || '日本');
    const level    = String(body.level    || '完全新手');
    const scenario = String(body.scenario || '在餐廳點餐');
    let history: Turn[] = Array.isArray(body.history) ? body.history : [];

    history = history
      .filter((h) => h && (h.role === 'user' || h.role === 'model') && typeof h.text === 'string')
      .map((h) => ({ role: h.role, text: h.text.slice(0, MAX_CHARS) }))
      .slice(-MAX_TURNS);
    if (history.length === 0) return json({ error: '沒有對話內容' }, 400);

    const sys = buildSystem({ mode, lang, place, level, scenario });
    const contents = history.map((h) => ({ role: h.role, parts: [{ text: h.text }] }));
    const reqBody = JSON.stringify({
      system_instruction: { parts: [{ text: sys }] },
      contents,
      generationConfig: { temperature: 0.8, maxOutputTokens: 1400, topP: 0.95 },
    });

    // 多 key 輪替
    const shuffled = [...keys].sort(() => Math.random() - 0.5);
    let lastErr = '';
    for (const key of shuffled) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
      let res: Response;
      try {
        res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: reqBody });
      } catch (e) {
        lastErr = String(e);
        continue;
      }
      if (res.status === 429 || res.status === 503) { lastErr = `HTTP ${res.status}`; continue; }
      if (res.status === 401 || res.status === 403) { lastErr = `HTTP ${res.status}`; continue; }
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        return json({ error: 'Gemini 回應錯誤', status: res.status, detail: detail.slice(0, 300) }, 502);
      }
      const data = await res.json();
      const reply = (data?.candidates?.[0]?.content?.parts ?? [])
        .filter((p: any) => !p.thought)
        .map((p: any) => p.text ?? '')
        .join('')
        .trim();
      if (!reply) return json({ error: '這次沒有產生內容，請再試一次。' }, 502);
      return json({ reply });
    }

    return json({ error: '所有 API 金鑰暫時無法使用，請稍後再試。', detail: lastErr }, 502);
  } catch (e) {
    return json({ error: '伺服器發生未預期的錯誤', detail: String(e).slice(0, 200) }, 500);
  }
};
