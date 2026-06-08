#!/usr/bin/env python3
"""
One-command YouTube sync for @twobears channel.
- Fetches all videos from channel
- Creates new blog post for each new video
- Transcribes audio using local mlx_whisper
- Commits and pushes to deploy

Usage:
  python3 scripts/sync-youtube.py              # sync all new videos
  python3 scripts/sync-youtube.py --no-push    # sync but don't git push
  python3 scripts/sync-youtube.py --limit 5    # only process 5 new videos
  python3 scripts/sync-youtube.py --transcribe-only  # only transcribe existing stubs
"""
import os
import re
import sys
import json
import argparse
import subprocess
import time
import tempfile
from datetime import datetime

CHANNEL = "https://www.youtube.com/@twobears"
BLOG_DIR = os.path.expanduser("~/Documents/two-bears-blog/src/content/blog")
AUDIO_DIR = "/tmp/yt-audio"
STUB_MAX_LEN = 300  # body shorter than this = needs transcription


# ─── helpers ──────────────────────────────────────────────────────────────────

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def slug_for(video_id):
    return os.path.join(BLOG_DIR, f"yt-{video_id}.md")


def needs_transcription(video_id):
    path = slug_for(video_id)
    if not os.path.exists(path):
        return True
    with open(path) as f:
        content = f.read()
    if content.startswith("---"):
        end = content.find("---", 3)
        body = content[end + 3:].strip() if end != -1 else ""
        return len(body) < STUB_MAX_LEN
    return len(content) < STUB_MAX_LEN


def guess_tags(title):
    title_lower = title.lower()
    tags = []
    if any(w in title for w in ['預言', '比格斯', '帕克', '末日', '戰爭', '未來人']):
        tags.append('預言')
    if any(w in title for w in ['飯店', '酒店', '旅館', 'hotel', 'resort', '住宿']):
        tags.append('飯店')
    if any(w in title for w in ['旅遊', '旅行', '出遊', '景點', '台灣', '日本', '泰國', '曼谷', '沖繩']):
        tags.append('旅遊')
    if any(w in title for w in ['美食', '吃', '餐廳', '料理', '食記']):
        tags.append('美食')
    if any(w in title for w in ['開箱', '評測', '推薦', '測試', '購物']):
        tags.append('開箱')
    if any(w in title_lower for w in ['shorts', 'short', '#shorts']):
        tags.append('短片')
    return tags or ['影片']


def make_frontmatter(video_id, title, upload_date, tags):
    # Parse date from YYYYMMDD format
    if upload_date and upload_date != 'NA' and len(upload_date) == 8:
        d = f"{upload_date[:4]}-{upload_date[4:6]}-{upload_date[6:8]}"
    else:
        d = datetime.now().strftime('%Y-%m-%d')

    # Escape single quotes in title
    title_escaped = title.replace("'", "&#39;")
    description = f"兩隻熊影片：{title_escaped[:80]}"

    tag_str = ", ".join(f"'{t}'" for t in tags)
    return f"""---
title: '{title_escaped}'
description: '{description}'
pubDate: '{d}'
tags: [{tag_str}]
youtubeId: '{video_id}'
---"""


def format_transcript(raw_text):
    sentences = re.split(r'([。！？])', raw_text)
    paragraphs = []
    current = ""
    for i in range(0, len(sentences) - 1, 2):
        s = sentences[i] + (sentences[i + 1] if i + 1 < len(sentences) else "")
        current += s
        if len(current) >= 200:
            paragraphs.append(current.strip())
            current = ""
    if current.strip():
        paragraphs.append(current.strip())
    return "\n\n".join(paragraphs) if paragraphs else raw_text.strip()


# ─── channel fetch ─────────────────────────────────────────────────────────────

def fetch_channel_videos(limit=None):
    log(f"Fetching video list from {CHANNEL}...")
    cmd = [
        "yt-dlp",
        "--flat-playlist",
        "--print", "%(id)s ||| %(duration_string)s ||| %(title)s ||| %(upload_date)s",
        CHANNEL,
    ]
    if limit:
        cmd += ["--playlist-end", str(limit)]

    result = run(cmd, timeout=120)
    if result.returncode != 0:
        log(f"ERROR fetching channel: {result.stderr[-300:]}")
        return []

    videos = []
    for line in result.stdout.strip().splitlines():
        parts = line.split(" ||| ")
        if len(parts) >= 3:
            videos.append({
                "id": parts[0].strip(),
                "duration": parts[1].strip() if len(parts) > 1 else "?",
                "title": parts[2].strip() if len(parts) > 2 else "Unknown",
                "date": parts[3].strip() if len(parts) > 3 else "NA",
            })
    log(f"Found {len(videos)} videos on channel")
    return videos


# ─── create stub ───────────────────────────────────────────────────────────────

def create_stub(video):
    vid = video["id"]
    path = slug_for(vid)
    if os.path.exists(path):
        return False  # already exists

    tags = guess_tags(video["title"])
    fm = make_frontmatter(vid, video["title"], video["date"], tags)
    with open(path, "w") as f:
        f.write(fm + "\n\n")

    log(f"  Created stub: yt-{vid}.md")
    return True


# ─── download + transcribe ─────────────────────────────────────────────────────

def download_audio(video_id):
    audio_path = os.path.join(AUDIO_DIR, f"{video_id}.mp3")
    if os.path.exists(audio_path):
        log(f"  Using cached audio ({os.path.getsize(audio_path) // 1024}KB)")
        return audio_path

    url = f"https://www.youtube.com/watch?v={video_id}"
    cmd = [
        "yt-dlp", "-x", "--audio-format", "mp3",
        "--audio-quality", "5", "--no-playlist",
        "-o", audio_path, url
    ]
    log(f"  Downloading audio...")
    result = run(cmd, timeout=300)
    if result.returncode != 0:
        raise RuntimeError(result.stderr[-400:])
    log(f"  Downloaded: {os.path.getsize(audio_path) // 1024}KB")
    return audio_path


def transcribe(audio_path):
    import mlx_whisper
    log(f"  Transcribing with mlx_whisper...")
    t0 = time.time()
    result = mlx_whisper.transcribe(
        audio_path,
        path_or_hf_repo='mlx-community/whisper-medium-mlx',
        language='zh'
    )
    text = ' '.join(s['text'] for s in result.get('segments', []))
    log(f"  Done: {len(text)} chars in {time.time()-t0:.0f}s")
    return text


def write_transcript(video_id, raw_text):
    path = slug_for(video_id)
    with open(path) as f:
        content = f.read()
    if content.startswith("---"):
        end = content.find("---", 3)
        if end != -1:
            fm = content[:end + 3]
            transcript_md = format_transcript(raw_text)
            with open(path, "w") as f:
                f.write(fm + "\n\n## 影片逐字稿\n\n" + transcript_md + "\n")
            return True
    return False


# ─── git ───────────────────────────────────────────────────────────────────────

def git_commit_push(new_ids):
    if not new_ids:
        return
    repo = os.path.expanduser("~/Documents/two-bears-blog")
    log(f"\nCommitting {len(new_ids)} new/updated files...")
    files = [f"src/content/blog/yt-{vid}.md" for vid in new_ids]
    run(["git", "-C", repo, "add"] + files)
    msg = f"Sync YouTube: add/update {len(new_ids)} video posts\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
    run(["git", "-C", repo, "commit", "-m", msg])
    result = run(["git", "-C", repo, "push"])
    if result.returncode == 0:
        log("Pushed to GitHub ✓ — Vercel will deploy automatically")
    else:
        log(f"Push failed: {result.stderr}")


# ─── main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Sync @twobears YouTube videos to blog")
    parser.add_argument("--limit", type=int, help="Max videos to fetch from channel")
    parser.add_argument("--no-transcribe", action="store_true", help="Create stubs only, skip transcription")
    parser.add_argument("--transcribe-only", action="store_true", help="Transcribe existing stubs, skip fetch")
    parser.add_argument("--no-push", action="store_true", help="Don't git push at the end")
    parser.add_argument("--video-id", help="Process a single video ID")
    args = parser.parse_args()

    os.makedirs(AUDIO_DIR, exist_ok=True)

    # Get video list
    if args.video_id:
        videos = [{"id": args.video_id, "duration": "?", "title": "?", "date": "NA"}]
    elif args.transcribe_only:
        # Find existing stubs that need transcription
        all_md = [f for f in os.listdir(BLOG_DIR) if f.startswith("yt-") and f.endswith(".md")]
        videos = [{"id": f[3:-3], "duration": "?", "title": "?", "date": "NA"} for f in all_md]
    else:
        videos = fetch_channel_videos(limit=args.limit)

    new_stubs = 0
    transcribed = 0
    errors = 0
    changed_ids = []

    for i, video in enumerate(videos):
        vid = video["id"]
        log(f"\n[{i+1}/{len(videos)}] {vid}: {video['title'][:60]}")

        # Create stub if new
        if not args.transcribe_only:
            created = create_stub(video)
            if created:
                new_stubs += 1
                changed_ids.append(vid)

        # Transcribe if needed
        if not args.no_transcribe and needs_transcription(vid):
            try:
                audio = download_audio(vid)
                text = transcribe(audio)
                if write_transcript(vid, text):
                    log(f"  Transcribed ✓")
                    transcribed += 1
                    if vid not in changed_ids:
                        changed_ids.append(vid)
                # Clean up audio
                try:
                    os.remove(audio)
                except Exception:
                    pass
            except Exception as e:
                log(f"  ERROR: {e}")
                errors += 1
        else:
            log(f"  Already transcribed, skipping")

    log(f"\n{'─'*40}")
    log(f"New posts: {new_stubs} | Transcribed: {transcribed} | Errors: {errors}")

    if changed_ids and not args.no_push:
        git_commit_push(changed_ids)
    elif changed_ids:
        log(f"Changes ready (--no-push). Run: git add + commit manually.")
    else:
        log("No changes.")


if __name__ == "__main__":
    main()
