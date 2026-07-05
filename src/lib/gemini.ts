import { getGeminiKeys } from '../utils/gemini'

const MODELS = [
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
]

async function callGeminiRaw(prompt: string, imageBase64?: string): Promise<string> {
  const keys = getGeminiKeys()
  if (!keys.length) throw new Error('No Gemini API key configured')

  const parts: object[] = []
  if (imageBase64) {
    parts.push({ inline_data: { mime_type: 'image/jpeg', data: imageBase64 } })
  }
  parts.push({ text: prompt })

  const body = JSON.stringify({
    contents: [{ parts }],
    generationConfig: { temperature: 0.8, maxOutputTokens: 1500, thinkingConfig: { thinkingBudget: 0 } },
  })

  for (const model of MODELS) {
    for (const key of keys) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
        )
        if (res.status === 404) break  // model not found → try next model
        if (!res.ok) continue           // rate limit / auth / other → try next key
        const data = await res.json()
        const text = (data?.candidates?.[0]?.content?.parts ?? [])
          .filter((p: any) => !p.thought)
          .map((p: any) => p.text ?? '')
          .join('')
          .trim()
        if (text) return text
      } catch {
        continue
      }
    }
  }
  throw new Error('All Gemini models and keys failed')
}

