import { getGeminiKeys } from '../utils/gemini'

const MODEL = 'gemini-2.5-flash'

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

  for (const key of keys) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
      )
      if (!res.ok) continue
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
  throw new Error('All Gemini keys failed')
}

export async function identifyProduct(imageBase64: string): Promise<{
  name: string
  category: string
  estimatedMarketPrice: number
  confidence: string
}> {
  const prompt = `你是一個二手商品鑑定專家。請分析這張商品圖片，回傳 JSON 格式（只回傳 JSON，不要其他文字）：
{
  "name": "商品名稱（品牌+型號，盡量完整）",
  "category": "分類（從以下選一個：電器/衣物/書籍/傢俱/3C/其他）",
  "estimatedMarketPrice": 台灣市場新品大約售價（數字，台幣）,
  "confidence": "high/medium/low（辨識信心度）"
}`
  try {
    const result = await callGeminiRaw(prompt, imageBase64)
    const clean = result.replace(/```json|```/g, '').trim()
    return JSON.parse(clean)
  } catch {
    return { name: '無法辨識', category: '其他', estimatedMarketPrice: 0, confidence: 'low' }
  }
}

export async function generateItemDescription(info: {
  name: string
  yearsUsed: number
  condition: string
  conditionNotes: string
  dealType: string
  price?: number
  locationNote?: string
}): Promise<{ story: string; plain: string }> {
  const prompt = `你是「兩隻熊二手市集」的 AI 攤主，語氣溫暖口語，像朋友在說話。

根據以下商品資訊，生成兩個版本的商品說明，回傳 JSON（只回傳 JSON）：

商品：${info.name}
使用年數：${info.yearsUsed} 年
狀況：${info.condition === 'like_new' ? '近全新' : info.condition === 'good' ? '良好' : '普通'}
瑕疵：${info.conditionNotes || '無明顯瑕疵'}
交易方式：${info.dealType === 'sell' ? `賣 ${info.price} 元` : info.dealType === 'trade' ? '以物換物' : '免費送出'}
地點備註：${info.locationNote || ''}

{
  "story": "口語化版本，100-150字，有溫度有故事感，說明這個東西的來歷和為什麼要出清，結尾說明適合誰",
  "plain": "條列式版本，包含：品項、使用年數、功能狀況、外觀描述、交易方式、面交地點，每項用換行分隔，不用 bullet point，純文字"
}`
  try {
    const result = await callGeminiRaw(prompt)
    const clean = result.replace(/```json|```/g, '').trim()
    return JSON.parse(clean)
  } catch {
    return {
      story: `這是一件使用了 ${info.yearsUsed} 年的 ${info.name}，功能正常，希望給需要的人繼續使用。`,
      plain: `${info.name}\n使用 ${info.yearsUsed} 年\n${info.conditionNotes || '功能正常'}`,
    }
  }
}

export async function findMatchingItems(
  query: string,
  items: any[],
): Promise<{ matches: string[]; reply: string }> {
  if (items.length === 0) {
    return { matches: [], reply: '目前攤位上還沒有商品，你可以先逛逛或等等再來～' }
  }

  const itemsSummary = items.slice(0, 50).map(item =>
    `ID:${item.id} | ${item.title} | ${item.deal_type === 'sell' ? item.price + '元' : item.deal_type === 'trade' ? '換物' : '免費'} | ${item.location_city || ''}`
  ).join('\n')

  const prompt = `你是「兩隻熊二手市集」的 AI 攤主，溫暖口語，像朋友推薦東西。

買家說：「${query}」

目前攤位商品：
${itemsSummary}

請回傳 JSON（只回傳 JSON）：
{
  "matches": ["商品ID1", "商品ID2", "商品ID3"],
  "reply": "用口語化方式回覆買家，說你幫他找到了什麼，最多推薦4件，如果沒有符合的就坦白說，語氣像攤主在推薦，不超過80字"
}`
  try {
    const result = await callGeminiRaw(prompt)
    const clean = result.replace(/```json|```/g, '').trim()
    return JSON.parse(clean)
  } catch {
    return { matches: [], reply: '讓我幫你找找看～目前攤位上的東西我整理一下給你。' }
  }
}

export async function chatWithSeller(
  userMessage: string,
  chatHistory: { role: string; content: string }[],
  session: any,
): Promise<{ reply: string; isComplete: boolean }> {
  const systemPrompt = `你是「兩隻熊二手市集」的 AI 攤主，名叫小熊。

你的任務是透過自然對話，收集上架二手商品所需的資訊。
說話風格：溫暖、口語、像朋友，用繁體中文，偶爾用台灣語氣詞。
不要一次問太多問題，一次只問一件事。

目前已收集到的資訊：
${JSON.stringify(session, null, 2)}

需要收集的資訊（依序收集尚未取得的）：
1. 商品名稱確認
2. 使用年數
3. 功能狀況（正常/有問題，是什麼問題）
4. 外觀狀況（有無刮傷/損壞）
5. 期望定價（或想換什麼，或免費）
6. 所在縣市
7. 面交方式（面交/宅配/超商）
8. 聯絡方式（LINE ID / 電話 / 表單）

定價規則：售價不能超過市價的30%。市價約 ${session.identified?.estimatedMarketPrice || 0} 元，所以這件商品最高只能賣 ${Math.floor((session.identified?.estimatedMarketPrice || 0) * 0.3)} 元。
如果賣家出的價格超過這個上限，要溫和提醒並建議調整到上限以下。

當所有資訊收集完畢，在回覆最後加上 [READY_TO_LIST]`

  const historyText = chatHistory.slice(-10).map(h =>
    `${h.role === 'user' ? '賣家' : '小熊'}：${h.content}`
  ).join('\n')

  const fullPrompt = `${systemPrompt}\n\n對話歷史：\n${historyText}\n\n賣家說：${userMessage}\n\n小熊回覆：`

  try {
    const reply = await callGeminiRaw(fullPrompt)
    const isComplete = reply.includes('[READY_TO_LIST]')
    return { reply: reply.replace('[READY_TO_LIST]', '').trim(), isComplete }
  } catch {
    return { reply: '抱歉，我暫時連不上，請稍後再試。', isComplete: false }
  }
}
