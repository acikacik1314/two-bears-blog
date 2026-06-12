export const prerender = false
import type { APIRoute } from 'astro'
import { GoogleGenAI } from '@google/genai'

export const GET: APIRoute = async () => {
  const logs: string[] = []

  // 1. 確認環境變數原始值
  const rawKeys = process.env.GEMINI_API_KEYS ?? ''
  const rawKey = process.env.GEMINI_API_KEY ?? ''
  logs.push(`GEMINI_API_KEYS length: ${rawKeys.length}`)
  logs.push(`GEMINI_API_KEYS first10: ${rawKeys.slice(0, 10)}`)
  logs.push(`GEMINI_API_KEY length: ${rawKey.length}`)
  logs.push(`GEMINI_API_KEY first10: ${rawKey.slice(0, 10)}`)

  // 2. 解析 keys
  let keys: string[] = []
  if (rawKeys) {
    try {
      const parsed = JSON.parse(rawKeys)
      if (Array.isArray(parsed)) {
        keys = parsed
        logs.push(`parsed as JSON array, count: ${keys.length}`)
      } else {
        logs.push(`parsed but not array: ${typeof parsed}`)
      }
    } catch(e) {
      logs.push(`JSON.parse failed: ${e}`)
      // 試試單一字串
      keys = [rawKeys]
    }
  } else if (rawKey) {
    keys = [rawKey]
    logs.push(`using single GEMINI_API_KEY`)
  }

  if (!keys.length) {
    return new Response(JSON.stringify({ logs, error: 'no keys' }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const key = keys[0]
  logs.push(`testing key prefix: ${key.slice(0, 8)}...`)

  // 3. 測試 SDK 呼叫
  try {
    const ai = new GoogleGenAI({ apiKey: key })
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: '說你好' }] }],
    })
    logs.push(`SDK success: ${response.text?.slice(0, 50)}`)
    return new Response(JSON.stringify({ logs, ok: true }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch(e: unknown) {
    logs.push(`SDK error: ${String(e)}`)
    return new Response(JSON.stringify({ logs, ok: false }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
