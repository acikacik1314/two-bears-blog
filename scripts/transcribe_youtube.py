#!/usr/bin/env python3
"""
Batch transcribe YouTube videos and update blog post markdown files.
Usage: python3 transcribe_youtube.py [--start N] [--limit N] [--video-id ID]
"""
import os
import re
import sys
import json
import argparse
import subprocess
import tempfile
import time

BLOG_DIR = os.path.expanduser("~/Documents/two-bears-blog/src/content/blog")
VIDEO_LIST = "/tmp/yt-video-list.txt"
AUDIO_DIR = "/tmp/yt-audio"
LOG_FILE = "/tmp/transcribe-progress.log"

# Minimum content length to consider a post already transcribed
STUB_MAX_LEN = 300


def log(msg):
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")


def read_video_list():
    videos = []
    with open(VIDEO_LIST) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split(" ||| ")
            if len(parts) >= 3:
                videos.append({"id": parts[0], "duration": parts[1], "title": parts[2]})
    return videos


def get_md_path(video_id):
    return os.path.join(BLOG_DIR, f"yt-{video_id}.md")


def already_transcribed(video_id):
    path = get_md_path(video_id)
    if not os.path.exists(path):
        return False
    with open(path) as f:
        content = f.read()
    # Strip frontmatter
    if content.startswith("---"):
        end = content.find("---", 3)
        if end != -1:
            body = content[end + 3:].strip()
            return len(body) > STUB_MAX_LEN
    return len(content) > STUB_MAX_LEN


def download_audio(video_id, output_path):
    url = f"https://www.youtube.com/watch?v={video_id}"
    cmd = [
        "yt-dlp",
        "-x", "--audio-format", "mp3",
        "--audio-quality", "5",
        "--no-playlist",
        "-o", output_path,
        url
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        raise RuntimeError(f"yt-dlp failed: {result.stderr[-500:]}")
    return output_path


def transcribe_audio(audio_path):
    import whisper
    model = whisper.load_model("medium")
    result = model.transcribe(audio_path, language="zh", fp16=False)
    return result["text"]


def format_transcript(raw_text):
    # Add paragraph breaks every ~200 characters at sentence boundaries
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


def update_md_file(video_id, transcript_text):
    path = get_md_path(video_id)
    with open(path) as f:
        content = f.read()

    # Find end of frontmatter
    if content.startswith("---"):
        end = content.find("---", 3)
        if end != -1:
            frontmatter = content[:end + 3]
            new_content = frontmatter + "\n\n## 影片逐字稿\n\n" + format_transcript(transcript_text) + "\n"
            with open(path, "w") as f:
                f.write(new_content)
            return True
    return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", type=int, default=0, help="Start index (0-based)")
    parser.add_argument("--limit", type=int, default=None, help="Max videos to process")
    parser.add_argument("--video-id", help="Process single video ID")
    parser.add_argument("--skip-download", action="store_true", help="Skip download, use existing audio")
    args = parser.parse_args()

    os.makedirs(AUDIO_DIR, exist_ok=True)

    if args.video_id:
        videos = [{"id": args.video_id, "duration": "?", "title": "?"}]
    else:
        videos = read_video_list()
        videos = videos[args.start:]
        if args.limit:
            videos = videos[:args.limit]

    log(f"Processing {len(videos)} videos")

    # Load whisper model once
    import whisper
    log("Loading Whisper medium model...")
    model = whisper.load_model("medium")
    log("Model loaded.")

    success = 0
    skipped = 0
    errors = 0

    for i, video in enumerate(videos):
        vid = video["id"]
        title = video["title"]
        log(f"[{i+1}/{len(videos)}] {vid}: {title[:50]}")

        if already_transcribed(vid):
            log(f"  → already transcribed, skipping")
            skipped += 1
            continue

        audio_path = os.path.join(AUDIO_DIR, f"{vid}.mp3")

        # Download
        if not args.skip_download and not os.path.exists(audio_path):
            try:
                log(f"  → downloading audio...")
                download_audio(vid, audio_path)
                log(f"  → downloaded: {os.path.getsize(audio_path) // 1024}KB")
            except Exception as e:
                log(f"  → DOWNLOAD ERROR: {e}")
                errors += 1
                continue
        elif os.path.exists(audio_path):
            log(f"  → using cached audio ({os.path.getsize(audio_path) // 1024}KB)")

        # Transcribe
        try:
            log(f"  → transcribing...")
            t0 = time.time()
            result = model.transcribe(audio_path, language="zh", fp16=False)
            elapsed = time.time() - t0
            text = result["text"]
            log(f"  → transcribed {len(text)} chars in {elapsed:.0f}s")
        except Exception as e:
            log(f"  → TRANSCRIBE ERROR: {e}")
            errors += 1
            continue

        # Update markdown
        if update_md_file(vid, text):
            log(f"  → updated {vid}.md")
            success += 1
        else:
            log(f"  → ERROR: could not update markdown file")
            errors += 1

        # Clean up audio to save disk space
        try:
            os.remove(audio_path)
        except Exception:
            pass

    log(f"\nDone: {success} transcribed, {skipped} skipped, {errors} errors")


if __name__ == "__main__":
    main()
