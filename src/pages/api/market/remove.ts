export const prerender = false

import type { APIRoute } from 'astro'
import { supabaseAdmin } from '../../../lib/supabase'
import { getSession } from '../../../utils/session'

export const POST: APIRoute = async ({ request, cookies }) => {
  const token = cookies.get('sb_session')?.value || ''
  const user = await getSession(token)
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  let body: any
  try { body = await request.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  const { item_id, action } = body
  if (!item_id) return new Response(JSON.stringify({ error: 'Missing item_id' }), { status: 400 })
  const newStatus = action === 'sold' ? 'sold' : 'removed'

  // verify ownership
  const { data: item } = await supabaseAdmin
    .from('market_items')
    .select('id, seller_email')
    .eq('id', item_id)
    .single()

  if (!item) return new Response(JSON.stringify({ error: '商品不存在' }), { status: 404 })
  if (item.seller_email !== user.email) return new Response(JSON.stringify({ error: '沒有權限' }), { status: 403 })

  const { error } = await supabaseAdmin
    .from('market_items')
    .update({ status: newStatus })
    .eq('id', item_id)

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
