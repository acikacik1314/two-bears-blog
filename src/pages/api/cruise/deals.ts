export const prerender = false

import type { APIRoute } from 'astro'
import { supabaseAdmin } from '../../../lib/supabase'

function checkPin(req: Request): boolean {
  const pin = req.headers.get('x-admin-pin')
  const env = import.meta.env.CRUISE_ADMIN_PIN || process.env.CRUISE_ADMIN_PIN || ''
  return !!env && pin === env
}

export const GET: APIRoute = async ({ url }) => {
  const status        = url.searchParams.get('status')        || 'active'
  const departure_port = url.searchParams.get('departure_port') || ''
  const cruise_line   = url.searchParams.get('cruise_line')   || ''
  const destination   = url.searchParams.get('destination')   || ''
  const min_nights    = url.searchParams.get('min_nights')    || ''
  const max_nights    = url.searchParams.get('max_nights')    || ''
  const tags          = url.searchParams.get('tags')          || ''  // comma-sep: repositioning,kids_free,...
  const sort          = url.searchParams.get('sort')          || 'discount'

  let q = supabaseAdmin
    .from('cruise_deals')
    .select('*, price_history:cruise_price_history(price, recorded_at)')
    .eq('status', status)

  if (departure_port) q = q.eq('departure_port', departure_port)
  if (cruise_line)    q = q.eq('cruise_line', cruise_line)
  if (destination)    q = q.ilike('destination', `%${destination}%`)
  if (min_nights)     q = q.gte('duration_nights', parseInt(min_nights))
  if (max_nights)     q = q.lte('duration_nights', parseInt(max_nights))
  if (tags.includes('repositioning')) q = q.eq('is_repositioning', true)
  if (tags.includes('kids_free'))     q = q.eq('has_kids_free', true)
  if (tags.includes('3rd_free'))      q = q.eq('has_3rd_free', true)
  if (tags.includes('last_minute'))   q = q.eq('is_last_minute', true)
  if (tags.includes('obc'))           q = q.eq('has_obc', true)

  const { data, error } = await q

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  const deals = (data || []).map(d => ({
    ...d,
    discount_pct: d.original_price
      ? Math.round((1 - d.current_price / d.original_price) * 100)
      : null,
    per_night: Math.round(d.current_price / d.duration_nights),
    days_until: Math.ceil(
      (new Date(d.departure_date).getTime() - Date.now()) / 86400000
    ),
  }))

  if (sort === 'discount')   deals.sort((a, b) => (b.discount_pct ?? 0) - (a.discount_pct ?? 0))
  if (sort === 'per_night')  deals.sort((a, b) => a.per_night - b.per_night)
  if (sort === 'departure')  deals.sort((a, b) => a.days_until - b.days_until)
  if (sort === 'newest')     deals.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  // Featured deals first
  const featured = deals.filter(d => d.is_featured)
  const rest     = deals.filter(d => !d.is_featured)

  return new Response(JSON.stringify([...featured, ...rest]), {
    headers: { 'Content-Type': 'application/json' },
  })
}

export const POST: APIRoute = async ({ request }) => {
  if (!checkPin(request)) return new Response(JSON.stringify({ error: '密碼錯誤' }), { status: 401 })

  const body = await request.json()
  const { data, error } = await supabaseAdmin
    .from('cruise_deals')
    .insert(body)
    .select()
    .single()

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  // Record initial price history
  await supabaseAdmin.from('cruise_price_history').insert({
    deal_id: data.id,
    price: data.current_price,
  })

  return new Response(JSON.stringify(data), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const PUT: APIRoute = async ({ request }) => {
  if (!checkPin(request)) return new Response(JSON.stringify({ error: '密碼錯誤' }), { status: 401 })

  const { id, ...updates } = await request.json()

  // Fetch old price to detect change
  const { data: old } = await supabaseAdmin
    .from('cruise_deals')
    .select('current_price')
    .eq('id', id)
    .single()

  const { data, error } = await supabaseAdmin
    .from('cruise_deals')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  // Record price history if price changed
  if (old && updates.current_price !== undefined && updates.current_price !== old.current_price) {
    await supabaseAdmin.from('cruise_price_history').insert({
      deal_id: id,
      price: updates.current_price,
    })
  }

  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
}

export const DELETE: APIRoute = async ({ request }) => {
  if (!checkPin(request)) return new Response(JSON.stringify({ error: '密碼錯誤' }), { status: 401 })

  const { id } = await request.json()
  const { error } = await supabaseAdmin.from('cruise_deals').delete().eq('id', id)

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
}
