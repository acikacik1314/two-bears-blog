export const prerender = false

import type { APIRoute } from 'astro'
import { supabase } from '../../../lib/supabase'

export const GET: APIRoute = async ({ url }) => {
  const category = url.searchParams.get('category')
  const dealType = url.searchParams.get('deal_type')
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100)

  let query = supabase
    .from('market_items')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (category && category !== 'all') query = query.eq('category', category)
  if (dealType && dealType !== 'all') query = query.eq('deal_type', dealType)

  const { data, error } = await query

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  return new Response(JSON.stringify({ items: data || [] }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}
