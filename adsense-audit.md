# AdSense 審查稽核報告（twobears.vercel.app）

稽核日期：2026-10-01
拒絕理由：缺乏價值的內容

## 總覽

| 檢查項 | 結果 |
|---|---|
| 文章總數（非 draft） | 751 篇 |
| 0 中文字（純英文） | 7 篇 ⚠️ |
| < 300 字 | 10 篇 ⚠️ |
| < 500 字 | 49 篇 ⚠️ |
| < 800 字 | 176 篇（23%）⚠️ |
| 含逐字稿 | 124 篇（其中 50 篇逐字稿前自家分析 < 500 字）⚠️ |
| 必要頁面 | /about ✅ /privacy ✅ 聯絡 = 只有 mailto ⚠️ |
| ads.txt | ✅ 正確 |
| AdSense script | ✅ 正確 |
| sitemap / robots | ✅ |
| 文章 title/description | ✅ 全部有 |
| 重複標題群組 | 5 組 ⚠️ |

結論：AdSense 很可能是看到大量「低字數＋逐字稿貼貼＋旅遊舊網誌＋YouTube embed 包裝」的頁面，審查日很容易隨機抽到這些頁面。這是「缺乏價值內容」的典型訊號。

---

## 1. 文章字數

字數定義：扣除 YAML frontmatter、程式碼區塊（``` 與 inline）、HTML 標籤、Markdown 圖片/連結後，計算 CJK 範圍 (U+4E00–U+9FFF) 字元數。排序由少到多。

### 1a. 零字數（純英文或空殼）— 7 篇，最嚴重
AdSense 要求以站點語言為主的實質內容。這幾篇是中文站裡的英文貼文，與其他內容語言不一致，容易被判成拼湊/機翻：

| 檔案 |
|---|
| [src/content/blog/fujian-aircraft-carrier-transits-taiwan-strait-what-do-six-prophets.md](src/content/blog/fujian-aircraft-carrier-transits-taiwan-strait-what-do-six-prophets.md) |
| [src/content/blog/predicted-war-feb-th-year-advance-polish-psychic-jackowski-taiwan.md](src/content/blog/predicted-war-feb-th-year-advance-polish-psychic-jackowski-taiwan.md) |
| [src/content/blog/prophet-who-spent-years-prison-personally-names-taiwan.md](src/content/blog/prophet-who-spent-years-prison-personally-names-taiwan.md) |
| [src/content/blog/she-said-god-death-ordered-her-stay-silent-until-july-but-she-started.md](src/content/blog/she-said-god-death-ordered-her-stay-silent-until-july-but-she-started.md) |
| [src/content/blog/verifying-greatest-time-traveler-from-have-kokubu-rei-predictions.md](src/content/blog/verifying-greatest-time-traveler-from-have-kokubu-rei-predictions.md) |
| [src/content/blog/very-bad-omen-all-time-highs-taiwan-stock-market-three-temples-one.md](src/content/blog/very-bad-omen-all-time-highs-taiwan-stock-market-three-temples-one.md) |
| [src/content/blog/why-loving-someone-more-can-lead-more-pain-professor-zeng-shi-qiang.md](src/content/blog/why-loving-someone-more-can-lead-more-pain-professor-zeng-shi-qiang.md) |

### 1b. 字數分佈

```
<100         7
100-299      3
300-499      39
500-799      127
800-1499     198
1500-2999    224
3000+        153
```

### 1c. 最少的 30 篇（含上面 7 篇零字後的 23 篇）

| 字數 | 檔案 |
|---:|---|
| 199 | [src/content/blog/2021-01-23-don-don-donki-ximen-taiwan.md](src/content/blog/2021-01-23-don-don-donki-ximen-taiwan.md) |
| 244 | src/content/blog/ep-20260527-預言大撞車-2026金融末日還是黃金狂飆-8位先知共同指向的-神祕時間點-曝光.md |
| 293 | src/content/blog/2017-12-16-yilan-walden-hotel-slh.md |
| 316 | src/content/blog/2018-09-19-yilan-jiaoxi-wellspring-silks.md |
| 324 | src/content/blog/2018-01-30-taipei-beitou-asia-pacific-hotel.md |
| 325 | src/content/blog/2017-11-25-chitose-ana-crowne-plaza-hokkaido.md |
| 331 | src/content/blog/2019-10-11-penghu-four-points-sheraton.md |
| 338 | src/content/blog/2017-05-30-phuket-renaissance-resort.md |
| 351 | src/content/blog/2017-08-20-taipei-hotel-east-songshan.md |
| 355 | src/content/blog/2018-08-05-tainan-hotel-deleau-anping.md |
| 359 | src/content/blog/2017-08-02-hualien-yuuli-hot-spring.md |
| 366 | src/content/blog/yt-MWlPG3HaDsw.md |
| 382 | src/content/blog/2018-06-05-buttermilk-american-restaurant-taipei.md |
| 390 | src/content/blog/2020-09-25-facebook-classic-layout.md |
| 396 | src/content/blog/2018-10-12-taichung-inhouse-hotel-grand.md |
| 400 | src/content/blog/yt-LIZvW5Om7z4.md |
| 415 | src/content/blog/2026-bangkok-marriott-marquis-queens-park.md |
| 419 | src/content/blog/2017-10-21-taitung-hotel-royal-chihpen.md |
| 427 | src/content/blog/2019-11-08-taichung-royalroi-hotel.md |
| 433 | src/content/blog/2017-06-02-yilan-classic-hotel-place.md |
| 433 | src/content/blog/2026-santorini-oia.md |
| 435 | src/content/blog/yt-GJ3mwHLZEa0.md |
| 436 | src/content/blog/2026-intercontinental-ana.md |

模式明顯：舊飯店／美食／景點網誌（2017–2019）、`yt-*` YouTube 包裝頁、少數 ep-* 預言摘要。完整 176 篇清單可用附錄 Python 片段重現。

### 1d. 以逐字稿為主、缺少自家分析的文章（50 篇）

共 124 篇含 `## 逐字稿` 或 `## 影片逐字稿`，其中有 50 篇在逐字稿標題「之前」的中文字數 < 500。AdSense 對「大量轉錄／第三方內容而缺乏自家評論」特別敏感。注意：`/transcript/[slug]` 路由本身已 `noindex, nofollow`（[src/pages/transcript/[slug].astro:41](src/pages/transcript/[slug].astro#L41)），但 `/blog/<slug>` 本體仍會把整篇逐字稿暴露給爬蟲與 AdSense 審核員。

代表性極端值（逐字稿前 0 中文字）：
- src/content/blog/2026-aistar-hdr-android.md
- src/content/blog/2026-bbq-ncl.md
- src/content/blog/2026-gaston-luga-splash.md
- src/content/blog/2026-msc-bellissima-beverage-package-lazy-package-guide-bidding-cabin.md
- src/content/blog/2026-sansui-hdr-slhd.md、2026-sansui-ktv-sktv-t888.md、2026-sansui-uhd.md
- src/content/blog/2026-vlog-agu.md、2026-vlog-alati-divine-suites.md、2026-vlog-all-one.md

這些頁面上線的實質內容幾乎只有一段 YouTube 影片 + 逐字稿，構成「薄內容 (thin content)」。

---

## 2. 必要頁面

| 頁面 | 檔案 | footer 連結 |
|---|---|---|
| 關於我們 | [src/pages/about.astro](src/pages/about.astro) ✅ | ✅ |
| 隱私權政策 | [src/pages/privacy.astro](src/pages/privacy.astro) ✅ | ✅（寫成「隱私政策與免責聲明」）|
| 聯絡我們 | ❌ 無獨立頁面，footer 只有 `mailto:acikacik@gmail.com` | ⚠️ |

footer 實作：[src/components/SiteFooterLinks.astro](src/components/SiteFooterLinks.astro)。AdSense 技術上接受 mailto 作為聯絡方式，但審查時常偏好一個獨立 `/contact` 頁，表單或多重聯絡方式（Email、社群、表單）更穩。

---

## 3. ads.txt

[public/ads.txt](public/ads.txt) 內容：
```
google.com, pub-2954712342813984, DIRECT, f08c47fec0942fa0
```
✅ 完全符合要求。

---

## 4. AdSense 程式碼

[src/components/BaseHead.astro](src/components/BaseHead.astro) 兩處皆到位：
- `<meta name="google-adsense-account" content="ca-pub-2954712342813984">`
- `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2954712342813984" crossorigin="anonymous">`

Publisher ID 一致（`pub-2954712342813984`）。✅

---

## 5. 索引相關

- Sitemap：✅ `@astrojs/sitemap` 已啟用，排除 `/admin/`、`/keystatic/`、`/tools/`，掛在 `/sitemap-index.xml`，見 [astro.config.mjs](astro.config.mjs)。
- robots.txt：[public/robots.txt](public/robots.txt) `Allow: /`、`Disallow: /tools/`、Sitemap 指向正確。✅
- noindex 使用位置（都合理）：
  - [src/pages/transcript/[slug].astro:41](src/pages/transcript/[slug].astro#L41) — 整個 transcript 鏡像路由 noindex
  - [src/pages/404.astro:16](src/pages/404.astro#L16) — 404 noindex,follow
  - [src/pages/tools/k9m3xq7pv-search.astro](src/pages/tools/k9m3xq7pv-search.astro) — 工具頁 noindex
- Title/description：✅ 所有 751 篇文章 frontmatter 都有 `title` 與 `description`（0 篇缺）。

---

## 6. 空頁面／低內容集合頁

- **分類頁** [src/pages/category/[category]/[...page].astro](src/pages/category/[category]/[...page].astro)：每頁 24 篇，照 `getPostCategory` 分組。但類別分佈極不平均（基於 frontmatter 統計）：
  ```
  402 (無 category)
  365 預言
   21 靈性
   11 其他
    8 地緣政治
    7 金融
    3 評測 / 3 財經
    1 天災 / 1 科技 / 1 影片 / 1 旅遊 / 1 異象
  ```
  👉 **「天災」「科技」「影片」「旅遊」「異象」各只有 1 篇**，等於單篇文章的獨立分類頁，等同 doorway/thin index。
- **blog 列表** [src/pages/blog/[...page].astro](src/pages/blog/[...page].astro)：24/頁，約 32 頁，中間頁都是縮圖＋卡片 + AdSlot（`import AdSlot from '../../components/AdSlot.astro'`），**廣告會跟隨這些列表頁顯示**。審查員若點進 `/blog/30`、`/blog/31` 這類後段分頁，看到的幾乎只有卡片 + 廣告，實質內容密度低。
- **預言家列表** [src/pages/prophet/[id].astro](src/pages/prophet/[id].astro)：若某預言家底下只有 1–2 篇文章，等於一個稀疏個人頁。
- 其他 `/omikuji`、`/fortune`、`/pick`、`/picks`、`/avoid` 等為互動工具；AdSlot 元件 [src/components/AdSlot.astro](src/components/AdSlot.astro) 全站可用，若這些頁上文本很少需確認是否仍插廣告。

---

## 7. 重複或高度相似內容

標題前 20 字相同的 5 組：

| 群組 | 檔案 |
|---|---|
| `[開箱] 美國富及第 Frigidair…` | yt-rGk4y8RK_MI.md、2026-frigidaire-costco.md |
| `【開箱】SANSUI 山水12L 旋風溫…` | 2026-sansui-saf-2.md、saf-3、saf-4 |
| `2026台灣大劫難！比格斯最新預言：中國…` | 2026-05-22-biggs-taiwan-weather-war.md、rumble-v79ayo6.md |
| `[開箱] CHEFBORN韓國天廚 8人…` | 2026-chefborn-washfall.md、2021-08-30-chefborn-uv-dishwasher-8p.md |
| `【開箱】FRIGIDAIRE 美國富及第…` | yt-EMnbuGGmMVE.md、2021-06-26-frigidaire-freezer-260l.md |

另：**預言系列有很多 `biggs-2026-*` 命名的文章**（biggs-2026-ai-virus-warning、2026-prophecies-biggs、biggs-2026-prophecies、biggs-2026-predictions、biggs-2026-apocalypse-judas-plague、biggs-2026-global-warning、biggs-2026-taiwan-blockchain-clarity-act…），光是看檔名就能預期有大量近似主題。建議手動抽樣確認是否互相含有大段共享文字。本次僅以標題前綴判定，未做內文 n-gram 相似度掃描。

---

## 修改優先清單（照優先順序排）

### P0 — 必做（直接對應「缺乏價值內容」）

1. **刪或 noindex 7 篇純英文零字數文章。**
   - 檔案：見「1a」清單 7 個 .md
   - 建議：直接刪除，或在 frontmatter 加 `draft: true`，或集中搬到英文子站。中文站主出現英文貼文會被判拼湊內容。

2. **處理 50 篇「逐字稿前自家分析 < 500 字」文章。**
   - 加 frontmatter 旗標（例如 `thin: true`），在 [src/pages/blog/[...slug].astro](src/pages/blog/[...slug].astro) 讀取並對這些 slug 輸出 `<meta name="robots" content="noindex, follow">`。
   - 或補 500–800 字自家觀點（開場 TL;DR、關鍵金句、兩隻熊怎麼看、延伸閱讀連結），把它們升到 1500 字以上。
   - 代表檔：2026-aistar-hdr-android.md、2026-bbq-ncl.md、2026-gaston-luga-splash.md、2026-msc-* 系列、2026-sansui-* 系列、2026-vlog-* 系列。

3. **移除／合併 10 篇 < 300 字文章。**
   - 檔案：見「1c」上段。這批是舊飯店／YT 包裝頁，直接 `draft: true` 或刪除。

4. **審查員第一眼：阻擋低密度列表頁被爬／顯示廣告。**
   - 方案 A（保守）：在 [src/components/AdSlot.astro](src/components/AdSlot.astro) 加 `minContentChars` prop，於 [src/pages/blog/[...page].astro](src/pages/blog/[...page].astro) 條件渲染（第一頁才顯示）。
   - 方案 B（直接）：對只有 1 篇文章的分類（天災／科技／影片／旅遊／異象）在 [src/pages/category/[category]/[...page].astro](src/pages/category/[category]/[...page].astro) 輸出 `noindex`，或在 category 判定時把 count<3 的類別合併進「其他」。

### P1 — 建議做

5. **補一個獨立 `/contact` 頁面。**
   - 新增 [src/pages/contact.astro](src/pages/contact.astro)：Email、社群、表單任選。
   - 把 [src/components/SiteFooterLinks.astro](src/components/SiteFooterLinks.astro) 的「聯絡我們 mailto」改成 `/contact`。

6. **處理剩餘的 < 800 字文章（除 P0 已覆蓋的以外約 100+ 篇）。**
   - 動作建議（可用腳本批次執行）：
     - 老舊住宿／美食／景點（2017–2019 series）：補當代 TL;DR + 現況確認（店還在嗎、價格變化）或 `draft: true` 下架。
     - `yt-*` 系列：確認是否只是 YouTube 影片包裝；若是，補一段「本集重點 3 條 + 兩隻熊怎麼看」。檔案批次位置：`src/content/blog/yt-*.md`。

7. **消除重複標題。**
   - 把每一組重複標題整合成一篇正本 + canonical，或刪除舊版。檔案見「第 7 節」表格。
   - 針對 `biggs-2026-*` 系列做內容相似度盤點，過度重複的合併。

### P2 — 加分項（之後逐步處理）

8. **逐字稿頁雖已 noindex，但 /blog 本體仍整篇含逐字稿**：考慮把逐字稿從 `/blog/<slug>` 主頁本體拆到 `/transcript/<slug>`（已 noindex），`/blog` 版只保留「摘要＋重點＋連結」。這會明顯提高 blog 主頁的內容密度與原創比例。可在 [src/pages/blog/[...slug].astro](src/pages/blog/[...slug].astro) 複用 transcript 路由的 `_marker` 切割邏輯裁掉主頁內容。

9. **一篇分類＝一篇文章的 category/prophet 頁加 `noindex`**：在 [src/pages/category/[category]/[...page].astro](src/pages/category/[category]/[...page].astro) 與 [src/pages/prophet/[id].astro](src/pages/prophet/[id].astro) 根據 `posts.length` 條件輸出 robots meta。

10. **重新送審前的操作建議**：
    - 完成 P0 後，重新提交 sitemap 到 Search Console，確認低內容頁已從索引中淡出（約 1–2 週）。
    - 再從 AdSense 後台申請重新審查。審查前自己隨機點 20 個 `/blog/*` 頁面自檢。

---

## 附錄：如何重現字數掃描

```python
import os, re
blog = 'src/content/blog'
rows = []
for name in os.listdir(blog):
    if not name.endswith(('.md','.mdx')): continue
    t = open(os.path.join(blog,name),encoding='utf-8').read()
    if not t.startswith('---'): continue
    end = t.find('\n---',3); fm_text = t[3:end]; body = t[end+4:]
    if re.search(r'^draft:\s*true', fm_text, re.M): continue
    body = re.sub(r'```.*?```','',body,flags=re.S)
    body = re.sub(r'`[^`]*`','',body)
    body = re.sub(r'<[^>]+>','',body)
    body = re.sub(r'!?\[[^\]]*\]\([^)]*\)','',body)
    cn = len(re.findall(r'[一-鿿]', body))
    rows.append((cn, name))
rows.sort()
for cn, n in rows:
    if cn < 800: print(cn, n)
```
