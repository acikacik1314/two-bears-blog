#!/usr/bin/env python3
"""
Batch update Rumble articles with Chinese titles from oEmbed API.
Also sets category based on title keywords.
"""
import os
import re
import json
import time
import urllib.request
import urllib.parse
from pathlib import Path

BLOG_DIR = Path(__file__).parent.parent / 'src' / 'content' / 'blog'

PROPHECY_KEYWORDS = ['預言', '比格斯', '末日', '台海', '三戰', '諾查丹瑪斯', '帕克', '鄭博見',
                     '巴夏', '薩洛梅', '靈媒', '異象', '警告', '啟示', '末世', '天啟',
                     'Biggs', 'Parker', 'Bashar', '赤色黎明', '靈性', '預警', '遙視',
                     '摩普萊', '未來人', '外星', '靈童', '竜樹', '凱西', '歐米娜', '阿米',
                     '遙視員', '預測', '時間機器', '倒數', '大劫', '危機', '崩盤',
                     '天災', '地震', '海嘯', '黑暗', '覺醒', '靈魂', '宇宙', '頻率',
                     '量子', '意識', '高我', '升維', '奇點', '洗牌', '重塑', '推背圖',
                     'KFK', '竜樹諒', '朵洛莉絲', 'Titor', '馬杜洛']

TRAVEL_KEYWORDS = ['旅遊', '旅行', '景點', '飯店', '住宿', '美食', '打卡', '攻略',
                   '自由行', '機票', '訂房', '觀光', '遊記', '直航', '渡輪', '石垣']

def get_oembed_title(rumble_url):
    api_url = f'https://rumble.com/api/Media/oembed.json?url={urllib.parse.quote(rumble_url)}'
    req = urllib.request.Request(api_url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        data = json.loads(urllib.request.urlopen(req, timeout=10).read())
        return data.get('title', ''), data.get('description', '')
    except Exception as e:
        print(f'  Error fetching oEmbed: {e}')
        return '', ''

def extract_chinese_title(full_title):
    """Extract Chinese part from 'English | Chinese' or return full title if already Chinese."""
    if '|' in full_title:
        parts = full_title.split('|')
        # Return the part that has Chinese characters
        for part in reversed(parts):
            part = part.strip()
            if any('一' <= c <= '鿿' for c in part):
                return part
    return full_title.strip()

def guess_category(title):
    title_lower = title.lower()
    if any(k in title for k in TRAVEL_KEYWORDS):
        return '旅遊'
    if any(k in title for k in PROPHECY_KEYWORDS) or any(k.lower() in title_lower for k in PROPHECY_KEYWORDS):
        return '預言'
    return '影片'

def read_frontmatter(content):
    """Parse YAML frontmatter, return (frontmatter_dict, body)."""
    if not content.startswith('---'):
        return {}, content
    end = content.find('\n---', 3)
    if end == -1:
        return {}, content
    fm_text = content[4:end]
    body = content[end+4:].lstrip('\n')
    return fm_text, body

def update_file(filepath):
    text = filepath.read_text(encoding='utf-8')

    # Extract rumblePage
    m = re.search(r"rumblePage:\s*'([^']+)'", text)
    if not m:
        print(f'  No rumblePage found, skipping')
        return False

    rumble_url = m.group(1)
    print(f'  Fetching: {rumble_url}')

    full_title, oembed_desc = get_oembed_title(rumble_url)
    if not full_title:
        print(f'  No title returned')
        return False

    zh_title = extract_chinese_title(full_title)
    if not zh_title:
        zh_title = full_title

    category = guess_category(zh_title)

    # Escape single quotes for YAML
    safe_title = zh_title.replace("'", "''")

    # Generate description from title
    desc = f'【兩隻熊】{zh_title}'[:100]
    safe_desc = desc.replace("'", "''")

    # Update title
    text = re.sub(r"title:.*", f"title: '{safe_title}'", text, count=1)
    # Update description
    text = re.sub(r"description:.*", f"description: '{safe_desc}'", text, count=1)
    # Update or add category
    if re.search(r"^category:", text, re.MULTILINE):
        text = re.sub(r"^category:.*", f"category: '{category}'", text, flags=re.MULTILINE, count=1)
    else:
        text = re.sub(r"(rumbleId:)", f"category: '{category}'\n\\1", text, count=1)

    filepath.write_text(text, encoding='utf-8')
    print(f'  → {zh_title[:50]} [{category}]')
    return True

def main():
    files = sorted(BLOG_DIR.glob('rumble-*.md'))
    print(f'Found {len(files)} Rumble articles\n')

    updated = 0
    for i, f in enumerate(files):
        print(f'[{i+1}/{len(files)}] {f.name}')
        if update_file(f):
            updated += 1
        time.sleep(0.3)  # be polite to API

    print(f'\nDone. Updated {updated}/{len(files)} files.')

if __name__ == '__main__':
    main()
