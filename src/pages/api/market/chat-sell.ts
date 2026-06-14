export const prerender = false

import type { APIRoute } from 'astro'
import { supabaseAdmin } from '../../../lib/supabase'
import { identifyProduct, generateItemDescription, chatWithSeller } from '../../../lib/gemini'
import { getSession } from '../../../utils/session'

export const POST: APIRoute = async ({ request, cookies }) => {
  const token = cookies.get('session')?.value || ''
  const user = await getSession(token)
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

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
    const imageBase64 = formData.get('imageBase64') as string
    const session = JSON.parse(sessionJson || '{}')

    const desc = await generateItemDescription({
      name: session.identified?.name || session.name || '商品',
      yearsUsed: Number(session.yearsUsed) || 0,
      condition: session.condition || 'good',
      conditionNotes: session.conditionNotes || '',
      dealType: session.dealType || 'sell',
      price: session.price ? Number(session.price) : undefined,
      locationNote: session.locationCity || '',
    })

    let imageUrl = ''
    if (imageBase64) {
      try {
        const raw = atob(imageBase64)
        const imgBytes = new Uint8Array(raw.length)
        for (let i = 0; i < raw.length; i++) imgBytes[i] = raw.charCodeAt(i)
        const fileName = `${Date.now()}_${user.email.replace(/[@.]/g, '_')}.jpg`
        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
          .from('market-images')
          .upload(fileName, imgBytes, { contentType: 'image/jpeg' })
        if (!uploadError && uploadData) {
          const { data: urlData } = supabaseAdmin.storage.from('market-images').getPublicUrl(uploadData.path)
          imageUrl = urlData.publicUrl
        }
      } catch {}
    }

    const { data, error } = await supabaseAdmin
      .from('market_items')
      .insert({
        seller_id: user.email,
        seller_name: user.name,
        seller_email: user.email,
        contact_type: session.contactType || 'form',
        contact_line_id: session.contactLineId || null,
        contact_phone: session.contactPhone || null,
        title: session.identified?.name || session.name || '二手商品',
        category: session.identified?.category || '其他',
        description_story: desc.story,
        description_plain: desc.plain,
        condition: session.condition || 'good',
        condition_notes: session.conditionNotes || null,
        years_used: Number(session.yearsUsed) || 0,
        deal_type: session.dealType || 'sell',
        price: session.price ? Number(session.price) : null,
        market_price: session.identified?.estimatedMarketPrice || null,
        trade_want: session.tradeWant || null,
        location_city: session.locationCity || null,
        location_note: session.locationNote || null,
        image_urls: imageUrl ? [imageUrl] : [],
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
