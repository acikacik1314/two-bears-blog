#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
預言管線控制台 + 轉錄引擎 — 127.0.0.1:5056
"""

import json, os, queue as q_mod, random, subprocess, sys, tempfile, threading, re as _re
from concurrent.futures import ThreadPoolExecutor
import time, uuid, webbrowser
from datetime import datetime
from pathlib import Path

import requests
import yt_dlp
from flask import Flask, Response, jsonify, render_template_string, request

import shutil

try:
    import frontmatter as _frontmatter
    _HAS_FRONTMATTER = True
except ImportError:
    _HAS_FRONTMATTER = False

REPO              = Path(__file__).resolve().parents[2]
SCRIPTS           = Path(__file__).parent
DB                = Path.home() / "prophets-db"
BLOG_DIR          = REPO / "src" / "content" / "blog"
PYTHON            = sys.executable
_NODE             = shutil.which("node") or "/usr/local/bin/node"
PROCESSED_FILE    = DB / "processed.json"
PROMPT_MERGE_FILE = SCRIPTS / "prompt-merge.txt"
EXTRACTS_DIR      = DB / "extracts"
_processed_lock   = threading.Lock()

POST_PROMPT_TEMPLATE = """\
你是兩隻熊頻道的貼文編輯。我會給你一位或多位預言家的原始內容，可能還會附上當天的行情或新聞。請你用下面六種格式各寫一則 YouTube 社群貼文，我會挑一種發布。

【共同規則，六種都要遵守】
主詞必須是說話的人。用他說、他提到、他認為，不要用將會發生、一定會這種斷言句。
不要照抄原文。所有文字都要是你自己歸納後寫出來的，如果真的要引用原話，控制在一句話以內。
不要寫素材裡沒有的內容。每一件提到的事，讀者到部落格都要找得到。
不要下結論，不要說準或不準，不要加立場或評價。
絕對不要出現任何投資建議，不要寫該買該賣、該配置多少比例、該準備多少現金。行情只寫報價和漲跌，不解讀，不建議。
不要把預言家的說法跟實際數據用因果句連起來，例如不要寫因為他說了所以漲。
不要用大陸用語。
不要把最刺激的那句話放在開頭。
純文字，不要 markdown，不要粗體，不要標題符號。段落之間空一行。
除了問號之外，只用逗號句號驚嘆號。不要用括號和引號。
結尾都要放這段導流：完整內容在部落格，最新的會先出現在博客那邊，要過一陣子才會整理成文章，想先看或想用聽的可以到博客。接著放連結 https://twobears.vercel.app/

【六種格式】
一，畫重點式。三到四行。第一行一句話講他今天說了什麼。第二行補時間或方法，例如這是他幾號在哪裡講的。第三行放一個可以驗證的時間點或事件。最後導流。

二，日報式。分成兩區。第一區今天預言家說了什麼，每位一到兩句，主詞都是人名。第二區今天實際發生了什麼，放黃金或加密貨幣的報價漲跌，以及跟預言家提過的主題有關的新聞，例如中東局勢、台海動態、AI 產業、金融市場。與這些主題無關的隨機新聞不要放。兩區之間不要下任何連結兩者的結論，最後寫一句我把兩邊分開放，準不準留給你自己判斷。最後導流。

三，對照式。當天有兩位以上講到同一個主題時用。先說他們各自的說法，指出哪裡一致哪裡不一致，說明他們用的方法完全不同，最後不下結論，導流。

四，追蹤式。針對之前講過、現在到期或接近到期的預言。先回顧他當初什麼時候說了什麼，再說現在的實際情況，誠實寫出對上還是沒對上，如果還不能判斷就寫還在觀察，最後導流。

五，問答式。開頭用一個讀者可能會問的問題，例如很多人在問某某這次到底在講什麼。接著用兩三段回答，內容是他的說法整理。結尾放一個開放問句邀請大家留言，最後導流。

六，一句話式。挑素材裡最值得思考的一句話，可以是預言家講過的一句原話，也可以是他的核心主張。先寫這句話，再用兩三句說明他為什麼這樣講，最後放一個開放問句邀請大家聊聊，導流。這一則不放行情也不放新聞。

【輸出方式】
六種都寫出來，用一到六標示清楚，每種之間空兩行。不要解釋你為什麼這樣寫，直接給貼文正文。如果某一種格式當天的素材不適合，就在那個編號下面寫今天素材不適合這個格式，並說明原因，不要硬寫。

【今天的素材】
預言家內容：
{{ARTICLE}}

當天行情與新聞，沒有就留空：
（貼在這裡）\
"""

_EXTRACT_PROMPT = """\
以下是一支預言影片的完整逐字稿。影片可能是英文、中文或其他語言，你的輸出一律用繁體中文。

請仔細閱讀全文，把說話者本人的所有具體預言、主張、警告、聲稱逐一提取成條目。
排除主持人介紹語、廣告插播、引用第三方的話、泛泛問候。
每一個不同主題或不同時間點都要分開成獨立條目，寧多勿少。

輸出純 JSON 陣列，第一個字元是 [，最後一個字元是 ]，不加任何說明文字或 markdown 符號：
[{"topic":"主題標籤（3到6個繁體中文字）","quote":"貼近原話的摘錄（保留說話者用詞和語氣，不要改寫，最多四句）","timeframe":"他提到的年份月份季節時間範圍，沒有就寫無","position":"前段或中段或後段"},...]

【影片資訊】
標題：{title}
頻道：{channel}
日期：{date}

【逐字稿】
{transcript}
"""

def _load_groq_keys():
    try:
        d = json.loads((Path.home() / ".claude/api_keys.json").read_text(encoding="utf-8"))
        return d.get("groq", [])
    except Exception:
        return []

GROQ_KEYS = _load_groq_keys()
_key_idx  = 0

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 800 * 1024 * 1024


# ── 轉錄引擎 ─────────────────────────────────────────────────────────────────

def call_whisper(audio_path, language=None):
    global _key_idx
    if not GROQ_KEYS:
        return None, "找不到 Groq API Key"
    for attempt in range(len(GROQ_KEYS)):
        key  = GROQ_KEYS[(_key_idx + attempt) % len(GROQ_KEYS)]
        data = {"model": "whisper-large-v3"}
        if language and language != "auto":
            data["language"] = language
        with open(audio_path, "rb") as f:
            ext  = Path(audio_path).suffix.lower().lstrip(".")
            mime = {"m4a":"audio/mp4","wav":"audio/wav","webm":"audio/webm"}.get(ext,"audio/mpeg")
            resp = requests.post(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {key}"},
                data=data, files={"file": (Path(audio_path).name, f, mime)}, timeout=180,
            )
        if resp.status_code == 200:
            _key_idx = (_key_idx + attempt) % len(GROQ_KEYS)
            return resp.json().get("text", ""), None
        elif resp.status_code == 429:
            time.sleep(1); continue
        else:
            return None, f"Groq 錯誤 {resp.status_code}"
    return None, "所有 Groq Key 已達速率限制"

def get_duration(audio_path):
    try:
        r = subprocess.run(
            ["ffprobe","-v","error","-show_entries","format=duration",
             "-of","default=noprint_wrappers=1:nokey=1", audio_path],
            capture_output=True, text=True, timeout=30)
        return float(r.stdout.strip() or "0")
    except Exception:
        return 0

def split_audio(src, tmpdir, chunk_mins=10):
    r = subprocess.run(
        ["ffprobe","-v","error","-show_entries","format=duration",
         "-of","default=noprint_wrappers=1:nokey=1", src],
        capture_output=True, text=True)
    duration = float(r.stdout.strip() or "0")
    chunk_sec = chunk_mins * 60
    chunks = []
    for i, start in enumerate(range(0, int(duration), chunk_sec)):
        out = os.path.join(tmpdir, f"chunk_{i:04d}.mp3")
        subprocess.run(
            ["ffmpeg","-y","-i",src,"-ss",str(start),"-t",str(chunk_sec),
             "-ar","16000","-ac","1","-b:a","64k", out], capture_output=True)
        if os.path.exists(out) and os.path.getsize(out) > 1000:
            chunks.append(out)
    return chunks

def transcribe_file(audio_path, language=None, progress_cb=None):
    size_mb = os.path.getsize(audio_path) / (1024*1024)
    if size_mb > 22:
        with tempfile.TemporaryDirectory() as tmpdir:
            mp3 = os.path.join(tmpdir, "converted.mp3")
            subprocess.run(["ffmpeg","-y","-i",audio_path,"-ar","16000","-ac","1","-b:a","64k",mp3], capture_output=True)
            target = mp3 if os.path.exists(mp3) else audio_path
            chunks = split_audio(target, tmpdir)
            if not chunks:
                return None, "切片失敗：無法讀取音訊時長"
            parts = []
            n = len(chunks)
            for i, chunk in enumerate(chunks):
                if progress_cb:
                    progress_cb(f"轉錄第 {i+1}/{n} 段…")
                text, err = call_whisper(chunk, language)
                if err:
                    return None, f"第 {i+1}/{n} 段失敗：{err}"
                parts.append(text.strip())
            return "\n\n".join(parts), None
    else:
        if progress_cb:
            progress_cb("轉錄中（單段）…")
        return call_whisper(audio_path, language)


# ── Gemini ───────────────────────────────────────────────────────────────────

GEMINI_MODELS = [
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
]
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


def _load_gemini_keys() -> list:
    try:
        d = json.loads((Path.home() / ".claude/api_keys.json").read_text(encoding="utf-8"))
        return [k for k in d.get("gemini", []) if k]
    except Exception:
        return []


def call_gemini(prompt: str, max_tokens: int = 8192, models: list = None, temperature: float = 0.2) -> str:
    keys = _load_gemini_keys()
    if not keys:
        raise RuntimeError("找不到 Gemini API Key（~/.claude/api_keys.json）")
    shuffled = keys[:]
    random.shuffle(shuffled)
    for model in (models or GEMINI_MODELS):
        for key in shuffled:
            try:
                resp = requests.post(
                    f"{GEMINI_BASE}/{model}:generateContent?key={key}",
                    json={
                        "contents": [{"parts": [{"text": prompt}]}],
                        "generationConfig": {"temperature": temperature, "maxOutputTokens": max_tokens},
                    },
                    timeout=300,
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


def _parse_json_array(raw: str) -> list:
    raw = _re.sub(r'^```(?:json)?\s*\n?', '', raw.strip())
    raw = _re.sub(r'\n?```$', '', raw).strip()
    s, e = raw.find('['), raw.rfind(']')
    if s == -1 or e == -1:
        raise ValueError("回傳內容中找不到 JSON 陣列")
    return json.loads(raw[s:e+1])


def _parse_json_obj(raw: str) -> dict:
    raw = _re.sub(r'^```(?:json)?\s*\n?', '', raw.strip())
    raw = _re.sub(r'\n?```$', '', raw).strip()
    s, e = raw.find('{'), raw.rfind('}')
    if s == -1 or e == -1:
        raise ValueError("回傳內容中找不到 JSON 物件")
    return json.loads(raw[s:e+1])


def _check_coverage(article: str, extracts_used: dict) -> list:
    """Returns list of video_ids whose content is missing from the article."""
    if not extracts_used:
        return []
    summaries = []
    for vid, ext in extracts_used.items():
        items  = ext.get("items") or []
        topics = "、".join(it.get("topic", "") for it in items[:8] if it.get("topic"))
        summaries.append(f"ID:{vid} 《{ext.get('title', vid)[:30]}》 主題：{topics}")
    prompt = (
        "以下是一篇文章，以及多支影片的主題清單。"
        "請判斷每支影片的主題有沒有在文章中得到實質涵蓋（不要求逐字引用，"
        "文章有提到該影片的核心主張即算涵蓋）。\n"
        "輸出純 JSON，格式：{\"missing\":[\"vid1\",\"vid2\"]}，全數涵蓋就輸出 {\"missing\":[]}\n\n"
        f"【文章（前 2500 字）】\n{article[:2500]}\n\n"
        "【各影片主題清單】\n" + "\n".join(summaries)
    )
    try:
        raw = call_gemini(prompt, max_tokens=256,
                          models=["gemini-2.5-flash-lite", "gemini-2.5-flash"],
                          temperature=0.1)
        return _parse_json_obj(raw).get("missing") or []
    except Exception:
        return []


# ── hits / misses from blog ──────────────────────────────────────────────────

def _get_hits_misses(prophet: str) -> tuple:
    hits, misses = [], []
    if not _HAS_FRONTMATTER or not BLOG_DIR.exists():
        return hits, misses
    for p in BLOG_DIR.glob("*.md"):
        try:
            post = _frontmatter.load(p)
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


# ── processed.json ────────────────────────────────────────────────────────────

def _load_processed() -> dict:
    try:
        return json.loads(PROCESSED_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save_processed(data: dict):
    PROCESSED_FILE.parent.mkdir(parents=True, exist_ok=True)
    PROCESSED_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )


# ── 非同步轉錄 job（URL-based）────────────────────────────────────────────────

_tx_jobs: dict = {}

_BASE_YDL = {
    "quiet": True, "no_warnings": True, "no_color": True,
    "cookiesfrombrowser": ("chrome",),
    "js_runtimes": {"node": {"path": _NODE}},
    # 繞開 403：優先用 ios/android player client（web client 常被擋）
    "extractor_args": {
        "youtube": {
            "player_client": ["ios", "android", "web"],
        }
    },
}

def _run_url_transcription(job_id: str, url: str, language: str):
    job = _tx_jobs[job_id]
    outq = job["queue"]

    def progress(msg: str):
        outq.put({"progress": msg})

    try:
        progress("取得影片資訊…")
        try:
            with yt_dlp.YoutubeDL(_BASE_YDL) as ydl:
                info = ydl.extract_info(url, download=False)
            vid_dur = info.get("duration") or 0
            progress(f"影片時長 {vid_dur//60} 分鐘，開始下載…")
        except Exception as e:
            outq.put({"done": True, "error": f"無法取得影片資訊：{str(e)[:200]}"}); return

        with tempfile.TemporaryDirectory() as tmpdir:
            ydl_opts = {
                **_BASE_YDL,
                "format": "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best",
                "outtmpl": os.path.join(tmpdir, "audio.%(ext)s"),
                "postprocessors": [{"key":"FFmpegExtractAudio","preferredcodec":"mp3","preferredquality":"96"}],
            }
            try:
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    ydl.download([url])
            except Exception as e:
                outq.put({"done": True, "error": f"無法下載：{str(e)[:200]}"}); return

            audio_files = sorted(Path(tmpdir).glob("*.mp3")) or sorted(Path(tmpdir).glob("*.*"))
            if not audio_files:
                outq.put({"done": True, "error": "下載失敗，請確認網址正確"}); return

            audio_path = str(audio_files[0])
            duration   = get_duration(audio_path)
            progress(f"下載完成（{duration:.0f} 秒），開始轉錄…")

            text, err = transcribe_file(audio_path,
                                        None if language == "auto" else language,
                                        progress_cb=progress)
            if err:
                outq.put({"done": True, "error": err}); return

            outq.put({"done": True, "text": text, "duration": round(duration, 1)})

    except Exception as e:
        outq.put({"done": True, "error": f"未預期錯誤：{str(e)[:200]}"})
    finally:
        job["finished"] = True


# ── /transcribe（供 pipeline 內部呼叫）──────────────────────────────────────

@app.route("/transcribe", methods=["POST"])
def transcribe_endpoint():
    if request.content_type and "multipart" in request.content_type:
        f = request.files.get("file")
        if not f:
            return jsonify({"error": "沒有收到檔案"}), 400
        language = request.form.get("language", "auto")
        suffix   = Path(f.filename).suffix or ".mp3"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            f.save(tmp.name); tmp_path = tmp.name
        try:
            duration  = get_duration(tmp_path)
            text, err = transcribe_file(tmp_path, None if language=="auto" else language)
            if err: return jsonify({"error": err}), 500
            return jsonify({"text": text, "duration": round(duration, 1)})
        finally:
            try: os.unlink(tmp_path)
            except: pass
    else:
        data     = request.get_json(force=True) or {}
        url      = data.get("url","").strip()
        if not url: return jsonify({"error": "請提供影片網址"}), 400
        language = data.get("language","auto")

        job_id = uuid.uuid4().hex[:8]
        _tx_jobs[job_id] = {"queue": q_mod.Queue(), "finished": False}
        threading.Thread(target=_run_url_transcription,
                         args=(job_id, url, language),
                         daemon=True).start()
        return jsonify({"job_id": job_id})


@app.route("/transcribe/stream/<job_id>")
def transcribe_stream(job_id):
    job = _tx_jobs.get(job_id)
    if not job: return "not found", 404

    def generate():
        yield "retry: 2000\n\n"
        while True:
            try:
                msg = job["queue"].get(timeout=30)
                yield f"data: {json.dumps(msg, ensure_ascii=False)}\n\n"
                if msg.get("done"):
                    break
            except q_mod.Empty:
                if job.get("finished"):
                    break
                yield 'data: {"ping":true}\n\n'

    return Response(generate(), mimetype="text/event-stream",
                    headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no"})


# ── job runner ───────────────────────────────────────────────────────────────

_jobs: dict = {}

def start_job(cmd):
    job_id = uuid.uuid4().hex[:8]
    outq   = q_mod.Queue()
    _jobs[job_id] = {"queue": outq, "done": False, "rc": None}
    def _run():
        try:
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                    text=True, encoding="utf-8", errors="replace", cwd=str(REPO))
            for line in proc.stdout:
                outq.put(line.rstrip())
            proc.wait()
            _jobs[job_id]["rc"]   = proc.returncode
            _jobs[job_id]["done"] = True
            outq.put(f"__EXIT__{proc.returncode}")
        except Exception as e:
            outq.put(f"啟動失敗：{e}"); _jobs[job_id]["done"] = True; outq.put("__EXIT__1")
    threading.Thread(target=_run, daemon=True).start()
    return job_id


# ── API ──────────────────────────────────────────────────────────────────────

@app.route("/api/scan", methods=["POST"])
def api_scan():
    data     = request.get_json(force=True) or {}
    priority = int(data.get("priority", 0))
    cmd = [PYTHON, str(SCRIPTS/"fetch_new.py")]
    if priority: cmd += ["--priority", str(priority)]
    return jsonify({"job_id": start_job(cmd)})

@app.route("/api/transcribe", methods=["POST"])
def api_transcribe():
    data          = request.get_json(force=True) or {}
    limit         = int(data.get("limit", 5))
    priority      = int(data.get("priority", 0))
    incl_shorts   = bool(data.get("include_shorts", False))
    cmd = [PYTHON, str(SCRIPTS/"transcribe_queue.py"), "--limit", str(limit)]
    if priority:     cmd += ["--priority", str(priority)]
    if incl_shorts:  cmd += ["--include-shorts"]
    return jsonify({"job_id": start_job(cmd)})

@app.route("/api/stream/<job_id>")
def api_stream(job_id):
    job = _jobs.get(job_id)
    if not job: return "not found", 404
    def generate():
        yield "retry: 1000\n\n"
        while True:
            try:
                line = job["queue"].get(timeout=30)
                if line.startswith("__EXIT__"):
                    yield f"data: {json.dumps({'done':True,'rc':int(line[8:])},ensure_ascii=False)}\n\n"; break
                yield f"data: {json.dumps({'line':line},ensure_ascii=False)}\n\n"
            except q_mod.Empty:
                if job["done"]: break
                yield 'data: {"ping":true}\n\n'
    return Response(generate(), mimetype="text/event-stream",
                    headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no"})

@app.route("/api/transcripts")
def api_transcripts():
    show_used = request.args.get("show_used", "0") == "1"
    processed = _load_processed()
    files = []
    for p in DB.glob("*/*.json"):
        if p.parent.name == "generated":
            continue
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
            if "transcript" not in d:
                continue
            vid    = d.get("video_id", p.stem)
            action = processed.get(vid, {}).get("action", "")
            if action == "deleted":
                continue
            if action == "used" and not show_used:
                continue
            files.append({
                "video_id":       vid,
                "prophet":        d.get("prophet",""),
                "title":          d.get("title",""),
                "published_at":   d.get("published_at",""),
                "transcribed_at": d.get("transcribed_at",""),
                "duration":       d.get("duration"),
                "word_count":     d.get("word_count") or len(d["transcript"].split()),
                "status":         d.get("status","done"),
                "warning":        d.get("warning",""),
                "lang":           d.get("lang","en"),
                "video_url":      d.get("video_url",""),
                "preview":        d["transcript"][:150].strip(),
                "processed":      action,
            })
        except Exception:
            pass
    files.sort(key=lambda x: x["published_at"], reverse=True)
    return jsonify(files)

@app.route("/api/transcript/<video_id>")
def api_transcript_detail(video_id):
    for p in DB.glob(f"*/{video_id}.json"):
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
            return jsonify({"transcript": d.get("transcript","")})
        except Exception:
            pass
    return jsonify({"error": "找不到"}), 404

@app.route("/api/queue-count")
def api_queue_count():
    try:
        items = json.loads((DB/"queue.json").read_text(encoding="utf-8")) if (DB/"queue.json").exists() else []
        by_s = {}
        for i in items: s=i.get("status","?"); by_s[s]=by_s.get(s,0)+1
        return jsonify({"total":len(items),"by_status":by_s})
    except Exception:
        return jsonify({"total":0,"by_status":{}})

@app.route("/api/generate", methods=["POST"])
def api_generate():
    data     = request.get_json(force=True) or {}
    video_id = data.get("video_id", "").strip()
    if not video_id:
        return jsonify({"error": "需要 video_id"}), 400
    cmd = [PYTHON, str(SCRIPTS / "generate.py"), video_id]
    return jsonify({"job_id": start_job(cmd)})

@app.route("/api/generated/<video_id>")
def api_generated(video_id):
    p = DB / "generated" / f"{video_id}.json"
    if not p.exists():
        return jsonify({"error": "尚未產生"}), 404
    try:
        return jsonify(json.loads(p.read_text(encoding="utf-8")))
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/open-db")
def api_open_db():
    subprocess.Popen(["open", str(DB)]); return jsonify({"ok":True})

@app.route("/api/processed")
def api_processed():
    return jsonify(_load_processed())

@app.route("/api/mark", methods=["POST"])
def api_mark():
    data     = request.get_json(force=True) or {}
    video_id = data.get("video_id", "").strip()
    action   = data.get("action", "").strip()
    if not video_id or action not in ("used", "deleted"):
        return jsonify({"error": "需要 video_id 和 action（used/deleted）"}), 400
    with _processed_lock:
        processed = _load_processed()
        processed[video_id] = {"action": action, "processed_at": datetime.now().isoformat()}
        _save_processed(processed)
        if action == "deleted":
            for p in DB.glob(f"*/{video_id}.json"):
                if p.parent.name != "generated":
                    try: p.unlink()
                    except Exception: pass
    return jsonify({"ok": True, "video_id": video_id, "action": action})

@app.route("/api/extract/<video_id>")
def api_extract_single(video_id):
    cache = EXTRACTS_DIR / f"{video_id}.json"
    if cache.exists():
        try:
            return jsonify(json.loads(cache.read_text(encoding="utf-8")))
        except Exception:
            pass
    return jsonify({"error": "尚未摘錄", "cached": False}), 404


@app.route("/api/extract", methods=["POST"])
def api_extract():
    data      = request.get_json(force=True) or {}
    video_ids = data.get("video_ids", [])
    force     = bool(data.get("force", False))
    if not video_ids:
        return jsonify({"error": "需要 video_ids"}), 400

    EXTRACTS_DIR.mkdir(parents=True, exist_ok=True)
    _ext_models = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"]

    def _do_one(vid):
        cache = EXTRACTS_DIR / f"{vid}.json"
        if not force and cache.exists():
            try:
                return vid, json.loads(cache.read_text(encoding="utf-8"))
            except Exception:
                pass
        tx_data = None
        for p in DB.glob(f"*/{vid}.json"):
            if p.parent.name in ("generated", "extracts"):
                continue
            try:
                d = json.loads(p.read_text(encoding="utf-8"))
                if "transcript" in d:
                    tx_data = d; break
            except Exception:
                pass
        if not tx_data:
            return vid, {"error": "找不到逐字稿", "video_id": vid}
        prompt = (_EXTRACT_PROMPT
            .replace("{title}",      tx_data.get("title", ""))
            .replace("{channel}",    tx_data.get("channel_name", ""))
            .replace("{date}",       tx_data.get("published_at", ""))
            .replace("{transcript}", tx_data.get("transcript", "")))
        try:
            raw   = call_gemini(prompt, max_tokens=8192, models=_ext_models, temperature=0.2)
            items = _parse_json_array(raw)
            result = {
                "video_id":     vid,
                "title":        tx_data.get("title", ""),
                "published_at": tx_data.get("published_at", ""),
                "prophet":      tx_data.get("prophet", ""),
                "video_url":    tx_data.get("video_url", ""),
                "items":        items,
                "extracted_at": datetime.now().isoformat(),
            }
            cache.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
            return vid, result
        except Exception as e:
            return vid, {"error": str(e), "video_id": vid}

    results = {}
    with ThreadPoolExecutor(max_workers=4) as ex:
        for vid, res in ex.map(_do_one, video_ids):
            results[vid] = res

    return jsonify({"ok": True, "results": results})


@app.route("/api/merge", methods=["POST"])
def api_merge():
    data      = request.get_json(force=True) or {}
    video_ids = data.get("video_ids", [])
    if not video_ids:
        return jsonify({"error": "需要 video_ids"}), 400

    prompt_text = ""
    if PROMPT_MERGE_FILE.exists():
        prompt_text = PROMPT_MERGE_FILE.read_text(encoding="utf-8").strip()

    transcripts = []
    for vid in video_ids:
        for p in DB.glob(f"*/{vid}.json"):
            if p.parent.name == "generated":
                continue
            try:
                d = json.loads(p.read_text(encoding="utf-8"))
                if "transcript" in d:
                    transcripts.append(d)
            except Exception:
                pass

    if not transcripts:
        return jsonify({"error": "找不到任何逐字稿"}), 404

    # Determine prophet (most frequent among selected)
    from collections import Counter
    prophet = Counter(d.get("prophet", "") for d in transcripts).most_common(1)[0][0]

    # Build sources block
    sources_lines = []
    for d in sorted(transcripts, key=lambda x: x.get("published_at", "")):
        sources_lines.append(
            f"標題：{d.get('title','')}\n"
            f"頻道：{d.get('channel_name','')}\n"
            f"日期：{d.get('published_at','')}\n"
            f"網址：{d.get('video_url','')}"
        )
    sources_text = "\n\n".join(sources_lines)

    # Hits / misses from blog frontmatter
    hits, misses = _get_hits_misses(prophet)
    hits_text    = "\n".join(hits)   if hits   else "無已判定紀錄"
    misses_text  = "\n".join(misses) if misses else "無已判定紀錄"

    # Build transcripts block — use extracts if cached, else raw transcript
    sep = "─" * 60
    tx_parts = []
    extracts_used = {}
    for d in sorted(transcripts, key=lambda x: x.get("published_at", "")):
        vid    = d.get("video_id", "")
        header = (
            f"{sep}\n"
            f"標題：{d.get('title','')}\n"
            f"日期：{d.get('published_at','')}\n"
            f"網址：{d.get('video_url','')}\n"
            f"{sep}\n\n"
        )
        body     = d.get("transcript", "")
        ext_path = EXTRACTS_DIR / f"{vid}.json"
        if ext_path.exists():
            try:
                ext   = json.loads(ext_path.read_text(encoding="utf-8"))
                items = ext.get("items") or []
                if items:
                    body = "\n\n".join(
                        f"[{it.get('position','?')}]【{it.get('topic','')}】\n"
                        f"{it.get('quote','')}\n"
                        f"時間點：{it.get('timeframe','無')}"
                        for it in items
                    )
                    extracts_used[vid] = ext
            except Exception:
                pass
        tx_parts.append(header + body)
    tx_section = "\n\n".join(tx_parts)
    if extracts_used:
        tx_section = (
            "【說明：以下素材為結構化摘錄，每條 quote 欄貼近說話者原話。"
            "請確保每支影片的每個條目都在文章中得到反映，不得遺漏任何影片。】\n\n"
        ) + tx_section

    if prompt_text and "{{" in prompt_text:
        full_prompt = (prompt_text
            .replace("{{PROPHET}}",     prophet)
            .replace("{{SOURCES}}",     sources_text)
            .replace("{{HITS}}",        hits_text)
            .replace("{{MISSES}}",      misses_text)
            .replace("{{TRANSCRIPTS}}", tx_section))
    elif prompt_text:
        full_prompt = prompt_text + "\n\n" + tx_section
    else:
        full_prompt = f"以下是多段預言影片的逐字稿，請整合成一篇部落格文章：\n\n{tx_section}"

    # 防機器人補充：避免每段都用同一個句式開頭
    full_prompt += (
        "\n\n【語氣與格式補充——這一點非常重要】\n"
        "一、輸出格式：第一行只放文章標題，第二行空行，第三行起才是文章正文。"
        "標題不要重複出現在正文裡。"
        "正文內不要有任何段落小標題，不管是純文字還是加符號的都不要。"
        "不同主題之間用空一行自然分段，不要在段落前加任何標題文字。\n"
        "二、段落開頭不要每段都用「我在八月X日的節目中」這個固定句式。"
        "每段句首要有變化，舉例：\n"
        "「說到疫苗這件事，我八月十一號講得很清楚⋯⋯」\n"
        "「八月十三號我提過，拜登政府解散了反詐欺團隊⋯⋯」\n"
        "「那次禱告節目裡我分享了一個夢⋯⋯」\n"
        "「我後來又想到，八月十七號那場直播我也說了⋯⋯」\n"
        "像真人在說話，不要像在念報告。"
        "同一個主題的不同日期發言，要自然地接在一起，不要切成一段一段的日期清單。"
    )

    import re as _re

    def _strip_md(s):
        s = _re.sub(r'\*\*(.+?)\*\*', r'\1', s)          # **bold**
        s = _re.sub(r'\*(.+?)\*', r'\1', s)               # *italic*
        s = _re.sub(r'^#{1,6}\s+', '', s, flags=_re.M)    # # headers
        s = _re.sub(r'^\s*[\*\-]\s+', '', s, flags=_re.M) # bullet points
        return s.strip()

    def _cjk_count(s):
        # Count CJK ideographs only — matches 繁體中文字數
        return sum(1 for c in s if '一' <= c <= '鿿'
                   or '㐀' <= c <= '䶿'
                   or '豈' <= c <= '﫿')

    _merge_models = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"]
    try:
        result = _strip_md(call_gemini(full_prompt, max_tokens=65536, models=_merge_models))
        cjk    = _cjk_count(result)

        # 字數不足 → 展開（帶原始逐字稿避免幻覺）
        if cjk < 2400:
            expand_prompt = (
                f"以下文章只有約 {cjk} 個繁體中文字，目標是 3300 到 3600 個繁體中文字，不能超過 3600 字。\n"
                f"請把每個主題段落展開成更詳細的版本。\n\n"
                f"嚴格規定：只能使用下方「原始逐字稿」裡出現過的事實、數字、人名、機構名稱和事件。"
                f"不得自行補充任何逐字稿中沒有提到的資訊。若逐字稿中某主題的內容確實有限，"
                f"就把他說過的話重複強調或換不同角度呈現，不要捏造。\n\n"
                f"全篇必須用第一人稱，主角親口說話，不能有任何第三人稱敘述。\n"
                f"純文字輸出，不加 markdown 格式，不加粗體，不加星號，不加井字號標題，不加項目符號。\n\n"
                f"【待展開的文章】\n{result}\n\n"
                f"【原始逐字稿（唯一允許取材的來源）】\n{tx_section}"
            )
            result = _strip_md(call_gemini(expand_prompt, max_tokens=65536, models=_merge_models))
            cjk    = _cjk_count(result)

        # 字數超過 3600 → 裁剪（最多兩次）
        for _pass in range(2):
            if cjk <= 3600:
                break
            trim_prompt = (
                f"以下文章共約 {cjk} 個繁體中文字，超出 3600 字的上限。\n"
                f"請裁剪到 3000 到 3200 個繁體中文字之間。\n\n"
                f"裁剪原則：\n"
                f"優先刪除重複敘述、過度舉例或次要細節。\n"
                f"必須保留三個區塊：命中與未命中說明、主要預言內容、2026 年後時間表。\n"
                f"全篇保持第一人稱，不能有任何第三人稱敘述。\n"
                f"純文字輸出，不加 markdown 格式，不加粗體，不加星號，不加井字號標題，不加項目符號。\n"
                f"只輸出裁剪後的完整文章，不要加任何說明或前言。\n\n"
                f"【待裁剪的文章】\n{result}"
            )
            result = _strip_md(call_gemini(trim_prompt, max_tokens=65536, models=_merge_models))
            cjk    = _cjk_count(result)

        # ── 涵蓋率檢查（最多重試兩次）──────────────────────────────
        coverage = None
        if extracts_used:
            missing_vids = _check_coverage(result, extracts_used)
            retried = 0
            for _attempt in range(2):
                if not missing_vids:
                    break
                retried += 1
                missing_lines = []
                for v in missing_vids:
                    if v in extracts_used:
                        ext = extracts_used[v]
                        items_text = "\n".join(
                            f"  • {it.get('topic','')}：{it.get('quote','')[:120]}"
                            for it in (ext.get("items") or [])[:6]
                        )
                        missing_lines.append(f"《{ext.get('title', v)[:40]}》\n{items_text}")
                retry_prompt = (
                    full_prompt +
                    f"\n\n【必須補入：以下影片的內容在前版文章中完全缺席，"
                    f"本次必須為每支影片寫至少一個完整段落】\n\n" +
                    "\n\n".join(missing_lines)
                )
                result = _strip_md(call_gemini(retry_prompt, max_tokens=65536, models=_merge_models))
                cjk    = _cjk_count(result)
                missing_vids = _check_coverage(result, extracts_used)

            total   = len(extracts_used)
            covered = total - len(missing_vids)
            coverage = {
                "total":   total,
                "covered": covered,
                "missing": len(missing_vids),
                "titles":  [extracts_used[v].get("title", v) for v in missing_vids if v in extracts_used],
                "retried": retried,
            }

        return jsonify({"ok": True, "article": result,
                        "count": len(transcripts), "char_count": cjk,
                        "coverage": coverage})
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/gen_title", methods=["POST"])
def api_gen_title():
    data    = request.get_json(force=True)
    article = (data.get("article") or "").strip()
    prophet = (data.get("prophet") or "").strip()
    if not article:
        return jsonify({"error": "沒有文章內容"}), 400

    prophet_label = f"「{prophet}」" if prophet else "這位預言者"
    prompt = (
        f"以下是一篇關於預言者 {prophet} 的繁體中文部落格文章。\n"
        f"請給我一個台灣人會想點的標題。\n"
        f"規則：\n"
        f"標題裡必須出現 {prophet_label} 這個名字。\n"
        f"人名之後接他說了什麼，要有具體的數字、事件或衝突點，不要空泛。\n"
        f"標題總長度 25 到 30 個字之間（人名算在內）。\n"
        f"不要加引號、不要加書名號、不要加任何標點符號。\n"
        f"只輸出標題本身，不要解釋，不要加任何前言或說明。\n\n"
        f"【文章】\n{article[:3000]}"
    )
    _title_models = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-3.1-flash-lite"]
    try:
        title = call_gemini(prompt, max_tokens=128, models=_title_models).strip()
        # 移除可能殘留的引號或書名號
        import re as _re2
        title = _re2.sub(r'^[「『《〈\"\']|[」』》〉\"\']$', '', title).strip()
        return jsonify({"ok": True, "title": title})
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/verify", methods=["POST"])
def api_verify():
    data       = request.get_json(force=True)
    article    = (data.get("article") or "").strip()
    video_ids  = data.get("video_ids") or []

    if not article:
        return jsonify({"error": "沒有文章內容"}), 400
    if not video_ids:
        return jsonify({"error": "沒有指定逐字稿 video_ids"}), 400

    transcripts = []
    for vid in video_ids:
        for p in DB.glob(f"*/{vid}.json"):
            try:
                d = json.loads(p.read_text(encoding="utf-8"))
                if "transcript" in d:
                    transcripts.append(d)
            except Exception:
                pass

    if not transcripts:
        return jsonify({"error": "找不到對應逐字稿"}), 404

    sep = "─" * 60
    tx_parts = []
    for d in sorted(transcripts, key=lambda x: x.get("published_at", "")):
        tx_parts.append(
            f"{sep}\n"
            f"標題：{d.get('title','')}\n"
            f"日期：{d.get('published_at','')}\n"
            f"{sep}\n\n"
            f"{d.get('transcript','')}"
        )
    tx_section = "\n\n".join(tx_parts)

    verify_prompt = (
        "你是一位事實查核員。以下是一篇整理文章，以及它的原始逐字稿來源。\n"
        "請逐一核查這篇文章中的每一個具體聲明，包括所有數字、百分比、人名、機構名稱、日期、事件描述。\n"
        "判斷每條聲明能否在逐字稿中找到對應的根據。\n\n"
        "輸出格式（每條聲明一行）：\n"
        "✓ [可核實] 聲明內容 → 逐字稿原文依據\n"
        "✗ [無法核實] 聲明內容 → 逐字稿中找不到此說法\n"
        "⚠ [內容不符] 聲明內容 → 實際逐字稿說法\n\n"
        "最後給出總結：可核實幾條、無法核實幾條、內容不符幾條。\n\n"
        f"【待查核的文章】\n{article}\n\n"
        f"【原始逐字稿（唯一可信來源）】\n{tx_section}"
    )

    _verify_models = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"]
    try:
        report = call_gemini(verify_prompt, max_tokens=16384, models=_verify_models)
        return jsonify({"ok": True, "report": report})
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/post_prompt", methods=["POST"])
def api_post_prompt():
    data    = request.get_json(force=True)
    article = (data.get("article") or "").strip()
    if not article:
        return jsonify({"error": "沒有文章內容"}), 400
    filled = POST_PROMPT_TEMPLATE.replace("{{ARTICLE}}", article)
    _post_models = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"]
    try:
        posts = call_gemini(filled, max_tokens=8192, models=_post_models)
        return jsonify({"ok": True, "posts": posts})
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 500


# ── HTML ─────────────────────────────────────────────────────────────────────

HTML = r"""<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>預言管線</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#0f1117;--surface:#1a1d27;--border:#2a2d3a;
  --text:#e2e8f0;--muted:#8892a4;
  --green:#4ade80;--red:#f87171;--amber:#fbbf24;--blue:#60a5fa;--purple:#a78bfa;
  --r:10px;
}
body{font-family:-apple-system,"PingFang TC",sans-serif;background:var(--bg);color:var(--text);
  min-height:100vh;padding:0 0 80px}

/* top bar */
.topbar{
  display:flex;align-items:center;gap:12px;flex-wrap:wrap;
  padding:16px 24px;border-bottom:1px solid var(--border);
  background:var(--surface);position:sticky;top:0;z-index:100;
}
.topbar-title{font-size:16px;font-weight:700;margin-right:8px}
.topbar-status{font-size:12px;color:var(--muted)}
.spacer{flex:1}
.btn{
  display:inline-flex;align-items:center;gap:6px;border:none;border-radius:7px;
  padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;transition:opacity .15s;
  white-space:nowrap;
}
.btn:disabled{opacity:.4;cursor:not-allowed}
.btn-primary{background:var(--blue);color:#0f172a}
.btn-green{background:var(--green);color:#0f172a}
.btn-ghost{background:var(--border);color:var(--text)}
.btn-purple{background:var(--purple);color:#0f172a}
.btn-amber{background:var(--amber);color:#0f172a}
.btn:not(:disabled):hover{opacity:.85}
input[type=number]{
  width:58px;background:var(--bg);border:1px solid var(--border);
  border-radius:6px;padding:6px 8px;font-size:13px;color:var(--text);outline:none;
}
input[type=number]:focus{border-color:var(--blue)}
input[type=text]{
  flex:1;background:var(--bg);border:1px solid var(--border);
  border-radius:6px;padding:8px 12px;font-size:13px;color:var(--text);outline:none;
}
input[type=text]:focus{border-color:var(--blue)}
select{background:var(--bg);border:1px solid var(--border);border-radius:6px;
  padding:7px 10px;font-size:13px;color:var(--text);outline:none;cursor:pointer}

/* running indicator */
.running-bar{
  display:none;align-items:center;gap:10px;
  padding:10px 24px;background:#1d2233;border-bottom:1px solid var(--border);
  font-size:13px;
}
.running-bar.show{display:flex}
.spinner{width:16px;height:16px;border:2px solid var(--border);border-top-color:var(--blue);
  border-radius:50%;animation:spin .7s linear infinite;flex-shrink:0}
@keyframes spin{to{transform:rotate(360deg)}}
.running-msg{flex:1;color:var(--muted)}
.running-detail{font-size:12px;color:var(--blue);max-width:500px;overflow:hidden;
  white-space:nowrap;text-overflow:ellipsis}

/* stats bar */
.stats{display:flex;gap:0;border-bottom:1px solid var(--border)}
.stat{flex:1;text-align:center;padding:12px 8px;border-right:1px solid var(--border)}
.stat:last-child{border-right:none}
.stat-val{font-size:22px;font-weight:700;line-height:1}
.stat-label{font-size:11px;color:var(--muted);margin-top:3px}

/* section head */
.section{padding:20px 24px 0}
.section-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.section-title{font-size:13px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.5px}

/* prophet groups */
.tx-list{display:flex;flex-direction:column;gap:12px;padding:0 24px 24px}
.prophet-group{display:flex;flex-direction:column;gap:0}
.group-head{
  display:flex;align-items:center;gap:10px;padding:10px 16px;cursor:pointer;
  background:#1e2130;border:1px solid var(--border);border-radius:var(--r);
  font-size:13px;transition:background .15s;user-select:none;
}
.group-head:hover{background:#252840}
.group-arrow{font-size:11px;color:var(--muted);width:10px;flex-shrink:0}
.group-name{font-weight:700;color:var(--blue)}
.group-count{font-size:11px;color:var(--muted);margin-left:auto}
.group-body{display:flex;flex-direction:column;gap:8px;margin-top:8px;padding-left:12px}

/* transcript cards */
.tx-card{
  background:var(--surface);border:1px solid var(--border);border-radius:var(--r);
  transition:border-color .15s;overflow:hidden;
}
.tx-card:hover{border-color:var(--blue)}
.tx-card.expanded{border-color:var(--blue)}
.tx-card.used-card{opacity:.55}
.tx-head{display:flex;align-items:center;gap:10px;padding:14px 16px;cursor:pointer}
.tx-check{
  width:15px;height:15px;flex-shrink:0;cursor:pointer;
  accent-color:var(--blue);
}
.tx-info{flex:1;overflow:hidden}
.tx-title{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:3px}
.tx-meta{font-size:11px;color:var(--muted)}
.tx-badge{
  font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;flex-shrink:0;
}
.badge-done{background:#14532d;color:#86efac}
.badge-incomplete{background:#713f12;color:#fde68a}
.badge-used{background:#1a2a3a;color:#60a5fa}
.tx-card-btns{display:flex;gap:5px;flex-shrink:0}
.btn-tiny{
  border:none;border-radius:5px;padding:4px 8px;font-size:11px;font-weight:600;
  cursor:pointer;transition:opacity .15s;white-space:nowrap;line-height:1.3;
}
.btn-tiny:hover{opacity:.75}
.btn-used{background:#1a3a2a;color:#4ade80;border:1px solid #2d6447}
.btn-del{background:#3a1a1a;color:#f87171;border:1px solid #6b2525}
.tx-body{
  display:none;border-top:1px solid var(--border);padding:16px;
  font-size:13px;line-height:1.8;white-space:pre-wrap;max-height:400px;overflow-y:auto;
  color:#cbd5e1;
}
.tx-body.show{display:block}
.tx-actions{display:flex;gap:8px;padding:10px 16px;border-top:1px solid var(--border);align-items:center}

/* sticky selection bar */
.select-bar{
  display:none;position:fixed;bottom:0;left:0;right:0;
  background:#1d2233;border-top:2px solid var(--blue);
  padding:12px 24px;align-items:center;gap:10px;z-index:200;
  box-shadow:0 -4px 24px rgba(0,0,0,.5);
}
.select-count{font-size:13px;font-weight:600;color:var(--text)}

/* log panel */
.log-panel{margin:0 24px 24px}
.log-toggle{
  display:flex;align-items:center;justify-content:space-between;cursor:pointer;
  padding:10px 14px;background:var(--surface);border:1px solid var(--border);
  border-radius:var(--r);font-size:13px;margin-bottom:8px;
}
.log-box{
  display:none;background:#0a0c12;border:1px solid var(--border);border-radius:var(--r);
  padding:14px;font-family:"SF Mono","Fira Code",monospace;font-size:11px;
  line-height:1.7;height:280px;overflow-y:auto;white-space:pre-wrap;
}
.log-box.show{display:block}
.l-ok{color:var(--green)}.l-err{color:var(--red)}.l-warn{color:var(--amber)}
.l-info{color:var(--blue)}.l-dim{color:var(--muted)}

/* manual section */
.manual{
  margin:0 24px 24px;background:var(--surface);border:1px solid var(--border);
  border-radius:var(--r);padding:18px;
}
.manual h3{font-size:13px;font-weight:600;color:var(--muted);text-transform:uppercase;
  letter-spacing:.5px;margin-bottom:12px}
.manual-row{display:flex;gap:8px;align-items:center}
.manual-result{margin-top:14px;display:none}
.manual-result.show{display:block}
.manual-text{
  background:#0a0c12;border:1px solid var(--border);border-radius:8px;
  padding:14px;font-size:13px;line-height:1.8;max-height:300px;overflow-y:auto;
  white-space:pre-wrap;margin-top:8px;
}
.manual-meta{font-size:12px;color:var(--muted);margin-bottom:4px}
.err-text{color:var(--red)}
.spinner-sm{width:13px;height:13px;border:2px solid var(--border);border-top-color:var(--blue);
  border-radius:50%;animation:spin .7s linear infinite;display:inline-block;vertical-align:middle}

.empty{text-align:center;color:var(--muted);padding:40px;font-size:14px}

/* merge panel */
.merge-panel{
  margin:0 24px 24px;background:var(--surface);border:1px solid var(--amber);
  border-radius:var(--r);padding:18px;
}
.merge-text{
  background:#0a0c12;border:1px solid var(--border);border-radius:8px;
  padding:14px;font-size:13px;line-height:1.8;max-height:500px;overflow-y:auto;
  white-space:pre-wrap;color:#cbd5e1;margin-top:8px;
}
.verify-box{
  display:none;margin-top:14px;background:#0a0c12;border:1px solid var(--green);
  border-radius:8px;padding:14px;font-size:13px;line-height:1.8;max-height:400px;
  overflow-y:auto;white-space:pre-wrap;color:#cbd5e1;
}
.verify-box.show{display:block}

/* generate panel */
.gen-panel{
  margin:0 24px 24px;background:var(--surface);border:1px solid var(--purple);
  border-radius:var(--r);padding:18px;display:none;
}
.gen-panel.show{display:block}
.gen-section{margin-bottom:16px}
.gen-label{font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;
  letter-spacing:.5px;margin-bottom:6px}
.gen-text{
  background:#0a0c12;border:1px solid var(--border);border-radius:8px;
  padding:14px;font-size:13px;line-height:1.8;max-height:300px;overflow-y:auto;
  white-space:pre-wrap;color:#cbd5e1;
}
.gen-row{display:flex;gap:8px;margin-top:8px}
.warn-badge{font-size:11px;padding:3px 9px;border-radius:20px;
  background:#7c2d12;color:#fca5a5;display:inline-block;margin:0 4px 6px 0}

/* extract review */
.extract-review{display:none;margin-top:12px}
.extract-review.show{display:block}
.ext-video{border:1px solid var(--border);border-radius:8px;margin-bottom:8px;overflow:hidden}
.ext-video-head{
  display:flex;align-items:center;gap:8px;padding:9px 14px;cursor:pointer;
  background:#12151f;font-size:13px;
}
.ext-video-head:hover{background:#1a1e2e}
.ext-video-body{padding:10px;display:flex;flex-direction:column;gap:6px}
.ext-item{background:#0a0c12;border:1px solid #1e2030;border-radius:6px;padding:9px}
.ext-item-head{display:flex;gap:8px;align-items:center;margin-bottom:5px;flex-wrap:wrap}
.ext-topic{font-size:11px;font-weight:700;color:var(--blue);background:#1a2a3a;
  padding:2px 8px;border-radius:10px}
.ext-pos{font-size:11px;color:var(--muted)}
.ext-time{font-size:11px;color:var(--amber);margin-left:auto}
.ext-quote{font-size:12px;line-height:1.7;color:#cbd5e1;white-space:pre-wrap}
.coverage-line{font-size:12px;padding:7px 10px;border-radius:6px;
  background:#0a0c12;margin-bottom:10px;display:none}

/* card extract area */
.tx-extract{display:none;border-top:1px solid var(--border);
  background:#08090f;padding:10px;flex-direction:column;gap:6px}
.tx-extract.show{display:flex}
</style>
</head>
<body>

<!-- top bar -->
<div class="topbar">
  <span class="topbar-title">📡 預言管線</span>
  <span class="topbar-status" id="topStatus"></span>
  <div class="spacer"></div>
  <label style="font-size:12px;color:var(--muted)">掃所有頻道</label>
  <button class="btn btn-primary" id="btnScan" onclick="runScan()">▶ 掃描新片</button>
  <label style="font-size:12px;color:var(--muted);margin-left:6px">轉錄</label>
  <input type="number" id="txLimit" value="10" min="1" max="30" title="支數">
  <label style="font-size:12px;color:var(--muted)">支</label>
  <label style="font-size:12px;color:var(--muted);display:flex;align-items:center;gap:4px;cursor:pointer">
    <input type="checkbox" id="inclShorts" style="cursor:pointer"> 含短影音
  </label>
  <button class="btn btn-green" id="btnTx" onclick="runTranscribe()">▶ 開始轉錄</button>
  <button class="btn btn-ghost" onclick="openDb()" title="在 Finder 開啟">📂</button>
</div>

<!-- running bar -->
<div class="running-bar" id="runBar">
  <div class="spinner"></div>
  <span class="running-msg" id="runMsg">執行中…</span>
  <span class="running-detail" id="runDetail"></span>
</div>

<!-- stats -->
<div class="stats" id="statsBar">
  <div class="stat"><div class="stat-val" id="sTx">—</div><div class="stat-label">已轉錄</div></div>
  <div class="stat"><div class="stat-val" id="sQueue" style="color:var(--amber)">—</div><div class="stat-label">待轉錄</div></div>
  <div class="stat"><div class="stat-val" id="sFail" style="color:var(--red)">—</div><div class="stat-label">下載失敗</div></div>
  <div class="stat"><div class="stat-val" id="sDefer" style="color:var(--muted)">—</div><div class="stat-label">延至明天</div></div>
</div>

<!-- transcript list -->
<div class="section">
  <div class="section-head">
    <span class="section-title">逐字稿</span>
    <div style="display:flex;gap:10px;align-items:center">
      <label style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--muted);cursor:pointer">
        <input type="checkbox" id="showUsed" onchange="loadTranscripts()" style="cursor:pointer"> 顯示已用
      </label>
      <button class="btn btn-ghost" style="padding:5px 10px;font-size:12px" onclick="loadTranscripts()">↺ 重新整理</button>
    </div>
  </div>
</div>
<div class="tx-list" id="txList"><div class="empty">載入中…</div></div>

<!-- sticky selection bar -->
<div class="select-bar" id="selectBar">
  <span class="select-count" id="selectCount">已選 0 支</span>
  <div class="spacer"></div>
  <button class="btn btn-ghost" onclick="clearSelection()">取消全選</button>
  <button class="btn btn-ghost" style="color:var(--green)" onclick="markSelected('used')">✓ 標記已用</button>
  <button class="btn btn-primary" id="btnExport" onclick="exportSelected()">📥 匯出文字</button>
  <button class="btn btn-ghost" id="btnExtract" onclick="extractSelected()">📄 摘錄</button>
  <button class="btn btn-amber" id="btnMerge" onclick="mergeSelected()">✨ 合成文章</button>
</div>

<!-- log -->
<div class="log-panel">
  <div class="log-toggle" onclick="toggleLog()">
    <span>▸ 執行記錄（供診斷用）</span>
    <button class="btn btn-ghost" style="padding:4px 10px;font-size:11px" onclick="event.stopPropagation();clearLog()">清除</button>
  </div>
  <div class="log-box" id="logBox"></div>
</div>

<!-- manual -->
<div class="manual">
  <h3>手動測試轉錄</h3>
  <div class="manual-row">
    <input type="text" id="manualUrl" placeholder="貼上 YouTube 網址…">
    <select id="manualLang">
      <option value="auto">自動</option><option value="zh">中文</option>
      <option value="en">英文</option><option value="ja">日文</option>
      <option value="pl">波蘭文</option>
    </select>
    <button class="btn btn-purple" id="btnManual" onclick="runManual()">✨ 轉錄</button>
  </div>
  <div class="manual-result" id="manualResult">
    <div class="manual-meta" id="manualMeta"></div>
    <div class="manual-text" id="manualText"></div>
    <div style="margin-top:8px">
      <button class="btn btn-ghost" style="padding:5px 12px;font-size:12px" onclick="copyManual()">📋 複製逐字稿</button>
    </div>
  </div>
</div>

<!-- merge panel -->
<div class="merge-panel" id="mergePanel" style="display:none">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
    <div style="font-size:13px;font-weight:600;color:var(--amber)">
      ✨ 合成文章 &mdash; <span id="mergeMeta" style="color:var(--muted);font-weight:400"></span>
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <div id="mergeActions" style="display:none;gap:8px">
        <button class="btn btn-ghost" style="padding:4px 10px;font-size:11px"
          onclick="copyMerge()">📋 複製</button>
        <button class="btn btn-ghost" style="padding:4px 10px;font-size:11px;color:var(--green)"
          id="btnVerify" onclick="verifyMerge()">🔍 驗證</button>
        <button class="btn btn-ghost" style="padding:4px 10px;font-size:11px;color:var(--blue)"
          id="btnPostPrompt" onclick="showPostPrompt()">📝 貼文提示詞</button>
      </div>
      <button class="btn btn-ghost" style="padding:4px 10px;font-size:11px"
        onclick="document.getElementById('mergePanel').style.display='none'">✕ 關閉</button>
    </div>
  </div>
  <!-- Stage 1: extract review -->
  <div class="extract-review" id="extractReview"></div>
  <!-- Stage 2: article -->
  <div class="coverage-line" id="coverageLine"></div>
  <div id="mergeTitleWrap" style="display:none;margin-bottom:8px">
    <div style="display:flex;align-items:center;gap:8px">
      <div id="mergeTitle" style="flex:1;font-size:15px;font-weight:600;color:var(--text);
        padding:10px 14px;background:#12151f;border:1px solid var(--amber);border-radius:6px;
        cursor:pointer" title="點擊複製標題"
        onclick="navigator.clipboard.writeText(this.textContent)"></div>
      <button class="btn btn-ghost" style="padding:4px 10px;font-size:11px;white-space:nowrap"
        id="btnRegenTitle" onclick="regenTitle()">🔄 重新生成</button>
    </div>
  </div>
  <div class="merge-text" id="mergeResult" style="display:none"></div>
  <div class="verify-box" id="verifyResult"></div>
  <div class="verify-box" id="postPromptBox" style="border-color:var(--blue);margin-top:14px"></div>
</div>

<!-- generate panel -->
<div class="gen-panel" id="genPanel">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
    <div style="font-size:13px;font-weight:600;color:var(--purple)">
      ✨ 產生文章 &mdash; <span id="genSubtitle" style="color:var(--text)"></span>
    </div>
    <button class="btn btn-ghost" style="padding:4px 10px;font-size:11px" onclick="closeGen()">✕ 關閉</button>
  </div>
  <div id="genWarnings" style="margin-bottom:10px"></div>
  <div id="genLoading" style="color:var(--muted);font-size:13px;padding:8px 0">正在產生…</div>
  <div id="genContent" style="display:none">
    <div class="gen-section">
      <div class="gen-label">文章標題</div>
      <div class="gen-text" id="genArticleTitle" style="max-height:60px"></div>
      <div class="gen-row">
        <button class="btn btn-ghost" style="padding:5px 12px;font-size:12px"
          onclick="copyGen('genArticleTitle')">📋 複製標題</button>
      </div>
    </div>
    <div class="gen-section">
      <div class="gen-label">文章內文</div>
      <div class="gen-text" id="genArticleBody"></div>
      <div class="gen-row">
        <button class="btn btn-ghost" style="padding:5px 12px;font-size:12px"
          onclick="copyGen('genArticleBody')">📋 複製內文</button>
      </div>
    </div>
    <div class="gen-section">
      <div class="gen-label">社群貼文</div>
      <div class="gen-text" id="genSocialPost" style="max-height:220px"></div>
      <div class="gen-row">
        <button class="btn btn-ghost" style="padding:5px 12px;font-size:12px"
          onclick="copyGen('genSocialPost')">📋 複製貼文</button>
      </div>
    </div>
    <div class="gen-section">
      <div class="gen-label">留言短句</div>
      <div class="gen-text" id="genComment" style="max-height:60px"></div>
      <div class="gen-row">
        <button class="btn btn-ghost" style="padding:5px 12px;font-size:12px"
          onclick="copyGen('genComment')">📋 複製留言</button>
      </div>
    </div>
  </div>
</div>

<script>
let currentEs = null;
const _txData = {};   // video_id → transcript metadata
let _selected = new Set();
let _lastMergeVids = [];
let _lastMergeProphet = '';
let _lastExtractVids = [];
let _extractResults  = {};

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── stats ─────────────────────────────────────────────────────────────────

async function loadStats() {
  try {
    const [txData, qData] = await Promise.all([
      fetch('/api/transcripts?show_used=1').then(r=>r.json()),
      fetch('/api/queue-count').then(r=>r.json()),
    ]);
    document.getElementById('sTx').textContent    = txData.length;
    const bs = qData.by_status || {};
    document.getElementById('sQueue').textContent = bs.queued  || 0;
    document.getElementById('sFail').textContent  = (bs.failed || 0) + (bs.incomplete || 0);
    document.getElementById('sDefer').textContent = bs.deferred || 0;
  } catch(e) {}
}

// ── transcripts ───────────────────────────────────────────────────────────

async function loadTranscripts() {
  const list     = document.getElementById('txList');
  const showUsed = document.getElementById('showUsed').checked;
  try {
    const url   = '/api/transcripts' + (showUsed ? '?show_used=1' : '');
    const files = await fetch(url).then(r => r.json());

    if (!files.length) {
      list.innerHTML = '<div class="empty">尚無逐字稿，先執行掃描和轉錄。</div>';
      return;
    }
    files.forEach(f => _txData[f.video_id] = f);

    // Group by prophet
    const groups = {};
    files.forEach(f => {
      const p = f.prophet || '（未知）';
      if (!groups[p]) groups[p] = [];
      groups[p].push(f);
    });
    // Sort within each group: published_at newest first
    Object.keys(groups).forEach(p => {
      groups[p].sort((a, b) => (b.published_at||'').localeCompare(a.published_at||''));
    });
    const sortedProphets = Object.keys(groups).sort();

    list.innerHTML = sortedProphets.map((prophet, idx) => {
      const items = groups[prophet];
      const grpId = 'grp-' + idx;
      const cards = items.map(f => renderCard(f)).join('');
      const vidsJson = items.map(f=>f.video_id).join(',');
      return `<div class="prophet-group">
        <div class="group-head" onclick="toggleGroup('${grpId}')">
          <span class="group-arrow" id="arr-${grpId}">▾</span>
          <span class="group-name">${esc(prophet)}</span>
          <span class="group-count">${items.length} 支</span>
          <button class="btn-tiny" id="gsel-${grpId}"
            style="margin-left:8px;background:#1a2a3a;color:#60a5fa;border:1px solid #2a4a6a;padding:3px 10px"
            onclick="event.stopPropagation();selectGroup('${grpId}')">全選</button>
        </div>
        <div class="group-body" id="${grpId}" data-vids="${vidsJson}">${cards}</div>
      </div>`;
    }).join('');
  } catch(e) {
    list.innerHTML = `<div class="empty">讀取失敗：${e.message}</div>`;
  }
}

function renderCard(f) {
  const vid    = f.video_id;
  const dur    = f.duration ? `${(f.duration/60).toFixed(1)} 分` : '';
  const wc     = f.word_count ? `${f.word_count} 字` : '';
  const meta   = [f.published_at, dur, wc].filter(Boolean).join(' · ');
  const ok     = f.status === 'done';
  const badge  = ok
    ? '<span class="tx-badge badge-done">✓ 完整</span>'
    : '<span class="tx-badge badge-incomplete">⚠ 疑似不完整</span>';
  const isUsed    = f.processed === 'used';
  const usedBadge = isUsed ? '<span class="tx-badge badge-used">已用</span>' : '';
  const inMerge   = _selected.has(vid);
  const chkd      = inMerge ? 'checked' : '';
  const cls       = isUsed ? 'tx-card used-card' : 'tx-card';
  const useBtn    = isUsed ? '' :
    `<button class="btn-tiny btn-used" onclick="markCard('${vid}','used')">✓ 已用</button>`;
  const addLabel  = inMerge ? '✓ 已加入合成' : '＋ 加入合成';
  const addStyle  = inMerge
    ? 'background:var(--green);color:#0f172a;'
    : 'background:var(--amber);color:#0f172a;';

  return `<div class="${cls}" id="card-${vid}">
    <div class="tx-head" onclick="toggleCard('${vid}')">
      <input type="checkbox" class="tx-check" ${chkd}
        onclick="event.stopPropagation();toggleSelect('${vid}',this.checked)">
      <div class="tx-info">
        <div class="tx-title">${esc(f.title)}</div>
        <div class="tx-meta">${meta}</div>
      </div>
      ${badge}${usedBadge}
      <div class="tx-card-btns" onclick="event.stopPropagation()">
        ${useBtn}
        <button class="btn-tiny btn-del" onclick="markCard('${vid}','deleted')">🗑</button>
      </div>
    </div>
    <div class="tx-body" id="body-${vid}">載入中…</div>
    <div class="tx-actions" id="act-${vid}" style="display:none">
      <button class="btn btn-ghost" style="padding:5px 12px;font-size:12px"
        onclick="event.stopPropagation();copyCard('${vid}')">📋 複製</button>
      <button class="btn btn-purple" style="padding:5px 12px;font-size:12px" id="genBtn-${vid}"
        onclick="event.stopPropagation();generateArticle('${vid}',this)">✨ 產生文章</button>
      <button class="btn btn-ghost" style="padding:5px 12px;font-size:12px;color:var(--blue)"
        id="extBtn-${vid}"
        onclick="event.stopPropagation();showCardExtract('${vid}',this)">📄 摘錄</button>
      <a href="${esc(f.video_url)}" target="_blank"
        onclick="event.stopPropagation()"
        style="font-size:12px;color:var(--blue);text-decoration:none;padding:5px 0">▶ 看原片</a>
      <div style="flex:1"></div>
      <button class="btn" style="padding:5px 12px;font-size:12px;${addStyle}" id="addBtn-${vid}"
        onclick="event.stopPropagation();addToMerge('${vid}')">${addLabel}</button>
    </div>
    <div class="tx-extract" id="tx-ext-${vid}"></div>
  </div>`;
}

function toggleGroup(grpId) {
  const body  = document.getElementById(grpId);
  const arrow = document.getElementById('arr-' + grpId);
  const open  = body.style.display !== 'none';
  body.style.display = open ? 'none' : '';
  if (arrow) arrow.textContent = open ? '▸' : '▾';
}

async function toggleCard(vid) {
  const card = document.getElementById('card-'+vid);
  const body = document.getElementById('body-'+vid);
  const act  = document.getElementById('act-'+vid);
  const open = body.classList.toggle('show');
  card.classList.toggle('expanded', open);
  act.style.display = open ? 'flex' : 'none';
  if (open && body.textContent === '載入中…') {
    const r = await fetch(`/api/transcript/${vid}`).then(r=>r.json());
    body.textContent = r.transcript || r.error || '（空）';
  }
}

async function copyCard(vid) {
  const body = document.getElementById('body-'+vid);
  await navigator.clipboard.writeText(body.textContent);
  const btn = event.target;
  btn.textContent = '✓ 已複製'; setTimeout(()=>btn.textContent='📋 複製', 1500);
}

// ── selection ─────────────────────────────────────────────────────────────

function toggleSelect(vid, checked) {
  if (checked) _selected.add(vid);
  else _selected.delete(vid);
  _syncAddBtn(vid, checked);
  _syncGroupSelBtn(vid);
  updateSelectBar();
}

function selectGroup(grpId) {
  const body   = document.getElementById(grpId);
  const vids   = (body ? body.dataset.vids || '' : '').split(',').filter(Boolean);
  if (!vids.length) return;
  const allSel = vids.every(v => _selected.has(v));
  vids.forEach(vid => {
    const want = !allSel;
    if (want) _selected.add(vid); else _selected.delete(vid);
    const cb = document.querySelector(`#card-${vid} .tx-check`);
    if (cb) cb.checked = want;
    _syncAddBtn(vid, want);
  });
  const btn = document.getElementById('gsel-' + grpId);
  if (btn) btn.textContent = allSel ? '全選' : '取消全選';
  updateSelectBar();
}

function _syncAddBtn(vid, checked) {
  const btn = document.getElementById('addBtn-' + vid);
  if (!btn) return;
  if (checked) { btn.textContent = '✓ 已加入合成'; btn.style.background = 'var(--green)'; btn.style.color = '#0f172a'; }
  else         { btn.textContent = '＋ 加入合成';  btn.style.background = '';              btn.style.color = ''; }
}

function _syncGroupSelBtn(vid) {
  document.querySelectorAll('[id^="grp-"]').forEach(body => {
    const vids = (body.dataset.vids || '').split(',').filter(Boolean);
    if (!vids.includes(vid)) return;
    const btn = document.getElementById('gsel-' + body.id);
    if (btn) btn.textContent = vids.every(v => _selected.has(v)) ? '取消全選' : '全選';
  });
}

function clearSelection() {
  _selected.clear();
  document.querySelectorAll('.tx-check').forEach(cb => { cb.checked = false; });
  document.querySelectorAll('[id^="addBtn-"]').forEach(btn => {
    btn.textContent = '＋ 加入合成'; btn.style.background = ''; btn.style.color = '';
  });
  document.querySelectorAll('[id^="gsel-"]').forEach(btn => { btn.textContent = '全選'; });
  updateSelectBar();
}

function updateSelectBar() {
  const bar = document.getElementById('selectBar');
  const n   = _selected.size;
  document.getElementById('selectCount').textContent = `已選 ${n} 支`;
  bar.style.display = n > 0 ? 'flex' : 'none';
}

function addToMerge(vid) {
  _selected.add(vid);
  const cb = document.querySelector(`#card-${vid} .tx-check`);
  if (cb) cb.checked = true;
  _syncAddBtn(vid, true);
  _syncGroupSelBtn(vid);
  updateSelectBar();
}

// ── mark / delete ─────────────────────────────────────────────────────────

async function markCard(vid, action) {
  const f = _txData[vid] || {};
  if (action === 'deleted') {
    const t = f.title ? `「${f.title.slice(0,30)}」` : vid;
    if (!confirm(`確定要刪除這支逐字稿？\n${t}\n\n（此操作不可復原）`)) return;
  }
  try {
    const r = await fetch('/api/mark', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({video_id: vid, action}),
    });
    const data = await r.json();
    if (data.error) { alert('操作失敗：' + data.error); return; }
    _selected.delete(vid);
    updateSelectBar();
    loadTranscripts();
  } catch(e) {
    alert('連線錯誤：' + e.message);
  }
}

async function markSelected(action) {
  const vids = [..._selected];
  if (!vids.length) return;
  if (action === 'deleted') {
    if (!confirm(`確定要刪除已選的 ${vids.length} 支逐字稿？（不可復原）`)) return;
  }
  await Promise.all(vids.map(vid =>
    fetch('/api/mark', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({video_id: vid, action}),
    })
  ));
  _selected.clear();
  updateSelectBar();
  loadTranscripts();
}

// ── export ────────────────────────────────────────────────────────────────

async function exportSelected() {
  const vids = [..._selected];
  if (!vids.length) return;
  const btn = document.getElementById('btnExport');
  btn.disabled = true;
  btn.textContent = '匯出中…';

  const SEP   = '─'.repeat(60);
  const parts = [];
  for (const vid of vids) {
    const f = _txData[vid] || {};
    let tx = '';
    try {
      const r = await fetch(`/api/transcript/${vid}`).then(r => r.json());
      tx = r.transcript || r.error || '（無逐字稿）';
    } catch(e) { tx = '（讀取失敗）'; }
    parts.push(
      `${SEP}\n預言家：${f.prophet||'—'}\n標題：${f.title||vid}\n` +
      `日期：${f.published_at||'—'}\n影片：${f.video_url||'—'}\n${SEP}\n\n${tx}`
    );
  }

  const content = parts.join('\n\n\n');
  const blob    = new Blob([content], {type: 'text/plain;charset=utf-8'});
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement('a');
  a.href        = url;
  a.download    = `transcripts_${new Date().toISOString().slice(0,10)}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  btn.disabled = false;
  btn.textContent = '📥 匯出文字';
}

// ── extract ───────────────────────────────────────────────────────────────

function _resetMergePanel() {
  document.getElementById('mergeTitleWrap').style.display = 'none';
  document.getElementById('mergeResult').style.display    = 'none';
  document.getElementById('mergeResult').textContent      = '';
  document.getElementById('mergeActions').style.display   = 'none';
  document.getElementById('coverageLine').style.display   = 'none';
  document.getElementById('verifyResult').classList.remove('show');
  document.getElementById('verifyResult').textContent     = '';
  document.getElementById('postPromptBox').classList.remove('show');
  document.getElementById('postPromptBox').innerHTML      = '';
}

async function extractSelected() {
  const vids = [..._selected];
  if (!vids.length) { alert('請先勾選逐字稿'); return; }

  const panel  = document.getElementById('mergePanel');
  const extRev = document.getElementById('extractReview');
  const meta   = document.getElementById('mergeMeta');
  const btn    = document.getElementById('btnExtract');

  _resetMergePanel();
  btn.disabled    = true;
  btn.textContent = '摘錄中…';
  meta.textContent = `共 ${vids.length} 支，摘錄中…`;
  extRev.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:8px 0">正在摘錄各影片重點，請稍候…</div>';
  extRev.classList.add('show');
  panel.style.display = 'block';
  panel.scrollIntoView({behavior:'smooth', block:'start'});

  try {
    const r    = await fetch('/api/extract', {method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({video_ids: vids})});
    const data = await r.json();
    if (data.error) {
      extRev.innerHTML = `<div style="color:var(--red)">摘錄失敗：${esc(data.error)}</div>`;
      return;
    }
    _lastExtractVids = vids;
    _extractResults  = data.results;
    renderExtractReview(vids, data.results);
    meta.textContent = `共 ${vids.length} 支，摘錄完成`;
  } catch(e) {
    extRev.innerHTML = `<div style="color:var(--red)">連線錯誤：${esc(e.message)}</div>`;
  } finally {
    btn.disabled    = false;
    btn.textContent = '📄 摘錄';
  }
}

function renderExtractReview(vids, results) {
  const extRev = document.getElementById('extractReview');
  let totalItems = 0;
  const videosHtml = vids.map(vid => {
    const res   = results[vid] || {};
    const f     = _txData[vid] || {};
    const title = esc(res.title || f.title || vid);
    const date  = res.published_at || f.published_at || '';
    if (res.error) {
      return `<div class="ext-video">
        <div class="ext-video-head" style="color:var(--red)">
          ⚠ ${title} — ${esc(res.error)}
          <button class="btn-tiny" style="margin-left:auto;background:#2a1a1a;color:#f87171;border:1px solid #6b2525"
            onclick="reExtract('${vid}')">🔄 重新摘錄</button>
        </div></div>`;
    }
    const items = res.items || [];
    totalItems += items.length;
    const extId = 'eg-' + vid;
    const itemsHtml = items.map(it => `
      <div class="ext-item">
        <div class="ext-item-head">
          <span class="ext-topic">${esc(it.topic||'')}</span>
          <span class="ext-pos">${esc(it.position||'')}</span>
          ${it.timeframe && it.timeframe!=='無' ? `<span class="ext-time">${esc(it.timeframe)}</span>` : ''}
        </div>
        <div class="ext-quote">${esc(it.quote||'')}</div>
      </div>`).join('');
    return `<div class="ext-video">
      <div class="ext-video-head" onclick="toggleExtVideo('${extId}')">
        <span id="earr-${extId}" style="font-size:11px;color:var(--muted);width:10px">▾</span>
        <span>${title}</span>
        <span style="color:var(--muted);font-size:11px;margin-left:6px">${date} · ${items.length} 條</span>
        <button class="btn-tiny" style="margin-left:auto;background:#1a2a3a;color:#60a5fa;border:1px solid #2a4a6a"
          onclick="event.stopPropagation();reExtract('${vid}')">🔄 重新摘錄</button>
      </div>
      <div id="${extId}" style="padding:10px;display:flex;flex-direction:column;gap:6px">${itemsHtml}</div>
    </div>`;
  }).join('');

  extRev.innerHTML = videosHtml +
    `<div style="margin-top:14px;display:flex;justify-content:flex-end;align-items:center;gap:12px">
      <span style="color:var(--muted);font-size:12px">共 ${totalItems} 條摘錄，確認後合成</span>
      <button class="btn btn-amber" onclick="runMergeFromExtracts()">✨ 合成文章</button>
    </div>`;
}

function toggleExtVideo(id) {
  const body = document.getElementById(id);
  const arr  = document.getElementById('earr-' + id);
  if (!body) return;
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : '';
  if (arr) arr.textContent = open ? '▸' : '▾';
}

async function reExtract(vid) {
  const extId = 'eg-' + vid;
  const body  = document.getElementById(extId);
  if (body) body.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:8px">重新摘錄中…</div>';
  try {
    const r    = await fetch('/api/extract', {method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({video_ids:[vid], force:true})});
    const data = await r.json();
    const res  = data.results?.[vid];
    if (res) {
      _extractResults[vid] = res;
      renderExtractReview(_lastExtractVids, _extractResults);
    }
  } catch(e) {
    if (body) body.innerHTML = `<div style="color:var(--red);font-size:12px;padding:8px">失敗：${esc(e.message)}</div>`;
  }
}

async function showCardExtract(vid, btn) {
  const box = document.getElementById('tx-ext-' + vid);
  if (box.classList.contains('show')) {
    box.classList.remove('show');
    if (btn) btn.textContent = '📄 摘錄';
    return;
  }
  box.classList.add('show');
  box.innerHTML = '<div style="color:var(--muted);font-size:12px">摘錄中…</div>';
  if (btn) { btn.disabled = true; btn.textContent = '摘錄中…'; }

  try {
    let data = null;
    const r = await fetch(`/api/extract/${vid}`);
    if (r.ok) {
      data = await r.json();
    } else {
      const r2   = await fetch('/api/extract', {method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({video_ids:[vid]})});
      const d2   = await r2.json();
      data = d2.results?.[vid];
    }
    if (!data || data.error) {
      box.innerHTML = `<div style="color:var(--red);font-size:12px">${esc(data?.error||'摘錄失敗')}</div>`;
      if (btn) { btn.disabled = false; btn.textContent = '📄 摘錄'; }
      return;
    }
    const items = data.items || [];
    box.innerHTML = items.length ? items.map(it => `
      <div class="ext-item">
        <div class="ext-item-head">
          <span class="ext-topic">${esc(it.topic||'')}</span>
          <span class="ext-pos">${esc(it.position||'')}</span>
          ${it.timeframe&&it.timeframe!=='無'?`<span class="ext-time">${esc(it.timeframe)}</span>`:''}
        </div>
        <div class="ext-quote">${esc(it.quote||'')}</div>
      </div>`).join('')
      : '<div style="color:var(--muted);font-size:12px">無摘錄結果</div>';
    if (btn) { btn.disabled = false; btn.textContent = '📄 已摘錄'; }
  } catch(e) {
    box.innerHTML = `<div style="color:var(--red);font-size:12px">連線錯誤：${esc(e.message)}</div>`;
    if (btn) { btn.disabled = false; btn.textContent = '📄 摘錄'; }
  }
}

async function runMergeFromExtracts() {
  const vids = _lastExtractVids;
  if (!vids.length) { alert('沒有可合成的影片'); return; }

  const extRev  = document.getElementById('extractReview');
  const result  = document.getElementById('mergeResult');
  const meta    = document.getElementById('mergeMeta');
  const cvLine  = document.getElementById('coverageLine');

  extRev.classList.remove('show');
  result.textContent = '正在呼叫 Gemini 合成文章，請稍候（含涵蓋率檢查，約需一分鐘）…';
  result.style.display = '';
  cvLine.style.display = 'none';
  meta.textContent     = `合成中…`;

  try {
    const r    = await fetch('/api/merge', {method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({video_ids: vids})});
    const data = await r.json();
    if (data.error) {
      result.textContent = '失敗：' + data.error;
      return;
    }
    result.textContent = data.article || '';
    const cc = data.char_count ? `，${data.char_count} 字` : '';
    meta.textContent   = `已合成 ${data.count || vids.length} 支${cc}`;

    // Show coverage status
    const cv = data.coverage;
    if (cv) {
      cvLine.style.display = 'block';
      if (cv.missing === 0) {
        cvLine.textContent = `✓ ${cv.total} 篇全數涵蓋`;
        cvLine.style.color = 'var(--green)';
      } else {
        const names = (cv.titles||[]).join('、');
        const retry = cv.retried > 0 ? `（已重試 ${cv.retried} 次）` : '';
        cvLine.textContent = `⚠ ${cv.total} 篇中 ${cv.covered} 篇涵蓋，${cv.missing} 篇未涵蓋${retry}：${names}`;
        cvLine.style.color = 'var(--amber)';
      }
    }

    document.getElementById('mergeActions').style.display = 'flex';
    _lastMergeVids    = vids;
    _lastMergeProphet = vids.length ? (_txData[vids[0]]?.prophet || '') : '';
    await Promise.all(vids.map(vid =>
      fetch('/api/mark', {method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({video_id:vid, action:'used'})})
    ));
    _selected.clear();
    updateSelectBar();
    loadTranscripts();
    regenTitle();
  } catch(e) {
    result.textContent = '連線錯誤：' + e.message;
  }
}

// ── merge ─────────────────────────────────────────────────────────────────

async function mergeSelected() {
  // 先摘錄，再由使用者確認後合成
  await extractSelected();
}

function copyMerge() {
  navigator.clipboard.writeText(document.getElementById('mergeResult').textContent);
}

async function regenTitle() {
  const article = document.getElementById('mergeResult').textContent.trim();
  if (!article || article === '合成中…') return;

  const wrap  = document.getElementById('mergeTitleWrap');
  const el    = document.getElementById('mergeTitle');
  const btn   = document.getElementById('btnRegenTitle');

  wrap.style.display = 'block';
  el.textContent     = '生成標題中…';
  if (btn) { btn.disabled = true; btn.textContent = '生成中…'; }

  try {
    const r = await fetch('/api/gen_title', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({article, prophet: _lastMergeProphet}),
    });
    const data = await r.json();
    el.textContent = data.error ? '標題生成失敗' : (data.title || '（無標題）');
  } catch(e) {
    el.textContent = '連線錯誤';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔄 重新生成'; }
  }
}

async function verifyMerge() {
  const article = document.getElementById('mergeResult').textContent.trim();
  if (!article || article === '合成中…') { alert('請先合成文章'); return; }
  if (!_lastMergeVids.length) { alert('找不到對應逐字稿，請重新合成'); return; }

  const box = document.getElementById('verifyResult');
  const btn = document.getElementById('btnVerify');

  btn.disabled    = true;
  btn.textContent = '驗證中…';
  box.textContent = '正在呼叫 Gemini 事實查核，請稍候…';
  box.classList.add('show');
  box.scrollIntoView({behavior: 'smooth', block: 'nearest'});

  try {
    const r = await fetch('/api/verify', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({article, video_ids: _lastMergeVids}),
    });
    const data = await r.json();
    box.textContent = data.error ? '錯誤：' + data.error : data.report || '';
  } catch(e) {
    box.textContent = '連線錯誤：' + e.message;
  } finally {
    btn.disabled    = false;
    btn.textContent = '🔍 驗證';
  }
}

async function showPostPrompt() {
  const article = document.getElementById('mergeResult').textContent.trim();
  if (!article || article === '合成中…') { alert('請先合成文章'); return; }

  const box = document.getElementById('postPromptBox');
  const btn = document.getElementById('btnPostPrompt');

  btn.disabled    = true;
  btn.textContent = '生成中…';
  box.innerHTML   = '';
  box.classList.add('show');

  try {
    const r = await fetch('/api/post_prompt', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({article}),
    });
    const data = await r.json();
    if (data.error) {
      box.textContent = '錯誤：' + data.error;
      return;
    }
    const pre = document.createElement('pre');
    pre.style.cssText = 'white-space:pre-wrap;font-size:12px;line-height:1.8;color:#cbd5e1;margin:0';
    pre.textContent = data.posts || '';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn btn-ghost';
    copyBtn.style.cssText = 'margin-top:8px;padding:4px 12px;font-size:11px;color:var(--blue)';
    copyBtn.textContent = '📋 複製全部';
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(data.posts || '');
      copyBtn.textContent = '✓ 已複製';
      setTimeout(() => copyBtn.textContent = '📋 複製全部', 1500);
    };
    box.appendChild(pre);
    box.appendChild(copyBtn);
    box.scrollIntoView({behavior: 'smooth', block: 'nearest'});
  } catch(e) {
    box.textContent = '連線錯誤：' + e.message;
  } finally {
    btn.disabled    = false;
    btn.textContent = '📝 貼文提示詞';
  }
}

// ── job runner ────────────────────────────────────────────────────────────

function setRunning(msg, active) {
  const bar = document.getElementById('runBar');
  document.getElementById('runMsg').textContent = msg;
  bar.classList.toggle('show', active);
  if (!active) document.getElementById('runDetail').textContent = '';
}

function appendLog(text, cls) {
  const box  = document.getElementById('logBox');
  const span = document.createElement('span');
  if (cls) span.className = cls;
  span.textContent = text + '\n';
  box.appendChild(span);
  box.scrollTop = box.scrollHeight;
}

function classifyLine(line) {
  if (!line) return 'l-dim';
  if (line.includes('✗') || line.includes('失敗') || line.includes('Error')) return 'l-err';
  if (line.includes('⚠') || line.includes('不完整') || line.includes('延至')) return 'l-warn';
  if (line.includes('✓') || line.includes('完成') || line.includes('已存')) return 'l-ok';
  if (line.startsWith('[')) return 'l-info';
  return 'l-dim';
}

function streamJob(jobId, msg) {
  if (currentEs) { currentEs.close(); currentEs = null; }
  setRunning(msg, true);
  ['btnScan','btnTx'].forEach(id => document.getElementById(id).disabled = true);

  const ts = new Date().toLocaleTimeString('zh-TW');
  appendLog(`\n── ${ts} ${msg} ──`, 'l-dim');

  const es = new EventSource(`/api/stream/${jobId}`);
  currentEs = es;

  es.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.ping) return;
    if (data.done) {
      es.close(); currentEs = null;
      ['btnScan','btnTx'].forEach(id => document.getElementById(id).disabled = false);
      const ok = data.rc === 0;
      setRunning('', false);
      appendLog(ok ? '── 完成 ──' : `── 失敗（退出碼 ${data.rc}）──`, ok?'l-ok':'l-err');
      loadStats();
      loadTranscripts();
      return;
    }
    if (data.line !== undefined) {
      appendLog(data.line, classifyLine(data.line));
      if (data.line.trim() && !data.line.includes('──')) {
        document.getElementById('runDetail').textContent = data.line.trim();
      }
    }
  };
  es.onerror = () => {
    es.close(); currentEs = null;
    setRunning('', false);
    ['btnScan','btnTx'].forEach(id => document.getElementById(id).disabled = false);
  };
}

// ── actions ───────────────────────────────────────────────────────────────

async function runScan() {
  const r = await fetch('/api/scan',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  streamJob((await r.json()).job_id, '正在掃描新片…');
}

async function runTranscribe() {
  const limit      = parseInt(document.getElementById('txLimit').value)||10;
  const inclShorts = document.getElementById('inclShorts').checked;
  const r = await fetch('/api/transcribe',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({limit, priority:0, include_shorts: inclShorts})});
  const label = inclShorts ? `最多 ${limit} 支（含短影音）` : `最多 ${limit} 支（僅長片）`;
  streamJob((await r.json()).job_id, `正在轉錄（${label}）…`);
}

function openDb() { fetch('/api/open-db'); }

function toggleLog() {
  const box = document.getElementById('logBox');
  const tog = box.previousElementSibling.querySelector('span');
  const open = box.classList.toggle('show');
  tog.textContent = (open ? '▾' : '▸') + ' 執行記錄（供診斷用）';
}

function clearLog() { document.getElementById('logBox').innerHTML = ''; }

// ── manual ────────────────────────────────────────────────────────────────

async function runManual() {
  const url  = document.getElementById('manualUrl').value.trim();
  const lang = document.getElementById('manualLang').value;
  if (!url) { alert('請貼上影片網址'); return; }
  const btn  = document.getElementById('btnManual');
  const meta = document.getElementById('manualMeta');
  const box  = document.getElementById('manualText');
  const res  = document.getElementById('manualResult');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-sm"></span> 轉錄中…';
  meta.textContent = '正在啟動…';
  box.textContent = '';
  box.className = 'manual-text';
  res.classList.add('show');

  const done = () => { btn.disabled = false; btn.innerHTML = '✨ 轉錄'; };
  try {
    const r    = await fetch('/transcribe',{method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({url,language:lang})});
    const data = await r.json();
    if (data.error) {
      box.className='manual-text err-text'; box.textContent=data.error; return done();
    }
    if (!data.job_id) {
      const wc = data.text.split(/\s+/).filter(Boolean).length;
      const dur = data.duration ? `${(data.duration/60).toFixed(1)} 分` : '時長未知';
      meta.textContent = `${wc} 字 ／ ${dur}`;
      box.textContent  = data.text;
      return done();
    }
    const es = new EventSource(`/transcribe/stream/${data.job_id}`);
    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.ping) return;
      if (msg.progress) { meta.textContent = msg.progress; return; }
      if (msg.done) {
        es.close(); done();
        if (msg.error) {
          box.className='manual-text err-text'; box.textContent='失敗：'+msg.error;
        } else {
          const wc  = msg.text.split(/\s+/).filter(Boolean).length;
          const dur = msg.duration ? `${(msg.duration/60).toFixed(1)} 分` : '時長未知';
          meta.textContent = `${wc} 字 ／ ${dur}`;
          box.textContent  = msg.text;
        }
      }
    };
    es.onerror = () => { es.close(); done(); box.className='manual-text err-text'; box.textContent='連線中斷'; };
  } catch(e) {
    box.className='manual-text err-text'; box.textContent='連線錯誤：'+e.message; done();
  }
}

function copyManual() {
  navigator.clipboard.writeText(document.getElementById('manualText').textContent)
    .then(() => {
      const b = document.getElementById('btnManual');
      b.textContent = '✓ 已複製';
      setTimeout(()=>b.innerHTML='✨ 轉錄', 1500);
    });
}

// ── generate ──────────────────────────────────────────────────────────────

async function generateArticle(vid, btn) {
  const f = _txData[vid] || {};
  const subtitle = `${f.prophet||'?'} ／ ${(f.title||'').slice(0,35)}`;

  const setBtnBusy  = () => { if (btn) { btn.disabled=true;  btn.textContent='產生中…'; } };
  const setBtnReady = () => { if (btn) { btn.disabled=false; btn.textContent='✨ 產生文章'; } };

  setBtnBusy();
  document.getElementById('genSubtitle').textContent  = subtitle;
  document.getElementById('genWarnings').innerHTML    = '';
  document.getElementById('genContent').style.display = 'none';
  const loading = document.getElementById('genLoading');
  loading.textContent   = '正在啟動…';
  loading.style.color   = 'var(--muted)';
  loading.style.display = '';
  document.getElementById('genPanel').classList.add('show');
  document.getElementById('genPanel').scrollIntoView({behavior:'smooth', block:'start'});

  try {
    const existing = await fetch(`/api/generated/${vid}`).then(r=>r.json()).catch(()=>null);
    if (existing && existing.article_body) {
      showGenerated(existing);
      setBtnReady();
      return;
    }
  } catch(e) {}

  let resp;
  try {
    resp = await fetch('/api/generate',{method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({video_id:vid})});
  } catch(e) {
    loading.textContent = `連線失敗：${e.message}`;
    loading.style.color = 'var(--red)';
    setBtnReady();
    return;
  }
  const respData = await resp.json();
  if (respData.error) {
    loading.textContent = `啟動失敗：${respData.error}`;
    loading.style.color = 'var(--red)';
    setBtnReady();
    return;
  }
  const job_id = respData.job_id;

  const es = new EventSource(`/api/stream/${job_id}`);
  es.onmessage = async (e) => {
    const data = JSON.parse(e.data);
    if (data.ping) return;
    if (data.done) {
      es.close();
      setBtnReady();
      if (data.rc === 0) {
        const result = await fetch(`/api/generated/${vid}`).then(r=>r.json()).catch(()=>({error:'讀取失敗'}));
        if (result.article_body) { showGenerated(result); }
        else {
          loading.textContent = `產生完成但讀取失敗：${result.error||''}`;
          loading.style.color = 'var(--red)';
        }
      } else {
        loading.textContent = '產生失敗，請查看下方執行記錄。';
        loading.style.color = 'var(--red)';
      }
      return;
    }
    if (data.line && data.line.trim()) {
      loading.textContent = data.line.trim();
      appendLog(data.line, classifyLine(data.line));
    }
  };
  es.onerror = () => {
    es.close(); setBtnReady();
    loading.textContent = '連線中斷';
    loading.style.color = 'var(--red)';
  };
}

function showGenerated(data) {
  document.getElementById('genLoading').style.display = 'none';
  document.getElementById('genContent').style.display = '';
  document.getElementById('genArticleTitle').textContent = data.article_title || '（無標題）';
  document.getElementById('genArticleBody').textContent  = data.article_body  || '';
  document.getElementById('genSocialPost').textContent   = data.social_post   || '';
  document.getElementById('genComment').textContent      = data.comment_line  || '';
  const warnEl = document.getElementById('genWarnings');
  warnEl.innerHTML = (data.warnings||[]).map(w=>`<span class="warn-badge">⚠ ${w}</span>`).join('');
}

function closeGen() { document.getElementById('genPanel').classList.remove('show'); }

async function copyGen(id) {
  const el = document.getElementById(id);
  await navigator.clipboard.writeText(el.textContent);
  const btn = el.nextElementSibling.querySelector('button');
  if (btn) { const orig=btn.textContent; btn.textContent='✓ 已複製'; setTimeout(()=>btn.textContent=orig,1500); }
}

// ── init ──────────────────────────────────────────────────────────────────
loadStats();
loadTranscripts();
</script>
</body>
</html>"""


@app.route("/")
def index():
    return render_template_string(HTML)


if __name__ == "__main__":
    if not GROQ_KEYS:
        print("⚠ 警告：找不到 Groq Key，請確認 ~/.claude/api_keys.json")
    threading.Timer(1.5, lambda: webbrowser.open("http://127.0.0.1:5056")).start()
    print("預言管線控制台啟動中… http://127.0.0.1:5056")
    app.run(host="127.0.0.1", port=5056, debug=False, threaded=True)
