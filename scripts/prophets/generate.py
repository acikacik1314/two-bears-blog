#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Step 3: 逐字稿 → 部落格文章 + 社群貼文。

執行方式：
  python3 scripts/prophets/generate.py <video_id>
"""

import argparse, json, re, sys
from datetime import datetime
from pathlib import Path

import random

import frontmatter
import requests

REPO      = Path(__file__).resolve().parents[2]
HERE      = Path(__file__).parent
DB        = Path.home() / "prophets-db"
GENERATED = DB / "generated"
BLOG_DIR  = REPO / "src" / "content" / "blog"

CHANNELS_JSON  = HERE / "channels.json"
PROMPT_ARTICLE = HERE / "prompt-article.txt"
PROMPT_SOCIAL  = HERE / "prompt-social.txt"

# 依 CLAUDE.md：primary=3.1，fallback 往下走；404 換模型，429/503 換 key
GEMINI_MODELS = [
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
]
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


def log(msg: str):
    print(msg, flush=True)


def _load_gemini_keys() -> list:
    try:
        d = json.loads((Path.home() / ".claude/api_keys.json").read_text(encoding="utf-8"))
        return [k for k in d.get("gemini", []) if k]
    except Exception:
        return []


def find_transcript(video_id: str) -> dict | None:
    for p in DB.glob(f"*/{video_id}.json"):
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            pass
    return None


def get_channel_info(prophet: str) -> dict:
    try:
        data = json.loads(CHANNELS_JSON.read_text(encoding="utf-8"))
        for ch in data.get("channels", []):
            if ch.get("prophet") == prophet:
                return ch
    except Exception:
        pass
    return {}


def get_hits_misses(prophet: str) -> tuple:
    """Scan src/content/blog for confirmed hits and misses for this prophet."""
    hits, misses = [], []
    if not BLOG_DIR.exists():
        return hits, misses

    for p in BLOG_DIR.glob("*.md"):
        try:
            post = frontmatter.load(p)
        except Exception:
            continue

        fp = post.get("prophet")
        if not fp:
            continue
        prophets = fp if isinstance(fp, list) else [fp]
        if prophet not in prophets:
            continue

        preds = post.get("predictions") or {}
        if not isinstance(preds, dict):
            continue

        for h in preds.get("hits") or []:
            if isinstance(h, dict):
                claim  = h.get("claim", "")
                reason = h.get("reason", "")
                judged = h.get("judgedOn", "")
                hits.append(f"• {claim}（{reason}，判定於 {judged}）")
            elif isinstance(h, str) and h.strip():
                hits.append(f"• {h}")

        for m in preds.get("misses") or []:
            if isinstance(m, dict):
                claim  = m.get("claim", "")
                reason = m.get("reason", "")
                judged = m.get("judgedOn", "")
                misses.append(f"• {claim}（{reason}，判定於 {judged}）")
            elif isinstance(m, str) and m.strip():
                misses.append(f"• {m}")

    return hits, misses


def call_gemini(prompt: str) -> str:
    keys = _load_gemini_keys()
    if not keys:
        raise RuntimeError("找不到 Gemini API Key（~/.claude/api_keys.json）")
    shuffled = keys[:]
    random.shuffle(shuffled)
    for model in GEMINI_MODELS:
        for key in shuffled:
            try:
                resp = requests.post(
                    f"{GEMINI_BASE}/{model}:generateContent?key={key}",
                    json={
                        "contents": [{"parts": [{"text": prompt}]}],
                        "generationConfig": {"temperature": 0.7, "maxOutputTokens": 8192},
                    },
                    timeout=180,
                )
                if resp.status_code in (429, 503):
                    continue
                if resp.status_code in (401, 403):
                    continue
                if resp.status_code == 404:
                    break
                if not resp.ok:
                    continue
                parts = resp.json()["candidates"][0]["content"]["parts"]
                return "".join(p["text"] for p in parts if not p.get("thought", False)).strip()
            except Exception:
                continue
    raise RuntimeError("所有 Gemini 模型和 Key 都失敗")


def extract_title_and_body(text: str) -> tuple:
    """
    Extract (title, body) from Gemini's article output.
    The prompt places the title request at the end, so it usually appears
    at the bottom prefixed with '標題：'. Falls back to the last short line.
    """
    for pat in (r'(?m)^標題[：:]\s*(.+)$', r'(?m)^【標題】\s*(.+)$'):
        m = re.search(pat, text)
        if m:
            return m.group(1).strip(), text[:m.start()].strip()

    lines = [l.strip() for l in text.splitlines()]
    while lines and not lines[-1]:
        lines.pop()
    if lines and 10 < len(lines[-1]) < 100 and len(lines) > 3:
        return lines[-1], "\n".join(lines[:-1]).strip()

    return "", text.strip()


def extract_social_and_comment(text: str) -> tuple:
    """
    Extract (title, post_body, comment_line) from Gemini's social post output.
    The comment_line is the sentence containing the blog URL.
    """
    comment_line = ""
    body_lines = []
    for line in text.splitlines():
        if "twobears.vercel.app" in line:
            comment_line = line.strip()
        else:
            body_lines.append(line)
    body = "\n".join(body_lines).strip()

    for pat in (r'(?m)^標題[：:]\s*(.+)$', r'(?m)^【標題】\s*(.+)$'):
        m = re.search(pat, body)
        if m:
            title = m.group(1).strip()
            body = (body[:m.start()] + body[m.end():]).strip()
            return title, body, comment_line

    lines = [l.strip() for l in body.splitlines() if l.strip()]
    if lines and 10 < len(lines[-1]) < 100:
        return lines[-1], "\n".join(lines[:-1]).strip(), comment_line

    return "", body, comment_line


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("video_id")
    args = parser.parse_args()
    video_id = args.video_id

    log(f"[generate] 開始處理 {video_id}")

    tx = find_transcript(video_id)
    if not tx:
        log(f"[generate] ✗ 找不到逐字稿：{video_id}")
        sys.exit(1)

    prophet      = tx.get("prophet", "")
    channel_name = tx.get("channel_name", "")
    title        = tx.get("title", "")
    pub_date     = tx.get("published_at", "")
    video_url    = tx.get("video_url", "")
    transcript   = tx.get("transcript", "")
    channel_type = tx.get("channel_type", "self")

    if not transcript:
        log("[generate] ✗ 逐字稿為空")
        sys.exit(1)

    hits, misses = get_hits_misses(prophet)
    log(f"[generate] {prophet}：{len(hits)} 命中、{len(misses)} 未命中紀錄")

    hits_text   = "\n".join(hits)   if hits   else "無已判定紀錄"
    misses_text = "\n".join(misses) if misses else "無已判定紀錄"

    log("[generate] 呼叫 Gemini 產生文章…")
    article_prompt = (PROMPT_ARTICLE.read_text(encoding="utf-8")
        .replace("{{PROPHET}}",        prophet)
        .replace("{{VIDEO_TITLE}}",    title)
        .replace("{{CHANNEL_NAME}}",   channel_name)
        .replace("{{PUBLISHED_DATE}}", pub_date)
        .replace("{{VIDEO_URL}}",      video_url)
        .replace("{{TRANSCRIPT}}",     transcript)
        .replace("{{HITS}}",           hits_text)
        .replace("{{MISSES}}",         misses_text))

    article_raw   = call_gemini(article_prompt)
    article_title, article_body = extract_title_and_body(article_raw)
    log(f"[generate] ✓ 文章產出（{len(article_body)} 字元）")

    log("[generate] 呼叫 Gemini 產生社群貼文…")
    social_prompt = (PROMPT_SOCIAL.read_text(encoding="utf-8")
        .replace("{{ARTICLE}}", article_raw))

    social_raw = call_gemini(social_prompt)
    social_title, social_post, comment_line = extract_social_and_comment(social_raw)
    log(f"[generate] ✓ 社群貼文產出（{len(social_post)} 字元）")

    warnings = []
    if len(hits) + len(misses) < 3:
        warnings.append("命中紀錄不足（少於 3 條）")
    if channel_type == "interview":
        warnings.append("請人工確認引述歸屬（interview 頻道）")

    GENERATED.mkdir(parents=True, exist_ok=True)
    out = GENERATED / f"{video_id}.json"
    record = {
        "video_id":      video_id,
        "prophet":       prophet,
        "video_title":   title,
        "article_title": article_title,
        "article_body":  article_body,
        "social_title":  social_title,
        "social_post":   social_post,
        "comment_line":  comment_line,
        "hits_count":    len(hits),
        "misses_count":  len(misses),
        "warnings":      warnings,
        "generated_at":  datetime.now().isoformat(),
    }
    out.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"[generate] ✓ 已存 {out}")
    for w in warnings:
        log(f"[generate] ⚠ {w}")


if __name__ == "__main__":
    main()
