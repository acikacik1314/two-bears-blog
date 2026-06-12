export const prerender = false
import type { APIRoute } from 'astro'
import { callGemini, getGeminiKeys } from '../../utils/gemini'

export const GET: APIRoute = async () => {
  const keys = getGeminiKeys()
  const logs: string[] = []
  logs.push(`key count: ${keys.length}`)
  logs.push(`first key prefix: ${keys[0]?.slice(0,10) ?? 'none'}`)

  // 直接呼叫真實的 callGemini，測試完整流程
  const result = await callGemini({
    contents: [{ role: 'user', parts: [{ text: '說你好，用一個字' }] }],
  })

  logs.push(`ok: ${result.ok}`)
  logs.push(`text: ${result.text?.slice(0, 100) ?? 'null'}`)

  return new Response(JSON.stringify({ logs, ok: result.ok }), {
    headers: { 'Content-Type': 'application/json' }
  })
}
