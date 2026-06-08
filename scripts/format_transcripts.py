#!/usr/bin/env python3
"""
批次整理 YouTube 逐字稿，將 ## 影片逐字稿 的內容排版成正式文章。
用法: python3 scripts/format_transcripts.py
"""

import os
import re
import subprocess
import sys
import json
import time
from pathlib import Path

BLOG_DIR = Path(__file__).parent.parent / "src/content/blog"
PROGRESS_FILE = Path(__file__).parent / "format_progress.json"

PROMPT = """你是一位台灣繁體中文部落格編輯。
請將以下 YouTube 影片的原始逐字稿，整理成排版清楚的繁體中文部落格文章內文。

規則：
1. 移除重複的語句和口頭禪（如：「然後然後」、「就是就是」、「你覺得呢」重複多次等）
2. 依內容分段，加上合適的 ## 標題（例如：## 產品介紹、## 實測心得、## 住宿評價）
3. 保留所有重要資訊：價格、地點、特色、心得
4. 用清晰流暢的繁體中文改寫，語氣輕鬆自然
5. 如有具體數字（價格、尺寸、時間）請保留
6. 只輸出整理後的文章內文，不要加任何說明或前言
7. 不要輸出 frontmatter（---）
"""

def load_progress():
    if PROGRESS_FILE.exists():
        return json.loads(PROGRESS_FILE.read_text())
    return {"done": [], "failed": []}

def save_progress(progress):
    PROGRESS_FILE.write_text(json.dumps(progress, ensure_ascii=False, indent=2))

def get_transcript_files():
    files = []
    for f in sorted(BLOG_DIR.glob("*.md")):
        content = f.read_text(encoding="utf-8")
        if "## 影片逐字稿" in content:
            files.append(f)
    return files

def format_transcript(title, transcript):
    input_text = f"文章標題：{title}\n\n逐字稿內容：\n{transcript}"
    result = subprocess.run(
        ["claude", "-p", PROMPT],
        input=input_text,
        capture_output=True,
        text=True,
        timeout=120
    )
    if result.returncode != 0:
        raise RuntimeError(f"claude CLI error: {result.stderr}")
    return result.stdout.strip()

def process_file(filepath):
    content = filepath.read_text(encoding="utf-8")

    # Split frontmatter from body
    parts = content.split("---", 2)
    if len(parts) < 3:
        raise ValueError("Invalid frontmatter format")
    frontmatter = "---" + parts[1] + "---"
    body = parts[2].strip()

    # Extract title from frontmatter
    title_match = re.search(r"title:\s*['\"]?(.+?)['\"]?\s*$", parts[1], re.MULTILINE)
    title = title_match.group(1) if title_match else filepath.stem

    # Find transcript section
    transcript_match = re.search(r"## 影片逐字稿\s*\n([\s\S]*?)$", body)
    if not transcript_match:
        raise ValueError("No transcript section found")

    transcript = transcript_match.group(1).strip()
    if len(transcript) < 50:
        raise ValueError("Transcript too short, skipping")

    # Format transcript
    formatted = format_transcript(title, transcript)

    # Replace the transcript section with formatted content
    pre_transcript = body[:transcript_match.start()].strip()
    if pre_transcript:
        new_body = pre_transcript + "\n\n" + formatted
    else:
        new_body = formatted

    # Write back
    filepath.write_text(frontmatter + "\n\n" + new_body + "\n", encoding="utf-8")
    return True

def main():
    progress = load_progress()
    files = get_transcript_files()
    total = len(files)

    print(f"找到 {total} 篇需要排版的文章")
    print(f"已完成: {len(progress['done'])}，失敗: {len(progress['failed'])}")
    print()

    pending = [f for f in files if str(f) not in progress["done"]]
    print(f"待處理: {len(pending)} 篇\n")

    for i, filepath in enumerate(pending, 1):
        name = filepath.name
        print(f"[{i}/{len(pending)}] 處理: {name} ...", end=" ", flush=True)
        try:
            process_file(filepath)
            progress["done"].append(str(filepath))
            save_progress(progress)
            print("✓")
            time.sleep(2)
        except Exception as e:
            progress["failed"].append({"file": str(filepath), "error": str(e)})
            save_progress(progress)
            print(f"✗ {e}")
            time.sleep(5)

    print(f"\n完成！成功: {len(progress['done'])}，失敗: {len(progress['failed'])}")
    if progress["failed"]:
        print("\n失敗的文章：")
        for f in progress["failed"]:
            print(f"  {Path(f['file']).name}: {f['error']}")

if __name__ == "__main__":
    main()
