#!/usr/bin/env python3
"""
Rename yt-{video_id} and rumble-{id} blog posts to SEO-friendly keyword slugs.
Generates 301 redirects in vercel.json for all renamed files.

Usage:
  python3 scripts/rename-slugs.py --dry-run   # preview changes, no rename
  python3 scripts/rename-slugs.py             # rename files + update vercel.json
"""

import re
import json
import argparse
from pathlib import Path

BLOG_DIR   = Path(__file__).parent.parent / 'src' / 'content' / 'blog'
VERCEL_JSON = Path(__file__).parent.parent / 'vercel.json'

STOPWORDS = {'a', 'an', 'the', 'in', 'on', 'at', 'to', 'of', 'for', 'by',
             'is', 'it', 'and', 'or', 'vs', 'ep', 'ft', 'tv'}


def title_to_slug(title: str, fallback_id: str, pub_date: str = '') -> str:
    """Generate SEO slug from title English keywords + year.
    Returns fallback_id if the title doesn't have enough meaningful keywords.
    """
    year = pub_date[:4] if len(pub_date) >= 4 else ''

    letter_words = re.findall(r'[a-zA-Z][a-zA-Z0-9]*', title)
    words = [w.lower() for w in letter_words if w.lower() not in STOPWORDS and len(w) >= 2]

    # Require at least 2 meaningful English words (not counting acronyms under 3 chars)
    substantive = [w for w in words if len(w) >= 3]
    if len(substantive) < 2:
        return fallback_id

    if year and year not in words:
        words = [year] + words

    slug = '-'.join(words)
    if len(slug) > 70:
        slug = slug[:70].rsplit('-', 1)[0]
    return slug


def parse_frontmatter(text: str) -> dict:
    if not text.startswith('---'):
        return {}
    end = text.find('\n---', 3)
    if end == -1:
        return {}
    fm = text[4:end]
    data = {}
    for line in fm.splitlines():
        m = re.match(r"^(\w+):\s*'?([^'#\n]+?)'?\s*$", line)
        if m:
            data[m.group(1)] = m.group(2).strip()
    return data


def make_slug(filepath: Path, fm: dict) -> str | None:
    name = filepath.stem
    pub_date = fm.get('pubDate', '')
    title    = fm.get('title', '')

    if name.startswith('yt-'):
        video_id = name[3:]
        candidate = title_to_slug(title, f'yt-{video_id}', pub_date)
        return candidate if candidate != f'yt-{video_id}' else None

    if name.startswith('rumble-'):
        rumble_id = name[7:]
        candidate = title_to_slug(title, f'rumble-{rumble_id}', pub_date)
        return candidate if candidate != f'rumble-{rumble_id}' else None

    return None


def unique_slug(slug: str, existing: set) -> str:
    if slug not in existing:
        return slug
    i = 2
    while f'{slug}-{i}' in existing:
        i += 1
    return f'{slug}-{i}'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    dry = args.dry_run
    if dry:
        print('DRY RUN — no files will be changed\n')

    files = sorted(BLOG_DIR.glob('*.md'))
    existing_slugs = {f.stem for f in files}

    renames   = []   # (old_path, new_path)
    redirects = []   # {"source": "/blog/old", "destination": "/blog/new", "permanent": true}

    for fp in files:
        name = fp.stem
        if not (name.startswith('yt-') or name.startswith('rumble-')):
            continue

        text = fp.read_text(encoding='utf-8')
        fm   = parse_frontmatter(text)
        new_slug = make_slug(fp, fm)
        if not new_slug:
            continue  # pure Chinese, keep as-is

        # Avoid collisions with existing filenames
        if new_slug in existing_slugs and new_slug != name:
            new_slug = unique_slug(new_slug, existing_slugs)

        new_path = BLOG_DIR / f'{new_slug}.md'
        existing_slugs.discard(name)
        existing_slugs.add(new_slug)

        renames.append((fp, new_path))
        redirects.append({
            'source':      f'/blog/{name}',
            'destination': f'/blog/{new_slug}',
            'permanent':   True,
        })
        print(f'  {name}')
        print(f'  → {new_slug}\n')

    print(f'Total renames: {len(renames)}')
    print(f'Files kept (pure Chinese): {sum(1 for f in files if (f.stem.startswith("yt-") or f.stem.startswith("rumble-"))) - len(renames)}')

    if dry:
        return

    # Rename files
    for old, new in renames:
        old.rename(new)

    # Update vercel.json
    vercel = json.loads(VERCEL_JSON.read_text())
    existing_redir = vercel.get('redirects', [])
    # Remove old entries for the same sources
    sources = {r['source'] for r in redirects}
    existing_redir = [r for r in existing_redir if r.get('source') not in sources]
    vercel['redirects'] = existing_redir + redirects
    VERCEL_JSON.write_text(json.dumps(vercel, ensure_ascii=False, indent=2) + '\n')

    print(f'\n✓ Renamed {len(renames)} files')
    print(f'✓ Added {len(redirects)} redirects to vercel.json')
    print('\nNext: git add -A && git commit -m "Rename yt/rumble slugs for SEO" && git push')


if __name__ == '__main__':
    main()
