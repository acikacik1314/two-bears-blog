#!/bin/zsh
# 播客自動轉文章管線 — 由 LaunchAgent 每 10 分鐘呼叫一次
# 手動執行：npm run podcast-now

set -euo pipefail

export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"

PROJ="/Users/user/Documents/two-bears-blog"
LOG="$PROJ/scripts/auto-publish.log"
MAX_LOG_LINES=500

cd "$PROJ"

echo "" >> "$LOG"
echo "========================================" >> "$LOG"
echo "$(date '+%Y-%m-%d %H:%M:%S') 開始自動發布" >> "$LOG"
echo "========================================" >> "$LOG"

# ── Step 0: 先 pull 取得最新 tracking，避免和 GH Actions 衝突 ────────────────
echo "[0/3] git pull..." >> "$LOG"
git pull --rebase --quiet >> "$LOG" 2>&1 || true

# ── Step 1: 抓 RSS，Gemini 產 frontmatter，直接寫草稿到 drafts/ ──────────────
echo "[1/3] 抓取 Podcast RSS 並產生草稿..." >> "$LOG"
if ! node scripts/podcast-to-blog.mjs >> "$LOG" 2>&1; then
  echo "  ⚠️  podcast-to-blog 失敗，跳過本次執行" >> "$LOG"
  exit 0
fi

# ── Step 1b: 立刻 commit tracking，讓 GH Actions 看到已認領的集數 ───────────
git add scripts/podcast-sync-tracking.json scripts/draft-tracking.json >> "$LOG" 2>&1 || true
if ! git diff --cached --quiet 2>/dev/null; then
  git commit -m "chore: 認領新集數（防競態）" >> "$LOG" 2>&1 || true
  git push origin main >> "$LOG" 2>&1 || true
fi

# ── Step 2: 發布草稿 ──────────────────────────────────────────────────────────
DRAFT_COUNT=$(ls drafts/*.md 2>/dev/null | wc -l | tr -d ' ')
if [ "$DRAFT_COUNT" -eq "0" ]; then
  echo "[2/3] 沒有草稿，結束。" >> "$LOG"
  exit 0
fi

echo "[2/3] 發布 $DRAFT_COUNT 篇草稿..." >> "$LOG"
if ! npm run publish >> "$LOG" 2>&1; then
  echo "  ⚠️  publish 失敗" >> "$LOG"
  exit 0
fi

# ── Step 3: 確認發布，更新 podcast-sync-tracking ─────────────────────────────
echo "[3/3] 更新 tracking..." >> "$LOG"
node scripts/podcast-to-blog.mjs --finalize >> "$LOG" 2>&1 || true

echo "✅ $(date '+%Y-%m-%d %H:%M:%S') 完成" >> "$LOG"

# 限制 log 大小（保留最後 MAX_LOG_LINES 行）
if [ -f "$LOG" ]; then
  tail -n $MAX_LOG_LINES "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi
