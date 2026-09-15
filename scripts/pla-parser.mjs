// PLA MND 資料解析共用模組
// 三個核心規則：
//   1. 中英交叉驗證（每欄位都比對兩邊）
//   2. 「逾字」分辨：cn無逾 + en有crossed → OCR壞；cn無逾 + en只有entered → 原文本來就沒跨
//   3. 中英數字不一致 → null + note + anomaly

export function stripSpaces(t) { return (t || '').replace(/\s+/g, ''); }

// ── 中文抽取 ─────────────────────────────────────────────────
export function extractChinese(clean) {
  const c = {
    total: null,
    zero: /未偵獲共機/.test(clean),
    paren_has_yu: false,
    paren_num: null,
    paren_multi: false,
    naval: null,
    official: null,
  };
  if (c.zero) {
    c.total = 0;
    return c;
  }
  const tm = clean.match(/偵獲共?機[^0-9（(]{0,4}(\d+)/);
  if (tm) c.total = parseInt(tm[1]);

  const pm = clean.match(/偵獲[^（(]*[（(]([^）)]*(?:逾越|進入)[^）)]*)[）)]/);
  if (pm) {
    const inner = pm[1];
    c.paren_has_yu = /逾/.test(inner);
    const nums = [...inner.matchAll(/(\d+)/g)].map(m => parseInt(m[1]));
    if (nums.length === 1) c.paren_num = nums[0];
    else if (nums.length > 1) c.paren_multi = true;
  }
  const nm = clean.match(/共艦[^0-9]{0,3}(\d+)/);
  if (nm) c.naval = parseInt(nm[1]);
  const om = clean.match(/公務船[^0-9]{0,3}(\d+)/);
  if (om) c.official = parseInt(om[1]);
  return c;
}

// ── 英文抽取（用大小寫敏感 + 容錯字元）───────────────────────
export function extractEnglish(clean) {
  // OCR 常見錯字: l→I, 0→O, i→l 等，用寬鬆比對
  const e = { total: null, crossed: null, entered: null, naval: null, official: null };

  // "N PLA aircraft"
  const tm = clean.match(/(\d+)PLAa[il1]rcraft/);
  if (tm) e.total = parseInt(tm[1]);

  // "N of the aircraft crossed" — 主要跨中線指標
  const cm = clean.match(/(\d+)ofthea[il1]rcraftcrossed/i);
  if (cm) e.crossed = parseInt(cm[1]);

  // "N of the aircraft entered" — 只有進入沒跨中線的情況
  const em = clean.match(/(\d+)ofthea[il1]rcraftentered/i);
  if (em) e.entered = parseInt(em[1]);

  // "N PLAN vessels"
  const nm = clean.match(/(\d+)PLANvessels/);
  if (nm) e.naval = parseInt(nm[1]);

  // "N official ship(s)"
  const om = clean.match(/(\d+)off?[il1]c[il1]alship/i);
  if (om) e.official = parseInt(om[1]);

  return e;
}

// ── 交叉驗證主邏輯 ──────────────────────────────────────────
// 回傳 { parsed, anomalies_this_record }
export function crossValidate(rawText, source) {
  const clean = stripSpaces(rawText);
  const cn = extractChinese(clean);
  const en = extractEnglish(clean);

  const r = {
    aircraft_total: null, crossed_median: null, adiz_entry: null,
    naval: null, official_ships: null,
    parse_note: '', ocr_degraded: false,
    source_detail: null, note: null,
  };
  const anomalies = [];

  // ── total ────────────────────────────────
  if (cn.zero) {
    r.aircraft_total = 0; r.crossed_median = 0; r.adiz_entry = 0;
    r.parse_note = 'zero-aircraft';
  } else {
    const [T, tag] = pickField(cn.total, en.total, 'total');
    r.aircraft_total = T;
    if (tag === 'mismatch') {
      anomalies.push({ field: 'total', cn: cn.total, en: en.total });
      addNote(r, `total: 中文=${cn.total} 英文=${en.total} 待人工確認`);
    } else if (tag === 'chinese_only' || tag === 'english_only') {
      r.source_detail = (r.source_detail ? r.source_detail + ';' : '') + `total:${tag}`;
    }
  }

  // ── crossed / adiz — 邏輯較複雜 ────────────────────
  if (cn.zero) {
    // 已在 total 段處理
  } else if (cn.paren_multi) {
    // 中文括號多數字，改用英文 crossed
    if (en.crossed !== null) {
      r.crossed_median = en.crossed; r.adiz_entry = en.crossed;
      r.source_detail = (r.source_detail ? r.source_detail + ';' : '') + 'crossed:english_recovered';
    } else if (en.entered !== null) {
      r.crossed_median = 0; r.adiz_entry = en.entered;
      r.source_detail = (r.source_detail ? r.source_detail + ';' : '') + 'crossed:english_recovered';
    } else {
      r.parse_note = (r.parse_note ? r.parse_note + ';' : '') + 'multi-paren-numbers';
      anomalies.push({ field: 'crossed', reason: 'multi-paren-no-english-fallback' });
    }
  } else if (cn.paren_has_yu) {
    // 中文明確有「逾」，是跨中線案例
    if (en.crossed !== null) {
      // 兩邊都有 crossed，比對
      if (cn.paren_num === en.crossed) {
        r.crossed_median = cn.paren_num; r.adiz_entry = cn.paren_num;
      } else {
        r.crossed_median = null; r.adiz_entry = null;
        addNote(r, `crossed: 中文=${cn.paren_num} 英文=${en.crossed} 待人工確認`);
        anomalies.push({ field: 'crossed', cn: cn.paren_num, en: en.crossed });
      }
    } else {
      // 只有中文
      r.crossed_median = cn.paren_num; r.adiz_entry = cn.paren_num;
      r.source_detail = (r.source_detail ? r.source_detail + ';' : '') + 'crossed:chinese_only';
    }
  } else if (cn.paren_num !== null) {
    // 中文括號有數字但沒「逾」— 兩種可能，用英文分辨
    if (en.crossed !== null) {
      // 英文明白說 crossed → 中文的「逾」被 OCR 讀壞
      r.crossed_median = null; r.adiz_entry = null;
      r.ocr_degraded = true;
      r.parse_note = 'ocr-degraded-yu-missing';
    } else if (en.entered !== null) {
      // 英文說 entered、沒 crossed → 原文本來就沒跨中線
      if (cn.paren_num === en.entered) {
        r.crossed_median = 0; r.adiz_entry = cn.paren_num;
      } else {
        // ADIZ 數字兩邊不一致
        r.crossed_median = null; r.adiz_entry = null;
        addNote(r, `adiz: 中文=${cn.paren_num} 英文=${en.entered} 待人工確認`);
        anomalies.push({ field: 'adiz', cn: cn.paren_num, en: en.entered });
      }
    } else {
      // 英文段落沒讀到，只能相信中文；但沒「逾」→ 保守起見標 degraded
      r.crossed_median = null; r.adiz_entry = null;
      r.ocr_degraded = true;
      r.parse_note = 'ocr-degraded-no-english-verify';
    }
  } else {
    // 中文沒括號 → 看英文
    if (en.crossed !== null) {
      r.crossed_median = en.crossed; r.adiz_entry = en.crossed;
      r.source_detail = (r.source_detail ? r.source_detail + ';' : '') + 'crossed:english_only';
    } else if (en.entered !== null) {
      r.crossed_median = 0; r.adiz_entry = en.entered;
      r.source_detail = (r.source_detail ? r.source_detail + ';' : '') + 'crossed:english_only';
    }
    // 兩邊都無 → 留 null (正常短報告)
  }

  // ── naval ─────────────────────────────────
  const [N, nTag] = pickField(cn.naval, en.naval, 'naval');
  r.naval = N;
  if (nTag === 'mismatch') {
    addNote(r, `naval: 中文=${cn.naval} 艘、英文=${en.naval} 艘 兩版本不一致 待人工確認`);
    anomalies.push({ field: 'naval', cn: cn.naval, en: en.naval });
  } else if (nTag === 'chinese_only' || nTag === 'english_only') {
    r.source_detail = (r.source_detail ? r.source_detail + ';' : '') + `naval:${nTag}`;
  }

  // ── official ships ────────────────────────
  const [O, oTag] = pickField(cn.official, en.official, 'official');
  r.official_ships = O;
  if (oTag === 'mismatch') {
    addNote(r, `official: 中文=${cn.official} 英文=${en.official} 待人工確認`);
    anomalies.push({ field: 'official', cn: cn.official, en: en.official });
  } else if (oTag === 'chinese_only' || oTag === 'english_only') {
    r.source_detail = (r.source_detail ? r.source_detail + ';' : '') + `official:${oTag}`;
  }

  return { parsed: r, mismatches: anomalies };
}

// pickField: 依中英兩值選出最終值
function pickField(cn, en, name) {
  if (cn === null && en === null) return [null, 'both_null'];
  if (cn === null) return [en, 'english_only'];
  if (en === null) return [cn, 'chinese_only'];
  if (cn === en) return [cn, 'match'];
  return [null, 'mismatch'];
}

function addNote(r, msg) {
  r.note = r.note ? r.note + ' | ' + msg : msg;
}

// ── 一致性 & 範圍檢查 ────────────────────────────────
export function checkConsistency(p) {
  const { aircraft_total: T, crossed_median: C, adiz_entry: A } = p;
  const v = [];
  if (T !== null && A !== null && A > T) v.push(`adiz(${A})>total(${T})`);
  if (A !== null && C !== null && C > A) v.push(`crossed(${C})>adiz(${A})`);
  if (T !== null && C !== null && C > T) v.push(`crossed(${C})>total(${T})`);
  return v;
}

export function checkRange(p, isOCR) {
  if (!isOCR) return [];
  const v = [];
  if (p.aircraft_total !== null && p.aircraft_total > 60) v.push(`total(${p.aircraft_total})>60`);
  if (p.naval !== null && p.naval > 30) v.push(`naval(${p.naval})>30`);
  return v;
}
