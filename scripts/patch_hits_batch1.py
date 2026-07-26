#!/usr/bin/env python3
"""
Batch 1 patch (read-write):
  1. 鄭博見 2026-global-turmoil-warning.md:
     pending → misses: '2026年陽曆六月，亞洲國家會有一些動盪，版圖可能會突變。'
  2. 比格斯 × 5 files:
     hits → excluded: '比格斯對台灣的持續關注引發廣泛討論，其預言影響力上升'
"""

from pathlib import Path
import frontmatter
import yaml

BLOG = Path(__file__).parent.parent / "src" / "content" / "blog"

# ── helpers ─────────────────────────────────────────────────────────────────

def load(fname):
    path = BLOG / fname
    post = frontmatter.load(str(path))
    return post, path

def save(post, path):
    """Round-trip through python-frontmatter; preserve body."""
    text = frontmatter.dumps(post)
    path.write_text(text, encoding="utf-8")

def move_item(lst_from: list, lst_to: list, text: str) -> bool:
    for i, item in enumerate(lst_from):
        if str(item).strip() == text.strip():
            lst_from.pop(i)
            lst_to.append(item)
            return True
    return False

def ensure_list(preds: dict, key: str) -> list:
    if preds.get(key) is None:
        preds[key] = []
    return preds[key]

# ── 1. 鄭博見 版圖突變 pending → misses ──────────────────────────────────────

TARGET_RUOHAI = "2026年陽曆六月，亞洲國家會有一些動盪，版圖可能會突變。"

post, path = load("2026-global-turmoil-warning.md")
preds = post.metadata.setdefault("predictions", {})
pending = ensure_list(preds, "pending")
misses  = ensure_list(preds, "misses")

if move_item(pending, misses, TARGET_RUOHAI):
    save(post, path)
    print(f"✅ 2026-global-turmoil-warning.md  pending→misses: {TARGET_RUOHAI[:30]}…")
else:
    print(f"⚠️  找不到目標條目，請確認文字: {TARGET_RUOHAI}")

# ── 2. 比格斯 自我指涉 hits → excluded (5 files) ─────────────────────────────

TARGET_BIGGS = "比格斯對台灣的持續關注引發廣泛討論，其預言影響力上升"

BIGGS_FILES = [
    "rumble-v799dgm.md",
    "rumble-v79am72.md",
    "rumble-v79asew.md",
    "rumble-v79ax40.md",
    "rumble-v79bwlm.md",
]

for fname in BIGGS_FILES:
    post, path = load(fname)
    preds = post.metadata.setdefault("predictions", {})
    hits     = ensure_list(preds, "hits")
    excluded = ensure_list(preds, "excluded")

    if move_item(hits, excluded, TARGET_BIGGS):
        save(post, path)
        print(f"✅ {fname}  hits→excluded: {TARGET_BIGGS[:30]}…")
    else:
        print(f"⚠️  {fname}: 找不到目標條目")
