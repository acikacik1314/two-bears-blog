#!/usr/bin/env python3
"""
D:12 patch — move 12 items from hits → excluded.
理由甲: Rumble upload date is after event date.
理由乙: Article text uses retrospective language ("曾準確預言", "已發生").
"""
import sys
from pathlib import Path
import frontmatter

BLOG_DIR = Path(__file__).parent.parent / "src" / "content" / "blog"

# Format A: (filename → [claims to move from hits to excluded])
FORMAT_A = {
    # K10 日經, K11 疫情 — 理由乙: "文中明確標示「曾準確預言」"
    "rumble-v79c3v6.md": [
        "準確預言日經指數暴跌（2020年3月日經大跌，文中明確標示「曾準確預言」）",
        "準確預言新冠疫情爆發（文中明確標示「曾準確預言」）",
    ],
    # P5 川普彈劾 — 理由甲: pubDate 2020-11-03 > 事件 2020-02
    "2020-11-03-hamilton-parker-2020.md": [
        "川普彈劾程序失敗，未遭撤職（2020年2月參議院宣判無罪）",
    ],
    # P6 香港大火 — 理由甲: upload 2026-05-02 > 事件 2025-11
    "rumble-v79axuu.md": [
        "香港紅磡高層建築大火，數十人遇難近300人失蹤（預言2024年初，應驗2025年11月）",
    ],
    # B1 關稅, B2 礦產, B3 馬杜洛 — 理由甲: upload 2026-05-02 > 各事件
    "rumble-v79awig.md": [
        "川普對中國加徵60%至100%關稅，對其他國家加徵20%基礎關稅（2025年4月）",
        "美烏礦產資源協議簽署（2025年4月30日）",
        "馬杜洛被美國抓捕（2026年1月，影片中已確認應驗）",
    ],
    # S7 伊朗核, S8 加密貨幣 — 理由甲+乙: upload 2026-05-02 > 各事件 & 文中"已發生"
    "rumble-v79b0s2.md": [
        "伊朗核設施遭美國空軍和海軍攻擊（2020年6月22日已發生）",
        "加密貨幣2025年大崩潰，整個市場蒸發超過一兆美元（2025年11月已發生）",
    ],
    # Z9 台北車站 — YouTube post 404，無可查出處
    "zheng-bojian-2026.md": [
        "台北車站隨機傷人案（2025年12月19日）應驗血光之災預言",
    ],
}

# Format B: (filename → {prophet → [claims to move from hits to excluded]})
FORMAT_B = {
    # PB4 環太平洋地震 — 理由甲: upload 2026-05-01 > 事件 2026-04-20
    "rumble-v799em0.md": {
        "比格斯": [
            "環太平洋火環帶板塊大震動影響美國至日本（應驗：2026年4月20日日本7.4級地震）",
        ],
        "帕克": [
            "環太平洋火環帶板塊大震動影響美國至日本（應驗：2026年4月20日日本7.4級地震）",
        ],
    },
}


def claim_str(entry) -> str:
    if isinstance(entry, str):
        return entry
    if isinstance(entry, dict):
        return entry.get("claim", "")
    return str(entry)


def patch_format_a(data: dict, to_move: list[str]) -> int:
    preds = data.get("predictions") or {}
    hits = list(preds.get("hits") or [])
    excluded = list(preds.get("excluded") or [])
    target = set(to_move)
    moved = 0
    remaining = []
    for entry in hits:
        if claim_str(entry) in target:
            excluded.append(claim_str(entry))
            moved += 1
        else:
            remaining.append(entry)
    preds["hits"] = remaining
    preds["excluded"] = excluded
    data["predictions"] = preds
    return moved


def patch_format_b(data: dict, prophet_claims: dict[str, list[str]]) -> int:
    preds = data.get("predictions") or {}
    moved = 0
    for prophet, to_move in prophet_claims.items():
        prophet_preds = preds.get(prophet) or {}
        hits = list(prophet_preds.get("hits") or [])
        excluded = list(prophet_preds.get("excluded") or [])
        target = set(to_move)
        remaining = []
        for entry in hits:
            if claim_str(entry) in target:
                excluded.append(claim_str(entry))
                moved += 1
            else:
                remaining.append(entry)
        prophet_preds["hits"] = remaining
        prophet_preds["excluded"] = excluded
        preds[prophet] = prophet_preds
    data["predictions"] = preds
    return moved


total = 0
errors = 0

print("=== patch_hits_batch3: D:12 ===\n")

for fname, to_move in FORMAT_A.items():
    fpath = BLOG_DIR / fname
    if not fpath.exists():
        print(f"  ⚠️  NOT FOUND: {fname}")
        errors += 1
        continue
    post = frontmatter.load(str(fpath))
    n = patch_format_a(post.metadata, to_move)
    if n == 0:
        print(f"  ⚠️  nothing moved: {fname}")
        errors += 1
    else:
        fpath.write_text(frontmatter.dumps(post), encoding="utf-8")
        print(f"  ✅ {fname}: {n} → excluded")
        total += n

for fname, prophet_claims in FORMAT_B.items():
    fpath = BLOG_DIR / fname
    if not fpath.exists():
        print(f"  ⚠️  NOT FOUND: {fname}")
        errors += 1
        continue
    post = frontmatter.load(str(fpath))
    n = patch_format_b(post.metadata, prophet_claims)
    if n == 0:
        print(f"  ⚠️  nothing moved: {fname}")
        errors += 1
    else:
        fpath.write_text(frontmatter.dumps(post), encoding="utf-8")
        print(f"  ✅ {fname} (Format B): {n} → excluded")
        total += n

print(f"\n總計移動：{total} 條（預期 12）")
if errors:
    print(f"⚠️  {errors} 個警告，請手動檢查")
sys.exit(1 if errors else 0)
