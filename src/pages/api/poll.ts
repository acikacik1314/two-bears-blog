import type { APIRoute } from 'astro';
import { put, list } from '@vercel/blob';

const POLLS = [
  { q: '你認為2026下半年最可能發生什麼？', o: ['台海緊張升溫', '全球經濟衰退', '加密貨幣暴漲', 'AI重大突破'] },
  { q: '你相信防火牆會在2039年倒塌嗎？', o: ['完全相信', '有可能', '不太可能', '絕對不會'] },
  { q: '黃金今年會突破3500美元嗎？', o: ['一定會', '可能會', '不太可能', '一定不會'] },
  { q: '你相信比格斯的台灣預言嗎？', o: ['非常相信', '部分相信', '持保留態度', '不相信'] },
  { q: '台灣未來5年最大的威脅是什麼？', o: ['軍事衝突', '經濟危機', '自然災害', '政治動盪'] },
  { q: '哪個預言家的準確率最高？', o: ['國分玲', '比格斯', '帕克', '其他'] },
  { q: 'BTC能在2026年突破10萬美元嗎？', o: ['一定會', '可能會', '不太可能', '一定不會'] },
  { q: '你最期待哪個預言實現？', o: ['中國民主化', '台灣永久和平', '科技飛躍突破', '世界大同'] },
  { q: '九紫離火運對你的影響如何？', o: ['非常正面', '略有正面', '沒有感覺', '不相信風水'] },
  { q: '你覺得今年台股最高會到哪裡？', o: ['2.5萬以上', '2萬~2.5萬', '1.5萬~2萬', '1.5萬以下'] },
  { q: '2039年最可能發生什麼大事？', o: ['中國防火牆倒塌', '台海戰爭結束', '第三次世界大戰', '科技奇點'] },
  { q: 'XRP能在2026年突破5美元嗎？', o: ['絕對可以', '可能會', '很難', '不可能'] },
];

function getWeekKey() {
  const d = new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

function getPoll(weekKey: string) {
  let h = 0;
  for (const c of weekKey) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  return POLLS[Math.abs(h) % POLLS.length];
}

async function getVotes(weekKey: string): Promise<Record<string, number>> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return {};
  try {
    const { blobs } = await list({ prefix: 'poll/', token: process.env.BLOB_READ_WRITE_TOKEN });
    const blob = blobs.find(b => b.pathname === `poll/${weekKey}.json`);
    if (!blob) return {};
    const r = await fetch(blob.url);
    return await r.json();
  } catch { return {}; }
}

export const GET: APIRoute = async () => {
  const weekKey = getWeekKey();
  const poll = getPoll(weekKey);
  const votes = await getVotes(weekKey);
  return new Response(JSON.stringify({ poll, votes, weekKey }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return new Response(JSON.stringify({ ok: false, noStorage: true }), { status: 200 });
  }
  const weekKey = getWeekKey();
  const poll = getPoll(weekKey);
  let option: number;
  try {
    const body = await request.json();
    option = Number(body.option);
    if (!Number.isInteger(option) || option < 0 || option >= poll.o.length) throw new Error();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid' }), { status: 400 });
  }
  const votes = await getVotes(weekKey);
  votes[option] = (votes[option] ?? 0) + 1;
  try {
    await put(`poll/${weekKey}.json`, JSON.stringify(votes), {
      access: 'public', addRandomSuffix: false, token: process.env.BLOB_READ_WRITE_TOKEN,
    });
  } catch {
    return new Response(JSON.stringify({ ok: false, noStorage: true }));
  }
  return new Response(JSON.stringify({ ok: true, votes }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
