import { GoogleGenAI } from '@google/genai'

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

// 依照 CLAUDE.md 記錄 + 本地實測可用的模型（AQ. key + google-genai SDK）
const MODELS = [
  'gemini-3.5-flash',       // ✅ CLAUDE.md 最新最快
  'gemini-3.1-flash-lite',  // ✅ CLAUDE.md 備用
  'gemini-2.5-flash',       // ✅ 備用（quota 較快用完）
  'gemini-2.5-flash-lite',  // ✅ 備用
  'gemini-2.0-flash',       // ✅ 備用
  'gemini-2.0-flash-lite',  // ✅ 備用
]

export function getModel(): string {
  const env = import.meta.env.GEMINI_MODEL || process.env.GEMINI_MODEL
  if (env) return env
  return MODELS[0]
}

export async function callGemini(body: {
  systemInstruction?: { parts: { text: string }[] }
  contents: { role: string; parts: { text: string }[] }[]
  tools?: object[]
  generationConfig?: object
}, keys?: string[]): Promise<{ ok: boolean; text?: string; status?: number }> {
  const pool = keys ?? getGeminiKeys()
  if (!pool.length) return { ok: false, text: '⚠️ AI助手尚未設定，請聯絡管理員。' }

  const envModel = import.meta.env.GEMINI_MODEL || process.env.GEMINI_MODEL
  const modelsToTry = envModel
    ? [envModel]
    : [...MODELS].sort(() => Math.random() - 0.5)

  const shuffled = [...pool].sort(() => Math.random() - 0.5)

  for (const model of modelsToTry) {
    for (const key of shuffled) {
      try {
        const ai = new GoogleGenAI({ apiKey: key })

        const config: Record<string, unknown> = {
          ...(body.generationConfig ?? {}),
        }
        if (body.tools?.length) config.tools = body.tools
        if (body.systemInstruction) {
          config.systemInstruction = body.systemInstruction.parts.map(p => p.text).join('\n')
        }

        const response = await ai.models.generateContent({
          model,
          contents: body.contents,
          config: Object.keys(config).length ? config : undefined,
        })

        const raw = response.text?.trim() ?? ''
        if (!raw) continue

        const text = raw
          .split('\n')
          .filter(line => !/^\s*\*\*?[A-Za-z]/.test(line))
          .join('\n')
          .trim()

        return { ok: true, text }
      } catch (err: unknown) {
        const msg = String(err)
        // 429 rate limit 或 quota → 試下一個 key
        if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) continue
        // 404 model not found → 試下一個 model
        if (msg.includes('404') || msg.includes('not found') || msg.includes('MODEL_NOT_FOUND')) break
        // 503/502/500 暫時錯誤 → 試下一個 key
        if (msg.includes('503') || msg.includes('502') || msg.includes('500')) continue
        // 401/403 key 無效 → 試下一個 key
        if (msg.includes('401') || msg.includes('403') || msg.includes('API_KEY_INVALID')) continue
        // 其他未知錯誤也繼續嘗試
        continue
      }
    }
  }

  return { ok: false, text: '__RATE_LIMITED__' }
}
