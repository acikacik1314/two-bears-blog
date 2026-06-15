export const prerender = false

import type { APIRoute } from 'astro'
import { supabaseAdmin } from '../../../lib/supabase'

export const POST: APIRoute = async ({ request }) => {
  let body: any
  try { body = await request.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  const { item_id, action, pin } = body
  if (!item_id) return new Response(JSON.stringify({ error: 'Missing item_id' }), { status: 400 })

  // Verify PIN if the item has one set
  const { data: item } = await supabaseAdmin
    .from('market_items')
    .select('delete_pin')
    .eq('id', item_id)
    .single()

  if (!item) return new Response(JSON.stringify({ error: '找不到商品' }), { status: 404 })

  if (item.delete_pin && item.delete_pin !== String(pin || '')) {
    return new Response(JSON.stringify({ error: '密碼錯誤' }), { status: 403 })
  }

  const newStatus = action === 'sold' ? 'sold' : 'removed'

  const { error } = await supabaseAdmin
    .from('market_items')
    .update({ status: newStatus })
    .eq('id', item_id)

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
