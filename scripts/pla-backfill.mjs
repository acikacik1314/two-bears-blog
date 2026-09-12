#!/usr/bin/env node
/**
 * pla-backfill.mjs — 一次性回補 MND 共機擾台歷史資料
 *
 * 兩個資料來源：
 *   1. HTML 正文（text）— 2020-09 ~ 2024-01-11, 2025-02-04 ~ 至今
 *   2. JPG OCR（ocr）— 2024-01-12 ~ 2025-02-03（HTML 無正文的缺口）
 *
 * 品管：
 *   - 一致性檢查：crossed ≤ adiz ≤ total（違反 → null + anomaly）
 *   - 範圍檢查（僅 OCR）：total > 60 或 naval > 30 → null + anomaly（人工看圖確認）
 *   - 括號多數字 → null + anomaly
 *   - OCR 記錄保留 ocr_raw 供事後查驗
 *
 * 執行：node scripts/pla-backfill.mjs [--resume] [--limit N] [--skip-ocr]
 * 需要：tesseract-ocr + chi_tra 語言包
 */

import * as cheerio from 'cheerio';
import { writeFileSync, existsSync, readFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const BASE = 'https://www.mnd.gov.tw';
const DELAY_MS = 1200;
const FETCH_TIMEOUT_MS = 30000;
const RETRY_MAX = 3;
const RETRY_BACKOFF_MS = 5000;
const TOTAL_PAGES = 220;

const DATA_PATH = new URL('../src/data/pla-incursions.json', import.meta.url).pathname;
const ANOMALIES_PATH = new URL('./pla-anomalies.json', import.meta.url).pathname;
const REPORT_PATH = new URL('./pla-backfill-report.txt', import.meta.url).pathname;

const RESUME = process.argv.includes('--resume');
const SKIP_OCR = process.argv.includes('--skip-ocr');
const LIMIT = (() => {
  const i = process.argv.indexOf('--limit');
  return i >= 0 ? parseInt(process.argv[i + 1]) : Infinity;
})();

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── 網路 ─────────────────────────────────────────────────────────
async function fetchWithRetry(url, opts = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= RETRY_MAX; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; twobears-backfill/1.0)' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        ...opts,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      lastErr = e;
      if (attempt < RETRY_MAX) await sleep(RETRY_BACKOFF_MS * attempt);
    }
  }
  throw lastErr;
}

async function fetchHtml(url) { return (await fetchWithRetry(url)).text(); }
async function fetchBinary(url) { return Buffer.from(await (await fetchWithRetry(url)).arrayBuffer()); }

// ── 列表頁 ──────────────────────────────────────────────────────
async function fetchListPage(page) {
  const url = page === 1 ? `${BASE}/news/plaactlist` : `${BASE}/news/plaactlist/${page}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const results = [];
  $('a.news_list').each((_, el) => {
    const href = $(el).attr('href') || '';
    const m = href.match(/news\/plaact\/(\d+)/);
    if (!m) return;
    results.push({
      id: m[1],
      rocDate: $(el).find('.date').text().trim() || null,
      url: href.startsWith('http') ? href : `${BASE}/${href.replace(/^\//, '')}`,
    });
  });
  return results;
}

function rocToIso(rocDate) {
  if (!rocDate) return null;
  const [y, m, d] = rocDate.split('.').map(Number);
  if (!y || !m || !d) return null;
  return `${y + 1911}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// ── 文章內文擷取 ─────────────────────────────────────────────────
function extractBodyText(html) {
  const $ = cheerio.load(html);
  $('script,style').remove();
  const main = $('.content-area, .news-content, #content, main, article').first();
  const el = main.length ? main : $('body');
  return el.text().replace(/\s+/g, ' ').trim();
}

function findPrimaryFileId(html) {
  const $ = cheerio.load(html);
  let fid = null;
  $('.downloaditems').each((_, el) => {
    if (fid) return;
    const txt = $(el).find('.download-text').text();
    const href = $(el).find('a[href*="File/"]').attr('href') || '';
    const m = href.match(/File\/(\d+)/);
    // 找檔名帶「活動」但不是「示意圖」的第一個
    if (m && txt.includes('活動') && !txt.includes('示意圖')) fid = m[1];
  });
  return fid;
}

function detectFormatVersion(text) {
  if (/機型\s*Aircraft/.test(text)) return 'legacy_2021';
  if (/防空識別區內飛航|逾越海峽中線及進入我西南空域活動情況/.test(text)) return 'legacy_2020';
  if (/偵獲共機|未偵獲共機/.test(text)) {
    if (/\(其中|艘次/.test(text)) return 'aggregate_2022';
    return 'modern_2025';
  }
  return 'no_text';
}

// ── 核心 parser（錨點式，量詞寬鬆）────────────────────────────
function parseCore(rawText) {
  const clean = rawText.replace(/\s+/g, '');
  const r = {
    aircraft_total: null,
    crossed_median: null,
    adiz_entry: null,
    naval: null,
    official_ships: null,
    parse_note: '',
  };

  if (/未偵獲共機/.test(clean)) {
    r.aircraft_total = 0; r.crossed_median = 0; r.adiz_entry = 0;
    r.parse_note = 'zero-aircraft';
  } else {
    // 偵獲(共?)機 錨點 + 前 0-4 個非數字非開括號字元 + 數字
    const tm = clean.match(/偵獲共?[^0-9（(]{0,4}(\d+)/);
    if (tm) r.aircraft_total = parseInt(tm[1]);

    // 抓 偵獲... 後的第一個括號內容
    const parenM = clean.match(/偵獲[^（(]*[（(]([^）)]+)[）)]/);
    if (parenM) {
      const inner = parenM[1];
      const nums = [...inner.matchAll(/(\d+)/g)].map(m => parseInt(m[1]));
      const hasCrossing = /逾越/.test(inner);
      if (nums.length === 0) {
        r.parse_note = 'paren-no-number';
      } else if (nums.length === 1) {
        if (hasCrossing) { r.crossed_median = nums[0]; r.adiz_entry = nums[0]; }
        else { r.crossed_median = 0; r.adiz_entry = nums[0]; }
      } else {
        r.parse_note = 'multi-paren-numbers';
      }
    }
  }

  // 共艦（不強求「艘」）
  const nm = clean.match(/共艦[^0-9]{0,3}(\d+)/);
  if (nm) r.naval = parseInt(nm[1]);

  // 公務船
  const om = clean.match(/公務船[^0-9]{0,3}(\d+)/);
  if (om) r.official_ships = parseInt(om[1]);

  return r;
}

function checkConsistency(p) {
  const { aircraft_total: T, crossed_median: C, adiz_entry: A } = p;
  const v = [];
  if (T !== null && A !== null && A > T) v.push(`adiz(${A})>total(${T})`);
  if (A !== null && C !== null && C > A) v.push(`crossed(${C})>adiz(${A})`);
  if (T !== null && C !== null && C > T) v.push(`crossed(${C})>total(${T})`);
  return v;
}

// 範圍檢查：僅套用於 OCR（文字時代 MND 明白發布的高數字要信任）
function checkRange(p, isOCR) {
  if (!isOCR) return [];
  const v = [];
  if (p.aircraft_total !== null && p.aircraft_total > 60) v.push(`total(${p.aircraft_total})>60`);
  if (p.naval !== null && p.naval > 30) v.push(`naval(${p.naval})>30`);
  return v;
}

// ── OCR ─────────────────────────────────────────────────────────
function runOCR(imagePath) {
  const out = execFileSync('tesseract', [imagePath, 'stdout', '-l', 'chi_tra'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 10 * 1024 * 1024,
  });
  return out;
}

async function parseViaOCR(article, html) {
  const fid = findPrimaryFileId(html);
  if (!fid) {
    return {
      _base: {
        aircraft_total: null, crossed_median: null, adiz_entry: null,
        naval: null, official_ships: null, parse_note: 'ocr-no-file',
      },
      ocr_raw: null, file_id: null,
    };
  }
  const tmp = join(tmpdir(), `mnd-ocr-${article.id}.jpg`);
  try {
    const buf = await fetchBinary(`${BASE}/File/${fid}`);
    writeFileSync(tmp, buf);
    const ocrText = runOCR(tmp);
    const parsed = parseCore(ocrText);
    return { _base: parsed, ocr_raw: ocrText, file_id: fid };
  } finally {
    try { unlinkSync(tmp); } catch {}
  }
}

// ── 每篇文章的處理 ──────────────────────────────────────────────
async function processArticle(article, anomalies) {
  const rec = {
    article_id: article.id,
    date: article.isoDate,
    roc_date: article.rocDate,
    url: article.url,
    aircraft_total: null,
    crossed_median: null,
    adiz_entry: null,
    naval: null,
    official_ships: null,
    format_version: null,
    source: null,           // 'text' | 'ocr'
    ocr_raw: null,          // 只有 OCR 記錄才有
    parse_note: '',
  };

  try {
    const html = await fetchHtml(article.url);
    const bodyText = extractBodyText(html);
    const fmtVer = detectFormatVersion(bodyText);
    rec.format_version = fmtVer;

    if (fmtVer === 'legacy_2020' || fmtVer === 'legacy_2021') {
      rec.source = 'text';
      rec.parse_note = 'legacy-format';
      return rec;
    }

    if (fmtVer === 'no_text' && !SKIP_OCR) {
      // OCR 走這條
      const ocrResult = await parseViaOCR(article, html);
      Object.assign(rec, ocrResult._base);
      rec.ocr_raw = ocrResult.ocr_raw;
      rec.source = 'ocr';
      rec.format_version = 'ocr_gap_2024';

      // OCR 專屬：範圍檢查
      const rangeV = checkRange(rec, true);
      if (rangeV.length) {
        rec.aircraft_total = rec.aircraft_total; // 保留原值，讓人工看
        // user 指示：不要直接採信 → 值仍記錄，但 anomaly 標記，人工要看圖
        anomalies.push({
          article_id: article.id, date: article.isoDate, url: article.url,
          reason: 'range-check-fail',
          detail: rangeV.join('; '),
          parsed: { total: rec.aircraft_total, crossed: rec.crossed_median, adiz: rec.adiz_entry, naval: rec.naval, official: rec.official_ships },
          ocr_raw: rec.ocr_raw?.slice(0, 500),
        });
        rec.parse_note = (rec.parse_note ? rec.parse_note + ';' : '') + 'range-flagged';
      }
    } else {
      // 現代/彙整格式：純文字解析
      const parsed = parseCore(bodyText);
      Object.assign(rec, parsed);
      rec.source = 'text';
    }

    // 一致性檢查（不分 text / ocr 都要跑）
    const consV = checkConsistency(rec);
    if (consV.length) {
      anomalies.push({
        article_id: article.id, date: article.isoDate, url: article.url,
        reason: 'consistency-fail',
        detail: consV.join('; '),
        parsed: { total: rec.aircraft_total, crossed: rec.crossed_median, adiz: rec.adiz_entry, naval: rec.naval, official: rec.official_ships },
        ocr_raw: rec.ocr_raw?.slice(0, 500),
        snippet: bodyText.slice(0, 500),
      });
      // 違反一致性：把 crossed / adiz 改 null，total / naval / official 保留
      rec.crossed_median = null;
      rec.adiz_entry = null;
      rec.parse_note = (rec.parse_note ? rec.parse_note + ';' : '') + 'consistency-fail';
    }

    // 括號多數字警示（由 parse_note 傳出來）
    if (rec.parse_note?.includes('multi-paren-numbers')) {
      anomalies.push({
        article_id: article.id, date: article.isoDate, url: article.url,
        reason: 'multi-paren-numbers',
        detail: '括號內出現多個數字，人工判斷',
        ocr_raw: rec.ocr_raw?.slice(0, 500),
        snippet: bodyText.slice(0, 500),
      });
    }
  } catch (e) {
    rec.parse_note = `fetch-fail:${e.message}`;
    anomalies.push({
      article_id: article.id, date: article.isoDate, url: article.url,
      reason: 'fetch-fail',
      detail: e.message,
    });
  }

  return rec;
}

// ── 主流程 ──────────────────────────────────────────────────────
async function main() {
  console.log('▶ PLA backfill start');
  console.log(`  RESUME=${RESUME} SKIP_OCR=${SKIP_OCR} LIMIT=${LIMIT}`);

  // Resume：讀入既有資料
  const existing = new Map();
  if (RESUME && existsSync(DATA_PATH)) {
    const prev = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
    for (const row of prev.records || []) existing.set(row.article_id, row);
    console.log(`  [RESUME] 讀入 ${existing.size} 筆`);
  }

  // Stage 1: 收集所有列表
  console.log('\n── Stage 1: 收集列表頁 ──');
  const articles = [];
  const seen = new Set();
  const failedPages = [];
  for (let page = 1; page <= TOTAL_PAGES; page++) {
    try {
      const items = await fetchListPage(page);
      if (!items.length) { console.log(`\n  第 ${page} 頁空，停止分頁`); break; }
      let added = 0;
      for (const it of items) {
        if (seen.has(it.id)) continue;
        seen.add(it.id);
        articles.push({ ...it, isoDate: rocToIso(it.rocDate) });
        added++;
      }
      if (page % 10 === 0) console.log(`  第 ${page} 頁：累計 ${articles.length}`);
    } catch (e) {
      failedPages.push({ page, error: e.message });
      console.log(`  ❌ 第 ${page} 頁失敗: ${e.message}`);
    }
    await sleep(DELAY_MS);
  }
  console.log(`  收集完成：${articles.length} 篇（失敗頁 ${failedPages.length}）`);

  // Stage 2: 逐篇處理
  console.log('\n── Stage 2: 抓取 + 解析 ──');
  const records = [];
  const anomalies = [];
  let cnt = 0;
  const total = Math.min(articles.length, LIMIT);
  for (const article of articles.slice(0, LIMIT)) {
    cnt++;
    if (existing.has(article.id)) {
      records.push(existing.get(article.id));
      if (cnt % 100 === 0) console.log(`  ${cnt}/${total} (cached)`);
      continue;
    }

    const rec = await processArticle(article, anomalies);
    records.push(rec);

    if (cnt % 50 === 0) {
      console.log(`  ${cnt}/${total} (${(cnt/total*100).toFixed(1)}%) — 最新: ${rec.date} total=${rec.aircraft_total} src=${rec.source}`);
    }
    if (cnt % 200 === 0) saveData(records, anomalies);
    await sleep(DELAY_MS);
  }

  saveData(records, anomalies);
  writeReport(records, anomalies, articles, failedPages);
  console.log(`\n▶ Done: ${records.length} 筆 / ${anomalies.length} anomalies`);
}

function saveData(records, anomalies) {
  records.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  mkdirSync(dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, JSON.stringify({
    updated: new Date().toISOString(),
    source: 'https://www.mnd.gov.tw/news/plaactlist',
    total_records: records.length,
    records,
  }, null, 2));
  writeFileSync(ANOMALIES_PATH, JSON.stringify({
    updated: new Date().toISOString(),
    count: anomalies.length,
    anomalies,
  }, null, 2));
}

function findMissingDates(dates) {
  if (!dates.length) return [];
  const start = new Date(dates[0]);
  const end = new Date(dates[dates.length - 1]);
  const set = new Set(dates);
  const missing = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (!set.has(iso)) missing.push(iso);
  }
  return missing;
}

function writeReport(records, anomalies, articles, failedPages) {
  const lines = [];
  lines.push('='.repeat(80));
  lines.push('PLA 共機擾台歷史資料回補報告');
  lines.push('='.repeat(80));
  lines.push('');
  lines.push(`執行時間：${new Date().toISOString()}`);
  lines.push(`列表頁失敗數：${failedPages.length} / ${TOTAL_PAGES}`);
  lines.push('');

  const withDate = records.filter(r => r.date).map(r => r.date).sort();
  lines.push(`總筆數：${records.length}`);
  lines.push(`涵蓋日期：${withDate[0]} ~ ${withDate[withDate.length - 1]}`);

  const missing = findMissingDates(withDate);
  lines.push(`\n缺漏日期（連續區間應每日一篇）：${missing.length} 天`);
  if (missing.length > 0 && missing.length <= 30) {
    lines.push('  ' + missing.join(', '));
  } else if (missing.length > 30) {
    lines.push('  前 15：' + missing.slice(0, 15).join(', '));
    lines.push('  後 15：' + missing.slice(-15).join(', '));
  }
  lines.push('');

  // 來源分布
  const text = records.filter(r => r.source === 'text');
  const ocr = records.filter(r => r.source === 'ocr');
  lines.push(`── 資料來源分布 ──`);
  lines.push(`  text (HTML 正文)  ：${text.length}`);
  lines.push(`  ocr  (JPG OCR)    ：${ocr.length}`);
  lines.push('');

  // aircraft_total null 原因
  const nulls = records.filter(r => r.aircraft_total === null);
  const byFmt = {};
  for (const r of nulls) byFmt[r.format_version || 'unknown'] = (byFmt[r.format_version || 'unknown'] || 0) + 1;
  const byNote = {};
  for (const r of nulls) {
    const key = (r.parse_note || 'empty').split(';')[0];
    byNote[key] = (byNote[key] || 0) + 1;
  }
  lines.push(`── aircraft_total = null (${nulls.length} 筆) ──`);
  lines.push('  按 format_version:');
  for (const [k, v] of Object.entries(byFmt)) lines.push(`    ${k}: ${v}`);
  lines.push('  按 parse_note:');
  for (const [k, v] of Object.entries(byNote)) lines.push(`    ${k}: ${v}`);
  lines.push('');

  // 有 total 但 crossed/adiz null
  const partialNulls = records.filter(r => r.aircraft_total !== null && (r.crossed_median === null || r.adiz_entry === null) && r.aircraft_total !== 0);
  lines.push(`── total ≠ 0 但 crossed/adiz = null: ${partialNulls.length} 筆 ──`);
  const byNote2 = {};
  for (const r of partialNulls) {
    const key = (r.parse_note || 'no-detail').split(';')[0];
    byNote2[key] = (byNote2[key] || 0) + 1;
  }
  for (const [k, v] of Object.entries(byNote2)) lines.push(`    ${k}: ${v}`);
  lines.push('');

  // Top 10
  const top = [...records].filter(r => r.aircraft_total !== null).sort((a, b) => b.aircraft_total - a.aircraft_total).slice(0, 10);
  lines.push(`── 單日總架次 Top 10 ──`);
  for (const r of top) {
    lines.push(`  ${r.date} | ${String(r.aircraft_total).padStart(3)} 架次 | 逾越=${r.crossed_median ?? '-'} ADIZ=${r.adiz_entry ?? '-'} 艦=${r.naval ?? '-'} | src=${r.source} | ${r.url}`);
  }
  lines.push('');

  // Anomalies 摘要
  lines.push(`── Anomalies ──`);
  const byReason = {};
  for (const a of anomalies) byReason[a.reason] = (byReason[a.reason] || 0) + 1;
  for (const [k, v] of Object.entries(byReason)) lines.push(`  ${k}: ${v}`);
  lines.push(`  合計 ${anomalies.length}（詳見 pla-anomalies.json）`);
  lines.push('');

  // 20 筆 OCR 隨機抽樣
  if (ocr.length > 0) {
    lines.push('── OCR 隨機抽樣 20 筆（人工驗證用）──');
    const shuffled = [...ocr].sort(() => Math.random() - 0.5).slice(0, 20);
    for (const r of shuffled) {
      const rawSnip = (r.ocr_raw || '').replace(/\s+/g, ' ').slice(0, 220);
      lines.push('');
      lines.push(`  ${r.date} (${r.article_id})`);
      lines.push(`    圖片: ${r.url}  ← 點進去看下載區`);
      lines.push(`    解析: total=${r.aircraft_total} crossed=${r.crossed_median} adiz=${r.adiz_entry} naval=${r.naval} official=${r.official_ships}`);
      lines.push(`    OCR原文片段: ${rawSnip}`);
    }
  }

  const report = lines.join('\n');
  writeFileSync(REPORT_PATH, report);
  console.log('\n' + report);
}

main().catch(e => { console.error(e); process.exit(1); });
