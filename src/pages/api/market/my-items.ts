export const prerender = false

import type { APIRoute } from 'astro'
import { supabaseAdmin } from '../../../lib/supabase'

export const GET: APIRoute = async ({ url }) => {
  const contact = url.searchParams.get('contact')?.trim()
  if (!contact) {
    return new Response(JSON.stringify({ error: '請輸入 LINE ID 或電話' }), { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('market_items')
    .select('*')
    .or(`contact_line_id.eq.${contact},contact_phone.eq.${contact}`)
    .neq('status', 'removed')
    .order('created_at', { ascending: false })

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  return new Response(JSON.stringify({ items: data || [] }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
