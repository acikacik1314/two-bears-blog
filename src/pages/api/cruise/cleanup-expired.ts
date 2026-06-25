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

  const today = new Date().toISOString().split('T')[0]

  // Count first
  const { data: expired, error: countErr } = await supabaseAdmin
    .from('cruise_deals')
    .select('id')
    .not('departure_date', 'is', null)
    .lt('departure_date', today)

  if (countErr) return new Response(JSON.stringify({ error: countErr.message }), { status: 500 })

  if (!expired || expired.length === 0) {
    return new Response(JSON.stringify({ deleted: 0, message: '沒有找到過期資料' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const ids = expired.map(d => d.id)
  const { error: delErr } = await supabaseAdmin
    .from('cruise_deals')
    .delete()
    .in('id', ids)

  if (delErr) return new Response(JSON.stringify({ error: delErr.message }), { status: 500 })

  return new Response(JSON.stringify({ deleted: ids.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
