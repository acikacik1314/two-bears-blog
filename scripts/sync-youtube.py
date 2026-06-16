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


def title_to_slug(title, video_id, upload_date="NA"):
    """Generate SEO-friendly slug from video title English keywords + year."""
    year = ""
    if upload_date and len(upload_date) == 8 and upload_date.isdigit():
        year = upload_date[:4]

    # Extract English words from mixed Chinese-English titles
    stopwords = {'a', 'an', 'the', 'in', 'on', 'at', 'to', 'of', 'for', 'by',
                 'is', 'it', 'and', 'or', 'vs', 'ep', 'ft'}
    letter_words = re.findall(r'[a-zA-Z][a-zA-Z0-9]*', title)
    words = [w.lower() for w in letter_words if w.lower() not in stopwords and len(w) >= 2]

    if not words:
        # Pure Chinese title (no English keywords) — fall back to yt-{video_id}
        return f"yt-{video_id}"

    if year and year not in words:
        words = [year] + words

    slug = '-'.join(words)
    if len(slug) > 70:
        slug = slug[:70].rsplit('-', 1)[0]
    return slug


def find_existing_path(video_id):
    """Find existing post file for this video (supports both old yt- and new keyword slugs)."""
    old = os.path.join(BLOG_DIR, f"yt-{video_id}.md")
    if os.path.exists(old):
        return old
    for fn in os.listdir(BLOG_DIR):
        if not fn.endswith('.md'):
            continue
        fp = os.path.join(BLOG_DIR, fn)
        try:
            with open(fp) as f:
                if f"youtubeId: '{video_id}'" in f.read(800):
                    return fp
        except Exception:
            pass
    return None


def new_post_path(video_id, title, upload_date):
    """Generate file path for a new post, handling slug collisions."""
    slug = title_to_slug(title, video_id, upload_date)
    base = os.path.join(BLOG_DIR, f"{slug}.md")
    if os.path.exists(base):
        # Collision with a different video — append short video_id suffix
        try:
            with open(base) as f:
                if f"youtubeId: '{video_id}'" in f.read(800):
                    return base  # same video, same path — fine
        except Exception:
            pass
        return os.path.join(BLOG_DIR, f"{slug}-{video_id[:6].lower()}.md")
    return base


def needs_transcription(video_id):
    path = find_existing_path(video_id)
    if not path:
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
    if find_existing_path(vid):
        return False  # already exists

    path = new_post_path(vid, video["title"], video["date"])
    tags = guess_tags(video["title"])
    fm = make_frontmatter(vid, video["title"], video["date"], tags)
    with open(path, "w") as f:
        f.write(fm + "\n\n")

    log(f"  Created stub: {os.path.basename(path)}")
    return path


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
    path = find_existing_path(video_id)
    if not path:
        return False
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

def git_commit_push(changed_paths):
    if not changed_paths:
        return
    repo = os.path.expanduser("~/Documents/two-bears-blog")
    log(f"\nCommitting {len(changed_paths)} new/updated files...")
    # Convert absolute paths to repo-relative paths
    rel_files = [os.path.relpath(p, repo) for p in changed_paths]
    run(["git", "-C", repo, "add"] + rel_files)
    msg = f"Sync YouTube: add/update {len(changed_paths)} video posts\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
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
        # Find existing stubs that need transcription (both yt- and keyword-slug posts)
        all_md = [f for f in os.listdir(BLOG_DIR) if f.endswith(".md")]
        videos = []
        for fn in all_md:
            fp = os.path.join(BLOG_DIR, fn)
            try:
                with open(fp) as f:
                    content = f.read(500)
                m = re.search(r"youtubeId:\s*'([^']+)'", content)
                if m:
                    videos.append({"id": m.group(1), "duration": "?", "title": "?", "date": "NA"})
            except Exception:
                pass
    else:
        videos = fetch_channel_videos(limit=args.limit)

    new_stubs = 0
    transcribed = 0
    errors = 0
    changed_paths = []

    for i, video in enumerate(videos):
        vid = video["id"]
        log(f"\n[{i+1}/{len(videos)}] {vid}: {video['title'][:60]}")

        # Create stub if new
        if not args.transcribe_only:
            result_path = create_stub(video)
            if result_path:
                new_stubs += 1
                changed_paths.append(result_path)

        # Transcribe if needed
        if not args.no_transcribe and needs_transcription(vid):
            try:
                audio = download_audio(vid)
                text = transcribe(audio)
                post_path = find_existing_path(vid)
                if post_path and write_transcript(vid, text):
                    log(f"  Transcribed ✓")
                    transcribed += 1
                    if post_path not in changed_paths:
                        changed_paths.append(post_path)
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

    if changed_paths and not args.no_push:
        git_commit_push(changed_paths)
    elif changed_paths:
        log(f"Changes ready (--no-push). Run: git add + commit manually.")
    else:
        log("No changes.")


if __name__ == "__main__":
    main()
