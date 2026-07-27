#!/usr/bin/env python3
"""
Batch 4 — exclude 27 Biggs hits:
• #11-25: circular-evidence items ("文中確認命中") from Rumble batch-import files
• #01-07, #26-30: vague trend claims with no specific event / verifiable date
Uses ruamel.yaml to preserve YAML formatting (quotes, key order, indentation).
"""
import sys
from pathlib import Path
from io import StringIO
from ruamel.yaml import YAML

BLOG_DIR = Path(__file__).parent.parent / "src" / "content" / "blog"

yaml = YAML()
yaml.preserve_quotes = True
yaml.width = 4096  # prevent line-wrapping


def load_md(path: Path):
    """Return (frontmatter_str, body_str, separator_type)."""
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---"):
        return None, text, ""
    # find closing ---
    end = text.index("\n---", 3)
    fm_str = text[3:end]           # between the two ---
    body = text[end + 4:]          # after closing ---
    return fm_str, body, "---"


def dump_yaml(data) -> str:
    s = StringIO()
    yaml.dump(data, s)
    return s.getvalue()


def save_md(path: Path, fm_data, body: str):
    fm_str = dump_yaml(fm_data)
    path.write_text(f"---\n{fm_str}---{body}", encoding="utf-8")


def claim_str(entry) -> str:
    if isinstance(entry, str):
        return entry
    if hasattr(entry, 'get'):
        return entry.get("claim", "") or ""
    return str(entry)


def move_hits_to_excluded(fm_data, to_move: set[str]) -> int:
    """Format A: move matching hits → excluded. Returns count moved."""
    preds = fm_data.get("predictions") or {}
    hits = list(preds.get("hits") or [])
    excluded = list(preds.get("excluded") or [])
    remaining, moved = [], 0
    for entry in hits:
        if claim_str(entry) in to_move:
            excluded.append(claim_str(entry))
            moved += 1
        else:
            remaining.append(entry)
    preds["hits"] = remaining
    preds["excluded"] = excluded
    fm_data["predictions"] = preds
    return moved


# ── Patch map: filename → list of claim strings to move hits→excluded ─────────

PATCHES = {
    # #01 AI深偽趨勢（模糊）
    "2026-05-23-biggs-ww3-taiwan-economy-ai.md": [
        "AI技術快速發展，深偽技術與AI詐騙案例大增",
    ],
    # #02 古巴士兵（理由乙）
    "2026-xrp-swift.md": [
        "古巴秘密向烏克蘭輸送士兵協助俄羅斯作戰（影片錄製時新聞已有報導）",
    ],
    # #03 川普當選、#04 能源供應鏈（模糊趨勢）
    "biggs-prediction-anxiety.md": [
        "川普贏得大選並執政，比格斯早在任期前即預告",
        "全球能源與供應鏈遭受政治力量干預，糧食安全警報升高",
    ],
    # #05 AI深偽、#06 國債（模糊）
    "brandon-biggs-2026.md": [
        "AI技術被用於生成深偽影像與冒充詐騙",
        "美國國債逼近40兆美元，利息負擔沉重",
    ],
    # #07 國債重複版
    "brandon-biggs-20260608.md": [
        "美國國債逼近40兆美元，年利息超過1兆美元，引發經濟警報",
    ],
    # #11 川普槍擊（文中說新聞已確認）
    "rumble-v79awig.md": [
        "川普遭槍擊，子彈從耳邊掠過，臉上帶血但奇蹟生還（文中說新聞已確認）",
    ],
    # #12–17 六條批次匯入回顧（文中確認命中）
    "rumble-v79axo4.md": [
        "川普遭槍擊，子彈從耳邊掠過，臉上帶血但奇蹟生還（文中確認命中）",
        "馬杜洛被美軍抓捕（文中明確列為2025全命中）",
        "川普對中國加徵60%至100%關稅，引爆貿易戰（文中確認命中）",
        "美烏礦產資源協議簽署（文中確認命中）",
        "供應鏈大規模中斷，雞蛋、黃油等食品短缺（文中確認命中）",
        "某蘋果手機新功能觸發爭議（文中確認命中）",
    ],
    # #18 川普槍擊、#19 馬杜洛重複版
    "rumble-v79bu9k.md": [
        "川普遭槍擊，子彈從耳邊掠過，臉上帶血但奇蹟生還（文中確認）",
        "馬杜洛被美軍抓捕（文中確認）",
    ],
    # #20 猶他炸彈、#21 SIM卡
    "rumble-v79bure.md": [
        "猶他州FBI逮捕嫌犯，炸彈引信被點燃但未爆（文中明確確認）",
        "紐約10萬張SIM卡非法通訊網路被破獲（文中明確確認）",
    ],
    # #22 川普槍擊第三重複版
    "rumble-v79bv6y.md": [
        "川普遭槍擊，子彈從耳邊掠過，奇蹟生還（文中確認）",
    ],
    # #23 川普當選/關稅、#24 礦產協議（重疊版）
    "rumble-v79bzj0.md": [
        "川普2024年當選並對中國加徵高額關稅，引爆全球貿易戰（文中確認）",
        "川普與烏克蘭簽署礦產資源協議（文中確認）",
    ],
    # #25 龍捲風、#26 義大利地震
    "rumble-v79ihzu.md": [
        "奧克拉荷馬州2024年4月出現EF3至EF4級龍捲風（文中明確確認）",
        "義大利發生地震（文中提到比格斯曾預言此事）",
    ],
    # #27 川普台灣（模糊趨勢）
    "taiwan-blitzkrieg.md": [
        "川普表示「不需要台灣」的言論引發外交爭議（2025年川普多次質疑台灣防衛承諾）",
    ],
    # #28–30 yt 籠統趨勢
    "yt-8Y-jvFtf5EY.md": [
        "台灣晶片產業受到中國高度覬覦，成為地緣政治核心焦點",
        "全球通膨與債務高企讓多名經濟學家對前景悲觀",
        "各國推動數位貨幣（CBDC），引發隱私與中央控制疑慮",
    ],
}

total_moved = 0
errors = 0
print("=== patch_hits_batch4: Biggs 27 items → excluded ===\n")

for fname, claims in PATCHES.items():
    fpath = BLOG_DIR / fname
    if not fpath.exists():
        print(f"  ⚠️  NOT FOUND: {fname}")
        errors += 1
        continue

    fm_str, body, _ = load_md(fpath)
    if fm_str is None:
        print(f"  ⚠️  NO FRONTMATTER: {fname}")
        errors += 1
        continue

    fm_data = yaml.load(fm_str)
    n = move_hits_to_excluded(fm_data, set(claims))
    if n == 0:
        print(f"  ⚠️  nothing moved: {fname}")
        errors += 1
    else:
        save_md(fpath, fm_data, body)
        print(f"  ✅ {fname}: {n} → excluded")
        total_moved += n

print(f"\n總計移動：{total_moved} 條（預期 27）")
if errors:
    print(f"⚠️  {errors} 個警告")
sys.exit(1 if errors else 0)
