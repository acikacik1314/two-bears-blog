export const prerender = false

import type { APIRoute } from 'astro'
import { supabaseAdmin } from '../../../lib/supabase'

function checkPin(req: Request): boolean {
  const pin = req.headers.get('x-admin-pin')
  const env = import.meta.env.CRUISE_ADMIN_PIN || process.env.CRUISE_ADMIN_PIN || ''
  return !!env && pin === env
}

export const POST: APIRoute = async ({ request }) => {
  if (!checkPin(request)) return new Response(JSON.stringify({ error: '密碼錯誤' }), { status: 401 })

  const { data: all, error } = await supabaseAdmin
    .from('cruise_deals')
    .select('id, ship_name, departure_date, cabin_type, current_price')
    .order('id', { ascending: true })

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  // Group by ship_name + departure_date + cabin_type + current_price
  const seen = new Map<string, number>()
  const toDelete: number[] = []

  for (const row of all ?? []) {
    const key = `${row.ship_name}|${row.departure_date}|${row.cabin_type}|${row.current_price}`
    if (seen.has(key)) {
      toDelete.push(row.id)
    } else {
      seen.set(key, row.id)
    }
  }

  if (!toDelete.length) {
    return new Response(JSON.stringify({ deleted: 0, message: '沒有找到重複資料' }))
  }

  const { error: delErr } = await supabaseAdmin
    .from('cruise_deals')
    .delete()
    .in('id', toDelete)

  if (delErr) return new Response(JSON.stringify({ error: delErr.message }), { status: 500 })

  return new Response(JSON.stringify({ deleted: toDelete.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
