# 兩隻熊部落格 - Claude 開發指引

## ⛔ 回報紀律（違者視為未完成）

任何「已完成」回報**必須**同時提供以下三項可驗證證據，缺一不可：

1. **Commit hash**：實際 `git commit` 輸出的完整 SHA（例如 `5cb5fc1`）
2. **git push 實際輸出**：貼上終端機回傳的原文，如 `main -> main`
3. **真實網址**：只能使用 `twobears.vercel.app` 網域下的路徑，例如 `https://twobears.vercel.app/prophets`

### 禁止事項

- **禁止虛構網址**：不得在回報中捏造任何域名（如 `twobear.blog`、`two-bears.vercel.app` 等未經確認的域名）
- **禁止虛構部署結果**：未親自執行 `vercel ls` 或確認 ● Ready 狀態前，不得宣稱「已部署」
- **禁止未附證據宣稱完成**：宣稱完成但無法提供上述三項證據的工作，一律視為**未完成**
- **schema 驗證失敗必須讓 build 報錯，禁止靜默跳過內容**：若 content.config.ts 的 Zod schema 與 markdown frontmatter 不符，build 必須明確報錯（`exit 1`），不可靜默略過該文章

### 內容異動後強制 commit 規則

- **任何 markdown 的 frontmatter 修改（prophet/predictions/category 等欄位）都必須立即 `git add` + `git commit` + `git push`**
- 未 commit 的修改不會進入 Vercel build，會導致線上資料與本機不一致，難以排查

---

## 專案概況

- Astro 6.x + @astrojs/vercel SSR adapter
- 部署：Vercel（git push 自動觸發）
- 主要路徑：`src/pages/`、`src/components/`、`src/utils/`

---

## ⚠️ 重要：全站 CSS 覆蓋問題

### 問題根源

`Header.astro` / `Footer.astro` 使用 Tailwind，編譯後的 CSS（`Footer.EerhZL9E.css` 或類似檔案）包含：

```css
body { color: #e2e8f0; background: #0f172a; }
```

這是 Header 的深色主題樣式，**會把所有頁面 `<body>` 的文字色蓋成近白的灰色**，導致在淺色背景上幾乎看不見。

### 正確的修法（每個頁面都必須這樣寫）

1. **使用 `html body` 提高優先級**（specificity 0-0-2 > `body` 的 0-0-1）
2. **所有顏色直接寫 hex，不靠 CSS variable 繼承**
3. **每個會顯示文字的元素都要明確設定 `color`，不能只靠繼承**

```css
/* ✅ 正確寫法 */
html body {
  background: #FFF8EC;
  color: #3B2A1E;
}
.wrap { color: #3B2A1E; }
.card h2 { color: #3B2A1E; }
.some-text { color: #5C4A35; }

/* ❌ 錯誤寫法 — 會被 Header CSS 蓋掉 */
body {
  background: var(--cream);
  color: var(--bear);
}
```

### 常用顏色 hex 對照

| 用途 | 變數名 | Hex |
|------|--------|-----|
| 主文字（深棕） | `--bear` | `#3B2A1E` |
| 次要文字（中棕） | `--muted` | `#5C4A35` |
| 奶油背景 | `--cream` | `#FFF8EC` |
| 白色卡片 | `--paper` | `#FFFFFF` |
| 琥珀色 CTA | `--honey` | `#E8920A` |
| 深琥珀 hover | `--honey-deep` | `#C2740A` |
| 分隔線 | `--line` | `#EADFC8` |

---

## `<style is:global>` 放置位置

在 Astro 頁面中，`<style is:global>` **必須放在 `<html>` 標籤之前**（frontmatter 之後、html 之前），才會被 Astro 處理並注入 CSS 檔案。

```astro
---
import BaseHead from '../components/BaseHead.astro'
---

<style is:global>          ← ✅ 放這裡
:root { --honey: #E8920A; }
html body { color: #3B2A1E; }
</style>

<html lang="zh-Hant">
<head>
  <BaseHead ... />
</head>
<body>...</body>
</html>

<!-- ❌ 不能放這裡 — Astro 不會處理 -->
<style is:global> ... </style>
```

---

## API Routes

- 所有 API route 必須加 `export const prerender = false`

---

## 🔐 API Key 安全規範

### 絕對禁止

- **API key 的值絕對不能出現在對話輸出、終端機畫面、或任何可見位置**
- 曾因 key 值洩漏，所有 key 都必須重新申請過一次
- `.env.local`、`.env.production.local` 已在 `.gitignore`（`.env*` 規則），永遠不要 commit

### Key 的來源（開發機）

本機 API key 儲存在：`~/.claude/api_keys.json`

結構：
```json
{
  "gemini": ["...", "..."],   // 12 組輪替 key
  "groq":   ["...", "..."],   // 4 組輪替 key
  "tavily": ["...", "..."]    // 2 組輪替 key
}
```

### 本機 `.env.local` 所需的 key 清單

```
GEMINI_API_KEY=          # 單一 key（備用）
GEMINI_API_KEYS=         # JSON 陣列字串，如 ["key1","key2"]
GROQ_API_KEYS=           # JSON 陣列字串
TAVILY_API_KEY=          # 單一 key
RESEND_API_KEY=          # 信件發送
BLOB_READ_WRITE_TOKEN=   # Vercel Blob 儲存
GOOGLE_CLIENT_ID=        # Google OAuth 登入
GOOGLE_CLIENT_SECRET=
KEYSTATIC_GITHUB_CLIENT_ID=   # Keystatic CMS
KEYSTATIC_GITHUB_CLIENT_SECRET=
KEYSTATIC_SECRET=
GITHUB_REPO_OWNER=       # acikacik1314
GITHUB_REPO_NAME=        # two-bears-blog
ADMIN_EMAIL=             # acikacik@gmail.com
```

### 更新 `.env.local`（Claude 操作原則）

從 `~/.claude/api_keys.json` 讀取並寫入 `.env.local` 時，必須用**不輸出值到畫面**的方式：

```bash
# ✅ 正確：值不顯示在畫面
python3 -c "
import json, re, sys
d = json.load(open('/Users/user/.claude/api_keys.json'))
env = open('.env.local').read()
env = re.sub(r'^GEMINI_API_KEYS=.*$', 'GEMINI_API_KEYS=' + json.dumps(d['gemini']), env, flags=re.MULTILINE)
open('.env.local', 'w').write(env)
print('done')
"

# ❌ 絕對不行：cat / echo / print 出 key 值
cat .env.local
python3 -c "print(keys)"
```

### Vercel 生產環境

- 在 **Vercel Dashboard → Project → Settings → Environment Variables** 設定
- `GEMINI_API_KEYS` 填 JSON 陣列字串：`["key1","key2","key3"]`
- 不需要 `KEYSTATIC_*`（僅本機 CMS 需要）
- 修改後需要重新部署才會生效

---

## Gemini API 設定

### 環境變數（Vercel / .env）

| 變數名 | 說明 |
|--------|------|
| `GEMINI_API_KEY` | 單一 key |
| `GEMINI_API_KEYS` | 多 key（JSON 陣列字串） |
| `GEMINI_MODEL` | 指定模型（不設則自動輪替） |

多 key 格式（Vercel 環境變數填這個字串）：
```
["key1", "key2", "key3"]
```

### 可用模型（2026-06 確認可用）

```
gemini-3.5-flash       ← 預設第一選擇
gemini-3.1-flash-lite
gemini-2.5-flash
gemini-2.5-flash-lite
```

**已停用（填了會 404）：** `gemini-2.0-flash`、`gemini-1.5-flash`

### 兩種呼叫模式

**模式 A：用 `callGemini()` utility**（`src/utils/gemini.ts`）

```typescript
import { callGemini } from '../../utils/gemini'

const result = await callGemini({
  systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
  contents: [{ role: 'user', parts: [{ text: '問題' }] }],
  generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
})
if (result.ok) console.log(result.text)
```

**模式 B：直接 fetch**（`bear-picks.ts`、`compare.ts` 用這個）

```typescript
const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
  { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: reqBody }
)
```

### Key + Model 輪替邏輯（重要！勿改錯）

```typescript
const MODELS = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite']
const shuffled = [...keys].sort(() => Math.random() - 0.5)

for (const model of MODELS) {
  for (const apiKey of shuffled) {
    try {
      const res = await fetch(url, { ... })
      if (res.status === 429 || res.status === 503) continue  // 限流 → 換 key
      if (res.status === 401 || res.status === 403) continue  // 認證失敗 → 換 key
      if (res.status === 404) break                           // 模型不存在 → 換模型 ⚠️
      if (!res.ok) continue
      // 成功 → return
    } catch {
      continue
    }
  }
  // 內層跑完（404 或全 key 試過）→ 外層自然繼續下一個 model ✅
}
```

**⚠️ 常見錯誤：**
- `break outer` 或 `break` 不分情況 → 內層 break 會跳出整個外層，所有 model 都試不到
- 404 應該 `break`（只跳出內層），讓外層繼續下一個 model

### Gemini 2.5 思考模式（Thinking Mode）過濾

`gemini-2.5-*` 回傳的 `parts` 陣列裡有 `{ thought: true }` 的思考過程，**必須過濾掉**：

```typescript
const text = (data?.candidates?.[0]?.content?.parts ?? [])
  .filter(p => !p.thought)          // ← 少了這行會混入思考文字
  .map(p => p.text ?? '')
  .join('')
  .trim()
```

或在 `generationConfig` 關掉思考：
```typescript
generationConfig: { thinkingConfig: { thinkingBudget: 0 } }
```

### 各 API route 使用情況

| 路由 | 模式 | 備註 |
|------|------|------|
| `api/bear-picks.ts` | 直接 fetch | 有 thought 過濾 |
| `api/compare.ts` | 直接 fetch | 固定用 `gemini-2.5-flash` |
| `api/biggsgpt.ts` | `callGemini()` | Gemini 失敗會 fallback 到 Groq |
| `api/gemini-analyze.ts` | 直接 fetch | ⚠️ 還有舊模型名，更新時記得改 |

## 每日發布管線

### 兩個指令

| 指令 | 腳本 | 功能 |
|------|------|------|
| `npm run draft` | `scripts/draft-posts.mjs` | 掃描 `~/Downloads/未來人預言家/`，呼叫 Gemini 生成草稿，存入 `drafts/` |
| `npm run publish` | `scripts/publish-drafts.mjs` | 把 `drafts/` 移入 `content/blog`，build 驗證，commit + push |

### 管線規則（不得違反）

- **predictions 只能有 `pending`，禁止產生 `hits` 或 `misses`**
  - hits/misses 的判定一律由人工修改 frontmatter
- **prophet 值必須完全匹配 prophets.ts 名冊**
  - 若 AI 識別到文中人物但對應不到名冊，草稿中的 `prophet:` 欄位留空，並在報告中標示「未識別人物，待人工確認」
  - 禁止自行建立新 profile 或猜測歸屬
- **草稿先在 `drafts/` 確認，再執行 publish**
  - `drafts/` 已加入 `.gitignore`，不會進 git
  - `draft: true` 旗標在 publish 時自動移除
- **凍結機制 `hold: true`**：任何標記為「待裁決」的草稿，必須立刻在 frontmatter 加上 `hold: true`
  - publish 腳本會跳過所有帶 `hold: true` 的草稿，並在報告中列出
  - 凍結草稿在使用者明確裁決前，禁止進入 publish——這是硬性規則，不能靠記憶執行
  - 人工裁決後，由使用者或 Claude 移除 `hold: true` 才可發布
- **tracking 檔案**：`scripts/draft-tracking.json` 記錄哪些來源已處理，會進 git
- **--all 旗標**：`npm run draft --all` 重新處理全部來源（含已草稿過的）

---

## 預言計分原則

### misses vs pending 的判定標準

- **`misses`（失準）**：時限已到，且明確未發生。例如「2025年內中國拿下台灣」→ 2025年已過，未發生 → miss。
- **`pending`（待驗證）**：符合以下任一條件，一律標 pending，不得標 miss：
  - 明確說「難以驗證」或「尚未到驗證期」
  - 預言的截止時間尚未到達（包括「2026年底前」等尚未過期的時限）
  - 預言無明確截止時間，且事件本身尚未發生
  - 主要事件未發生，導致附帶細節（如時間框架）無法被驗證

**口訣：misses 只收「時到事未成」，其他一律 pending。**

### 同名/近名人物辨別規則

- **禁止以名字推斷歸屬**：兩個名字相似的人物，不得以「名字看起來像某人」為理由直接補掛 prophet 欄位
- **必須以內文實證區分**：裁決前先開檔案讀內容，確認文中出現的具體人名、作品、頭銜
- 判例：波蘭 Krzysztof Kieślowski（導演）vs Krzysztof Jackowski（預言家）——外部推理曾誤判，內文實證糾正。`kieslowski-survival-guide.md` = 導演文章，`2026-financial-doomsday.md` = 傑可夫斯基預言

### 典籍類預言特別計分規則（推背圖、諾查丹瑪斯、日月神示等）

- **典籍可立檔**，但事後諸葛的解讀**不算命中**
- 「命中」的唯一條件：對應事件發生**之前**，特定象或段落的解讀就已在公開管道流傳
- 若解讀是在事件發生**之後**才出現（「第X象正是在說這件事」），一律標 `pending` 或不入 `hits`，寧缺勿濫
- 本規則同時適用未來所有典籍類人物（袁天罡與李淳風、諾查丹瑪斯等）

---

## Rumble 文章欄位規範

### 兩套編號系統，絕對不可混用

Rumble 影片有**兩套獨立 ID**，格式不同、用途不同：

| 欄位 | 說明 | 範例 |
|------|------|------|
| `rumblePage` | 完整頁面網址（含文字 slug） | `https://rumble.com/v799em0-2026-.html` |
| `rumbleId` | embed ID（oEmbed API 回傳） | `v772qls` |

- 頁面網址中的代碼（如 `v799em0`）是**頁面代碼**，**不等於** embed ID
- `rumbleId` 欄位填錯成頁面代碼，會導致嵌入播放器顯示**陌生頻道的影片**

### 新增或匯入 Rumble 文章時的強制流程

1. 取得影片頁面 URL（如 `https://rumble.com/v{slug}-title.html`）
2. 查 oEmbed API：`GET https://rumble.com/api/Media/oembed.json?url={頁面URL}`
3. **驗證** `author_url` 包含 `twobear2`，不符合就不寫入
4. 從回傳 `html` 欄位提取 embed ID（`rumble.com/embed/{EMBED_ID}/`）
5. 寫入 `rumbleId: '{EMBED_ID}'` 及 `rumblePage: '{頁面URL}'`，兩欄缺一不可

```yaml
# ✅ 正確
rumbleId: 'v772qls'
rumblePage: 'https://rumble.com/v799em0-2026-.html'

# ❌ 錯誤（把頁面代碼填進 rumbleId）
rumbleId: 'v799em0'
```

---

## 通路王 Deep Link

- member ID：`3RE6d`
- 已核准平台：momo、台灣樂天、Yahoo購物、家樂福、蝦皮商城、酷澎
- Yahoo 另用：`https://ibanana.biz/3RDip`
- 小三美日另用：`https://afflink.one/s/nP5WT`
- 平台按鈕必須用 `<a>` 元素（不能用 `<button>`），通路王的 MutationObserver 才能自動轉換
