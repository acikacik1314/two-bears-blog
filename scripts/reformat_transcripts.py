#!/usr/bin/env python3
"""
Use Gemini API to reformat raw YouTube transcripts into proper blog posts.
Rotates through multiple API keys to avoid rate limits.
Usage: python3 reformat_transcripts.py [--limit N]
"""
import re, sys, time, json, urllib.request
from pathlib import Path

BLOG_DIR = Path(__file__).parent.parent / 'src' / 'content' / 'blog'

API_KEYS = [
    "AIzaSyA4kf23sC8fU4NbMt_gPPJrCx4vatd-plE",
    "AIzaSyACbLPdU-tcqPXArPyFiAkmb_OqgpNlnrY",
    "AIzaSyA_dMT2r3Kvg2rzvecveLFK2A81WfMNaME",
    "AIzaSyAnHD-WWcl9b5JmczM28tJCMNOIH3U66YE",
    "AIzaSyAsAL9RncwG5I_ahk0m2nVsXi1VUXJZerk",
    "AIzaSyAsVbdJNKVgzXX1vWUUYLMiZPkgA_Ft8eQ",
    "AIzaSyBXESjdtBM1vCEnjc0pyT9mtHMqhr6wx4o",
    "AIzaSyCAfi2Wxo8cNZ7nFUgrxunKEbUfi6Q_jP0",
    "AIzaSyCX9zUpitoRBDQfhr0pmB91BZi5z7MnqHo",
    "AIzaSyDFJ0ppzqabkuS1OkyTz3yq8kZcP-TB4JQ",
    "AIzaSyDUHeggkHddrdb2S1NIW92s5_lNtCe-tEc",
]

key_index = 0

PROMPT = """你是一位專業的中文部落格編輯。以下是一段 YouTube 影片的語音逐字稿，請將它整理成一篇完整、易讀的繁體中文部落格文章。

要求：
1. 加上適當的段落標題（## 格式）
2. 加上正確的中文標點符號（。，！？、：「」）
3. 整理口語化表達，改為流暢的書面語
4. 保留所有重要資訊，不要刪減內容
5. 只輸出整理好的文章內容，不要加任何說明或前言
6. 不要輸出 frontmatter 或 markdown code block

逐字稿內容：
{transcript}"""


def call_gemini(text, key):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={key}"
    body = json.dumps({
        "contents": [{"parts": [{"text": PROMPT.format(transcript=text[:15000])}]}],
        "generationConfig": {"temperature": 0.3, "maxOutputTokens": 8192}
    }).encode()
    req = urllib.request.Request(url, data=body, method='POST',
                                  headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r:
        result = json.loads(r.read())
    return result['candidates'][0]['content']['parts'][0]['text']


def next_key():
    global key_index
    key = API_KEYS[key_index % len(API_KEYS)]
    key_index += 1
    return key


def get_frontmatter(text):
    if text.startswith('---'):
        end = text.find('---', 3)
        if end != -1:
            return text[:end + 3], text[end + 3:].strip()
    return None, text


def has_transcript(text):
    body = get_frontmatter(text)[1]
    return len(body) > 300


def is_already_formatted(text):
    body = get_frontmatter(text)[1]
    # If body has multiple ## headings, it's already formatted
    return body.count('\n## ') >= 2


def main():
    limit = None
    for i, arg in enumerate(sys.argv):
        if arg == '--limit' and i + 1 < len(sys.argv):
            limit = int(sys.argv[i + 1])

    files = sorted(BLOG_DIR.glob('yt-*.md'))
    to_process = []
    for f in files:
        text = f.read_text(encoding='utf-8')
        if has_transcript(text) and not is_already_formatted(text):
            to_process.append(f)

    if limit:
        to_process = to_process[:limit]

    print(f'Files to reformat: {len(to_process)}\n')

    ok = errors = skipped = 0

    for i, fpath in enumerate(to_process):
        text = fpath.read_text(encoding='utf-8')
        fm, body = get_frontmatter(text)
        title_m = re.search(r"title:\s*'(.+)'", text)
        title = title_m.group(1) if title_m else fpath.name

        print(f'[{i+1}/{len(to_process)}] {title[:50]}')

        retries = 0
        result = None
        while retries < len(API_KEYS):
            key = next_key()
            try:
                result = call_gemini(body, key)
                break
            except urllib.error.HTTPError as e:
                err = e.read().decode()
                if '429' in str(e.code) or 'quota' in err.lower():
                    print(f'  Rate limit on key {key[-8:]}, trying next...')
                    retries += 1
                    time.sleep(1)
                else:
                    print(f'  API error: {e.code} {err[:100]}')
                    errors += 1
                    break
            except Exception as e:
                print(f'  Error: {e}')
                errors += 1
                break

        if result:
            new_content = fm + '\n\n' + result.strip() + '\n'
            fpath.write_text(new_content, encoding='utf-8')
            print(f'  ✓ Done')
            ok += 1
        else:
            print(f'  ✗ Failed')
            errors += 1

        time.sleep(2)

    print(f'\n完成：{ok} 成功，{errors} 失敗，{skipped} 跳過')


if __name__ == '__main__':
    main()
