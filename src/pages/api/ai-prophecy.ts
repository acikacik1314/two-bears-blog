export const prerender = false

import type { APIContext } from 'astro'
import { getSession } from '../../utils/session'

export async function POST({ request, cookies }: APIContext) {
  const token = cookies.get('sb_session')?.value
  const user = token ? await getSession(token).catch(() => null) : null
  if (!user) return new Response('Unauthorized', { status: 401 })

  const apiKey = (import.meta.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY) ?? ''
  if (!apiKey) {
    return new Response(JSON.stringify({ answer: '⚠️ AI助手尚未設定。請管理員設定 GEMINI_API_KEY 環境變數後重新部署。' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { question } = await request.json() as { question: string }
  if (!question?.trim()) return new Response('Bad Request', { status: 400 })

  const model = (import.meta.env.GEMINI_MODEL || process.env.GEMINI_MODEL) || 'gemini-2.5-flash'

  const systemText = `你是「兩隻熊末日觀測站」的AI預言研究助手，暱稱為「熊靈」。
你的核心專長：
1. 解讀知名預言家觀點（Baba Vanga、Nostradamus、Bible Code、馬雅曆法）
2. 分析全球地緣政治走向（台海、中東、美中、俄烏）
3. 加密貨幣末日預言解讀（XRP歸零 vs 百倍、比特幣數位黃金理論）
4. 台灣觀點的生存情報與防災建議
5. 靈性、易經、星座趨勢分析

回答風格：神秘深刻又有實用建議，用繁體中文，末尾可加一句令人深思的預言格言。
回答控制在 300 字以內。`

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemText }] },
          contents: [{ role: 'user', parts: [{ text: question }] }],
          generationConfig: { maxOutputTokens: 600, temperature: 0.85 },
        }),
        signal: AbortSignal.timeout(20000),
      }
    )

    if (!res.ok) {
      const errText = await res.text()
      console.error('Gemini API error:', res.status, errText)
      return new Response(JSON.stringify({ answer: `AI連線失敗 (${res.status})，請稍後再試。` }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const data = await res.json()
    const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '無法獲得回應，請稍後再試。'
    return new Response(JSON.stringify({ answer }), { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('AI prophecy error:', err)
    return new Response(JSON.stringify({ answer: '連線逾時或發生錯誤，請稍後再試。' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
