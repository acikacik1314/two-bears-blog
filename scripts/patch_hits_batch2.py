#!/usr/bin/env python3
"""
Batch 2 patch:
  ② misses:   ADI+KFK "2021年戰爭"、阿南德 "三戰非傳統形式"
  ③ excluded: 帕克 "帕克建議備災具有現實參考意義"  (漏抓 B 類)
  ①+④:       C 類 44 條逐條處置
    - 帕克 "裴洛西訪台" → trim (pubDate 2022-02 < visit 2022-08)
    - 其餘 C 類全數 → excluded
      含：跨預言家重複字串、D 類（無日期佐證）、趨勢陳述
"""

from pathlib import Path
import frontmatter

BLOG = Path(__file__).parent.parent / "src" / "content" / "blog"

# ── 工具函式 ──────────────────────────────────────────────────────────────────

def load(fname):
    path = BLOG / fname
    return frontmatter.load(str(path)), path

def save(post, path):
    path.write_text(frontmatter.dumps(post), encoding="utf-8")

def ensure(d, key):
    if d.get(key) is None:
        d[key] = []
    return d[key]

def move(preds, src, dst, text):
    """Move item from preds[src] → preds[dst]. Returns True if found."""
    lst_from = ensure(preds, src)
    lst_to   = ensure(preds, dst)
    for i, item in enumerate(lst_from):
        if str(item).strip() == text.strip():
            lst_from.pop(i)
            lst_to.append(text)
            return True
    return False

def trim_hit(preds, old_text, new_text):
    """Replace old_text in preds['hits'] with new_text in place."""
    hits = ensure(preds, "hits")
    for i, item in enumerate(hits):
        if str(item).strip() == old_text.strip():
            hits[i] = new_text
            return True
    return False

def patch(fname, ops):
    """
    ops = list of (action, src_key, dst_key, text)
         or ('trim', old, new)
    """
    post, path = load(fname)
    preds = post.metadata.setdefault("predictions", {})
    changed = False
    for op in ops:
        if op[0] == "move":
            _, src, dst, text = op
            ok = move(preds, src, dst, text)
            label = f"{src}→{dst}: {text[:40]}…"
        elif op[0] == "trim":
            _, old, new = op
            ok = trim_hit(preds, old, new)
            label = f"trim: {old[:40]}… → {new[:40]}…"
        else:
            continue
        status = "✅" if ok else "⚠️ not found"
        print(f"  {status}  {fname}  {label}")
        if ok:
            changed = True
    if changed:
        save(post, path)

# ─────────────────────────────────────────────────────────────────────────────
# ② misses: 年份判斷錯誤 / 事後重新定義
# ─────────────────────────────────────────────────────────────────────────────

WAR_2021  = "2021年確實爆發重大戰爭（ADI在2020年預言，俄烏衝突及以巴衝突升溫均印證）"
WWIII_ANA = "第三次世界大戰以「非傳統形式」展開（代理人戰爭、資訊戰持續）"

patch("2026-adi-kfk-cp.md", [
    ("move", "hits", "misses", WAR_2021),
])
patch("anand-wwiii-dollar.md", [
    ("move", "hits", "misses", WWIII_ANA),
])

# ─────────────────────────────────────────────────────────────────────────────
# ③ 漏抓 B 類 → excluded
# ─────────────────────────────────────────────────────────────────────────────

patch("park-taiwan-supplies.md", [
    ("move", "hits", "excluded", "台海緊張情勢升溫，帕克建議備災具有現實參考意義"),
    ("move", "hits", "excluded", "台灣在全球局勢中的關鍵地位持續受到關注"),   # C 類也在這裡
])

# ─────────────────────────────────────────────────────────────────────────────
# ① 修剪保留：帕克 裴洛西訪台（pubDate 2022-02 < visit 2022-08）
# ─────────────────────────────────────────────────────────────────────────────

patch("2022-02-24-hamilton-parker-2022.md", [
    ("trim",
     "台海緊張情勢因裴洛西訪台升至數十年新高",
     "台海緊張情勢升至數十年新高（2022年應驗）"),
    ("move", "hits", "excluded", "全球通貨膨脹持續攀升，能源短缺問題嚴峻"),
])

# ─────────────────────────────────────────────────────────────────────────────
# ④ 其餘 C 類 / D 類（無日期佐證）/ 跨預言家重複 → excluded
# ─────────────────────────────────────────────────────────────────────────────

TAIWAN_STRAIT = "台海緊張情勢持續升溫，解放軍演習頻率增加（2025-2026年現實）"

# 帕克
patch("parker-2026-06-20.md", [
    ("move", "hits", "excluded", "美國攻擊伊朗，中東局勢進一步升溫"),
])
patch("rumble-v799bac.md",  [("move", "hits", "excluded", TAIWAN_STRAIT)])
patch("rumble-v79awyu.md",  [("move", "hits", "excluded", TAIWAN_STRAIT)])

# 比格斯 - 各個 rumble 檔
GOLD  = "黃金價格持續創歷史新高（2025-2026年突破3000美元/盎司）"
AI_26 = "AI技術在2025-2026年出現重大突破，社會衝擊持續擴大"

for fname in [
    "rumble-v798wmk.md", "rumble-v7998kg.md", "rumble-v799dgm.md",
    "rumble-v79am72.md", "rumble-v79asew.md", "rumble-v79ax40.md",
    "rumble-v79ay7w.md", "rumble-v79bwlm.md",
]:
    ops = [("move", "hits", "excluded", TAIWAN_STRAIT)]
    if fname in ("rumble-v798wmk.md", "rumble-v7998kg.md",
                 "rumble-v79am72.md", "rumble-v79bwlm.md", "rumble-v79atnk.md"):
        ops.append(("move", "hits", "excluded", GOLD))
    if fname == "rumble-v798wmk.md":
        ops.append(("move", "hits", "excluded", AI_26))
    patch(fname, ops)

patch("rumble-v79atnk.md",  [
    ("move", "hits", "excluded", TAIWAN_STRAIT),
    ("move", "hits", "excluded", GOLD),
])
patch("rumble-v79976q.md",  [("move", "hits", "excluded", TAIWAN_STRAIT)])
patch("taiwan-blitzkrieg.md", [
    ("move", "hits", "excluded", "台海軍事緊張持續升溫，解放軍演習頻率增加"),
])

# 比格斯 - 內容文章
patch("2026-05-23-biggs-ww3-taiwan-economy-ai.md", [
    ("move", "hits", "excluded", "以色列與伊朗持續衝突，以色列採取軍事行動"),
    ("move", "hits", "excluded", "中國入侵台灣的威脅持續，台海緊張升溫"),
    ("move", "hits", "excluded", "川普2024年當選總統並持續執政"),
    ("move", "hits", "excluded", "全球食物與汽車價格飛漲，民眾購買力下降"),
])
patch("brandon-biggs-2026.md", [
    ("move", "hits", "excluded", "川普2024年當選總統，持續強勢執政"),
    ("move", "hits", "excluded", "以色列面臨更嚴峻攻擊威脅，以伊衝突持續"),
    ("move", "hits", "excluded", "全球食物與肉類價格飛漲，民眾生活壓力大增"),
])
patch("brandon-biggs-20260608.md", [
    ("move", "hits", "excluded", "川普執政後美國政治持續動盪，保護孩子的安全受到威脅的言論升溫"),
    ("move", "hits", "excluded", "以色列與伊朗緊張局勢持續，北以色列遭受攻擊威脅"),
    ("move", "hits", "excluded", "俄羅斯火山活動加劇，影響氣候"),
])
patch("brandon-biggs-20260609.md", [
    ("move", "hits", "excluded", "川普執政後美國持續社會動盪，出現類似 COVID 時期的騷亂跡象"),
    ("move", "hits", "excluded", "全球糧食安全與食物供應鏈受到政治力量干預的威脅升高"),
])
patch("yt-8Y-jvFtf5EY.md", [
    ("move", "hits", "excluded", "AI技術快速發展超出預期，ChatGPT等突破持續推進"),
    ("move", "hits", "excluded", "川普當選後政治格局大幅改變，深層政府對立持續"),
])

# 比格斯 + KFK (Format A shared)
patch("2026-05-09-ai-turning-point-2026.md", [
    ("move", "hits", "excluded", AI_26),
])

# 摩普萊
patch("2026-mor-plai-nasa.md", [
    ("move", "hits", "excluded", "精準預言泰柬邊境衝突再次爆發（7月24日衝突，11月再次升溫，均應驗）"),
])
patch("rumble-v79976q.md", [("move", "hits", "excluded", TAIWAN_STRAIT)])
patch("rumble-v79atnk.md", [
    ("move", "hits", "excluded", TAIWAN_STRAIT),
    ("move", "hits", "excluded", GOLD),
])

# Jessica Adams
patch("rumble-v799cey.md", [("move", "hits", "excluded", TAIWAN_STRAIT)])

# 麥克蒙尼格
patch("rumble-v79at52.md", [("move", "hits", "excluded", TAIWAN_STRAIT)])
patch("cia-mcmoneagle-doomsday.md", [
    ("move", "hits", "excluded", "全球緊張局勢持續升溫，末日時鐘維持史上最接近午夜位置"),
])
patch("mcmoneagle-2026-end.md", [
    ("move", "hits", "excluded", "全球經濟因地緣政治不穩而受衝擊，貪婪與不穩定加劇"),
])

# 2062
patch("2020-08-18-future-person-2ch-2062.md", [
    ("move", "hits", "excluded", "日本人口持續減少的趨勢（現實中已在發生）"),
])

# 2075
patch("2020-10-11-future-person-yj2075.md", [
    ("move", "hits", "excluded", "俄羅斯太空技術持續發展"),
])

# Adam Archon
patch("2026-adam-archon-apextv.md", [
    ("move", "hits", "excluded", "無現金支付趨勢持續加速，多國大幅壓縮現金流通（與預言方向一致）"),
])

# KFK
patch("2020-06-29-future-person-kfk-2060.md", [
    ("move", "hits", "excluded", "數位貨幣趨勢持續，多國積極推進CBDC（央行數位貨幣）"),
    ("move", "hits", "excluded", "結婚率在多數已開發國家持續下降"),
])

# 薩洛梅
patch("athos-salome-2026.md", [
    ("move", "hits", "excluded", "全球通貨膨脹與經濟衰退威脅持續加劇"),
    ("move", "hits", "excluded", "台灣、烏克蘭、以色列局勢持續緊張，三點連動備受關注"),
])

# 鄭博見
patch("zheng-bojian-2026.md", [
    ("move", "hits", "excluded", "台海緊張局勢持續，軍購案與軍事鎖定信號不斷"),
])
