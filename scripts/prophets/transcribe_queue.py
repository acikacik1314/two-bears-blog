#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Step 2: 逐字稿佇列處理器。

讀取 ~/prophets-db/queue.json，依 priority 排序，
逐一 POST 到 http://127.0.0.1:5055/transcribe，
結果存 ~/prophets-db/YYYY-MM/{video_id}.json。

錯誤分類：
  app 未啟動（Connection refused）→ 立刻停止，通知開啟 App
  Groq 配額耗盡（HTTP 500 + 速率限制關鍵字）→ 停止今天所有轉錄
  下載失敗（HTTP 400 / yt-dlp 錯誤）→ 跳過本支，繼續下一支
  同一支累計失敗 2 次 → 標記 deferred，延至隔天重試

執行方式：
  python3 scripts/prophets/transcribe_queue.py          # 跑到上限為止
  python3 scripts/prophets/transcribe_queue.py --limit 5  # 只跑 5 支
  python3 scripts/prophets/transcribe_queue.py --priority 1  # 只跑 priority 1
"""

import argparse, json, os, re, requests, subprocess
from datetime import date, datetime, timedelta

_ANSI = re.compile(r'\x1b\[[0-9;]*m')
from pathlib import Path

HERE = Path(__file__).parent
DB   = Path.home() / "prophets-db"
LOG  = DB / "transcribe.log"

QUEUE_FILE     = DB / "queue.json"
CHANNELS_JSON  = HERE / "channels.json"
PROCESSED_FILE = DB / "processed.json"
TRANSCRIBE_URL = "http://127.0.0.1:5056/transcribe"


# ── helpers ──────────────────────────────────────────────────────────────────

def log(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"{ts} {msg}"
    print(line, flush=True)
    try:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def notify(title: str, body: str):
    # 用 subprocess 傳參數，避免 shell 拼字串導致引號爆炸
    title_safe = title[:80].replace('"', "'")
    body_safe  = body[:200].replace('"', "'")
    script = f'display notification "{body_safe}" with title "{title_safe}"'
    try:
        subprocess.run(["osascript", "-e", script], timeout=5, capture_output=True)
    except Exception:
        pass


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def save_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def count_today_transcripts() -> int:
    today = date.today().isoformat()
    count = 0
    for p in DB.glob("*/*.json"):
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
            if d.get("transcribed_at", "").startswith(today) \
               and d.get("status") in ("done", "published"):
                count += 1
        except Exception:
            pass
    return count


def transcript_path(video_id: str, published_at: str) -> Path:
    month = published_at[:7]  # YYYY-MM
    return DB / month / f"{video_id}.json"


def call_transcribe(video_url: str, lang: str) -> tuple:
    """POST 到轉錄 app，透過 SSE 串流接收進度，回傳 (text, duration_sec, error_msg)。"""
    payload = json.dumps({
        "url": video_url,
        "language": lang if lang and lang != "auto" else "auto",
    })
    try:
        r = requests.post(
            TRANSCRIBE_URL,
            data=payload,
            headers={"Content-Type": "application/json"},
            timeout=10,
        )
    except requests.exceptions.ConnectionError:
        return "", 0, "Connection refused"
    except Exception as e:
        return "", 0, str(e)

    if r.status_code != 200:
        try:
            body = r.json().get("error", r.text[:200])
        except Exception:
            body = r.text[:200]
        return "", 0, f"HTTP {r.status_code}: {_ANSI.sub('', body)}"

    resp_data = r.json()
    job_id = resp_data.get("job_id")
    if not job_id:
        return resp_data.get("text", ""), float(resp_data.get("duration") or 0), None

    stream_url = TRANSCRIBE_URL + f"/stream/{job_id}"
    try:
        with requests.get(stream_url, stream=True, timeout=(10, None)) as sr:
            for raw in sr.iter_lines():
                if not raw or not raw.startswith(b"data:"):
                    continue
                try:
                    msg = json.loads(raw[5:].strip())
                except Exception:
                    continue
                if msg.get("ping"):
                    continue
                if msg.get("progress"):
                    log(f"  → {msg['progress']}")
                    continue
                if msg.get("done"):
                    if "error" in msg:
                        return "", 0, msg["error"]
                    return msg.get("text", ""), float(msg.get("duration") or 0), None
    except requests.exceptions.ConnectionError:
        return "", 0, "Connection refused"
    except requests.exceptions.ChunkedEncodingError as e:
        return "", 0, f"串流中斷：{str(e)[:100]}"
    except Exception as e:
        return "", 0, str(e)

    return "", 0, "串流結束但未收到結果"


def _is_cjk_text(text: str) -> bool:
    """若文字中 CJK 字元佔非空白字元的 30% 以上，視為中日韓語。"""
    cjk   = sum(1 for c in text if '一' <= c <= '鿿'
                                or '぀' <= c <= 'ヿ'
                                or '가' <= c <= '힣')
    total = sum(1 for c in text if not c.isspace())
    return total > 0 and cjk / total >= 0.30


def check_completeness(text: str, duration_sec: float, lang: str):
    """
    回傳 (word_count, warning_str | None)。
    中日韓：每分鐘 200-250 字元，門檻 100 字元/分。
    英文/其他：每分鐘 130 字，門檻 65 字/分。
    duration_sec == 0 → ffprobe 失敗，無法驗證，標警告。
    duration_sec <= 30 → 太短不做檢查。
    """
    is_cjk = lang in ("zh", "ja", "ko") or _is_cjk_text(text)
    if is_cjk:
        count = len(text.replace(" ", "").replace("\n", ""))
    else:
        count = len(text.split())

    if duration_sec == 0:
        return count, "無法驗證：ffprobe 讀不到時長，完整性未確認"

    duration_min = duration_sec / 60
    if duration_sec <= 30:
        return count, None

    threshold = duration_min * (100 if is_cjk else 65)
    unit = "字元" if is_cjk else "字"
    if count < threshold:
        warning = (f"疑似不完整：實際 {count} {unit}，"
                   f"預期至少 {threshold:.0f}（{duration_min:.1f} 分鐘 × "
                   f"{'100' if is_cjk else '65'} {unit}/分）")
        return count, warning
    return count, None


def is_app_down(err: str) -> bool:
    return any(kw in err for kw in (
        "Connection refused", "Connection reset",
        "Remote end closed", "ConnectionRefusedError",
    ))


def is_groq_quota(err: str) -> bool:
    """Groq 明確回報配額耗盡，才停止今天所有轉錄。HTTP 500 + 特定關鍵字。"""
    if "HTTP 500" not in err:
        return False
    return any(kw in err for kw in (
        "速率限制", "所有 API Key", "rate_limit", "quota_exceeded", "429",
    ))


def is_upcoming_live(err: str) -> bool:
    """YouTube 直播尚未開始，延到明天再試。"""
    return "live event will begin" in err.lower()


def is_timeout_error(err: str) -> bool:
    """轉錄 App 在執行途中串流中斷（非影片本身問題）→ 不累計 fail_count。"""
    return any(kw in err for kw in ("串流中斷", "串流結束但未收到結果"))


def is_download_failure(err: str) -> bool:
    """yt-dlp 下載失敗（app 回 HTTP 400）。"""
    return "HTTP 400" in err


# ── queue ordering ────────────────────────────────────────────────────────────

def _round_robin_sort(items: list, per_round: int = 2) -> list:
    """
    Priority-grouped round-robin ordering.
    Groups by (priority, prophet). Within each prophet: newest published_at first.
    Each round takes up to `per_round` items from each prophet before moving to the next.
    Lower priority number = higher priority (runs first and fills quota first).
    """
    groups: dict = {}
    for item in items:
        key = (item.get("priority", 2), item.get("prophet", ""))
        groups.setdefault(key, []).append(item)
    for key in groups:
        groups[key].sort(key=lambda x: x.get("published_at", ""), reverse=True)
    sorted_keys = sorted(groups.keys())
    result = []
    while any(groups.values()):
        for key in sorted_keys:
            batch = groups.get(key, [])
            if not batch:
                continue
            take = min(per_round, len(batch))
            result.extend(batch[:take])
            groups[key] = batch[take:]
    return result


# ── main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit",    type=int, default=0,
                        help="最多跑幾支（0=用 channels.json 的 daily_transcribe_limit）")
    parser.add_argument("--priority", type=int, default=0,
                        help="只跑此 priority（0=全部）")
    parser.add_argument("--include-shorts", action="store_true",
                        help="也處理短影音（預設跳過）")
    args = parser.parse_args()

    DB.mkdir(parents=True, exist_ok=True)
    today_str    = date.today().isoformat()
    tomorrow_str = (date.today() + timedelta(days=1)).isoformat()

    channels_data = load_json(CHANNELS_JSON, {})
    daily_max  = channels_data.get("daily_transcribe_limit", 30)
    run_limit  = args.limit if args.limit > 0 else daily_max

    queue     = load_json(QUEUE_FILE, [])
    processed = load_json(PROCESSED_FILE, {})
    if not queue:
        log("[transcribe] queue 為空，結束")
        return

    today_done = count_today_transcripts()
    log(f"[transcribe] 今日已轉錄 {today_done}/{daily_max} 支，queue 共 {len(queue)} 筆")

    if today_done >= daily_max:
        log("[transcribe] 已達每日上限，停止")
        return

    # 本次最多跑 run_limit 支，但不超過每日剩餘配額
    remaining  = min(run_limit, daily_max - today_done)
    done_count = 0
    failed_items = []
    updated_queue = []

    sorted_queue = _round_robin_sort(queue)

    for item in sorted_queue:
        if done_count >= remaining:
            updated_queue.append(item)
            continue

        priority  = item.get("priority", 2)
        video_id  = item["video_id"]
        prophet   = item["prophet"]
        title     = item["title"]
        video_url = item["video_url"]
        lang      = item.get("lang", "auto")
        pub_date  = item.get("published_at", today_str)

        if args.priority and priority != args.priority:
            updated_queue.append(item)
            continue

        # 短影音：預設跳過，除非帶 --include-shorts
        if not args.include_shorts and item.get("video_type") == "short":
            updated_queue.append(item)
            continue

        # 延後處理的影片：今天跳過，留在 queue 等明天
        retry_after = item.get("retry_after", "")
        if retry_after and retry_after > today_str:
            updated_queue.append(item)
            continue

        # 已標記處理過（used/deleted）就從 queue 移除
        if video_id in processed:
            log(f"[transcribe] 已標記{processed[video_id].get('action','')}，跳過 {video_id}")
            continue

        # 已存在就跳過（不重複），並從 queue 移除
        tpath = transcript_path(video_id, pub_date)
        if tpath.exists():
            log(f"[transcribe] 已存在，跳過 {video_id}")
            continue

        log(f"[transcribe] {prophet} ｜ {title[:50]}")
        log(f"  URL: {video_url}")

        text, duration_sec, err = call_transcribe(video_url, lang)

        if err:
            log(f"  ✗ 失敗：{err}")

            # ① App 未啟動 → 立刻停止，把剩餘全部（含本支）保留
            if is_app_down(err):
                notify("預言家轉錄未啟動", "轉錄稿 App 未執行（port 5055），請先開啟 App")
                log("[transcribe] 轉錄 App 未啟動，停止。請開啟 ~/Desktop/轉錄稿.app 後重試")
                idx = sorted_queue.index(item)
                updated_queue.extend(sorted_queue[idx:])
                break

            # ② Groq 配額耗盡 → 停止今天，保留全部剩餘
            if is_groq_quota(err):
                notify("預言家轉錄暫停", "Groq 額度用盡，今日已停止")
                log("[transcribe] Groq 速率限制，停止今天所有轉錄")
                idx = sorted_queue.index(item)
                updated_queue.append(item)
                updated_queue.extend(sorted_queue[idx + 1:])
                break

            # ③ 串流中斷（App 崩潰或重啟）→ 延到明天，不累計 fail_count
            if is_timeout_error(err):
                item["retry_after"] = tomorrow_str
                item["status"]      = "deferred"
                item["fail_reason"] = err
                log(f"  → 轉錄串流中斷，延至 {tomorrow_str} 重試（不計失敗次數）")
                updated_queue.append(item)
                continue

            # ④ 直播尚未開始 → 延到明天，不計 fail_count
            if is_upcoming_live(err):
                item["retry_after"] = tomorrow_str
                item["status"]      = "deferred"
                item["fail_reason"] = err
                log(f"  → 直播尚未開始，延至 {tomorrow_str} 再試")
                updated_queue.append(item)
                continue

            # ⑤ 下載失敗或其他錯誤 → 累計 fail_count，繼續下一支
            fail_count = item.get("fail_count", 0) + 1
            item["fail_count"]  = fail_count
            item["status"]      = "failed"
            item["fail_reason"] = err
            item["failed_at"]   = datetime.now().isoformat()

            if fail_count >= 2:
                item["retry_after"] = tomorrow_str
                item["status"]      = "deferred"
                log(f"  → 累計失敗 {fail_count} 次，延至 {tomorrow_str} 重試")

            failed_items.append({"item": item, "reason": err})
            updated_queue.append(item)
            continue

        # 成功 — 完整性檢查
        word_count, warning = check_completeness(text, duration_sec, lang)
        if warning:
            log(f"  ⚠ {warning}")

        now_iso = datetime.now().isoformat()
        record = {
            "video_id":       video_id,
            "prophet":        prophet,
            "channel_name":   item.get("channel_name", ""),
            "title":          title,
            "published_at":   pub_date,
            "duration":       round(duration_sec, 1) if duration_sec else None,
            "word_count":     word_count,
            "video_url":      video_url,
            "lang":           lang,
            "transcript":     text,
            "transcribed_at": now_iso,
            "status":         "incomplete" if warning else "done",
            "channel_type":   item.get("type", "self"),
        }
        if warning:
            record["warning"] = warning

        # 確認磁碟空間（> 1 GB 才存）
        stat = os.statvfs(str(DB))
        free_gb = stat.f_bavail * stat.f_frsize / 1e9
        if free_gb < 1.0:
            msg = f"磁碟剩餘 {free_gb:.1f} GB，停止儲存"
            log(f"  ✗ {msg}")
            notify("預言家磁碟空間不足", msg)
            updated_queue.append(item)
            break

        tpath.parent.mkdir(parents=True, exist_ok=True)
        save_json(tpath, record)
        done_count += 1
        log(f"  ✓ 已存 {tpath}")
        # 成功 → 從 queue 移除（不加入 updated_queue）

    save_json(QUEUE_FILE, updated_queue)

    log(f"[transcribe] 完成：本次轉錄 {done_count} 支，{len(failed_items)} 支失敗，"
        f"queue 剩 {len(updated_queue)} 筆")

    if failed_items:
        notify("預言家轉錄有失敗", f"{len(failed_items)} 支失敗，詳見 transcribe.log")
        log(f"[transcribe] 失敗原因：{'; '.join(f['reason'][:60] for f in failed_items)}")


if __name__ == "__main__":
    main()
