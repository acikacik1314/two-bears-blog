#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Step 1: RSS 輪詢 — 掃新影片、寫入 queue。

執行方式：
  python3 scripts/prophets/fetch_new.py              # 全部頻道
  python3 scripts/prophets/fetch_new.py --priority 1  # 只跑 priority 1
  python3 scripts/prophets/fetch_new.py --dry-run     # 不寫檔，只印結果
"""

import argparse, json, os, random, sys, time, urllib.request, xml.etree.ElementTree as ET
from datetime import date, datetime
from pathlib import Path

REPO  = Path(__file__).resolve().parents[2]
HERE  = Path(__file__).parent
DB    = Path.home() / "prophets-db"
LOG   = DB / "fetch.log"

CHANNELS_JSON  = HERE / "channels.json"
QUEUE_FILE     = DB / "queue.json"
STATE_FILE     = DB / "fetch_state.json"
PROCESSED_FILE = DB / "processed.json"

NS = {"atom": "http://www.w3.org/2005/Atom",
      "yt":   "http://www.youtube.com/xml/schemas/2015",
      "media":"http://search.yahoo.com/mrss/"}


# ── helpers ──────────────────────────────────────────────────────────────────

def log(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"{ts} {msg}"
    print(line, flush=True)
    try:
        with open(LOG, "a") as f:
            f.write(line + "\n")
    except Exception:
        pass


def notify(title: str, body: str):
    os.system(
        f'osascript -e \'display notification "{body}" with title "{title}"\''
    )


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text())
    except Exception:
        return default


def save_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2))


def transcript_exists(video_id: str, processed: dict) -> bool:
    """已轉錄或已標記處理過就跳過。"""
    if video_id in processed:
        return True
    for p in DB.glob("*/*.json"):
        if p.stem == video_id:
            return True
    return False


def in_queue(video_id: str, queue: list) -> bool:
    return any(item["video_id"] == video_id for item in queue)


def fetch_rss(channel_id: str):
    url = f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.read()


def parse_rss(xml_bytes: bytes, channel: dict, today_str: str, processed: dict) -> list:
    """解析 RSS，回傳可轉錄的新影片清單。"""
    root = ET.fromstring(xml_bytes)
    entries = root.findall("atom:entry", NS)
    results = []

    for entry in entries:
        vid_el   = entry.find("yt:videoId", NS)
        title_el = entry.find("atom:title", NS)
        pub_el   = entry.find("atom:published", NS)
        link_el  = entry.find("atom:link", NS)

        if vid_el is None:
            continue

        video_id  = vid_el.text.strip()
        title     = (title_el.text or "").strip() if title_el is not None else ""
        pub_raw   = pub_el.text.strip() if pub_el is not None else ""
        video_url = link_el.get("href", "") if link_el is not None else \
                    f"https://www.youtube.com/watch?v={video_id}"

        # 解析日期
        try:
            pub_dt  = datetime.fromisoformat(pub_raw.replace("Z", "+00:00"))
            pub_str = pub_dt.strftime("%Y-%m-%d")
        except Exception:
            pub_str = today_str

        lower_title = title.lower()

        # 跳過尚未開播的直播（標題含 live / 直播，且判斷為未來事件）
        # 已結束的直播（錄影）照常收錄
        is_upcoming_live = any(kw in lower_title for kw in ["#shorts", "live", "直播"])
        if is_upcoming_live:
            continue

        if transcript_exists(video_id, processed):
            continue

        video_type = "short" if "/shorts/" in video_url else "long"

        results.append({
            "video_id":    video_id,
            "prophet":     channel["prophet"],
            "channel_id":  channel["channel_id"],
            "channel_name": channel["channel_name"],
            "title":       title,
            "published_at": pub_str,
            "video_url":   video_url,
            "lang":        channel.get("lang", "auto"),
            "priority":    channel["priority"],
            "type":        channel.get("type", "self"),
            "video_type":  video_type,
            "status":      "queued",
            "queued_at":   today_str,
        })

    return results


# ── main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--priority", type=int, default=0,
                        help="只處理此 priority（0=全部）")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    DB.mkdir(parents=True, exist_ok=True)
    today_str = date.today().isoformat()

    channels_data = load_json(CHANNELS_JSON, {})
    channels      = channels_data.get("channels", [])
    state         = load_json(STATE_FILE, {})  # {channel_id: last_checked_date}
    queue         = load_json(QUEUE_FILE, [])
    processed     = load_json(PROCESSED_FILE, {})  # {video_id: {action, processed_at}}

    new_total    = 0
    errors       = []
    retry_queue  = []  # channels to retry after main pass

    def _process_channel(ch: dict, is_retry: bool = False) -> bool:
        """Fetch + parse one channel. Returns True on success."""
        cid     = ch["channel_id"]
        prophet = ch["prophet"]
        nonlocal new_total
        try:
            xml_bytes = fetch_rss(cid)
            new_items = parse_rss(xml_bytes, ch, today_str, processed)
            added = 0
            for item in new_items:
                if not in_queue(item["video_id"], queue):
                    queue.append(item)
                    added += 1
                    new_total += 1
            state[cid] = today_str
            label = "（重試）" if is_retry else ""
            log(f"  → {added} 筆新影片{label}")
            return True
        except Exception as e:
            log(f"  ✗ {e}")
            return False

    for ch in channels:
        cid      = ch["channel_id"]
        prophet  = ch["prophet"]
        tier     = ch.get("tier", "daily")
        priority = ch.get("priority", 2)

        if args.priority and priority != args.priority:
            continue

        # low tier：今天已查過就跳
        if tier == "low" and state.get(cid) == today_str:
            continue

        log(f"[fetch] {prophet} ({cid})")
        ok = _process_channel(ch)
        if not ok:
            retry_queue.append(ch)

        time.sleep(random.uniform(2, 3))

    # 重試一次失敗的頻道
    if retry_queue:
        log(f"[fetch] 重試 {len(retry_queue)} 個失敗頻道…")
        time.sleep(5)
        still_failed = []
        for ch in retry_queue:
            log(f"[fetch] 重試 {ch['prophet']}")
            ok = _process_channel(ch, is_retry=True)
            if not ok:
                still_failed.append(ch)
            time.sleep(random.uniform(3, 5))

        for ch in still_failed:
            msg = f"RSS 失敗 {ch['prophet']}: 重試後仍失敗"
            errors.append(msg)
            log(f"  ✗ {msg}")

    # 依 priority 排序（1 最優先）
    queue.sort(key=lambda x: (x["priority"], x["queued_at"]))

    if not args.dry_run:
        save_json(QUEUE_FILE, queue)
        save_json(STATE_FILE, state)

    log(f"[fetch] 完成，新增 {new_total} 筆進 queue（queue 現有 {len(queue)} 筆）")

    if errors:
        notify("預言家 RSS 有錯誤", f"{len(errors)} 個頻道失敗，請查 fetch.log")
        log(f"[fetch] 失敗頻道：{'; '.join(errors)}")
        sys.exit(1)


if __name__ == "__main__":
    main()
