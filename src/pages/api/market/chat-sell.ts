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

  // Called when chat completes — AI extracts structured data from conversation
  if (action === 'extract') {
    const sessionJson = formData.get('session') as string
    const chatHistoryJson = formData.get('chatHistory') as string
    const session = JSON.parse(sessionJson || '{}')
    const chatHistoryArr = JSON.parse(chatHistoryJson || '[]')

    const extracted = chatHistoryArr.length > 0
      ? await extractSessionFromChat(chatHistoryArr, session.identified)
      : {}

    const merged = {
      name:           extracted.name           || session.identified?.name || session.name || '',
      yearsUsed:      extracted.yearsUsed      ?? session.yearsUsed ?? 0,
      condition:      extracted.condition      || session.condition      || 'good',
      conditionNotes: extracted.conditionNotes || session.conditionNotes || '',
      dealType:       extracted.dealType       || session.dealType       || 'sell',
      price:          extracted.price          ?? session.price          ?? null,
      tradeWant:      extracted.tradeWant      || session.tradeWant      || '',
      locationCity:   extracted.locationCity   || session.locationCity   || '',
      locationNote:   extracted.locationNote   || session.locationNote   || '',
      contactType:    extracted.contactType    || session.contactType    || 'form',
      contactLineId:  extracted.contactLineId  || session.contactLineId  || '',
      contactPhone:   extracted.contactPhone   || session.contactPhone   || '',
      identified:     session.identified       || {},
    }

    return new Response(JSON.stringify({ merged }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // finalize: trust the pre-extracted session, no re-extraction needed
  if (action === 'finalize') {
    const sessionJson = formData.get('session') as string
    const session = JSON.parse(sessionJson || '{}')

    const name = session.name || session.identified?.name || '商品'
    const desc = await generateItemDescription({
      name,
      yearsUsed:      Number(session.yearsUsed) || 0,
      condition:      session.condition      || 'good',
      conditionNotes: session.conditionNotes || '',
      dealType:       session.dealType       || 'sell',
      price:          session.price ? Number(session.price) : undefined,
      locationNote:   session.locationCity   || '',
    })

    // Receive photos as individual Blob fields (photo_0, photo_1, photo_2...)
    const imageUrls: string[] = []
    for (let i = 0; i < 3; i++) {
      const photoFile = formData.get(`photo_${i}`) as File | null
      if (!photoFile) continue
      try {
        const arrayBuffer = await photoFile.arrayBuffer()
        const imgBytes = new Uint8Array(arrayBuffer)
        const fileName = `${Date.now()}_${i}.jpg`
        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
          .from('market-images')
          .upload(fileName, imgBytes, { contentType: 'image/jpeg' })
        if (!uploadError && uploadData) {
          const { data: urlData } = supabaseAdmin.storage.from('market-images').getPublicUrl(uploadData.path)
          imageUrls.push(urlData.publicUrl)
        } else if (uploadError) {
          console.error(`Photo ${i} upload error:`, uploadError.message)
        }
      } catch (e) {
        console.error(`Photo ${i} exception:`, e)
      }
    }

    const sellerName = session.contactLineId || session.contactPhone || '匿名賣家'

    const { data, error } = await supabaseAdmin
      .from('market_items')
      .insert({
        seller_id:         sellerName,
        seller_name:       sellerName,
        seller_email:      '',
        contact_type:      session.contactType    || 'form',
        contact_line_id:   session.contactLineId  || null,
        contact_phone:     session.contactPhone   || null,
        title:             name,
        category:          session.identified?.category || '其他',
        description_story: desc.story,
        description_plain: desc.plain,
        condition:         session.condition      || 'good',
        condition_notes:   session.conditionNotes || null,
        years_used:        Number(session.yearsUsed) || 0,
        deal_type:         session.dealType       || 'sell',
        price:             session.price ? Number(session.price) : null,
        market_price:      null,
        trade_want:        session.tradeWant      || null,
        location_city:     session.locationCity   || null,
        location_note:     session.locationNote   || null,
        image_urls:        imageUrls,
        status:            'active',
        view_count:        0,
        inquiry_count:     0,
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
