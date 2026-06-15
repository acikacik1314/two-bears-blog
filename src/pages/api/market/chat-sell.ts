export const prerender = false

import type { APIRoute } from 'astro'
import { supabaseAdmin } from '../../../lib/supabase'
import { identifyProduct, generateItemDescription, chatWithSeller, extractSessionFromChat } from '../../../lib/gemini'
export const POST: APIRoute = async ({ request }) => {

  const formData = await request.formData()
  const action = formData.get('action') as string

  if (action === 'identify_image') {
    const imageFile = formData.get('image') as File
    if (!imageFile) return new Response(JSON.stringify({ error: 'No image' }), { status: 400 })

    const arrayBuffer = await imageFile.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    let s = ''
    for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i])
    const imageBase64 = btoa(s)

    const identified = await identifyProduct(imageBase64)
    return new Response(JSON.stringify({ identified, imageBase64 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (action === 'chat') {
    const message = formData.get('message') as string
    const historyJson = formData.get('history') as string
    const sessionJson = formData.get('session') as string

    const history = JSON.parse(historyJson || '[]')
    const session = JSON.parse(sessionJson || '{}')

    const result = await chatWithSeller(message, history, session)
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (action === 'finalize') {
    const sessionJson = formData.get('session') as string
    const chatHistoryJson = formData.get('chatHistory') as string
    const imageBase64sJson = formData.get('imageBase64s') as string
    const session = JSON.parse(sessionJson || '{}')
    const chatHistoryArr = JSON.parse(chatHistoryJson || '[]')
    const imageBase64s: string[] = JSON.parse(imageBase64sJson || '[]')

    // Extract structured data from the full conversation
    const extracted = chatHistoryArr.length > 0
      ? await extractSessionFromChat(chatHistoryArr, session.identified)
      : session

    const name = extracted.name || session.identified?.name || session.name || '商品'
    const desc = await generateItemDescription({
      name,
      yearsUsed: Number(extracted.yearsUsed ?? session.yearsUsed) || 0,
      condition: extracted.condition || session.condition || 'good',
      conditionNotes: extracted.conditionNotes || session.conditionNotes || '',
      dealType: extracted.dealType || session.dealType || 'sell',
      price: extracted.price ? Number(extracted.price) : (session.price ? Number(session.price) : undefined),
      locationNote: extracted.locationCity || session.locationCity || '',
    })

    const imageUrls: string[] = []
    for (let i = 0; i < imageBase64s.length; i++) {
      const b64 = imageBase64s[i]
      if (!b64) continue
      try {
        const raw = atob(b64)
        const imgBytes = new Uint8Array(raw.length)
        for (let j = 0; j < raw.length; j++) imgBytes[j] = raw.charCodeAt(j)
        const fileName = `${Date.now()}_${i}.jpg`
        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
          .from('market-images')
          .upload(fileName, imgBytes, { contentType: 'image/jpeg' })
        if (!uploadError && uploadData) {
          const { data: urlData } = supabaseAdmin.storage.from('market-images').getPublicUrl(uploadData.path)
          imageUrls.push(urlData.publicUrl)
        }
      } catch {}
    }

    const { data, error } = await supabaseAdmin
      .from('market_items')
      .insert({
        seller_id: extracted.contactLineId || extracted.contactPhone || `anon_${Date.now()}`,
        seller_name: extracted.contactLineId || extracted.contactPhone || '匿名賣家',
        seller_email: null,
        contact_type: extracted.contactType || session.contactType || 'form',
        contact_line_id: extracted.contactLineId || session.contactLineId || null,
        contact_phone: extracted.contactPhone || session.contactPhone || null,
        title: name,
        category: session.identified?.category || '其他',
        description_story: desc.story,
        description_plain: desc.plain,
        condition: extracted.condition || session.condition || 'good',
        condition_notes: extracted.conditionNotes || session.conditionNotes || null,
        years_used: Number(extracted.yearsUsed ?? session.yearsUsed) || 0,
        deal_type: extracted.dealType || session.dealType || 'sell',
        price: extracted.price ? Number(extracted.price) : (session.price ? Number(session.price) : null),
        market_price: null,
        trade_want: extracted.tradeWant || session.tradeWant || null,
        location_city: extracted.locationCity || session.locationCity || null,
        location_note: extracted.locationNote || session.locationNote || null,
        image_urls: imageUrls,
        status: 'active',
        view_count: 0,
        inquiry_count: 0,
      })
      .select()
      .single()

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

    return new Response(JSON.stringify({ success: true, item: data }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400 })
}
