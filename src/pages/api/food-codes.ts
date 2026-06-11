export const prerender = false;

import type { APIRoute } from 'astro';
import { put, list } from '@vercel/blob';

// ══════════════════════════════════════════════════════════════════
//  手動代碼 — 每月收到新代碼就更新這裡
//  general: true = 全台適用（分眾）；false = 限定地區
// ══════════════════════════════════════════════════════════════════
const MANUAL_CODES: CodeEntry[] = [
  // ── Uber Eats 全台（分眾）─────────────────────────────────────
  { platform: 'ubereats', code: '六要大吃',  desc: '消費滿79元享1次4折，最高折抵NT$100', expires: '2026-06-15', general: true  },
  { platform: 'ubereats', code: '好吃四折',  desc: '消費滿129元享1次4折，最高折抵NT$100', expires: '2026-06-30', general: true  },
  { platform: 'ubereats', code: '免運吃七次', desc: '消費滿129元享7次免運費', expires: '2026-06-30', general: true  },
  // ── Uber Eats 地區限定 ─────────────────────────────────────────
  { platform: 'ubereats', code: '六月吃飽',  desc: '消費滿149元享1次9折，最高折抵NT$100（新北/桃園/新竹/苗栗/台中/彰化/南投/雲林/嘉義/台南/高雄/屏東/宜蘭/花蓮/台東/澎湖/金門/基隆指定地區）', expires: '2026-06-30', general: false },
  { platform: 'ubereats', code: '六就吃八',  desc: '消費滿149元享1次7折，最高折抵NT$100（基隆市）', expires: '2026-06-15', general: false },
  { platform: 'ubereats', code: '六就享八',  desc: '消費滿149元享1次5折，最高折抵NT$100（苗栗縣）', expires: '2026-06-15', general: false },
  { platform: 'ubereats', code: '六就餓八',  desc: '消費滿149元享1次5折，最高折抵NT$100（南投縣）', expires: '2026-06-15', general: false },
  { platform: 'ubereats', code: '六就點八',  desc: '消費滿149元享1次5折，最高折抵NT$100（彰化縣）', expires: '2026-06-15', general: false },
  { platform: 'ubereats', code: '六就喜八',  desc: '消費滿149元享1次5折，最高折抵NT$100（雲林縣）', expires: '2026-06-15', general: false },
  { platform: 'ubereats', code: '六就暖八',  desc: '消費滿149元享1次5折，最高折抵NT$100（嘉義縣市）', expires: '2026-06-15', general: false },
  { platform: 'ubereats', code: '六就要八',  desc: '消費滿149元享1次5折，最高折抵NT$100（台南市）', expires: '2026-06-15', general: false },
  { platform: 'ubereats', code: '六就狂八',  desc: '消費滿149元享1次5折，最高折抵NT$100（屏東縣）', expires: '2026-06-15', general: false },
  { platform: 'ubereats', code: '六就省八',  desc: '消費滿149元享1次5折，最高折抵NT$100（宜蘭縣）', expires: '2026-06-15', general: false },
  { platform: 'ubereats', code: '六就好八',  desc: '消費滿149元享1次7折，最高折抵NT$100（花蓮縣）', expires: '2026-06-15', general: false },
  { platform: 'ubereats', code: '六就飽八',  desc: '消費滿149元享1次7折，最高折抵NT$100（台東縣）', expires: '2026-06-15', general: false },
  { platform: 'ubereats', code: '六就訂八',  desc: '消費滿149元享1次7折，最高折抵NT$100（澎湖縣）', expires: '2026-06-15', general: false },
  { platform: 'ubereats', code: '六就樂八',  desc: '消費滿149元享1次7折，最高折抵NT$100（金門縣）', expires: '2026-06-15', general: false },
  // ── Foodpanda ─────────────────────────────────────────────────
  { platform: 'foodpanda', code: 'pandapro',  desc: 'pandapro會員 85折，最高折抵NT$45（可用2次）', expires: '2026-06-25', general: true  },
];
// ══════════════════════════════════════════════════════════════════

const BLOB_KEY = 'food-codes/latest.json';

export interface CodeEntry {
  platform: 'foodpanda' | 'ubereats';
  code: string;
  desc: string;
  expires?: string;
  general: boolean;
  source?: 'manual' | 'auto';
}

export interface FoodCodesResult {
  codes: CodeEntry[];
  fetched: string;
  source: 'blob' | 'live';
}

// ── Scraper ────────────────────────────────────────────────────────
const CALLING_TW_URL = 'https://www.callingtaiwan.com.tw/%e5%a4%96%e9%80%81%e5%84%aa%e6%83%a0%e7%b8%bd%e6%95%b4%e7%90%86-foodpanda-ubereats/';

async function scrapeCallingTW(): Promise<string> {
  try {
    const res = await fetch(CALLING_TW_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TwoBearsBot/1.0)' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return '';
    const html = await res.text();
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  } catch { return ''; }
}

async function tavilySearch(apiKey: string, query: string): Promise<string> {
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        max_results: 5,
        include_domains: ['facebook.com', 'ptt.cc', 'dcard.tw', 'callingtaiwan.com.tw'],
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return '';
    const data = await res.json();
    return (data.results ?? []).map((r: any) => `${r.title ?? ''} ${r.content ?? ''}`).join('\n');
  } catch { return ''; }
}

function findAutoCode(text: string): CodeEntry[] {
  const found: CodeEntry[] = [];
  const seen = new Set<string>();
  const manualCodes = new Set(MANUAL_CODES.map(m => m.code.toLowerCase()));

  // eats-xxxxx
  for (const m of text.matchAll(/eats-[a-z0-9]{4,10}/gi)) {
    const c = m[0].toLowerCase();
    if (!seen.has(c) && !manualCodes.has(c)) {
      seen.add(c); found.push({ platform: 'ubereats', code: c, desc: '網路搜尋代碼，請確認有效性', general: true, source: 'auto' });
    }
  }
  // Alphanumeric codes near 代碼/優惠碼
  for (const m of text.matchAll(/(?:代碼|折扣碼|優惠碼|promo[\s_-]?code)[：:\s「"]+([A-Za-z0-9_-]{5,14})/gi)) {
    const c = m[1].trim();
    if (/^(http|www|com)/i.test(c)) continue;
    const cu = c.toUpperCase();
    if (!seen.has(cu) && !manualCodes.has(c.toLowerCase())) {
      seen.add(cu);
      const isPanda = /panda|fp/i.test(text.slice(Math.max(0, m.index! - 100), m.index!));
      found.push({ platform: isPanda ? 'foodpanda' : 'ubereats', code: cu, desc: '網路搜尋代碼，請確認有效性', general: true, source: 'auto' });
    }
  }
  // Chinese-character codes (4–6 chars) near promotion keywords
  for (const m of text.matchAll(/(?:點擊|複製|代碼|優惠碼|折扣碼)[：:\s「"(（]+([一-龥]{3,7})/g)) {
    const c = m[1].trim();
    if (!seen.has(c) && !manualCodes.has(c)) {
      seen.add(c);
      const isPanda = /panda|熊貓/i.test(text.slice(Math.max(0, m.index! - 150), m.index!));
      found.push({ platform: isPanda ? 'foodpanda' : 'ubereats', code: c, desc: '網路搜尋代碼，請確認有效性', general: true, source: 'auto' });
    }
  }
  return found.slice(0, 6);
}

export async function scrapeAllCodes(): Promise<FoodCodesResult> {
  const apiKey = import.meta.env.TAVILY_API_KEY ?? '';
  const [callingText, uberText, pandaText] = await Promise.all([
    scrapeCallingTW(),
    apiKey ? tavilySearch(apiKey, 'UberEats 台灣 優惠代碼 2026 六月') : Promise.resolve(''),
    apiKey ? tavilySearch(apiKey, 'foodpanda 台灣 優惠代碼 2026 六月') : Promise.resolve(''),
  ]);

  const autoCodes = findAutoCode(callingText + '\n' + uberText + '\n' + pandaText);
  const manualWithSource = MANUAL_CODES.map(c => ({ ...c, source: 'manual' as const }));
  const manualKeys = new Set(MANUAL_CODES.map(m => m.code.toLowerCase()));
  const deduped = autoCodes.filter(a => !manualKeys.has(a.code.toLowerCase()));

  return {
    codes: [...manualWithSource, ...deduped],
    fetched: new Date().toISOString(),
    source: 'live',
  };
}

// ── Blob helpers ───────────────────────────────────────────────────
async function readBlob(): Promise<FoodCodesResult | null> {
  try {
    const { blobs } = await list({ prefix: 'food-codes/latest' });
    if (blobs.length === 0) return null;
    const res = await fetch(blobs[0].url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function writeBlob(data: FoodCodesResult): Promise<void> {
  try {
    await put(BLOB_KEY, JSON.stringify(data), { access: 'public', addRandomSuffix: false });
  } catch { /* non-fatal */ }
}

// ── Route ──────────────────────────────────────────────────────────
export const GET: APIRoute = async () => {
  const stored = await readBlob();
  if (stored) {
    return new Response(JSON.stringify({ ...stored, source: 'blob' }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
    });
  }

  // First boot: scrape + save
  const fresh = await scrapeAllCodes();
  await writeBlob(fresh);
  return new Response(JSON.stringify(fresh), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
  });
};
