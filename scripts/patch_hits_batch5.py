#!/usr/bin/env python3
"""
Batch 5 — 其他預言家清除問題命中：
  帕克：3條趨勢（craig-hamilton-parker-2026）
        2條趨勢（2022-02-24-hamilton-parker-2022）
        1條循環自證（parker-2026-06-20）
  薩洛梅：4條趨勢（athos-salome-2026）
  鄭博見：3條後設/循環（rumble-v79az72）
          1條循環 + 3條趨勢（zheng-bojian-2026）
"""
import sys
from pathlib import Path
from io import StringIO
from ruamel.yaml import YAML

BLOG_DIR = Path(__file__).parent.parent / "src" / "content" / "blog"
yaml = YAML()
yaml.preserve_quotes = True
yaml.width = 4096


def load_md(path):
    text = path.read_text(encoding='utf-8')
    if not text.startswith('---'):
        return None, text, ""
    end = text.index('\n---', 3)
    return text[3:end], text[end + 4:], '---'


def dump_yaml(data):
    s = StringIO()
    yaml.dump(data, s)
    return s.getvalue()


def save_md(path, fm_data, body):
    path.write_text(f"---\n{dump_yaml(fm_data)}---{body}", encoding='utf-8')


def claim_str(entry):
    if isinstance(entry, str): return entry
    if hasattr(entry, 'get'): return entry.get('claim', '') or ''
    return str(entry)


def move_hits_to_excluded(fm_data, to_move):
    preds = fm_data.get('predictions') or {}
    hits = list(preds.get('hits') or [])
    excluded = list(preds.get('excluded') or [])
    remaining, moved = [], 0
    for entry in hits:
        if claim_str(entry) in to_move:
            excluded.append(claim_str(entry))
            moved += 1
        else:
            remaining.append(entry)
    preds['hits'] = remaining
    preds['excluded'] = excluded
    fm_data['predictions'] = preds
    return moved


PATCHES = {
    # ── 帕克 ──────────────────────────────────────────────────────────
    # C: 趨勢陳述（無具體事件）
    'craig-hamilton-parker-2026.md': [
        '川普執政引發巨大社會震盪與政治革命氛圍',
        '全球政府重稅政策引發民怨，農民與小商家生存困難',
        '美國UFO檔案陸續解密，外星議題受到更多關注',
    ],
    # C: 趨勢陳述 + D: 後設追認
    '2022-02-24-hamilton-parker-2022.md': [
        '台海緊張情勢升至數十年新高（2022年應驗）',  # C+D：括號內自稱應驗，無具體事件
        '俄烏衝突引發歐洲能源危機，歐盟內部矛盾加深',  # C：趨勢，無具體日期/事件
    ],
    # B: 循環自證（括號內「已應驗」為自我標註）
    'parker-2026-06-20.md': [
        '2026年初加密貨幣市場遭受監管重擊，小型幣、隱私幣、AI幣遭受最重打擊（已應驗：多國監管浪潮、部分隱私幣下市）',
    ],

    # ── 薩洛梅 ────────────────────────────────────────────────────────
    # C: 全部四條均為趨勢陳述（無具體事件/日期）
    'athos-salome-2026.md': [
        '南海成為全球地緣政治衝突的核心焦點',
        'AI 發展速度超越預期，各領域面臨根本性變革',
        '網路攻擊關鍵基礎設施事件（能源、衛星、金融系統）頻繁發生',
        '多國政府在環境資源保護與化石燃料利益之間陷入衝突',
    ],

    # ── 鄭博見 ────────────────────────────────────────────────────────
    # B+D: 文中明確標示「結果」已發生；以「上個月」過去式陳述
    'rumble-v79az72.md': [
        '2025年11月比特幣市場出現史上最嚴重單月拋售，總市值損失超過1.3萬億美金（文中明確標示「結果」已發生）',
        '東南亞泰國南部遭遇300年一遇降雨量，九省被淹沒；印尼蘇門答臘死亡人數達800多人（文中以「上個月」過去式陳述）',
        '香港發生60年以來最嚴重火災事故（文中以已發生過去式陳述）',
    ],
    # B: 循環自證 + C: 趨勢陳述
    'zheng-bojian-2026.md': [
        '盟友互相拋棄的格局應驗（年初預言已確認）',  # B
        'AI、晶片、算力已全面納入國家主權競爭核心',  # C
        '數位貨幣與虛擬貨幣快速發展，傳統金融受衝擊',  # C
        '全球通膨與裁員潮導致人心扭曲、社會不安',  # C
    ],
}

total_moved = 0
errors = 0
print("=== patch_hits_batch5: 帕克/薩洛梅/鄭博見 → excluded ===\n")

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

expected = 3 + 2 + 1 + 4 + 3 + 4
print(f"\n總計移動：{total_moved} 條（預期 {expected}）")
if errors:
    print(f"⚠️  {errors} 個警告")
sys.exit(1 if errors else 0)
