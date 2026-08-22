export const prerender = false;

import type { APIRoute } from 'astro';
import codesData from '../../data/food-codes.json';

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
  source: string;
}

// ── Scraper（供 GitHub Actions 更新腳本 scripts/refresh-food-codes.mjs 使用）──
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

const BRAND_BLOCKLIST = new Set([
  'IHERB', 'FOODPANDA', 'EXPEDIA', 'KLOOK', 'KKDAY', 'ASIAYO',
  'AGODA', 'BOOKING', 'AIRBNB', 'SHOPEE', 'MOMO', 'RAKUTEN',
  'PCHOME', 'CARREFOUR', 'UBEREATS', 'GRABFOOD',
]);

function findAutoCode(text: string, manualCodes: Set<string>): CodeEntry[] {
  const found: CodeEntry[] = [];
  const seen = new Set<string>();

  for (const m of text.matchAll(/eats-[a-z0-9]{4,10}/gi)) {
    const c = m[0].toLowerCase();
    if (!seen.has(c) && !manualCodes.has(c)) {
      seen.add(c); found.push({ platform: 'ubereats', code: c, desc: '網路搜尋代碼，請確認有效性', general: true, source: 'auto' });
    }
  }
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

  const repoManual = codesData.codes as CodeEntry[];
  const manualKeys = new Set(repoManual.map(m => m.code.toLowerCase()));
  const autoCodes = findAutoCode(callingText + '\n' + uberText + '\n' + pandaText, manualKeys);
  const deduped = autoCodes.filter(a => !manualKeys.has(a.code.toLowerCase()));

  return {
    codes: [...repoManual, ...deduped],
    fetched: new Date().toISOString(),
    source: 'live',
  };
}

// ── Route ──────────────────────────────────────────────────────────────────────
export const GET: APIRoute = async () => {
  const today = new Date().toISOString().slice(0, 10);
  const allCodes = codesData.codes as CodeEntry[];
  const codes = allCodes.filter(c => !c.expires || c.expires >= today);

  return new Response(JSON.stringify({
    codes,
    fetched: codesData.fetched,
    source: 'repo',
  } satisfies FoodCodesResult), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
