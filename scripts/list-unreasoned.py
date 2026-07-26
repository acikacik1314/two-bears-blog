#!/usr/bin/env python3
"""
scripts/list-unreasoned.py  — 只讀，不修改任何 markdown。

輸出 reports/unreasoned.md：
  按預言家分組，列出所有仍是字串形式（或物件但無 reason）的 hits 和 misses。
  格式：`檔名.md` | hits/misses | 「條目原文」

dedup 邏輯：同一預言家跨文章去重，以 claim 文字為 key；
若同一 claim 在任一檔案有 reason，則整體視為「已補寫」，不列入待補。
"""

import sys
from pathlib import Path
from collections import defaultdict
from datetime import date

import frontmatter

sys.path.insert(0, str(Path(__file__).parent))
from prophet_utils import get_predictions

BLOG_DIR    = Path(__file__).parent.parent / "src" / "content" / "blog"
REPORTS_DIR = Path(__file__).parent.parent / "reports"


def get_claim(entry) -> str:
    if isinstance(entry, str):
        return entry.strip()
    if isinstance(entry, dict):
        return str(entry.get("claim", "")).strip()
    return str(entry).strip()


def has_reason(entry) -> bool:
    if isinstance(entry, dict):
        return bool(str(entry.get("reason", "")).strip())
    return False


# ── Pass 1: collect per-prophet per-list claim → {fname, any_reason} ──────────

# prophet_id → list_name → claim → {'fname': str, 'any_reason': bool}
raw: dict[str, dict[str, dict[str, dict]]] = defaultdict(
    lambda: defaultdict(dict)
)

for md_path in sorted(BLOG_DIR.glob("*.md")):
    try:
        post = frontmatter.load(str(md_path))
    except Exception:
        continue
    data = post.metadata

    prophets_raw = data.get("prophet")
    if not prophets_raw:
        continue
    if isinstance(prophets_raw, str):
        prophets = [prophets_raw]
    elif isinstance(prophets_raw, list):
        prophets = [p for p in prophets_raw if p]
    else:
        continue

    fname = md_path.name

    for prophet_id in prophets:
        preds = get_predictions(data, prophet_id)
        for list_name in ("hits", "misses"):
            for entry in (preds.get(list_name) or []):
                claim = get_claim(entry)
                if not claim:
                    continue
                bucket = raw[prophet_id][list_name]
                if claim not in bucket:
                    bucket[claim] = {"fname": fname, "any_reason": has_reason(entry)}
                elif has_reason(entry):
                    bucket[claim]["any_reason"] = True


# ── Pass 2: keep only claims with no reason anywhere ──────────────────────────

# prophet_id → list_name → [(fname, claim)]
unreasoned: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(list))

for prophet_id, lists in raw.items():
    for list_name, claims in lists.items():
        for claim, info in claims.items():
            if not info["any_reason"]:
                unreasoned[prophet_id][list_name].append(
                    (info["fname"], claim)
                )

# ── Report ─────────────────────────────────────────────────────────────────────

total = sum(
    len(items)
    for prophet_lists in unreasoned.values()
    for items in prophet_lists.values()
)

lines = [
    "# 待補判定理由清單",
    "",
    f"生成日期：{date.today()}",
    f"總計待補：**{total}** 條（hits + misses 尚無 reason 的唯一條目）",
    "",
    "| 預言家 | hits 待補 | misses 待補 | 合計 |",
    "|--------|----------|-------------|------|",
]

for prophet_id in sorted(unreasoned.keys()):
    h = len(unreasoned[prophet_id].get("hits",   []))
    m = len(unreasoned[prophet_id].get("misses", []))
    lines.append(f"| **{prophet_id}** | {h} | {m} | {h+m} |")

lines += ["", "---", ""]

for prophet_id in sorted(unreasoned.keys()):
    h_items = unreasoned[prophet_id].get("hits",   [])
    m_items = unreasoned[prophet_id].get("misses", [])
    if not h_items and not m_items:
        continue
    lines.append(f"## {prophet_id}")
    lines.append("")
    for list_name, items in [("hits", h_items), ("misses", m_items)]:
        if not items:
            continue
        lines.append(f"### {list_name}")
        for fname, claim in items:
            lines.append(f"- `{fname}` | {list_name} | 「{claim}」")
        lines.append("")

REPORTS_DIR.mkdir(exist_ok=True)
out = REPORTS_DIR / "unreasoned.md"
out.write_text("\n".join(lines), encoding="utf-8")
print(f"✅ {out}")
print(f"總計待補：{total} 條")
