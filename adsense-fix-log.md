# AdSense 修補紀錄

執行日期：2026-10-01
對應稽核報告：[adsense-audit.md](adsense-audit.md)

## 修改檔案一覽

### 程式／路由
- [src/pages/blog/[...slug].astro](src/pages/blog/[...slug].astro) — 移除 `MIN_SUMMARY = 200` 門檻，只要文章含 `## 逐字稿` 或 `## 影片逐字稿`（含文件開頭），`/blog/<slug>` 一律只渲染標題之前的摘要；標題之後整段逐字稿不再出現在 /blog 頁，連結仍由 `BlogPost.astro` 的「📄 查看原始逐字稿 →」按鈕導向 `/transcript/<slug>`（維持 noindex）。
- [src/pages/blog/[...page].astro](src/pages/blog/[...page].astro) — 第 2 頁以後輸出 `<meta name="robots" content="noindex, follow">`；AdSlot 只在第 1 頁顯示（將 `{i === 6 && …}` 加上 `&& page.currentPage === 1`）。
- [src/pages/category/[category]/[...page].astro](src/pages/category/[category]/[...page].astro) — 當 `page.total < 3` 或 `page.currentPage > 1` 時輸出 `noindex, follow`。對應稽核 1 篇分類（天災、科技、影片、旅遊、異象）自動被隔離。
- [src/pages/prophet/[id].astro](src/pages/prophet/[id].astro) — 當 `allPosts.length < 3` 時輸出 `noindex, follow`。
- [src/pages/contact.astro](src/pages/contact.astro) — 新增聯絡頁，風格對齊 `about.astro` 的深色霓虹卡片。內含：
  - Email：`acikacik@gmail.com`
  - YouTube：`https://www.youtube.com/@twobears`
  - Facebook 粉絲團：`https://www.facebook.com/twobear2`（**TODO**：確認是否正確，源始檔用 `twobear2` 僅因為 ko-fi 使用這個 handle；若正式粉專是其他網址請自行替換）
- [src/components/SiteFooterLinks.astro](src/components/SiteFooterLinks.astro) — footer「聯絡我們」由 `mailto:acikacik@gmail.com` 改為 `/contact`。

### 工具頁 AdSlot 檢查
`/omikuji`、`/fortune`、`/pick`、`/picks`、`/avoid` 這 5 頁 **原本就沒有** `AdSlot` 的匯入或使用（`grep -n "AdSlot"` 結果為空），無需移除。

## 設成 draft 的文章清單

共 **25 篇** 被加上 `draft: true`，不會進入 build／sitemap／AdSlot 曝光。

### 7 篇純英文（0 中文字）
| 檔案 |
|---|
| src/content/blog/fujian-aircraft-carrier-transits-taiwan-strait-what-do-six-prophets.md |
| src/content/blog/predicted-war-feb-th-year-advance-polish-psychic-jackowski-taiwan.md |
| src/content/blog/prophet-who-spent-years-prison-personally-names-taiwan.md |
| src/content/blog/she-said-god-death-ordered-her-stay-silent-until-july-but-she-started.md |
| src/content/blog/verifying-greatest-time-traveler-from-have-kokubu-rei-predictions.md |
| src/content/blog/very-bad-omen-all-time-highs-taiwan-stock-market-three-temples-one.md |
| src/content/blog/why-loving-someone-more-can-lead-more-pain-professor-zeng-shi-qiang.md |

### 18 篇 2017–2021 低字數舊文（< 500 中文字）
| 中文字數 | 檔案 |
|---:|---|
| 338 | src/content/blog/2017-05-30-phuket-renaissance-resort.md |
| 433 | src/content/blog/2017-06-02-yilan-classic-hotel-place.md |
| 453 | src/content/blog/2017-06-23-taipei-marriott-inges-restaurant.md |
| 359 | src/content/blog/2017-08-02-hualien-yuuli-hot-spring.md |
| 351 | src/content/blog/2017-08-20-taipei-hotel-east-songshan.md |
| 419 | src/content/blog/2017-10-21-taitung-hotel-royal-chihpen.md |
| 325 | src/content/blog/2017-11-25-chitose-ana-crowne-plaza-hokkaido.md |
| 293 | src/content/blog/2017-12-16-yilan-walden-hotel-slh.md |
| 324 | src/content/blog/2018-01-30-taipei-beitou-asia-pacific-hotel.md |
| 382 | src/content/blog/2018-06-05-buttermilk-american-restaurant-taipei.md |
| 355 | src/content/blog/2018-08-05-tainan-hotel-deleau-anping.md |
| 316 | src/content/blog/2018-09-19-yilan-jiaoxi-wellspring-silks.md |
| 396 | src/content/blog/2018-10-12-taichung-inhouse-hotel-grand.md |
| 440 | src/content/blog/2018-11-16-taichung-hotel-the-place.md |
| 331 | src/content/blog/2019-10-11-penghu-four-points-sheraton.md |
| 427 | src/content/blog/2019-11-08-taichung-royalroi-hotel.md |
| 390 | src/content/blog/2020-09-25-facebook-classic-layout.md |
| 199 | src/content/blog/2021-01-23-don-don-donki-ximen-taiwan.md |

### 本次未動的範圍（按原始指示）
- `2026-*` 開頭的文章（含 2026 低字數影片包裝頁）—— 這些需要日後補自家分析或單獨處理。
- `ep-*`、`yt-*`、`rumble-*`、`biggs-*` 等命名的文章 —— 由於逐字稿從 /blog 頁被拆走，許多原本靠逐字稿充字數的文章在 /blog 看起來會更短，但同時逐字稿路由仍 noindex，整體對審查員更友善。

## 字數分佈變化（排除 draft 之後）

| 區間 | 修改前 | 修改後 | 差 |
|---|---:|---:|---:|
| 總篇數 | 751 | **726** | −25 |
| < 100 | 7 | **0** | −7 |
| 100–299 | 3 | 1 | −2 |
| 300–499 | 39 | 23 | −16 |
| 500–799 | 127 | 127 | 0 |
| 800–1499 | 198 | 198 | 0 |
| 1500–2999 | 224 | 224 | 0 |
| 3000+ | 153 | 153 | 0 |
| **< 300 累計** | 10 | **1** | −9 |
| **< 500 累計** | 49 | **24** | −25 |
| **< 800 累計** | 176 | **151** | −25 |

極端薄內容（0 中文字、199 中文字那篇 Donki 文）已完全清除。<500 字文章從 49 篇砍到 24 篇（剩下的全是 2026 新內容與 yt-*／ep-* 影片包裝頁，依指示本次不動）。

## Build 驗證
`npm run build` 全程通過，無報錯；sitemap 正常輸出；Vercel adapter bundling 完成。

## 下一步建議（送審前）
1. **處理 `contact.astro` 的 FB 粉絲團網址** —— 請把 `twobear2` 換成正確的粉絲團 slug。
2. **送審前自檢清單**：
   - 隨機點 20 個 `/blog/*` 頁面確認無整段逐字稿外露。
   - 檢查 Search Console 的「含 noindex 的網頁」是否開始累積（約 1–2 週可見）。
   - 檢查 `/sitemap-index.xml` 不再包含那 25 篇 draft。
3. **後續可做**（本次未納入）：
   - 2026 年的 50 篇「逐字稿前自家分析 < 500 字」文章補 TL;DR 或改 `draft: true`。
   - 重複標題 5 組合併。
   - 2026 之後的 `yt-*` 系列補一段「本集重點 + 兩隻熊怎麼看」。
