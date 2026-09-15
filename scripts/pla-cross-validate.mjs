#!/usr/bin/env node
/**
 * pla-cross-validate.mjs — 一次性重跑：中英交叉驗證
 *
 * 對 pla-incursions.json 內每筆記錄執行：
 *   1. OCR 記錄：直接用 ocr_raw
 *   2. Text 記錄：重新抓 HTML 取 bodyText
 *   3. 用 pla-parser.mjs 的 crossValidate 產生新解析
 *   4. 一致性檢查、範圍檢查
 *   5. 寫入更新後的 JSON + anomalies
 *
 * 執行：node scripts/pla-cross-validate.mjs
 */

import * as cheerio from 'cheerio';
import { readFileSync, writeFileSync } from 'node:fs';
import { crossValidate, checkConsistency, checkRange, stripSpaces } from './pla-parser.mjs';

const DATA_PATH = new URL('../src/data/pla-incursions.json', import.meta.url).pathname;
const ANOMALIES_PATH = new URL('./pla-anomalies.json', import.meta.url).pathname;
const REPORT_PATH = new URL('./pla-cross-validate-report.txt', import.meta.url).pathname;

const DELAY_MS = 1200;
const FETCH_TIMEOUT_MS = 30000;
const RETRY_MAX = 3;
const RETRY_BACKOFF_MS = 5000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchHtml(url) {
  let lastErr;
  for (let attempt = 1; attempt <= RETRY_MAX; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; twobears-crossvalidate/1.0)' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      if (attempt < RETRY_MAX) await sleep(RETRY_BACKOFF_MS * attempt);
    }
  }
  throw lastErr;
}

function extractBodyText(html) {
  const $ = cheerio.load(html);
  $('script,style').remove();
  const main = $('.content-area, .news-content, #content, main, article').first();
  const el = main.length ? main : $('body');
  return el.text().replace(/\s+/g, ' ').trim();
}

async function main() {
  console.log('▶ Cross-validation start');
  const data = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
  const oldAnomalies = JSON.parse(readFileSync(ANOMALIES_PATH, 'utf8')).anomalies || [];
  const newAnomalies = [];

  const stats = {
    total: data.records.length,
    processed: 0,
    text_refetched: 0,
    text_refetch_failed: 0,
    ocr_only: 0,
    changed: 0,
    null_to_zero_crossed: 0,  // ocr_degraded → crossed=0
    ocr_degraded_remaining: 0,
    cn_en_mismatches: 0,
    multi_paren_recovered: 0,
    changes_by_reason: {},
  };

  for (const r of data.records) {
    stats.processed++;

    let rawText = null;
    if (r.source === 'ocr' && r.ocr_raw) {
      rawText = r.ocr_raw;
      stats.ocr_only++;
    } else if (r.source === 'text' || !r.source) {
      // Text record → refetch
      try {
        const html = await fetchHtml(r.url);
        rawText = extractBodyText(html);
        stats.text_refetched++;
        await sleep(DELAY_MS);
      } catch (e) {
        stats.text_refetch_failed++;
        newAnomalies.push({
          article_id: r.article_id, date: r.date, url: r.url,
          reason: 'refetch-fail', detail: e.message,
        });
        continue;
      }
    }

    if (!rawText) continue;

    // 對 legacy 格式跳過（不做交叉驗證）
    if (r.format_version === 'legacy_2020' || r.format_version === 'legacy_2021') {
      continue;
    }

    const oldValues = {
      total: r.aircraft_total, crossed: r.crossed_median,
      adiz: r.adiz_entry, naval: r.naval, official: r.official_ships,
      degraded: !!r.ocr_degraded, note: r.note || null,
    };

    const { parsed, mismatches } = crossValidate(rawText, r.source);

    // 一致性檢查
    const consV = checkConsistency(parsed);
    if (consV.length) {
      parsed.crossed_median = null;
      parsed.adiz_entry = null;
      parsed.parse_note = (parsed.parse_note ? parsed.parse_note + ';' : '') + 'consistency-fail';
      newAnomalies.push({
        article_id: r.article_id, date: r.date, url: r.url,
        reason: 'consistency-fail', detail: consV.join('; '),
      });
    }

    // 範圍檢查 (OCR only)
    const rangeV = checkRange(parsed, r.source === 'ocr');
    if (rangeV.length) {
      parsed.parse_note = (parsed.parse_note ? parsed.parse_note + ';' : '') + 'range-flagged';
      newAnomalies.push({
        article_id: r.article_id, date: r.date, url: r.url,
        reason: 'range-check-fail', detail: rangeV.join('; '),
        parsed: { total: parsed.aircraft_total, crossed: parsed.crossed_median, naval: parsed.naval },
      });
    }

    // 收集 mismatch anomalies
    for (const m of mismatches) {
      if (m.cn !== undefined && m.en !== undefined) {
        newAnomalies.push({
          article_id: r.article_id, date: r.date, url: r.url,
          reason: 'cn-en-mismatch',
          detail: `field=${m.field} cn=${m.cn} en=${m.en}`,
        });
        stats.cn_en_mismatches++;
      } else {
        newAnomalies.push({
          article_id: r.article_id, date: r.date, url: r.url,
          reason: m.reason || 'multi-paren-numbers',
          detail: `field=${m.field}`,
        });
      }
    }

    // 統計變化
    const changed = oldValues.total !== parsed.aircraft_total ||
                    oldValues.crossed !== parsed.crossed_median ||
                    oldValues.adiz !== parsed.adiz_entry ||
                    oldValues.naval !== parsed.naval ||
                    oldValues.official !== parsed.official_ships ||
                    oldValues.degraded !== parsed.ocr_degraded;
    if (changed) {
      stats.changed++;
      // 特別統計：從 null → crossed=0 的（ocr_degraded 修正）
      if (oldValues.crossed === null && parsed.crossed_median === 0 && oldValues.degraded) {
        stats.null_to_zero_crossed++;
      }
      if ((parsed.source_detail || '').includes('english_recovered')) {
        stats.multi_paren_recovered++;
      }
    }
    if (parsed.ocr_degraded) stats.ocr_degraded_remaining++;

    // 更新記錄
    r.aircraft_total = parsed.aircraft_total;
    r.crossed_median = parsed.crossed_median;
    r.adiz_entry = parsed.adiz_entry;
    r.naval = parsed.naval;
    r.official_ships = parsed.official_ships;
    r.parse_note = parsed.parse_note;
    r.ocr_degraded = parsed.ocr_degraded;
    r.source_detail = parsed.source_detail;
    r.note = parsed.note;

    if (stats.processed % 50 === 0) {
      console.log(`  ${stats.processed}/${stats.total} (refetched=${stats.text_refetched} failed=${stats.text_refetch_failed} changed=${stats.changed})`);
    }
  }

  // Save
  data.updated = new Date().toISOString();
  writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
  writeFileSync(ANOMALIES_PATH, JSON.stringify({
    updated: new Date().toISOString(),
    count: newAnomalies.length,
    anomalies: newAnomalies.sort((a, b) => (a.date || '').localeCompare(b.date || '')),
  }, null, 2));

  // Report
  const lines = [];
  lines.push('='.repeat(70));
  lines.push('PLA 中英交叉驗證重跑報告');
  lines.push('='.repeat(70));
  lines.push('');
  lines.push(`總筆數: ${stats.total}`);
  lines.push(`OCR (用既有 ocr_raw): ${stats.ocr_only}`);
  lines.push(`Text (重抓): ${stats.text_refetched} (失敗 ${stats.text_refetch_failed})`);
  lines.push('');
  lines.push(`── 變化統計 ──`);
  lines.push(`變動筆數: ${stats.changed}`);
  lines.push(`  其中「原本 ocr_degraded → 修正為 crossed=0」: ${stats.null_to_zero_crossed}`);
  lines.push(`  其中「multi-paren 用英文救回」: ${stats.multi_paren_recovered}`);
  lines.push(`剩餘 ocr_degraded 筆數: ${stats.ocr_degraded_remaining}`);
  lines.push('');
  lines.push(`── Anomalies ──`);
  lines.push(`中英不一致 (cn-en-mismatch): ${stats.cn_en_mismatches}`);
  const byReason = {};
  for (const a of newAnomalies) byReason[a.reason] = (byReason[a.reason] || 0) + 1;
  for (const [k, v] of Object.entries(byReason)) lines.push(`  ${k}: ${v}`);
  lines.push(`總 anomalies: ${newAnomalies.length}`);
  lines.push('');

  // [8][9][16] 三筆結果
  lines.push('── 使用者指定的 3 筆檢查 ──');
  for (const date of ['2024-02-11', '2024-02-19', '2024-03-24']) {
    const r = data.records.find(x => x.date === date);
    if (r) {
      lines.push(`  ${date}: total=${r.aircraft_total} crossed=${r.crossed_median} adiz=${r.adiz_entry} naval=${r.naval} degraded=${!!r.ocr_degraded}`);
    }
  }
  lines.push('');

  // 前 10 CN-EN mismatches
  const mismatches = newAnomalies.filter(a => a.reason === 'cn-en-mismatch').slice(0, 10);
  if (mismatches.length) {
    lines.push('── CN-EN mismatches (前 10 筆) ──');
    for (const m of mismatches) lines.push(`  ${m.date} | ${m.detail} | ${m.url}`);
    lines.push('');
  }

  const report = lines.join('\n');
  writeFileSync(REPORT_PATH, report);
  console.log('\n' + report);
}

main().catch(e => { console.error(e); process.exit(1); });
