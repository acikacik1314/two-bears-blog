#!/usr/bin/env python3
"""
Download Pixnet images and push to GitHub repos in batches.
Each repo holds ~300 images (~600MB). Resumes from where it left off.

Usage: python3 migrate_images_to_github.py
       python3 migrate_images_to_github.py --update-urls  (after all images uploaded)
"""
import re
import sys
import json
import time
import shutil
import subprocess
import urllib.request
from pathlib import Path

GITHUB_TOKEN = ""  # set via GITHUB_TOKEN env var or paste here before running
GITHUB_USER  = "acikacik1314"
REPO_PREFIX  = "twobears-img"
BATCH_SIZE   = 50
BLOG_DIR     = Path(__file__).parent.parent / 'src' / 'content' / 'blog'
WORK_DIR     = Path('/tmp/img_migration')
MAP_FILE     = Path(__file__).parent / 'image_url_map.json'

def github_api(method, path, data=None):
    url = f"https://api.github.com{path}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method=method, headers={
        'Authorization': f'token {GITHUB_TOKEN}',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'twobears-migration',
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return json.loads(e.read())

def repo_exists(name):
    r = github_api('GET', f'/repos/{GITHUB_USER}/{name}')
    return 'id' in r

def create_repo(name):
    r = github_api('POST', '/user/repos', {
        'name': name,
        'private': False,
        'auto_init': True,
        'description': 'Two Bears blog images backup'
    })
    return 'id' in r

def get_all_image_urls():
    urls = []
    seen = set()
    for f in sorted(BLOG_DIR.glob('*.md')):
        text = f.read_text(encoding='utf-8')
        for url in re.findall(r'https://pic\.pimg\.tw/[^\)\"\'\s]+', text):
            if url not in seen:
                seen.add(url)
                urls.append(url)
    return urls

def download_image(url, dest):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            dest.write_bytes(r.read())
        return True
    except Exception as e:
        print(f'    ✗ {url[-40:]}: {e}')
        return False

def push_batch(repo_name, images_dir, url_map):
    clone_dir = WORK_DIR / repo_name
    if clone_dir.exists():
        shutil.rmtree(clone_dir)

    remote = f'https://{GITHUB_TOKEN}@github.com/{GITHUB_USER}/{repo_name}.git'
    subprocess.run(['git', 'clone', remote, str(clone_dir)], check=True,
                   capture_output=True)
    # Increase buffer for large image pushes
    subprocess.run(['git', 'config', 'http.postBuffer', '524288000'],
                   cwd=clone_dir, check=True, capture_output=True)

    # Copy images into repo
    for img in images_dir.iterdir():
        shutil.copy2(img, clone_dir / img.name)

    subprocess.run(['git', 'add', '-A'], cwd=clone_dir, check=True, capture_output=True)
    subprocess.run(['git', 'commit', '-m', f'Add {len(list(images_dir.iterdir()))} images'],
                   cwd=clone_dir, check=True, capture_output=True)
    result = subprocess.run(['git', 'push'], cwd=clone_dir, capture_output=True, text=True)
    if result.returncode != 0:
        raise subprocess.CalledProcessError(result.returncode, 'git push',
                                            stderr=result.stderr)

    # Record URL mapping
    for img in images_dir.iterdir():
        orig_url = img.stem.replace('__', '://', 1).replace('_', '/', 2)
        # We stored the original URL as the filename key
        pass

    shutil.rmtree(clone_dir)

def url_to_filename(url):
    # Convert URL to safe filename: keep extension, hash the rest
    import hashlib
    ext = url.rsplit('.', 1)[-1].split('?')[0][:5]
    h = hashlib.md5(url.encode()).hexdigest()[:16]
    return f'{h}.{ext}'

def update_article_urls(url_map):
    changed = 0
    for f in BLOG_DIR.glob('*.md'):
        text = f.read_text(encoding='utf-8')
        new_text = text
        for old_url, new_url in url_map.items():
            new_text = new_text.replace(old_url, new_url)
        if new_text != text:
            f.write_text(new_text, encoding='utf-8')
            changed += 1
    print(f'Updated {changed} articles')

def main():
    update_only = '--update-urls' in sys.argv

    # Load existing URL map
    url_map = {}
    if MAP_FILE.exists():
        url_map = json.loads(MAP_FILE.read_text())

    if update_only:
        print(f'Loaded {len(url_map)} URL mappings, updating articles...')
        update_article_urls(url_map)
        return

    all_urls = get_all_image_urls()
    print(f'Total unique images: {len(all_urls)}')
    print(f'Already mapped: {len(url_map)}')

    # Filter out already done
    remaining = [u for u in all_urls if u not in url_map]
    print(f'Remaining: {len(remaining)}\n')

    if not remaining:
        print('All done! Run with --update-urls to update articles.')
        return

    WORK_DIR.mkdir(parents=True, exist_ok=True)

    # Process in batches
    batch_num = len(url_map) // BATCH_SIZE + 1
    for batch_start in range(0, len(remaining), BATCH_SIZE):
        batch = remaining[batch_start:batch_start + BATCH_SIZE]
        repo_name = f'{REPO_PREFIX}-{batch_num:02d}'

        print(f'\n[Batch {batch_num}] {repo_name} — {len(batch)} images')

        # Create repo if needed
        if not repo_exists(repo_name):
            print(f'  Creating repo {repo_name}...')
            if not create_repo(repo_name):
                print(f'  ✗ Failed to create repo')
                break
            time.sleep(2)

        # Download images
        img_dir = WORK_DIR / 'images'
        if img_dir.exists():
            shutil.rmtree(img_dir)
        img_dir.mkdir()

        ok = 0
        for i, url in enumerate(batch):
            fname = url_to_filename(url)
            dest = img_dir / fname
            if download_image(url, dest):
                url_map[url] = f'https://raw.githubusercontent.com/{GITHUB_USER}/{repo_name}/main/{fname}'
                ok += 1
            if i % 50 == 49:
                print(f'  Downloaded {i+1}/{len(batch)}...')
            time.sleep(0.3)

        print(f'  Downloaded {ok}/{len(batch)} images')

        # Push to GitHub
        print(f'  Pushing to GitHub...')
        try:
            push_batch(repo_name, img_dir, url_map)
            print(f'  ✓ Pushed')
        except subprocess.CalledProcessError as e:
            print(f'  ✗ Push failed:\n{e.stderr}')
            break

        # Save map progress
        MAP_FILE.write_text(json.dumps(url_map, indent=2))
        print(f'  Saved {len(url_map)} mappings')

        shutil.rmtree(img_dir)
        batch_num += 1

    print(f'\n完成！共 {len(url_map)} 張圖片已上傳')
    print('執行 --update-urls 更新文章網址')


if __name__ == '__main__':
    main()
