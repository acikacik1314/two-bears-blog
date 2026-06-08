export function getGeminiKeys(): string[] {
  const multi = import.meta.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEYS
  if (multi) {
    try {
      const keys = JSON.parse(multi) as string[]
      if (Array.isArray(keys) && keys.length) return keys
    } catch {}
  }
  const single = (import.meta.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY) ?? ''
  return single ? [single] : []
}

export function getModel(): string {
  return (import.meta.env.GEMINI_MODEL || process.env.GEMINI_MODEL) || 'gemini-2.0-flash'
}

export async function callGemini(body: object, keys?: string[]): Promise<{ ok: boolean; text?: string; status?: number }> {
  const pool = keys ?? getGeminiKeys()
  if (!pool.length) return { ok: false, text: '⚠️ AI助手尚未設定，請聯絡管理員。' }

  const model = getModel()
  // Shuffle to spread load evenly
  const shuffled = [...pool].sort(() => Math.random() - 0.5)

  for (const key of shuffled) {
    let res: Response
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(25000),
        }
      )
    } catch {
      continue
    }

    if (res.status === 429 || res.status === 401 || res.status === 403) continue  // bad/expired key or rate limit → try next

    if (!res.ok) {
      return { ok: false, status: res.status, text: `AI連線失敗 (${res.status})，請稍後再試。` }
    }

    const data = await res.json()
    const parts: { text?: string }[] = data?.candidates?.[0]?.content?.parts ?? []
    const text = parts.map(p => p.text ?? '').join('').trim()
    if (!text) return { ok: false, text: '無法獲得回應，請稍後再試。' }
    return { ok: true, text }
  }

  return { ok: false, text: '__RATE_LIMITED__' }
}
