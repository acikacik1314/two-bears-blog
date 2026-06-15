export const prerender = false

import type { APIRoute } from 'astro'
import { supabaseAdmin } from '../../../lib/supabase'

export const POST: APIRoute = async ({ request }) => {
  let body: any
  try { body = await request.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  const { item_id, action } = body
  if (!item_id) return new Response(JSON.stringify({ error: 'Missing item_id' }), { status: 400 })

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
