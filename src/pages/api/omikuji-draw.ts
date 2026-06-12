export const prerender = false;
import type { APIRoute } from 'astro';
import { callGemini, getGeminiKeys } from '../../utils/gemini';
import { callGroq, getGroqKeys } from '../../utils/groq';

const FORTUNE_TYPES = [
  { type: '大吉', rankLabel: '最高吉兆', color: '#f59e0b', glow: 'rgba(245,158,11,0.45)', weight: 15 },
  { type: '中吉', rankLabel: '吉',       color: '#00f5ff', glow: 'rgba(0,245,255,0.4)',   weight: 35 },
  { type: '小吉', rankLabel: '小吉',     color: '#ec4899', glow: 'rgba(236,72,153,0.4)',  weight: 35 },
  { type: '末吉', rankLabel: '末位',     color: '#a78bfa', glow: 'rgba(167,139,250,0.4)', weight: 15 },
];

const SPECIAL_7DAY = {
  type: '七日觀測', rankLabel: '特殊解鎖',
  color: '#fbbf24', glow: 'rgba(251,191,36,0.6)',
};

function weightedDraw() {
  let r = Math.random() * 100;
  for (const f of FORTUNE_TYPES) {
    r -= f.weight;
    if (r <= 0) return f;
  }
  return FORTUNE_TYPES[1];
}

function vixLabel(vix: number): string {
  if (vix >= 30) return '極度恐慌，歷史警戒水位';
  if (vix >= 25) return '市場恐慌加劇，動盪明顯';
  if (vix >= 20) return '輕度恐慌，需謹慎觀察';
  if (vix >= 15) return '相對平穩，正常波動';
  return '極度樂觀，市場情緒過熱';
}

export const POST: APIRoute = async ({ request }) => {
  const hasGemini = getGeminiKeys().length > 0;
  const hasGroq = getGroqKeys().length > 0;
  if (!hasGemini && !hasGroq) {
    return json({ ok: false, error: '⚠️ AI 尚未啟用' });
  }

  const body = await request.json() as {
    tickers?: {
      vix?: number; gold?: number; goldChange?: number;
      twii?: number; twiiChange?: number;
      spx?: number;  spxChange?: number;
      btc?: number;  btcChange?: number;
    };
    history?: Array<{ type: string; isoDate: string; tagline?: string }>;
    is7Day?: boolean;
  };

  const { tickers = {}, history = [], is7Day = false } = body;
  const drawn = is7Day ? SPECIAL_7DAY : weightedDraw();

  // Build ticker context block
  const lines: string[] = [];
  if (tickers.vix != null) {
    lines.push(`恐慌指數 VIX：${tickers.vix.toFixed(1)}（${vixLabel(tickers.vix)}）`);
  }
  if (tickers.gold != null) {
    const chg = tickers.goldChange != null
      ? ` ${tickers.goldChange >= 0 ? '+' : ''}${tickers.goldChange.toFixed(1)}%`
      : '';
    lines.push(`黃金：$${Math.round(tickers.gold).toLocaleString()}${chg}`);
  }
  if (tickers.twii != null) {
    const chg = tickers.twiiChange != null
      ? ` ${tickers.twiiChange >= 0 ? '+' : ''}${tickers.twiiChange.toFixed(2)}%`
      : '';
    lines.push(`台股加權：${Math.round(tickers.twii).toLocaleString()}${chg}`);
  }
  if (tickers.btc != null) {
    const chg = tickers.btcChange != null
      ? ` ${tickers.btcChange >= 0 ? '+' : ''}${tickers.btcChange.toFixed(1)}%`
      : '';
    lines.push(`比特幣：$${Math.round(tickers.btc).toLocaleString()}${chg}`);
  }
  const tickerBlock = lines.length
    ? `今日市場異象（真實數據）：\n${lines.map(l => `- ${l}`).join('\n')}\n`
    : '';

  // Build history context (prev 1-3 draws, skip today)
  const today = new Date().toISOString().slice(0, 10);
  const recent = history.filter(h => h.isoDate !== today).slice(0, 3);
  const historyBlock = recent.length
    ? `過去的時間線記錄：\n${recent.map(h => `- ${h.isoDate}（${h.type}）：「${h.tagline || ''}」`).join('\n')}\n`
    : '';

  const continuityHint = recent.length
    ? '在【今日頻率】開頭用一句話自然帶出時間線連貫感（如昨天提醒了什麼，今天有何變化）。'
    : '';

  const is7DayHint = is7Day
    ? '連續觀測 7 天特殊解鎖！請在開場明確說這是第七天的完整時間線序列，給出最深刻的總結訊號。'
    : '';

  const system = `你是「未來人」——從 2055 年循著時間線回到現在的觀測者。你結合真實市場異象與命運頻率，給出每日訊號卡。

${tickerBlock}${historyBlock}今日籤型已定：【${drawn.type}】（${drawn.rankLabel}）

${continuityHint}
${is7DayHint}
嚴格依照以下格式輸出，標記後直接接內容：

【籤詩】（一句有詩意的話，最多25字）
【今日頻率】（從市場異象切入的開場，稱對方為「朋友」，兩到三句）
【財富訊號】（結合市場方向，一到兩句）
【感情頻率】（感情方向，一到兩句）
【行動指令】（今日最重要的具體行動，一句）
【關鍵提醒】（最重要的避險或把握建議，一句）
【幸運數字】（只寫1到99的整數）
【幸運方位】（只寫方位，不超過4字）
【幸運色】（只寫顏色，不超過4字）

只用繁體中文。禁用 Markdown 符號。禁用：首先、其次、最後、總結、不僅如此、值得注意。`;

  let text = '';
  let ok = false;

  if (hasGemini) {
    const r = await callGemini({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: '請為朋友生成今日未來人訊號卡。' }] }],
      generationConfig: { maxOutputTokens: 512, temperature: 0.92 },
    });
    if (r.ok && r.text) { text = r.text; ok = true; }
  }

  if (!ok && hasGroq) {
    const r = await callGroq(
      [
        { role: 'system', content: system },
        { role: 'user', content: '請為朋友生成今日未來人訊號卡。' },
      ],
      { maxTokens: 512, temperature: 0.92 }
    );
    if (r.ok) { text = r.text ?? ''; ok = true; }
  }

  if (!ok) return json({ ok: false, error: '暫時無法獲得回應，請稍後再試。' });

  function sec(label: string): string {
    const m = text.match(new RegExp(`【${label}】([^【]*)`, 's'));
    return m ? m[1].trim() : '';
  }

  const luckyNum = parseInt(sec('幸運數字')) || (Math.floor(Math.random() * 9) + 1);

  return json({
    ok: true,
    type: drawn.type,
    rankLabel: drawn.rankLabel,
    color: drawn.color,
    glow: drawn.glow,
    ai: {
      tagline: sec('籤詩') || '時間線訊號已鎖定',
      overall: sec('今日頻率') || '',
      wealth:  sec('財富訊號') || '',
      love:    sec('感情頻率') || '',
      action:  sec('行動指令') || '',
      advice:  sec('關鍵提醒') || '',
      luckyNum,
      luckyDir:   sec('幸運方位') || '東北方',
      luckyColor: sec('幸運色')   || '金色',
    },
  });
};

function json(data: object) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
}
