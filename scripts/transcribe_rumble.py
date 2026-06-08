#!/usr/bin/env python3
"""
Transcribe local Rumble video files and update corresponding blog articles.
Usage: python3 transcribe_rumble.py [video_folder] [--dry-run]
"""
import re
import sys
from pathlib import Path
from difflib import SequenceMatcher

BLOG_DIR = Path(__file__).parent.parent / 'src' / 'content' / 'blog'
VIDEO_DIR = Path('/Volumes/Install macOS Sequoia/未來人預言家封存')
TRANSCRIPT_DIR = Path('/tmp/rumble_transcripts')

def similarity(a, b):
    return SequenceMatcher(None, a, b).ratio()

def clean_title(s):
    """Strip punctuation/brackets for fuzzy matching."""
    s = re.sub(r'[【】！？…「」『』〔〕、，。：\[\]!?,.:;\'\"()（）]', '', s)
    s = re.sub(r'\s+', '', s)
    return s.lower()

def load_rumble_articles():
    articles = {}
    for f in BLOG_DIR.glob('rumble-*.md'):
        text = f.read_text(encoding='utf-8')
        m = re.search(r"^title:\s*'(.+)'", text, re.MULTILINE)
        if m:
            articles[f] = m.group(1)
    return articles

# Manual overrides: video date prefix → rumble article filename
MANUAL_MAP = {
    '20260310': 'rumble-v79ay7w.md',
}

def find_matching_article(video_title, articles):
    """Find best matching Rumble article for a video title."""
    # Check manual overrides first
    date_prefix = video_title[:8]
    if date_prefix in MANUAL_MAP:
        override = MANUAL_MAP[date_prefix]
        for fpath in articles:
            if fpath.name == override:
                return fpath, 1.0

    # Strip date prefix from video title
    video_clean = clean_title(re.sub(r'^\d{8}_', '', video_title))

    best_score = 0
    best_file = None
    for fpath, article_title in articles.items():
        score = similarity(video_clean, clean_title(article_title))
        if score > best_score:
            best_score = score
            best_file = fpath

    return best_file, best_score

def transcribe_video(video_path, output_dir):
    """Run mlx-whisper on video using Apple Silicon Metal GPU."""
    import mlx_whisper
    output_dir.mkdir(parents=True, exist_ok=True)
    stem = video_path.stem[:50]
    txt_file = output_dir / (stem + '.txt')

    if txt_file.exists():
        print(f'  (cached)')
        return txt_file.read_text(encoding='utf-8')

    print(f'  Running mlx-whisper (medium)...')
    result = mlx_whisper.transcribe(
        str(video_path),
        path_or_hf_repo='mlx-community/whisper-medium-mlx',
        language='zh'
    )

    lines = [s['text'].strip() for s in result.get('segments', [])]
    transcript = '\n'.join(lines)
    txt_file.write_text(transcript, encoding='utf-8')
    return transcript

def update_article(md_path, transcript):
    """Add transcript to article body."""
    text = md_path.read_text(encoding='utf-8')

    # Check if transcript already added
    if '## 影片逐字稿' in text or '## 逐字稿' in text:
        print(f'  Already has transcript, skipping')
        return False

    transcript = transcript.strip()
    section = f'\n\n## 影片逐字稿\n\n{transcript}\n'

    text = text.rstrip() + section
    md_path.write_text(text, encoding='utf-8')
    return True

def main():
    dry_run = '--dry-run' in sys.argv

    if not VIDEO_DIR.exists():
        print(f'Video folder not found: {VIDEO_DIR}')
        sys.exit(1)

    videos = sorted(VIDEO_DIR.glob('*.mp4'))
    print(f'Found {len(videos)} videos')

    articles = load_rumble_articles()
    print(f'Found {len(articles)} Rumble articles\n')

    for video in videos:
        title = video.stem
        print(f'\n[{title[:60]}]')

        best_file, score = find_matching_article(title, articles)
        if score < 0.3:
            print(f'  No match found (best score: {score:.2f})')
            continue

        print(f'  → {best_file.name} (score: {score:.2f})')

        if dry_run:
            continue

        transcript = transcribe_video(video, TRANSCRIPT_DIR)
        if not transcript:
            print(f'  Transcription failed')
            continue

        if update_article(best_file, transcript):
            print(f'  ✓ Updated {best_file.name}')
        else:
            print(f'  Skipped (already has transcript)')

if __name__ == '__main__':
    main()
