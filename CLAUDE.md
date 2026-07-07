# 兩隻熊部落格 - Claude 開發指引

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
