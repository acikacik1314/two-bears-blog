#!/usr/bin/env python3
"""
scan_fulfilled_pending.py
掃描所有 blog 文章中 pending 條目，找出含有「具體事件特徵關鍵詞」的條目。
這些條目是「可能已應驗但尚未判定」的候選清單，需要人工逐條比對近期新聞。

觸發邏輯：符合以下任一類關鍵詞即標記：
  - 地名（國家、城市、地區）
  - 規模數字（地震規模、具體數字百分比等）
  - 具名人物
  - 選舉/政治職位
  - 災害類型（地震、海嘯、颱風、火山、洪水）
  - 具體機構/組織
  - 日期/月份/年份關鍵詞（已來到或即將到來）

注意：本腳本不做外部查證、不判斷是否應驗、不呼叫任何 AI，
      只負責把「有具體事件描述、值得人工比對」的條目撈出來。
      只讀不寫，不修改任何 markdown。
"""

import re
import glob
import sys
from datetime import date

try:
    import yaml
except ImportError:
    print("請先安裝 pyyaml：pip3 install pyyaml", file=sys.stderr)
    sys.exit(1)

TODAY = str(date.today())

# ── 關鍵詞分類 ──────────────────────────────────────────────────────────────

# 地名
PLACE_RE = re.compile(
    r'台灣|日本|美國|中國|韓國|北韓|俄羅斯|烏克蘭|以色列|伊朗|伊拉克|印度|印尼|菲律賓'
    r'|沙烏地|歐洲|英國|法國|德國|土耳其|敘利亞|阿富汗|巴基斯坦'
    r'|紐約|東京|北京|上海|首爾|平壤|德黑蘭|莫斯科|基輔|倫敦'
    r'|熊本|大阪|神戶|仙台|那霸|台北|高雄|洛杉磯|波特蘭|多倫多|芝加哥'
    r'|琉球|沖繩|關東|關西|九州|北海道|東北|四國'
)

# 規模數字（地震規模、具體數字）
MAGNITUDE_RE = re.compile(
    r'規模\s*\d|\bM\d|\d+\.\d+級|震度\s*\d|\d+(?:\.\d+)?(?:公里|公尺|km)'
    r'|[0-9]+(?:\.[0-9]+)?%|[0-9]{4,}(?:億|萬|人|美元|台幣)'
)

# 具名人物
PERSON_RE = re.compile(
    r'川普|拜登|習近平|普丁|澤倫斯基|金正恩|馬斯克|范斯|哈里斯|柯文哲'
    r'|賴清德|蔡英文|麥卡錫|紐森|強森|馬克宏|梅洛尼|莫迪|岸田|石破'
    r'|哈梅內伊|納坦雅胡|辛瓦爾|班尼特|拉夫桑賈尼'
    r'|帕克|比格斯|阿曼達|薩洛梅|摩普萊|鄭博見|若海'
)

# 選舉/政治事件
ELECTION_RE = re.compile(
    r'選舉|大選|總統|議員|國會|內閣|執政|罷免|彈劾|就職|辭職|倒台|政變'
    r'|任命|接管|執政黨|在野黨|聯合政府'
)

# 災害類型
DISASTER_RE = re.compile(
    r'地震|海嘯|颱風|颶風|火山|洪水|水災|旱災|火災|核電|輻射|爆炸|爆發'
    r'|山崩|土石流|暴風|龍捲風|大雪|寒流|熱浪'
)

# 具體機構/組織/金融
ENTITY_RE = re.compile(
    r'聯合國|NATO|北約|WTO|IMF|美聯儲|美國銀行|嘉信|摩根|瑞波|XRP|BTC|比特幣'
    r'|以太坊|ETH|股市|道瓊|納斯達克|TSMC|台積電|輝達|特斯拉|蘋果|谷歌|Meta'
    r'|中央銀行|CBDC|聯準會|黃金|石油|原油|天然氣'
)

# 具體時間窗口（現在或近期）— 含年份或月份
TIME_WINDOW_RE = re.compile(
    r'202[6-9]年|203[0-9]年|七月|八月|九月|十月|十一月|十二月'
    r'|今年|明年|今夏|今冬|年底|年末|月內|週內|本季'
)

CATEGORIES = [
    (PLACE_RE,       "地名"),
    (MAGNITUDE_RE,   "規模/數字"),
    (PERSON_RE,      "具名人物"),
    (ELECTION_RE,    "選舉/政治"),
    (DISASTER_RE,    "災害類型"),
    (ENTITY_RE,      "機構/組織/金融"),
    (TIME_WINDOW_RE, "時間窗口"),
]

# ── 檔案處理 ─────────────────────────────────────────────────────────────────

def extract_frontmatter(path: str) -> dict | None:
    with open(path, encoding="utf-8") as f:
        content = f.read()
    m = re.match(r'^---\n(.*?)\n---', content, re.DOTALL)
    if not m:
        return None
    try:
        return yaml.safe_load(m.group(1))
    except Exception:
        return None


def get_claim(entry) -> str:
    if isinstance(entry, str):
        return entry
    if isinstance(entry, dict):
        return entry.get("claim", str(entry))
    return str(entry)


def match_categories(text: str) -> list[str]:
    matched = []
    for pattern, label in CATEGORIES:
        m = pattern.search(text)
        if m:
            matched.append(f"{label}（「{m.group(0)}」）")
    return matched


# ── 主掃描 ───────────────────────────────────────────────────────────────────

posts = sorted(glob.glob("src/content/blog/*.md"))

# prophet_id -> list of findings
findings: dict[str, list[dict]] = {}
total_scanned_pending = 0
total_flagged = 0

for path in posts:
    data = extract_frontmatter(path)
    if not data:
        continue
    if data.get("draft"):
        continue
    prophet = data.get("prophet")
    if not prophet:
        continue
    preds = data.get("predictions") or {}
    pending_list = preds.get("pending") or []
    if not pending_list:
        continue

    post_id = path.removeprefix("src/content/blog/").removesuffix(".md")
    pub_date = str(data.get("pubDate", "unknown"))

    prophet_ids = prophet if isinstance(prophet, list) else [prophet]

    for entry in pending_list:
        total_scanned_pending += 1
        claim = get_claim(entry)
        cats = match_categories(claim)
        if not cats:
            continue
        total_flagged += 1
        for pid in prophet_ids:
            findings.setdefault(pid, []).append({
                "post": post_id,
                "pubDate": pub_date,
                "claim": claim,
                "categories": cats,
            })

# ── 輸出 ──────────────────────────────────────────────────────────────────────

lines = []
lines.append("# 已應驗但未判定 候選清單")
lines.append(f"掃描日期：{TODAY}")
lines.append(f"掃描文章：{len(posts)} 篇  ｜  共掃 pending 條目：{total_scanned_pending} 條")
lines.append(f"**旗標條目（含具體事件特徵）：{total_flagged} 條**\n")
lines.append("⚠️ 這是候選清單，不是判決。每條需要人工逐條比對近期新聞事件：")
lines.append("  ✅ 若有對應事件已發生 → 研判是否符合，移至 hits（需填 reason）")
lines.append("  ✅ 若事件未發生或未到窗口 → 保留 pending")
lines.append("  ✅ 若條目本身模糊無可查 → 考慮標 excluded\n")
lines.append("---\n")

for prophet_id in sorted(findings.keys()):
    items = findings[prophet_id]
    # deduplicate by (post, claim)
    seen = set()
    unique_items = []
    for item in items:
        key = (item["post"], item["claim"])
        if key not in seen:
            seen.add(key)
            unique_items.append(item)
    lines.append(f"## {prophet_id}（{len(unique_items)} 條）\n")
    for item in unique_items:
        lines.append(f"- **來源**：`{item['post']}`（pubDate: {item['pubDate']}）")
        lines.append(f"  **條目**：{item['claim']}")
        lines.append(f"  **特徵**：{'; '.join(item['categories'])}")
        lines.append("")

output = "\n".join(lines)
print(output)

# 寫入報告檔
report_path = "reports/fulfilled-candidates.md"
try:
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(output)
    print(f"\n✅ 報告已寫入 {report_path}", file=sys.stderr)
except Exception as e:
    print(f"⚠️ 無法寫入 {report_path}：{e}", file=sys.stderr)
