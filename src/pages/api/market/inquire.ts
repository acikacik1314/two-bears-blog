export const prerender = false

import type { APIRoute } from 'astro'
import { supabaseAdmin } from '../../../lib/supabase'

export const POST: APIRoute = async ({ request }) => {
  let body: any
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  const { item_id, buyer_name, buyer_email, message } = body

  if (!item_id || !buyer_name || !buyer_email || !message) {
    return new Response(JSON.stringify({ error: '請填寫所有必填欄位' }), { status: 400 })
  }

  const { data: item, error: itemError } = await supabaseAdmin
    .from('market_items')
    .select('id, seller_email, inquiry_count')
    .eq('id', item_id)
    .single()

  if (itemError || !item) {
    return new Response(JSON.stringify({ error: '商品不存在' }), { status: 404 })
  }

  const { error: insertError } = await supabaseAdmin.from('market_inquiries').insert({
    item_id,
    buyer_name,
    buyer_email,
    message,
    seller_email: item.seller_email,
  })

  if (insertError) {
    return new Response(JSON.stringify({ error: insertError.message }), { status: 500 })
  }

  await supabaseAdmin
    .from('market_items')
    .update({ inquiry_count: (item.inquiry_count || 0) + 1 })
    .eq('id', item_id)

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
