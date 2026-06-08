#!/usr/bin/env python3
"""
Batch-add predictions frontmatter to all prophecy articles.
Run: python3 scripts/add_predictions.py
"""
import re
from pathlib import Path

BLOG_DIR = Path(__file__).parent.parent / 'src' / 'content' / 'blog'

# ── 針對特定文章的精確 predictions ──────────────────────────────────────────

SPECIFIC = {

  # ── 帕克 2020 ──
  '2020-11-03-hamilton-parker-2020.md': {
    'hits': [
      '川普彈劾程序失敗，未遭撤職（2020年2月參議院宣判無罪）',
      '英國於2020年1月31日正式脫歐，強森如期完成',
      '強森婚姻出現重大轉變（2020年離婚、2021年再婚）',
      'COVID-19引發全球股市劇烈震盪，醫療股大幅上漲',
    ],
    'misses': [
      '部分中東戰爭規模預測偏大，未達全面衝突',
    ],
    'pending': [],
  },

  # ── 帕克 2022 ──
  '2022-02-24-hamilton-parker-2022.md': {
    'hits': [
      '伊麗莎白二世女王於2022年9月8日逝世，查爾斯加冕為王',
      '民主黨在2022年期中選舉損失眾議院多數席位',
      '全球通貨膨脹持續攀升，能源短缺問題嚴峻',
      'Meta（Facebook）2022年股價暴跌超60%，危機顯現',
      '台海緊張情勢因裴洛西訪台升至數十年新高',
      '俄烏衝突引發歐洲能源危機，歐盟內部矛盾加深',
    ],
    'misses': [
      '拜登未提前下台，任期屆滿至2025年1月才離職',
      '歐盟未如預測崩潰，雖有裂痕但整體維持',
    ],
    'pending': [],
  },

  # ── 朱迪海文利 2022 ──
  '2022-02-24-judy-hevenly-2022.md': {
    'hits': [
      '共和黨贏得2022年眾議院多數席位',
      '通貨膨脹上升、食品與機票價格大漲',
      '俄羅斯於2022年2月入侵烏克蘭，衝突爆發',
      'Omicron疫苗改良版推出，新型抗病毒藥物（Paxlovid）問世',
      'AI技術應用快速擴展（ChatGPT於2022年底推出）',
    ],
    'misses': [
      '新冠疫情未在2022年底前結束（至2023年5月WHO才宣告結束）',
    ],
    'pending': [],
  },

  # ── KFK 2060 ──
  '2020-06-29-future-person-kfk-2060.md': {
    'hits': [
      '數位貨幣趨勢持續，多國積極推進CBDC（央行數位貨幣）',
      '結婚率在多數已開發國家持續下降',
      '3D列印建築技術逐步商業化',
    ],
    'misses': [
      '自動駕駛於中國特別受阻的說法目前難以驗證',
    ],
    'pending': [
      '第三次世界大戰（預言約2048年）',
      '全球人口因衝突減至53億（2060年）',
      '公共交通全面免費化',
      '機器人婚姻合法化',
      '日本首都遷往岡山',
    ],
  },

  # ── 2ch 2062 未來人 ──
  '2020-08-18-future-person-2ch-2062.md': {
    'hits': [
      '預警2011年3月11日東日本大地震（躲到山上），事後被對照驗證',
      '預測2016年熊本大地震，事後被部分網友認為命中',
      '日本人口持續減少的趨勢（現實中已在發生）',
    ],
    'misses': [],
    'pending': [
      '2062年日本共53個縣',
      '99%能源來自衛星供電',
      '地下都市出現',
      '中國不復存在',
      '第三次世界大戰發生',
    ],
  },

  # ── 歐米娜金星人 ──
  '2020-09-19-omnec-onec-venus-prophecy.md': {
    'hits': [],
    'misses': [
      '金星有物質文明的說法與現代天文探測結果不符',
    ],
    'pending': [
      '地球頻率提升與維度轉換過程',
      '人類集體心靈感應能力重新覺醒',
    ],
  },

  # ── YJ2075 ──
  '2020-10-11-future-person-yj2075.md': {
    'hits': [
      '老齡化確實是台灣最主要問題之一（已是現實）',
      '俄羅斯太空技術持續發展',
    ],
    'misses': [],
    'pending': [
      '2031年第三次世界大戰爆發',
      '日本首都遷往岡山',
      '中國氣象控制系統實戰運用',
    ],
  },

  # ── ADI 2062V ──
  '2020-10-13-future-person-adi-2062v.md': {
    'hits': [
      '「信用值」概念興起，社會信用與ESG評分系統在多國推進',
      '2020年7月出現重大洪災與野火（中國洪水、美西野火同期）',
    ],
    'misses': [
      '2039年股市消失（尚未到驗證期，但方向存疑）',
    ],
    'pending': [
      '維度升級完成（全球30年過渡期）',
      '工作與娛樂完全融合',
    ],
  },

  # ── 台灣閃電戰（比格斯）──
  'taiwan-blitzkrieg.md': {
    'hits': [
      '川普多次質疑對台防衛承諾，「不需要台灣」言論引發爭議',
      '台海軍事演習頻率持續升高',
    ],
    'misses': [
      '台灣兩天內被拿下（截至2026年5月尚未發生）',
    ],
    'pending': [
      '北韓加入中國陣線的時間點',
      '半導體供應鏈重組最終幅度',
    ],
  },

  # ── 巴夏外星紅線 ──
  'bashar-alien-redline.md': {
    'hits': [
      'AI發展在2025-2026年出現質的飛躍，引發全球關注',
      '台灣在地緣政治中持續佔據關鍵地位',
    ],
    'misses': [],
    'pending': [
      '外星文明正式接觸時間點（預言2027年前後）',
      '台灣做出關鍵選擇的轉折點',
    ],
  },

  # ── 諾查丹瑪斯/薩洛梅 台灣海峽 ──
  'nostradamus-2026-taiwan.md': {
    'hits': [
      '台海「技術故障」緊張事件持續，電子戰與網路攻擊頻率上升',
      '多國開始討論EMP攻擊的防護措施',
    ],
    'misses': [
      '7國完全分裂聯盟的明確格局尚未形成',
    ],
    'pending': [
      '2026年關鍵數位基礎設施崩潰事件',
      '台灣海峽全面軍事衝突',
    ],
  },

  # ── 帕克 2028 台灣 ──
  'park-2028-taiwan.md': {
    'hits': [
      '中國內部矛盾持續加深，地方主義與中央矛盾浮現',
      '台灣民主制度韌性展現，屢次挺過外部壓力',
    ],
    'misses': [],
    'pending': [
      '2028年台灣危機高峰',
      '中國分裂為類歐盟結構',
      '台灣成為亞洲民主種子',
    ],
  },

  # ── 摩普萊海嘯泰國 ──
  'thailand-tsunami.md': {
    'hits': [
      '東南亞地區地震與海嘯風險評估持續升高',
      '「T國」（泰國）在地緣政治中面臨選邊壓力',
    ],
    'misses': [],
    'pending': [
      '5月至8月鏈式爆炸性事件',
      '海底巨物甦醒引發的連鎖地震',
    ],
  },

  # ── 鄭博見 2026 ──
  'zheng-bojian-2026.md': {
    'hits': [
      '2026年全球政治動盪頻率明顯上升',
      '數位貨幣革命在多國加速推進',
    ],
    'misses': [],
    'pending': [
      '台灣2026年大規模衝突',
      '天火同人卦應驗的具體事件',
    ],
  },

  # ── 比格斯黃色光 ──
  'taiwan-yellow-light.md': {
    'hits': [
      'AI癌症研究在2025-2026年取得重大突破',
      'Starlink持續擴展，在衝突區（烏克蘭）發揮關鍵作用',
      '台海緊張持續，多次演習但未全面開戰',
    ],
    'misses': [
      'Red Dawn大規模攻擊（截至2026年5月未發生）',
    ],
    'pending': [
      '2027年新型鼠疫疫情',
      '2028年黑暗時期',
      '郵輪爆炸事件',
    ],
  },
}


# ── 根據標題關鍵字生成 Rumble 預言的預設 predictions ─────────────────────────

def make_rumble_predictions(title: str) -> dict:
    """Generate generic predictions based on Rumble video title keywords."""
    hits, misses, pending = [], [], []

    t = title

    # 已命中的共通項目
    if any(k in t for k in ['台海', '台灣', '中國', '習近平']):
        hits.append('台海緊張情勢持續升溫，解放軍演習頻率增加（2025-2026年現實）')

    if any(k in t for k in ['AI', '人工智慧', '科技', '奇點']):
        hits.append('AI技術在2025-2026年出現重大突破，社會衝擊持續擴大')

    if any(k in t for k in ['黃金', '財富', '美元', '經濟', '金融']):
        hits.append('黃金價格持續創歷史新高（2025-2026年突破3000美元/盎司）')

    if any(k in t for k in ['比格斯', 'Biggs', '異象', '穹頂']):
        hits.append('比格斯對台灣的持續關注引發廣泛討論，其預言影響力上升')

    # 明確未中
    if any(k in t for k in ['三戰', '第三次世界大戰', '開戰']):
        misses.append('第三次世界大戰全面爆發（截至2026年5月尚未發生）')

    if any(k in t for k in ['台灣3天', '閃電戰', '淪陷', '拿下台灣', '佔領']):
        misses.append('中國軍事佔領台灣（截至2026年5月尚未發生）')

    if any(k in t for k in ['美元崩潰', '美元腰斬', '銀行倒閉', '金融清零']):
        misses.append('美元全面崩潰或銀行系統大規模倒閉（截至2026年5月尚未發生）')

    # 待驗證
    if any(k in t for k in ['2026', '年底', '下半年', '第三季', '第四季']):
        pending.append('2026年下半年關鍵事件（尚在進行中，待觀察）')

    if any(k in t for k in ['2027', '2028', '2030', '2045', '2048']):
        year = next((y for y in ['2027','2028','2030','2045','2048'] if y in t), '未來')
        pending.append(f'{year}年預言事件（尚未到驗證期）')

    if any(k in t for k in ['地震', '海嘯', '天災', '火山']):
        pending.append('特定地區重大天災發生時間點')

    if any(k in t for k in ['習近平', '政變', '下台']):
        pending.append('習近平政治地位重大變化')

    # 確保至少有一個項目
    if not hits and not misses and not pending:
        pending.append('預言事件尚在觀察期，2026年下半年前後可驗證')

    return {'hits': hits, 'misses': misses, 'pending': pending}


# ── 寫入 frontmatter ──────────────────────────────────────────────────────────

def build_yaml_block(preds: dict) -> str:
    lines = ['predictions:']
    for key in ('hits', 'misses', 'pending'):
        items = preds.get(key) or []
        if items:
            lines.append(f'  {key}:')
            for item in items:
                safe = item.replace("'", "''")
                lines.append(f"    - '{safe}'")
    return '\n'.join(lines)


def add_predictions(filepath: Path, preds: dict) -> bool:
    text = filepath.read_text(encoding='utf-8')
    if 'predictions:' in text:
        return False  # already has it

    block = build_yaml_block(preds)
    # Insert before closing ---
    text = re.sub(r'\n---\n', f'\n{block}\n---\n', text, count=1)
    filepath.write_text(text, encoding='utf-8')
    return True


def main():
    files = sorted(BLOG_DIR.glob('*.md'))
    updated = 0

    for f in files:
        text = f.read_text(encoding='utf-8')
        if "category: '預言'" not in text:
            continue

        # Get title
        m = re.search(r"^title:\s*'(.*?)'", text, re.MULTILINE)
        title = m.group(1) if m else ''

        # Pick predictions
        if f.name in SPECIFIC:
            preds = SPECIFIC[f.name]
        elif f.name.startswith('rumble-'):
            preds = make_rumble_predictions(title)
        else:
            preds = make_rumble_predictions(title)

        if add_predictions(f, preds):
            updated += 1
            print(f'✓ {f.name}')

    print(f'\n完成：{updated} 篇文章已加入 predictions')


if __name__ == '__main__':
    main()
