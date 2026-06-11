export const prerender = false;

import type { APIRoute } from 'astro';
import { getGeminiKeys } from '../../utils/gemini';

const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

/* ── Rate limiter (in-memory, per serverless instance) ── */
const rateMap = new Map<string, { count: number; resetAt: number }>();

function checkRate(ip: string): boolean {
  const now = Date.now();
  const rec = rateMap.get(ip);
  if (!rec || rec.resetAt < now) {
    rateMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (rec.count >= 3) return false;
  rec.count++;
  return true;
}

const SYMBOL_RE = /^[A-Za-z0-9.]{1,6}$/;
const FORBIDDEN_RE = /買入|賣出|加碼|減持|建議買進|建議賣出/g;

const SYSTEM_SUFFIX = `

【輸出格式規則】
- 全文使用台灣繁體中文
- 使用結構化 Markdown：## 二級標題、### 三級標題、Markdown 表格、> 引用區塊
- 口吻帶有宏大、神秘、高科技時空觀測者的風格，但資料必須來自檢索結果
- 所有財報數字必須標明來源（例如：「據 Bloomberg 報導」或「根據公司 2025Q1 財報」）
- 所有預言引用旁加上標示：（網路檢索記錄，原始出處請自行查證）
- 查無可靠記錄時，明說「查無可靠記錄」，絕不捏造或推測
- 嚴禁出現「買入、賣出、加碼、減持、目標價 XX 元」等任何行動指令字眼
- 報告結尾必須輸出以下固定免責聲明（原文，不要修改）：

---

> ⚠️ **免責聲明**：本頁內容由 AI 即時檢索生成，僅供娛樂與資訊參考，不構成任何投資建議。預言內容為網路公開記錄之整理，本站不對其真實性背書。投資有風險，決策請諮詢持牌專業人士。`;

const DIMENSIONS: Record<number, { label: string; prompt: string }> = {
  1: {
    label: '命運軌跡',
    prompt: `你是「時空因果觀測站」的跨時空財經觀察員，任務是將財務基本面與網路流傳的預言記錄進行交叉觀測。

【任務步驟】
1. 使用 Google Search 即時檢索目標資產的最新財報摘要、近三季營收趨勢、毛利率與波特五力分析資料，標注數據出處。
2. 使用 Google Search 即時檢索網路上阿南德（Anand Kumar）、盲眼龍婆（Baba Vanga）、KFK 先知、2060未來人、比格斯（Brandon Biggs）、帕克（Craig Hamilton-Parker）、麥克蒙尼格（Joseph McMoneagle）等對科技週期、晶片產業、AI 浪潮、全球經濟的公開預言記錄與年份。若某位預言家查無可靠記錄，直接標注「查無可靠記錄」。
3. 用 Markdown 表格對齊「財務時間線」與「預言時間線」，標出重合與矛盾之處。
4. 以「基準情境 / 樂觀情境 / 悲觀情境」三種敘事推演未來 24 個月的可能產業環境，不得包含任何價格預測。`,
  },
  2: {
    label: '絕對防禦',
    prompt: `你是「時空因果觀測站」的護城河鑑定師，以 Morningstar 四大框架評估企業防禦韌性。

【任務步驟】
1. 使用 Google Search 即時檢索目標企業的競爭優勢相關資料，以 Morningstar 四大護城河框架各打 1–10 分，並附評分依據（需引用可查證的資料）：
   - 無形資產（品牌力、專利、監管許可）
   - 轉換成本（客戶黏著度與遷移障礙）
   - 網絡效應（平台規模與正回饋效應）
   - 成本優勢（規模效益或獨特資源）
2. 使用 Google Search 即時檢索著名預言（阿南德、KFK、比格斯等）提及的重大衝突、地緣政治轉折、金融重組年份記錄。若查無可靠記錄，明說之。
3. 以「護城河防禦力 × 預言情境耐受度」為核心，敘事分析在三種預言情境下（溫和衝擊、系統性危機、極端黑天鵝）企業體質的耐受程度。
4. 給出「防禦韌性評級」（僅定性描述，嚴禁含任何目標價格）。`,
  },
  3: {
    label: '黑天鵝雷達',
    prompt: `你是「時空因果觀測站」的黑天鵝雷達操作員，負責構建風險矩陣並交叉比對未來人警告記錄。

【任務步驟】
1. 掃描目標資產的宏觀風險層（地緣政治、供應鏈中斷、監管收緊、匯率波動、利率政策）與微觀風險層（競爭格局、技術替代、客戶集中度）。
2. 使用 Google Search 即時檢索 KFK 先知、2060未來人、麥克蒙尼格（Joseph McMoneagle）、阿南德等對 2026–2030 年地緣政治、台海情勢、金融體系重組、能源轉型的公開發言記錄。若查無可靠記錄，明說之。
3. 建立 2×2 風險矩陣表格：
   - 橫軸：網路討論熱度（高 / 低）
   - 縱軸：與該資產的關聯度（強 / 弱）
   每格列出 2–3 個具體風險事件。
4. 對高關聯度風險，列出「可公開追蹤的監測指標」清單，給出指標閾值與數據來源（例如：VIX 超過 40、能源期貨走勢、特定新聞關鍵字密度）。`,
  },
  4: {
    label: '解密天機',
    prompt: `你是「時空因果觀測站」的財報解碼員，任務是對比最新財報數據、市場情緒與預言經濟節點。

【任務步驟】
1. 使用 Google Search 即時檢索目標資產最新季度財報：EPS 相對分析師預期的 Beat/Miss 幅度、營收表現、自由現金流。標注財報期別與來源。
2. 分析管理層 Forward Guidance 的「措辭信心度」——識別積極信號（上調指引、強調訂單能見度）、保守信號（下調或區間縮窄）或模糊迴避語言，引用原文。如能查到，按「據 [來源] 報導，市場共識為…」轉述格式呈現分析師預期，不得以 AI 口吻直接給出預測。
3. 使用 Google Search 即時檢索當前市場情緒指標（VIX 水位、恐慌貪婪指數等公開數據），描述目前在「貪婪–恐懼循環」的位置。
4. 使用 Google Search 即時檢索預言敘事中提到的「經濟循環轉折點」公開記錄，與目前市場情緒位置進行交叉比對，找出時間節點的重合性或矛盾。`,
  },
  5: {
    label: '估值溫度計',
    prompt: `你是「時空因果觀測站」的估值溫度計，以歷史分位點描述多維估值的當前落點。

【任務步驟】
1. 使用 Google Search 即時檢索目標資產的：
   - 當前本益比（P/E）及其近 5 年、近 10 年的歷史分位數
   - 股價淨值比（P/B）的歷史分位數
   - EV/EBITDA（如適用），或對指數/ETF 使用對應估值指標
   標注數據來源與取樣日期。
2. 用「溫度計」視覺比喻描述目前估值落點：
   - 🔥 過熱區（> 第 80 百分位）
   - ⚖️ 平衡區（第 40–80 百分位）
   - 🧊 低溫區（< 第 40 百分位）
3. 若 Google Search 檢索到任何券商共識或分析師報告，必須以「據 [來源名稱] 報導，市場共識為…」的轉述格式呈現，並附 grounding 引用來源；絕不以 AI 自己的口吻給出價格預測或目標價。
4. 使用 Google Search 即時檢索預言家記錄中提及的「估值泡沫年份」或「資產價格重置」的公開預測，做歷史對比說明。`,
  },
};

function sseData(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function errRes(msg: string, status = 400): Response {
  return new Response(sseData({ error: msg }), {
    status,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const ip = clientAddress ?? '0.0.0.0';
  if (!checkRate(ip)) {
    return errRes('請求過於頻繁，請 1 分鐘後再試（每分鐘限 3 次）', 429);
  }

  let symbol: string, dimension: number;
  try {
    const body = await request.json() as { symbol?: unknown; dimension?: unknown };
    symbol = String(body.symbol ?? '').toUpperCase().trim();
    dimension = Number(body.dimension);
  } catch {
    return errRes('請求格式錯誤', 400);
  }

  if (!SYMBOL_RE.test(symbol)) {
    return errRes('資產符號格式不正確（僅允許 1–6 位英數字與「.」）', 400);
  }
  if (![1, 2, 3, 4, 5].includes(dimension)) {
    return errRes('無效的觀測維度', 400);
  }

  const keys = getGeminiKeys();
  if (!keys.length) return errRes('服務暫時不可用，請稍後再試', 503);

  // Shuffle keys so different instances don't all hit the same key first
  const shuffled = [...keys].sort(() => Math.random() - 0.5);

  const dim = DIMENSIONS[dimension];

  const userPrompt = `請對以下資產進行「${dim.label}」觀測分析：

**資產符號**：${symbol}

請先透過 Google Search 即時檢索該資產的最新公開資訊，然後依據你的角色定位完整輸出交叉觀測報告。`;

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: dim.prompt + SYSTEM_SUFFIX }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    tools: [{ googleSearch: {} }],
    generationConfig: { maxOutputTokens: 4096, temperature: 0.7 },
  });

  let geminiRes: Response | null = null;
  outer: for (const model of MODELS) {
    for (const apiKey of shuffled) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
        );
        if (res.status === 429 || res.status === 503) {
          console.warn(`Gemini ${model} key rate-limited (${res.status}), trying next key`);
          continue;
        }
        if (res.status === 401 || res.status === 403) {
          console.warn(`Gemini ${model} key auth failed (${res.status}), trying next key`);
          continue;
        }
        if (res.status === 404) {
          console.warn(`Gemini model ${model} not found, trying next model`);
          break; // try next model
        }
        geminiRes = res;
        break outer;
      } catch {
        continue;
      }
    }
  }

  if (!geminiRes) {
    return errRes('所有時空通道已滿載，請 1 分鐘後重試', 429);
  }

  if (!geminiRes.ok || !geminiRes.body) {
    let detail = '';
    try { detail = await geminiRes.text(); } catch { /* */ }
    console.error('Gemini error', geminiRes.status, detail.slice(0, 200));
    return errRes(`時空訊號中斷 (${geminiRes.status})，請稍後重試`, 502);
  }

  const enc = new TextEncoder();
  const reader = geminiRes.body.getReader();

  const outStream = new ReadableStream({
    async start(ctrl) {
      const dec = new TextDecoder();
      let buf = '';
      let gMeta: unknown = null;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jstr = line.slice(6).trim();
            if (!jstr || jstr === '[DONE]') continue;

            try {
              const data = JSON.parse(jstr);
              const candidate = data?.candidates?.[0];
              if (!candidate) continue;

              const parts: Array<{ text?: string }> = candidate?.content?.parts ?? [];
              let txt = parts.map(p => p.text ?? '').join('');

              if (txt) {
                txt = txt.replace(FORBIDDEN_RE, '[資訊已過濾]');
                ctrl.enqueue(enc.encode(sseData({ t: txt })));
              }

              if (candidate.groundingMetadata) {
                gMeta = candidate.groundingMetadata;
              }
            } catch { /* malformed chunk, skip */ }
          }
        }
      } catch {
        ctrl.enqueue(enc.encode(sseData({ error: '時空訊號中斷，請稍後重試' })));
      } finally {
        ctrl.enqueue(enc.encode(sseData({ done: true, meta: gMeta })));
        ctrl.close();
      }
    },
  });

  return new Response(outStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
};
