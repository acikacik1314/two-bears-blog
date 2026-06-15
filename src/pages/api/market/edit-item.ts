export const prerender = false

import type { APIRoute } from 'astro'
import { supabaseAdmin } from '../../../lib/supabase'

export const POST: APIRoute = async ({ request }) => {
  let body: any
  try { body = await request.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  const { item_id, pin, ...fields } = body
  if (!item_id) return new Response(JSON.stringify({ error: 'Missing item_id' }), { status: 400 })

  // Verify PIN if item has one
  const { data: item } = await supabaseAdmin
    .from('market_items')
    .select('delete_pin')
    .eq('id', item_id)
    .single()

  if (!item) return new Response(JSON.stringify({ error: '找不到商品' }), { status: 404 })

  if (item.delete_pin && item.delete_pin !== String(pin || '')) {
    return new Response(JSON.stringify({ error: '密碼錯誤' }), { status: 403 })
  }

  const allowed = ['title', 'price', 'deal_type', 'condition', 'condition_notes',
    'location_city', 'location_note', 'description_story', 'description_plain',
    'contact_type', 'contact_line_id', 'contact_phone', 'trade_want']

  const updates: Record<string, any> = {}
  for (const key of allowed) {
    if (key in fields) updates[key] = fields[key] ?? null
  }
  if (!Object.keys(updates).length) {
    return new Response(JSON.stringify({ error: '沒有可更新的欄位' }), { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('market_items')
    .update(updates)
    .eq('id', item_id)

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
