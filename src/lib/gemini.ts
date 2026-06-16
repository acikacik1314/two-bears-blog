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

export async function identifyProduct(imageBase64: string): Promise<{
  name: string
  category: string
  confidence: string
}> {
  const prompt = `你是一個二手商品鑑定專家。請分析這張商品圖片，回傳 JSON 格式（只回傳 JSON，不要其他文字）：
{
  "name": "商品名稱，用繁體中文描述（例：優衣庫印花短袖T恤、Apple AirPods Pro 第二代），品牌可保留英文",
  "category": "分類（從以下選一個：電器/衣物/書籍/傢俱/3C/其他）",
  "confidence": "high/medium/low（辨識信心度）"
}`
  try {
    const result = await callGeminiRaw(prompt, imageBase64)
    const clean = result.replace(/```json|```/g, '').trim()
    return JSON.parse(clean)
  } catch {
    return { name: '無法辨識', category: '其他', confidence: 'low' }
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
  deliveryMethods?: string[]
  size?: string
}): Promise<{ story: string; plain: string }> {
  const deliveryText = info.deliveryMethods?.length
    ? info.deliveryMethods.join('、')
    : '請洽賣家'

  const prompt = `你是「兩隻熊二手市集」的 AI 攤主，語氣溫暖口語，像朋友在說話。

根據以下商品資訊，生成兩個版本的商品說明，回傳 JSON（只回傳 JSON）：

商品：${info.name}${info.size ? `（尺寸：${info.size}）` : ''}
使用年數：${info.yearsUsed} 年
狀況：${info.condition === 'like_new' ? '近全新' : info.condition === 'good' ? '良好' : '普通'}
瑕疵：${info.conditionNotes || '無明顯瑕疵'}
交易方式：${info.dealType === 'sell' ? `賣 ${info.price} 元` : info.dealType === 'trade' ? '以物換物' : '免費送出'}
交貨方式：${deliveryText}
地點：${info.locationNote || ''}

{
  "story": "口語化版本，100-150字，有溫度有故事感，說明這個東西的來歷和為什麼要出清，結尾說明適合誰",
  "plain": "條列式版本，包含：品項、使用年數、功能狀況、外觀描述、售價/交易方式、交貨方式（面交/超商/宅配等）、地點，每項用換行分隔，不用 bullet point，純文字"
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

export async function extractSessionFromChat(
  chatHistory: { role: string; content: string }[],
  identified: any,
): Promise<any> {
  const historyText = chatHistory.map(h =>
    `${h.role === 'user' ? '賣家' : '小熊'}：${h.content}`
  ).join('\n')

  const prompt = `以下是賣家和小熊的上架對話記錄。請從對話中提取所有商品資訊，回傳 JSON（只回傳 JSON，不要其他文字）：

對話：
${historyText}

回傳格式：
{
  "name": "最終確認的商品名稱（若賣家有修改就用修改後的，否則用「${identified?.name || ''}」）",
  "yearsUsed": 使用年數（數字，沒提到填 0）,
  "condition": "like_new 或 good 或 fair",
  "conditionNotes": "外觀/功能瑕疵說明，沒有填空字串",
  "originalPrice": 賣家說的購入原價（數字，沒提到填 null）,
  "dealType": "sell 或 free 或 trade",
  "price": 賣家希望的售價（數字，免費或換物填 null）,
  "tradeWant": "換物想要什麼（不是換物填 null）",
  "locationCity": "縣市名稱",
  "locationNote": "面交地點細節",
  "size": "衣物尺寸（例：M、L、XL、腰圍28英寸），非衣物填 null",
  "deliveryMethods": ["面交", "超商取貨付款", "宅配貨到付款"] 中賣家接受的方式（陣列）,
  "contactType": "line 或 phone 或 form",
  "contactLineId": "LINE ID（沒有填 null）",
  "contactPhone": "電話（沒有填 null）"
}`

  try {
    const result = await callGeminiRaw(prompt)
    const clean = result.replace(/```json|```/g, '').trim()
    return JSON.parse(clean)
  } catch {
    return {}
  }
}

export async function findMatchingItems(
  query: string,
  items: any[],
): Promise<{ matches: string[]; reply: string }> {
  if (items.length === 0) {
    return { matches: [], reply: '目前攤位上還沒有商品，你可以先逛逛或等等再來～' }
  }

  const pool = items.slice(0, 50)
  const itemsSummary = pool.map((item, i) =>
    `${i + 1}. ${item.title} | ${item.deal_type === 'sell' ? item.price + '元' : item.deal_type === 'trade' ? '換物' : '免費'} | ${item.location_city || ''} | ${item.condition === 'like_new' ? '近全新' : item.condition === 'good' ? '良好' : '普通'}`
  ).join('\n')

  const prompt = `你是「兩隻熊二手市集」的 AI 攤主，溫暖口語，像朋友推薦東西。

買家說：「${query}」

目前攤位商品（序號 | 名稱 | 價格 | 地點 | 狀況）：
${itemsSummary}

請回傳 JSON（只回傳 JSON，matches 填序號數字，最多 4 個，沒有符合的填空陣列）：
{
  "matches": [1, 3],
  "reply": "用口語化方式回覆買家，說你幫他找到了什麼，如果沒有符合的就坦白說，語氣像攤主在推薦，不超過 80 字"
}`
  try {
    const result = await callGeminiRaw(prompt)
    // Extract JSON object even if model adds extra text around it
    const jsonMatch = result.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('findMatchingItems: no JSON in response:', result.slice(0, 200))
      throw new Error('No JSON')
    }
    const parsed = JSON.parse(jsonMatch[0])
    const matchIds = ((parsed.matches as any[]) || [])
      .map(n => pool[Number(n) - 1]?.id)
      .filter(Boolean) as string[]
    return { matches: matchIds, reply: parsed.reply || '我找到一些可能符合的商品～' }
  } catch (e) {
    console.error('findMatchingItems error:', e)
    return { matches: [], reply: '抱歉，我找一下攤位上的商品，請再說一次你想找什麼？' }
  }
}

export async function chatWithSeller(
  userMessage: string,
  chatHistory: { role: string; content: string }[],
  session: any,
): Promise<{ reply: string; isComplete: boolean }> {
  const keys = getGeminiKeys()
  if (!keys.length) return { reply: '抱歉，我暫時連不上，請稍後再試。', isComplete: false }

  const category = session.identified?.category || ''
  const isClothing = category === '衣物'

  const systemInstruction = `你是「兩隻熊二手市集」的 AI 攤主，名叫小熊。
說話風格：溫暖、口語、像朋友，用繁體中文，偶爾用台灣語氣詞。
一次只問一件事，不要同時問多個問題。

商品 AI 辨識結果：${JSON.stringify(session.identified || {})}

【數字處理規則——絕對遵守】
- 賣家回答數字時，永遠照字面接受，不要開玩笑、不要誤讀、不要質疑
- 例如：賣家說「10」→ 就是 10 年；賣家說「900」→ 就是 900 元；賣家說「3000」→ 就是 3000 元
- 禁止把數字誤讀成別的意思（例如禁止把「10」解讀成「1010年」）

你必須依序收集以下所有資訊，每一項都要問到才能結束：
1. 商品名稱確認（若賣家沒有異議就視為確認，直接進入下一步）
2. 當初購入的原價大約多少元（不要自己猜，一定要問，單位是新台幣元）
3. 使用幾年（單位是年）${isClothing ? '\n3b. 衣物尺寸（S/M/L/XL 或實際數字，例如腰圍、胸圍等）' : ''}
4. 功能狀況是否正常
5. 外觀有無刮傷損壞或瑕疵
6. 期望售價多少元（或換物、或免費）
7. 所在縣市，以及面交的話大概在哪裡（捷運站、區域等）
8. 交貨方式（面交、超商取貨付款、宅配貨到付款，可以多選）
9. 聯絡方式（LINE ID 或電話，二擇一，這項一定要問，是買家聯絡賣家的唯一方式）

定價規則：售價不能超過賣家告知原價的 30%。計算方式：原價 × 0.3 = 上限。
例如原價 3000 元 → 上限 900 元（900 元以下都可接受）。若超過上限才需溫和提醒。

【重要】只有在以上全部問完後，才能在回覆最後加上 [READY_TO_LIST]。
缺少任何一項（尤其是第 9 項聯絡方式）都不能加 [READY_TO_LIST]。`

  // Build proper multi-turn contents
  const contents: object[] = chatHistory.slice(-14).map(h => ({
    role: h.role === 'user' ? 'user' : 'model',
    parts: [{ text: h.content }],
  }))
  contents.push({ role: 'user', parts: [{ text: userMessage }] })

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents,
    generationConfig: { temperature: 0.7, maxOutputTokens: 600, thinkingConfig: { thinkingBudget: 0 } },
  })

  for (const model of MODELS) {
    for (const key of keys) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
        )
        if (res.status === 404) break
        if (!res.ok) continue
        const data = await res.json()
        const reply = (data?.candidates?.[0]?.content?.parts ?? [])
          .filter((p: any) => !p.thought)
          .map((p: any) => p.text ?? '')
          .join('')
          .trim()
        if (!reply) continue
        const isComplete = reply.includes('[READY_TO_LIST]')
        return { reply: reply.replace('[READY_TO_LIST]', '').trim(), isComplete }
      } catch {
        continue
      }
    }
  }
  return { reply: '抱歉，我暫時連不上，請稍後再試。', isComplete: false }
}
