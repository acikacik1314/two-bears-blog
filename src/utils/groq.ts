const MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-70b-versatile',
  'llama-3.1-8b-instant',
]

export function getGroqKeys(): string[] {
  const multi = import.meta.env.GROQ_API_KEYS || process.env.GROQ_API_KEYS
  if (multi) {
    try {
      const keys = JSON.parse(multi) as string[]
      if (Array.isArray(keys) && keys.length) return keys
    } catch {}
  }
  const single = (import.meta.env.GROQ_API_KEY || process.env.GROQ_API_KEY) ?? ''
  return single ? [single] : []
}

export async function callGroq(
  messages: { role: string; content: string }[],
  opts: { maxTokens?: number; temperature?: number; json?: boolean } = {}
): Promise<{ ok: boolean; text?: string; status?: number }> {
  const pool = getGroqKeys()
  if (!pool.length) return { ok: false, text: '⚠️ Groq API 未設定。' }

  const shuffled = [...pool].sort(() => Math.random() - 0.5)

  for (const model of MODELS) {
    for (const key of shuffled) {
      let res: Response
      try {
        res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model,
            messages,
            max_tokens: opts.maxTokens ?? 1024,
            temperature: opts.temperature ?? 0.8,
            ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
          }),
          signal: AbortSignal.timeout(25000),
        })
      } catch {
        continue
      }

      if (res.status === 429 || res.status === 401 || res.status === 403) continue
      if (res.status === 404) break  // model not found → try next

      if (!res.ok) {
        return { ok: false, status: res.status, text: `AI連線失敗 (${res.status})，請稍後再試。` }
      }

      const data = await res.json()
      const text = (data?.choices?.[0]?.message?.content ?? '').trim()
      if (!text) return { ok: false, text: '無法獲得回應，請稍後再試。' }
      return { ok: true, text }
    }
  }

  return { ok: false, text: '__RATE_LIMITED__' }
}
