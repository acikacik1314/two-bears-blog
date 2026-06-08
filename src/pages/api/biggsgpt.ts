export const prerender = false

import type { APIContext } from 'astro'

export async function POST({ request }: APIContext) {
  const apiKey = (import.meta.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY) ?? ''
  if (!apiKey) {
    return new Response(JSON.stringify({ answer: '⚠️ AI助手尚未啟用，請稍後再試。' }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  const { question, history } = await request.json() as { question: string; history?: { role: string; text: string }[] }
  if (!question?.trim()) return new Response('Bad Request', { status: 400 })

  const model = (import.meta.env.GEMINI_MODEL || process.env.GEMINI_MODEL) || 'gemini-2.5-flash'

  const systemText = `你是「比格斯GPT」，兩隻熊末日觀測站的AI助理熊🐻。
個性：神秘、犀利、帶末日感但不失幽默，說話簡潔有力。
專長：
- 解讀知名預言家（國分玲、Nostradamus、Baba Vanga、Parker等）的預言
- 分析台海局勢、地緣政治、末日情境
- 加密貨幣（XRP/BTC）末日預言與走勢解讀
- 台灣觀點的生存備災建議
- 易經、星座、靈性分析

規則：
- 繁體中文回答
- 控制在250字以內，簡潔有力
- 回答最後可加一句神秘格言（用 ──「」包住）
- 如果問題超出專長，引導回預言/末日/生存/加密貨幣話題`

  const contents = []
  if (history?.length) {
    for (const h of history.slice(-6)) {
      contents.push({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.text }] })
    }
  }
  contents.push({ role: 'user', parts: [{ text: question }] })

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemText }] },
          contents,
          generationConfig: { maxOutputTokens: 512, temperature: 0.9 },
        }),
        signal: AbortSignal.timeout(25000),
      }
    )

    if (!res.ok) {
      return new Response(JSON.stringify({ answer: `連線失敗 (${res.status})，請稍後再試。` }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const data = await res.json()
    const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '無法獲得回應，請稍後再試。'
    return new Response(JSON.stringify({ answer }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch {
    return new Response(JSON.stringify({ answer: '連線逾時，請稍後再試。' }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
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
