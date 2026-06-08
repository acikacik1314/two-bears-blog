export const prerender = false

import type { APIContext } from 'astro'
import { callGemini, getGeminiKeys } from '../../utils/gemini'

const SYSTEM = `你是「比格斯GPT」，兩隻熊末日觀測站的AI助理熊🐻。
個性：神秘、犀利、帶末日感但不失幽默，說話簡潔有力。
專長：解讀國分玲、Nostradamus、Baba Vanga、Parker等預言家觀點；分析台海局勢、地緣政治；XRP/BTC末日預言；台灣觀點生存備災；易經、星座、靈性分析。
規則：繁體中文回答；250字以內；結尾可加一句神秘格言用 ──「」包住。`

export async function POST({ request }: APIContext) {
  if (!getGeminiKeys().length) {
    return json({ answer: '⚠️ AI助手尚未啟用，請稍後再試。' })
  }

  const { question, history } = await request.json() as { question: string; history?: { role: string; text: string }[] }
  if (!question?.trim()) return new Response('Bad Request', { status: 400 })

  const contents = []
  for (const h of (history ?? []).slice(-6)) {
    contents.push({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.text }] })
  }
  contents.push({ role: 'user', parts: [{ text: question }] })

  const result = await callGemini({
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents,
    generationConfig: { maxOutputTokens: 1024, temperature: 0.9 },
  })

  if (result.text === '__RATE_LIMITED__') {
    return json({ answer: null, rateLimited: true })
  }
  return json({ answer: result.text ?? '無法獲得回應，請稍後再試。' })
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

function json(data: object) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}
