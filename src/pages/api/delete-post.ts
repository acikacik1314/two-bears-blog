export const prerender = false

import type { APIRoute } from 'astro'
import { existsSync, unlinkSync } from 'fs'
import { join } from 'path'

const PIN_ENV = import.meta.env.CRUISE_ADMIN_PIN ?? process.env.CRUISE_ADMIN_PIN ?? ''
const OWNER   = import.meta.env.GITHUB_REPO_OWNER ?? process.env.GITHUB_REPO_OWNER ?? 'acikacik1314'
const REPO    = import.meta.env.GITHUB_REPO_NAME  ?? process.env.GITHUB_REPO_NAME  ?? 'two-bears-blog'
const GH_TOKEN = import.meta.env.GITHUB_TOKEN     ?? process.env.GITHUB_TOKEN      ?? ''

function checkPin(req: Request): boolean {
  return !!PIN_ENV && req.headers.get('x-admin-pin') === PIN_ENV
}

export const DELETE: APIRoute = async ({ request }) => {
  if (!checkPin(request)) {
    return json({ ok: false, error: '密碼錯誤' }, 401)
  }

  let postId: string
  try {
    const body = await request.json()
    postId = String(body.postId ?? '').trim()
  } catch {
    return json({ ok: false, error: '格式錯誤' }, 400)
  }

  // Basic safety: only alphanumeric, hyphens, dots
  if (!postId || !/^[\w.\-]+$/.test(postId)) {
    return json({ ok: false, error: '無效的文章 ID' }, 400)
  }

  const relPath = `src/content/blog/${postId}.md`

  // ── 本機 dev：直接刪檔 ──────────────────────────────────────────────────────
  if (import.meta.env.DEV) {
    const absPath = join(process.cwd(), relPath)
    if (!existsSync(absPath)) {
      return json({ ok: false, error: '找不到該文章檔案' }, 404)
    }
    try {
      unlinkSync(absPath)
    } catch (e: unknown) {
      return json({ ok: false, error: `刪除失敗：${String(e)}` }, 500)
    }
    return json({ ok: true, postId, note: '本機已刪除，請記得 git commit && git push' })
  }

  // ── 線上 Vercel：GitHub Contents API ────────────────────────────────────────
  if (!GH_TOKEN) {
    return json({
      ok: false,
      error: 'GITHUB_TOKEN 未設定。請在 Vercel Dashboard → Settings → Environment Variables 加入 GITHUB_TOKEN（需有 repo write 權限的 PAT）',
    }, 500)
  }

  const ghHeaders = {
    'Authorization': `Bearer ${GH_TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  }
  const ghUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${relPath}`

  const getRes = await fetch(ghUrl, { headers: ghHeaders })
  if (!getRes.ok) {
    return json({ ok: false, error: `GitHub API 找不到檔案（${getRes.status}）` }, 404)
  }
  const fileData = await getRes.json() as { sha: string }

  const delRes = await fetch(ghUrl, {
    method: 'DELETE',
    headers: ghHeaders,
    body: JSON.stringify({
      message: `chore: 刪除文章 ${postId}`,
      sha: fileData.sha,
    }),
  })

  if (!delRes.ok) {
    const err = await delRes.json().catch(() => ({})) as { message?: string }
    return json({ ok: false, error: `GitHub 刪除失敗：${err.message ?? delRes.status}` }, 500)
  }

  return json({ ok: true, postId })
}

function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
