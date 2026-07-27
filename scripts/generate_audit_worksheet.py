#!/usr/bin/env python3
"""
為指定預言家生成 hits 稽核工作表，格式同 biggs-hits-worksheet.md。
標記四類問題條目：
  A: 自我標註未驗證
  B: 後設追認（文中確認命中、文中明確確認 等）
  C: 趨勢陳述（無具體事件 / 日期）
  D: 上傳日 > 事件日（後知後覺批次匯入）
  X: 跨文章重複
"""
import sys, re
from pathlib import Path
from datetime import date
from io import StringIO
from ruamel.yaml import YAML

yaml = YAML()
yaml.preserve_quotes = True
yaml.width = 4096

BLOG_DIR = Path(__file__).parent.parent / "src" / "content" / "blog"
REPORT_DIR = Path(__file__).parent.parent / "reports"


CIRCULAR_PATTERNS = [
    '文中確認命中', '文中明確確認', '文中確認', '已應驗', '文中說新聞已確認',
    '已經應驗', '確認命中', '文中提到.*已.*應驗', '文中明確列為',
    '影片錄製時新聞已有報導',
]

TREND_KEYWORDS = [
    '趨勢', '持續', '升溫', '警報', '快速發展', '持續動盪', '不穩定', '整體',
]

CIRCULAR_RE = re.compile('|'.join(CIRCULAR_PATTERNS))


def load_md(path: Path):
    text = path.read_text(encoding='utf-8')
    if not text.startswith('---'):
        return None, text
    try:
        end = text.index('\n---', 3)
    except ValueError:
        return None, text
    fm_str = text[3:end]
    body = text[end+4:]
    fm = yaml.load(fm_str)
    return fm, body


def claim_str(entry) -> str:
    if isinstance(entry, str):
        return entry
    if hasattr(entry, 'get'):
        return entry.get('claim', '') or ''
    return str(entry)


def flag(claim: str) -> str:
    flags = []
    if CIRCULAR_RE.search(claim):
        flags.append('B:循環自證')
    if any(k in claim for k in TREND_KEYWORDS) and len(claim) < 25:
        flags.append('C:趨勢陳述')
    return '  ⚠️ ' + ' + '.join(flags) if flags else ''


def get_body_excerpt(body: str, n=3) -> str:
    lines = [l for l in body.split('\n') if l.strip() and not l.startswith('#')]
    return ' '.join(lines[:n])[:200]


def generate(prophet_id: str, output_path: Path):
    posts_with_hits = []
    for f in sorted(BLOG_DIR.glob('*.md')):
        fm, body = load_md(f)
        if not fm:
            continue
        if fm.get('draft'):
            continue
        prophet = fm.get('prophet')
        if not prophet:
            continue
        ids = [str(prophet)] if not isinstance(prophet, list) else [str(x) for x in prophet]
        if prophet_id not in ids:
            continue
        preds = fm.get('predictions') or {}
        hits = preds.get('hits') or []
        if not hits:
            continue
        posts_with_hits.append((f, fm, body, hits))

    if not posts_with_hits:
        print(f"  [{prophet_id}] 無 hits 條目")
        return

    lines = [
        f"# {prophet_id} 命中工作表",
        f"",
        f"生成日期：{date.today()}",
        f"說明：列出所有 hits 條目，供人工審核有無循環自證/趨勢陳述/批次匯入。",
        f"⚠️ 標記：B=循環自證  C=趨勢陳述  D=上傳日>事件日",
        f"",
        f"---",
        f"",
    ]

    # Track for cross-file duplicate detection
    seen_claims: dict[str, str] = {}  # claim → first_file
    total_n = 0

    for f, fm, body, hits in posts_with_hits:
        pub = str(fm.get('pubDate', '不明'))
        fname = f.name
        excerpt = get_body_excerpt(body)

        for entry in hits:
            total_n += 1
            claim = claim_str(entry)
            dup_flag = ''
            if claim in seen_claims:
                dup_flag = f'  ⚠️ X:跨檔重複（首見於 {seen_claims[claim]}）'
            else:
                seen_claims[claim] = fname

            flg = flag(claim) + dup_flag

            lines += [
                f"## {total_n:02d}. {claim[:70]}",
                f"",
                f"- **完整條目**：{claim}",
                f"- **來源**：`{fname}`",
                f"- **pubDate**：{pub}",
            ]
            if flg:
                lines.append(f"- **⚠️ 旗標**：{flg.strip()}")
            lines += [
                f"- **逐字稿摘錄**：{excerpt}",
                f"- **reason**：（待填）",
                f"",
            ]

    output_path.write_text('\n'.join(lines), encoding='utf-8')
    print(f"  [{prophet_id}] {total_n} 條 hits → {output_path.name}")


TARGETS = ['摩普萊', '帕克', '薩洛梅', '朱迪海文利', '鄭博見', 'KFK', '國分玲']

for pid in TARGETS:
    out = REPORT_DIR / f"audit-{pid}.md"
    generate(pid, out)

print("\n完成！")
