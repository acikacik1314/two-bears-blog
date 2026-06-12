const MODELS = [
  'llama-3.3-70b-versatile',
  'llama3-70b-8192',
  'llama-3.1-8b-instant',
  'llama3-8b-8192',
  'mixtral-8x7b-32768',
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

      if (res.status === 429 || res.status === 401 || res.status === 403) continue  // rate limit / bad key → try next key
      if (res.status === 404) break  // model not found → try next model
      if (res.status === 500 || res.status === 502 || res.status === 503 || res.status === 529) continue  // server error → try next key/model

      const data = await res.json()
      const text = (data?.choices?.[0]?.message?.content ?? '').trim()
      if (!text) return { ok: false, text: '無法獲得回應，請稍後再試。' }
      return { ok: true, text }
    }
  }

  return { ok: false, text: '__RATE_LIMITED__' }
}
