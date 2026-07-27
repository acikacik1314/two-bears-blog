#!/usr/bin/env python3
"""
scan_expired_pending.py
掃描所有 blog 文章中 pending 條目，找出文字裡含有「已過去的日期/時間窗」的條目。
這些條目是「疑似已落空」的候選清單，需要人工確認是否應移至 misses。

今天：2026-07-28

觸發邏輯（任一命中即標記）：
  - 2020–2025 年（任何明確年份出現）
  - 2026年1–6月 或 2026年上半年/初期
"""

import re
import glob
import sys

try:
    import yaml
except ImportError:
    print("請先安裝 pyyaml：pip3 install pyyaml", file=sys.stderr)
    sys.exit(1)

TODAY = "2026-07-28"

# 已過去的年份
PAST_YEAR_RE = re.compile(r'20(?:2[0-5])年')
# 2026年上半年月份（1–6月）
PAST_2026_MONTH_RE = re.compile(r'2026年(?:[1-6]月|上半年|初[期]?)')
# "年底/年末/年內/年前" 搭配過去年份
PAST_YEAR_END_RE = re.compile(r'20(?:2[0-5])年(?:底|末|內|前)')

PATTERNS = [
    (PAST_YEAR_RE,       "過去年份"),
    (PAST_2026_MONTH_RE, "2026年上半年月份"),
    (PAST_YEAR_END_RE,   "過去年底/年末/年內"),
]


def extract_frontmatter(path: str) -> dict | None:
    with open(path, encoding="utf-8") as f:
        content = f.read()
    m = re.match(r'^---\n(.*?)\n---', content, re.DOTALL)
    if not m:
        return None
    try:
        return yaml.safe_load(m.group(1))
    except Exception:
        return None


def get_claim(entry) -> str:
    if isinstance(entry, str):
        return entry
    if isinstance(entry, dict):
        return entry.get("claim", str(entry))
    return str(entry)


def check_triggers(text: str) -> list[str]:
    hits = []
    for pattern, label in PATTERNS:
        m = pattern.search(text)
        if m:
            hits.append(f"{label}（「{m.group(0)}」）")
    return hits


posts = sorted(glob.glob("src/content/blog/*.md"))

# prophet -> list of findings
findings: dict[str, list[dict]] = {}
total_scanned_pending = 0

for path in posts:
    data = extract_frontmatter(path)
    if not data:
        continue
    prophet = data.get("prophet")
    if not prophet:
        continue
    preds = data.get("predictions") or {}
    pending_list = preds.get("pending") or []
    if not pending_list:
        continue

    post_id = path.removeprefix("src/content/blog/").removesuffix(".md")
    pub_date = str(data.get("pubDate", "unknown"))

    for entry in pending_list:
        total_scanned_pending += 1
        claim = get_claim(entry)
        triggers = check_triggers(claim)
        if not triggers:
            continue
        # Normalise prophet: could be string or list
        ids = prophet if isinstance(prophet, list) else [prophet]
        for pid in ids:
            findings.setdefault(pid, []).append({
                "post": post_id,
                "pubDate": pub_date,
                "claim": claim,
                "triggers": triggers,
            })

total_flagged = sum(len(v) for v in findings.values())

print(f"# 疑似已到期 pending 掃描報告")
print(f"掃描日期：{TODAY}")
print(f"掃描文章：{len(posts)} 篇  共掃 pending 條目：{total_scanned_pending} 條")
print(f"**旗標條目：{total_flagged} 條**\n")
print("⚠️ 這是候選清單，不是判決。每條需要人工確認：")
print("  ✅ 若事件確未發生 → 移至 misses")
print("  ✅ 若預言無截止日期或仍在觀察期 → 保留 pending")
print("  ✅ 若年份只是背景描述非截止日期 → 保留 pending\n")
print("---\n")

for prophet_id in sorted(findings.keys()):
    items = findings[prophet_id]
    print(f"## {prophet_id}（{len(items)} 條）\n")
    for item in items:
        print(f"- **來源**：`{item['post']}`（pubDate: {item['pubDate']}）")
        print(f"  **條目**：{item['claim']}")
        print(f"  **觸發**：{'; '.join(item['triggers'])}")
        print()
