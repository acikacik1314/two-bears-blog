export const prerender = false

import type { APIRoute } from 'astro'
import { supabaseAdmin } from '../../../lib/supabase'

export const GET: APIRoute = async ({ url }) => {
  const contact = url.searchParams.get('contact')?.trim()
  if (!contact) {
    return new Response(JSON.stringify({ error: '請輸入聯絡方式' }), { status: 400 })
  }

  // Get all items for this contact
  const { data: items, error: itemsError } = await supabaseAdmin
    .from('market_items')
    .select('id, title')
    .or(`contact_line_id.eq.${contact},contact_phone.eq.${contact}`)
    .neq('status', 'removed')

  if (itemsError) return new Response(JSON.stringify({ error: itemsError.message }), { status: 500 })
  if (!items?.length) return new Response(JSON.stringify({ inquiries: [] }), { headers: { 'Content-Type': 'application/json' } })

  const itemIds = items.map(i => i.id)
  const titleMap: Record<string, string> = {}
  items.forEach(i => { titleMap[i.id] = i.title })

  const { data: inquiries, error: inqError } = await supabaseAdmin
    .from('market_inquiries')
    .select('id, item_id, buyer_name, buyer_email, message, created_at')
    .in('item_id', itemIds)
    .order('created_at', { ascending: false })

  if (inqError) return new Response(JSON.stringify({ error: inqError.message }), { status: 500 })

  const result = (inquiries || []).map(inq => ({
    ...inq,
    item_title: titleMap[inq.item_id] || '未知商品',
  }))

  return new Response(JSON.stringify({ inquiries: result }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
