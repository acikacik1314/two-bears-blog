export const prerender = false;

import type { APIRoute } from 'astro';
import { put, list } from '@vercel/blob';

// ══════════════════════════════════════════════════════════════════
//  手動代碼 — 每月收到新代碼就更新這裡
//  general: true = 全台適用（分眾）；false = 限定地區
// ══════════════════════════════════════════════════════════════════
const MANUAL_CODES: CodeEntry[] = [
  // ── Uber Eats 全台（分眾）─────────────────────────────────────
  { platform: 'ubereats', code: '月底幫省',    desc: '消費滿 $199 現折 $60，每人可用 2 次', expires: '2026-08-02', general: true  },
  { platform: 'ubereats', code: '贏球美食省200', desc: '消費滿 $699 享 8 折，最高折抵 $200，可用 1 次', expires: '2026-08-05', general: true  },
  // ── Uber Eats 地區限定 ─────────────────────────────────────────
  { platform: 'ubereats', code: '瑪奇Mobile', desc: '消費滿 $249 現折 $50（限部分縣市）', expires: '2026-08-31', general: false },
  { platform: 'ubereats', code: '八點七折',  desc: '消費滿 $149 享 2 次 7 折，最高折抵 $50（基隆市）', expires: '2026-08-15', general: false },
  { platform: 'ubereats', code: '八點五折',  desc: '消費滿 $149 享 2 次 5 折，最高折抵 $80（苗栗縣）', expires: '2026-08-15', general: false },
  { platform: 'ubereats', code: '八好五折',  desc: '消費滿 $149 享 2 次 5 折，最高折抵 $80（彰化縣）', expires: '2026-08-15', general: false },
  { platform: 'ubereats', code: '八吃五折',  desc: '消費滿 $149 享 2 次 5 折，最高折抵 $80（南投縣）', expires: '2026-08-15', general: false },
  { platform: 'ubereats', code: '八喜五折',  desc: '消費滿 $149 享 2 次 5 折，最高折抵 $80（雲林縣）', expires: '2026-08-15', general: false },
  { platform: 'ubereats', code: '八飽五折',  desc: '消費滿 $149 享 2 次 5 折，最高折抵 $80（嘉義縣、嘉義市）', expires: '2026-08-15', general: false },
  { platform: 'ubereats', code: '八要五折',  desc: '消費滿 $149 享 2 次 5 折，最高折抵 $80（台南市）', expires: '2026-08-15', general: false },
  { platform: 'ubereats', code: '八狂五折',  desc: '消費滿 $149 享 2 次 5 折，最高折抵 $80（屏東縣）', expires: '2026-08-15', general: false },
  { platform: 'ubereats', code: '八省五折',  desc: '消費滿 $149 享 2 次 5 折，最高折抵 $80（宜蘭縣）', expires: '2026-08-15', general: false },
  // ── Foodpanda 老顧客（全台/分眾）──────────────────────────────
  { platform: 'foodpanda', code: '爽爽送',       desc: '滿額現折（依帳號資格而異）', expires: '2026-08-31', general: true  },
  { platform: 'foodpanda', code: '十足美味',     desc: 'pandapro 訂閱會員專屬・非訂閱用戶無效', general: true  },
  // ── Foodpanda 類別/付款方式限定 ───────────────────────────────
  { platform: 'foodpanda', code: 'FRESH',        desc: 'pandamart 生鮮雜貨訂單適用', general: false },
  { platform: 'foodpanda', code: 'SHOPS',        desc: 'pandamart 購物訂單適用',     general: false },
  { platform: 'foodpanda', code: '十足新鮮',    desc: 'pandamart 生鮮訂單適用',     general: false },
  { platform: 'foodpanda', code: 'psctbc607',    desc: '中信 LINE Pay 卡付款專屬',   general: false },
  { platform: 'foodpanda', code: 'psctbce607',   desc: '中信 foodpanda 聯名卡付款專屬', general: false },
  { platform: 'foodpanda', code: '刷這張十足爽', desc: 'foodpanda 聯名卡付款專屬',  general: false },
  // ── Foodpanda 指定店家 ────────────────────────────────────────
  { platform: 'foodpanda', code: '週二星享日', desc: '星巴克每週二【限時優惠專區】消費滿 $279 現折 $70（指定店家）', expires: '2026-12-31', general: false },
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

// Known brand names that sometimes appear near promo-code keywords but are not actual codes
const BRAND_BLOCKLIST = new Set([
  'IHERB', 'FOODPANDA', 'EXPEDIA', 'KLOOK', 'KKDAY', 'ASIAYO',
  'AGODA', 'BOOKING', 'AIRBNB', 'SHOPEE', 'MOMO', 'RAKUTEN',
  'PCHOME', 'CARREFOUR', 'UBEREATS', 'GRABFOOD',
]);

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
    if (BRAND_BLOCKLIST.has(cu)) continue;
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
  const now = new Date();
  const monthLabel = `${now.getFullYear()} ${now.getMonth() + 1}月`;
  const [callingText, uberText, pandaText] = await Promise.all([
    scrapeCallingTW(),
    apiKey ? tavilySearch(apiKey, `UberEats 台灣 優惠代碼 ${monthLabel}`) : Promise.resolve(''),
    apiKey ? tavilySearch(apiKey, `foodpanda 台灣 優惠代碼 ${monthLabel}`) : Promise.resolve(''),
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
export const GET: APIRoute = async ({ url }) => {
  const forceRefresh = url.searchParams.has('refresh');

  if (!forceRefresh) {
    const stored = await readBlob();
    if (stored) {
      return new Response(JSON.stringify({ ...stored, source: 'blob' }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
      });
    }
  }

  const fresh = await scrapeAllCodes();
  await writeBlob(fresh);
  return new Response(JSON.stringify(fresh), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
  });
};
