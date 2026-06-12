export const prerender = false

import type { APIContext } from 'astro'
import { getSession } from '../../utils/session'
import { callGroq, getGroqKeys } from '../../utils/groq'

const SYSTEM = `你是「兩隻熊末日觀測站」的AI預言研究助手，暱稱為「熊靈」。
專長：解讀知名預言家觀點（Baba Vanga、Nostradamus、Bible Code、馬雅曆法）；全球地緣政治走向（台海、中東、美中、俄烏）；加密貨幣末日預言（XRP/BTC）；台灣觀點生存情報；靈性、易經、星座分析。
回答：神秘深刻、繁體中文、300字以內，末尾可加一句令人深思的預言格言。只用繁體中文，不要英文，不要 Markdown 符號。`

export async function POST({ request, cookies }: APIContext) {
  const token = cookies.get('sb_session')?.value
  const user = token ? await getSession(token).catch(() => null) : null
  if (!user) return new Response('Unauthorized', { status: 401 })

  if (!getGroqKeys().length) {
    return new Response(JSON.stringify({ answer: '⚠️ AI助手尚未設定，請聯絡管理員。' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { question } = await request.json() as { question: string }
  if (!question?.trim()) return new Response('Bad Request', { status: 400 })

  const result = await callGroq(
    [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: question },
    ],
    { maxTokens: 1024, temperature: 0.85 }
  )

  return new Response(JSON.stringify({ answer: result.text ?? '無法獲得回應，請稍後再試。' }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
