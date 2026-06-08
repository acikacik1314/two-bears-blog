#!/usr/bin/env python3
"""
Fetch full article content from Pixnet and update blog markdown files.
Usage: python3 fetch_pixnet_content.py [--dry-run] [--force]
"""
import os
import re
import sys
import time
import glob
import urllib.request
import html2text
from pathlib import Path

BLOG_DIR = Path(__file__).parent.parent / 'src' / 'content' / 'blog'
STUB_MAX_LEN = 800  # bodies shorter than this are considered stubs


def fetch_url(url):
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8', errors='replace')


def extract_article_body(html):
    idx = html.find('class="article-body"')
    if idx == -1:
        return None
    start = html.find('>', idx) + 1
    end = html.find('class="article-extended-body"', start)
    if end == -1:
        end = html.find('</article>', start)
    if end == -1:
        end = start + 100000
    return html[start:end]


def html_to_md(body_html):
    # Pre-process: remove &nbsp; before conversion
    body_html = body_html.replace('&nbsp;', ' ').replace('\xa0', ' ')
    h = html2text.HTML2Text()
    h.ignore_links = True
    h.ignore_images = False
    h.body_width = 0
    h.images_to_alt = False
    md = h.handle(body_html)
    # Remove lines that are only whitespace
    lines = [l for l in md.splitlines() if l.strip()]
    md = '\n\n'.join(
        '\n'.join(chunk)
        for chunk in [list(g) for k, g in
            __import__('itertools').groupby(lines, key=lambda x: bool(x.strip()))
            if k]
    )
    # Clean image alt text
    md = re.sub(r'!\[.*?\]\(', '![](', md)
    return md.strip()


def get_frontmatter_and_body(text):
    if text.startswith('---'):
        end = text.find('---', 3)
        if end != -1:
            return text[:end + 3], text[end + 3:].strip()
    return None, text


def main():
    dry_run = '--dry-run' in sys.argv
    force = '--force' in sys.argv

    files = sorted(BLOG_DIR.glob('*.md'))
    pixnet_files = []

    for f in files:
        text = f.read_text(encoding='utf-8')
        m = re.search(r"pixnetSource:\s*'([^']+)'", text)
        if not m:
            continue
        fm, body = get_frontmatter_and_body(text)
        if fm is None:
            continue
        if not force and len(body) > STUB_MAX_LEN:
            continue
        pixnet_files.append((f, m.group(1), fm))

    print(f'Found {len(pixnet_files)} Pixnet stubs to update\n')

    ok = 0
    errors = 0

    for i, (fpath, url, frontmatter) in enumerate(pixnet_files):
        print(f'[{i+1}/{len(pixnet_files)}] {fpath.name}')
        print(f'  URL: {url}')

        if dry_run:
            continue

        try:
            html = fetch_url(url)
            body_html = extract_article_body(html)
            if not body_html:
                print('  ✗ article-body not found')
                errors += 1
                continue

            md = html_to_md(body_html)
            if len(md) < 200:
                print(f'  ✗ content too short ({len(md)} chars)')
                errors += 1
                continue

            new_content = frontmatter + '\n\n' + md + '\n'
            fpath.write_text(new_content, encoding='utf-8')
            print(f'  ✓ {len(md)} chars, {md.count("![](")} images')
            ok += 1

        except Exception as e:
            print(f'  ✗ Error: {e}')
            errors += 1

        time.sleep(1.5)  # be respectful to Pixnet

    print(f'\n完成：{ok} 成功，{errors} 失敗')


if __name__ == '__main__':
    main()
