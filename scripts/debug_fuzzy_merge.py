#!/usr/bin/env python3
"""
列出 deduplicateEntries 中所有被 Levenshtein ≥0.85 合併的配對。
只看 Phase 2 模糊合併（Phase 1 的精確正規化合併不在風險範圍）。
"""
import sys
from pathlib import Path
from ruamel.yaml import YAML
import re

BLOG_DIR = Path(__file__).parent.parent / "src" / "content" / "blog"
yaml = YAML()
yaml.preserve_quotes = True
yaml.width = 4096


def normalize_key(claim: str) -> str:
    return re.sub(r'[（(][^）)]*[）)]\s*$', '', claim).strip()


def levenshtein(a: str, b: str) -> float:
    if a == b: return 1.0
    la, lb = len(a), len(b)
    if la == 0 or lb == 0: return 0.0
    dp = list(range(la + 1))
    for j in range(1, lb + 1):
        prev = dp[0]; dp[0] = j
        for i in range(1, la + 1):
            tmp = dp[i]
            dp[i] = prev if b[j-1] == a[i-1] else min(prev, dp[i], dp[i-1]) + 1
            prev = tmp
    return 1 - dp[la] / max(la, lb)


def find_fuzzy_merges(raw_entries: list, bucket: str) -> list[tuple]:
    """回傳 [(key_i, key_j, similarity, category)] 所有被合併的組合"""
    # Phase 1: exact key grouping
    by_key: dict[str, str] = {}   # key → first claim
    for e in raw_entries:
        claim = e if isinstance(e, str) else (e.get('claim', '') if hasattr(e, 'get') else str(e))
        if not claim: continue
        key = normalize_key(claim)
        if key not in by_key:
            by_key[key] = claim

    keys = list(by_key.keys())
    absorbed = set()
    merges = []
    for i in range(len(keys)):
        if keys[i] in absorbed: continue
        for j in range(i+1, len(keys)):
            if keys[j] in absorbed: continue
            sim = levenshtein(keys[i], keys[j])
            if sim >= 0.85:
                merges.append((keys[i], keys[j], round(sim, 3), bucket))
                absorbed.add(keys[j])
    return merges


def load_posts():
    posts = []
    for f in BLOG_DIR.glob('*.md'):
        text = f.read_text(encoding='utf-8')
        if not text.startswith('---'): continue
        try:
            end = text.index('\n---', 3)
        except ValueError:
            continue
        fm = yaml.load(text[3:end])
        if not fm: continue
        posts.append((f.name, fm))
    return posts


def main():
    posts = load_posts()
    
    # 聚合每位預言家的 hits/misses
    prophet_entries: dict[str, dict[str, list]] = {}
    for fname, fm in posts:
        if fm.get('draft'): continue
        prophet = fm.get('prophet')
        if not prophet: continue
        preds = fm.get('predictions') or {}
        ids = [prophet] if isinstance(prophet, str) else list(prophet)
        for pid in ids:
            pid = str(pid).strip()
            d = prophet_entries.setdefault(pid, {'hits': [], 'misses': [], 'pending': []})
            for bucket in ('hits', 'misses', 'pending'):
                items = preds.get(bucket) or []
                d[bucket].extend(items)

    all_merges = []
    for pid, buckets in sorted(prophet_entries.items()):
        for bucket, items in buckets.items():
            if not items: continue
            merges = find_fuzzy_merges(items, bucket)
            for ki, kj, sim, _ in merges:
                all_merges.append((pid, bucket, ki, kj, sim))

    if not all_merges:
        print("✅ 無任何模糊合併配對（全站 hits/misses/pending 無 ≥0.85 相似對）")
        return

    print(f"=== 模糊合併配對（Levenshtein ≥0.85）  共 {len(all_merges)} 對 ===\n")
    cur_prophet = None
    for pid, bucket, ki, kj, sim in sorted(all_merges, key=lambda x: x[0]):
        if pid != cur_prophet:
            print(f"\n── {pid} ─────────────────────────────")
            cur_prophet = pid
        print(f"  [{bucket}] sim={sim}")
        print(f"    A: {ki}")
        print(f"    B: {kj}")


if __name__ == '__main__':
    main()
