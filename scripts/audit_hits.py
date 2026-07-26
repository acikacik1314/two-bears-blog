#!/usr/bin/env python3
"""
scripts/audit_hits.py  v2
Phase 1 (read-only): produce reports/hits-audit.md.

計數邏輯與 prophetStats.ts 對齊:
  每位預言家的 hits / misses / pending = 跨所有文章後以文字去重 (Set)。
  審計的旗標也作用在去重後的集合上,確保「移除後試算」
  跟讀者看到的數字一致。

四類旗標:
  A = 自我標註未驗證卻放在 hits
  B = 自我指涉,不是對世界的預測
  C = 說出口時就已成立的趨勢陳述 (無具體門檻/時間點)
  D = 事後追認 (條目括號內日期早於所有含該條目的文章 pubDate)

額外報告:
  X = 跨檔重複 hits (同一條文字出現在 2+ 個檔案,但網站只算 1 次)
"""

import re
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

import frontmatter

sys.path.insert(0, str(Path(__file__).parent))
from prophet_utils import get_predictions

BLOG_DIR = Path(__file__).parent.parent / "src" / "content" / "blog"
REPORTS_DIR = Path(__file__).parent.parent / "reports"

# ── 關鍵詞表 ────────────────────────────────────────────────────────────────

A_KW = [
    "尚未結束", "待觀察", "尚在進行中", "仍在進行", "尚未發生",
    "尚未到期", "尚未確認", "仍待驗證", "持續中",
]

B_KW = [
    "預言影響力", "引發廣泛討論", "知名度上升", "人氣上升",
    "討論度上升", "影響力上升", "預言家本人",
]

C_KW = [
    "持續升溫", "持續創歷史新高", "持續加劇", "持續緊張",
    "持續上升", "不斷升高", "不斷創新高", "不斷加劇",
    "飛漲", "持續飆漲", "不斷飆升",
]
C_TREND_WORDS = ["升溫", "加劇", "緊張", "持續", "飛漲", "持續創"]


def is_a(hit: str) -> bool:
    return any(kw in hit for kw in A_KW)


def is_b(hit: str) -> bool:
    return any(kw in hit for kw in B_KW)


def is_c(hit: str) -> bool:
    has_trend = any(kw in hit for kw in C_KW)
    if not has_trend:
        for tw in C_TREND_WORDS:
            if tw in hit:
                if re.search(r"[（(]已[應驗確認]|新聞已確認|文中確認[）)]", hit):
                    return False
                if re.search(r"\d{4}年\d{1,2}月", hit):
                    return False
                has_trend = True
                break
    if not has_trend:
        return False
    if re.search(r"\d{4}年\d{1,2}月\d{1,2}日", hit):
        return False
    return True


def extract_bracket_date(hit: str):
    m = re.search(r"[（(].*?(\d{4})年(\d{1,2})月(\d{1,2})日.*?[）)]", hit)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            pass
    m = re.search(r"[（(].*?(\d{4})年(\d{1,2})月.*?[）)]", hit)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), 1)
        except ValueError:
            pass
    return None


def parse_pub_date(data: dict):
    pd = data.get("pubDate")
    if pd is None:
        return None
    if isinstance(pd, date):
        return pd
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", str(pd))
    if m:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    return None


def get_all_prophets(data: dict) -> list:
    p = data.get("prophet")
    if isinstance(p, list):
        return [x for x in p if x]
    if isinstance(p, str) and p:
        return [p]
    return []


# ── Pass 1: 收集每位預言家的所有條目 (含來源檔與日期) ────────────────────────

# prophet → {text → {files: set, earliest_pub: date or None}}
raw: dict[str, dict[str, dict]] = defaultdict(lambda: defaultdict(lambda: {"files": set(), "earliest_pub": None, "latest_pub": None}))
# For misses: prophet → set of unique miss texts
miss_texts: dict[str, set] = defaultdict(set)

for md_path in sorted(BLOG_DIR.glob("*.md")):
    try:
        post = frontmatter.load(str(md_path))
    except Exception:
        continue
    data = post.metadata
    prophets = get_all_prophets(data)
    if not prophets:
        continue
    pub_date = parse_pub_date(data)
    fname = md_path.name

    for prophet_name in prophets:
        preds = get_predictions(data, prophet_name)
        for hit in (preds.get("hits") or []):
            t = str(hit).strip()
            entry = raw[prophet_name][t]
            entry["files"].add(fname)
            if pub_date:
                if entry["earliest_pub"] is None or pub_date < entry["earliest_pub"]:
                    entry["earliest_pub"] = pub_date
                if entry["latest_pub"] is None or pub_date > entry["latest_pub"]:
                    entry["latest_pub"] = pub_date
        for miss in (preds.get("misses") or []):
            miss_texts[prophet_name].add(str(miss).strip())

# ── Pass 2: 對去重後集合跑稽核 ──────────────────────────────────────────────

findings: dict[str, list] = {"A": [], "B": [], "C": [], "D": [], "X": []}

for prophet_name, texts in raw.items():
    for text, meta in texts.items():
        files = sorted(meta["files"])
        earliest_pub = meta["earliest_pub"]
        latest_pub = meta["latest_pub"]

        # X: cross-file duplicate (website counts it once; real inflation source)
        if len(files) > 1:
            findings["X"].append({
                "prophet": prophet_name, "hit": text,
                "files": files, "count": len(files),
            })

        if is_a(text):
            findings["A"].append({"prophet": prophet_name, "hit": text, "files": files})

        if is_b(text):
            findings["B"].append({"prophet": prophet_name, "hit": text, "files": files})

        if is_c(text):
            findings["C"].append({"prophet": prophet_name, "hit": text, "files": files})

        # D: bracket date earlier than the EARLIEST article pubDate that contains this hit
        if earliest_pub:
            ev_date = extract_bracket_date(text)
            if ev_date and ev_date < earliest_pub:
                findings["D"].append({
                    "prophet": prophet_name, "hit": text,
                    "files": files,
                    "earliest_pub": str(earliest_pub),
                    "event_date": str(ev_date),
                })

# ── Per-prophet stats (deduped, matching prophetStats.ts) ──────────────────

prophet_stats: dict[str, dict] = {}
for prophet_name in set(list(raw.keys()) + list(miss_texts.keys())):
    unique_hits = set(raw[prophet_name].keys()) if prophet_name in raw else set()
    unique_misses = miss_texts.get(prophet_name, set())
    bad_hits = set()
    for cat in ["A", "B", "C", "D"]:
        for item in findings[cat]:
            if item["prophet"] == prophet_name:
                bad_hits.add(item["hit"])
    prophet_stats[prophet_name] = {
        "hits": len(unique_hits),
        "misses": len(unique_misses),
        "bad": len(bad_hits),
        "bad_texts": bad_hits,
    }

total_hits = sum(v["hits"] for v in prophet_stats.values())
total_bad_unique = len({(i["prophet"], i["hit"]) for cat in ["A","B","C","D"] for i in findings[cat]})

# ── 報告 ────────────────────────────────────────────────────────────────────

lines = [
    "# Hits 稽核報告 v2",
    "",
    f"掃描日期：{date.today()}",
    f"> 計數邏輯與 prophetStats.ts 一致：每位預言家跨所有文章去重後計分。",
    "",
    "## 總計（去重後）",
    "",
    f"- 全站 hits 總數（去重）：{total_hits}",
    f"- A 類（自我標註未驗證）：{len(findings['A'])} 條",
    f"- B 類（自我指涉）：{len(findings['B'])} 條",
    f"- C 類（趨勢陳述）：{len(findings['C'])} 條",
    f"- D 類（事後追認）：{len(findings['D'])} 條",
    f"- 四類聯集（不重複）：{total_bad_unique} 條",
    f"- X 類（跨檔重複，已去重不影響計分）：{len(findings['X'])} 條",
    "",
    "## 命中率試算（去重版，對齊網站顯示）",
    "",
    "> 移除欄：假設四類所有旗標條目全數移除後的試算；實際由人工確認。",
    "",
]

for name in sorted(prophet_stats.keys()):
    st = prophet_stats[name]
    h, m, bad = st["hits"], st["misses"], st["bad"]
    adj_h = max(0, h - bad)
    cur = f"{round(h/(h+m)*100)}%（{h} hit / {h+m} 已驗）" if (h + m) > 0 else "—"
    adj = f"{round(adj_h/(adj_h+m)*100)}%（{adj_h}/{adj_h+m}）" if (adj_h + m) > 0 else "—"
    if bad > 0:
        lines.append(f"- **{name}**：現在 {cur} → 移除 {bad} 條後 {adj}")
    else:
        lines.append(f"- **{name}**：現在 {cur}（無旗標）")

lines.append("")

for cat, label in [
    ("A", "A 類：自我標註未驗證"),
    ("B", "B 類：自我指涉"),
    ("C", "C 類：趨勢陳述（含疑似假陽性，需人工複核）"),
    ("D", "D 類：事後追認（需確認是否有更早原始紀錄）"),
    ("X", "X 類：跨檔重複命中（網站去重後只算 1 次）"),
]:
    items = findings[cat]
    lines += [f"## {label}（{len(items)} 條）", ""]
    if not items:
        lines.append("（無）")
    else:
        for item in sorted(items, key=lambda x: x["prophet"]):
            files_str = ", ".join(f"`{f}`" for f in item.get("files", []))
            if cat == "D":
                lines.append(
                    f'- **{item["prophet"]}** | 最早文章 {item["earliest_pub"]} > 事件 {item["event_date"]} | {files_str} | 「{item["hit"]}」'
                )
            elif cat == "X":
                lines.append(
                    f'- **{item["prophet"]}** | {item["count"]} 個檔案 | {files_str} | 「{item["hit"]}」'
                )
            else:
                lines.append(f'- **{item["prophet"]}** | {files_str} | 「{item["hit"]}」')
    lines.append("")

REPORTS_DIR.mkdir(exist_ok=True)
out = REPORTS_DIR / "hits-audit.md"
out.write_text("\n".join(lines), encoding="utf-8")
print(f"✅ {out}")
print(f"去重 hits 總數:{total_hits}  A:{len(findings['A'])} B:{len(findings['B'])} C:{len(findings['C'])} D:{len(findings['D'])} X:{len(findings['X'])}")
print("--- 比格斯 ---")
s = prophet_stats.get("比格斯", {})
print(f"  hits={s.get('hits')} misses={s.get('misses')} bad={s.get('bad')}")
