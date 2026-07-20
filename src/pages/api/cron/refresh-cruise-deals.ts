export const prerender = false

import type { APIRoute } from 'astro'
import { supabaseAdmin } from '../../../lib/supabase'
import { scrapeDeals } from '../cruise/ai-search'

function getGeminiKeys(): string[] {
  const raw = import.meta.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEYS || '[]'
  try { return JSON.parse(raw) } catch { return [raw].filter(Boolean) }
}

export const GET: APIRoute = async ({ request }) => {
  const auth = request.headers.get('authorization')
  const secret = import.meta.env.CRON_SECRET || process.env.CRON_SECRET || ''
  if (secret && auth !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const geminiKeys = getGeminiKeys()
  if (!geminiKeys.length) {
    return new Response(JSON.stringify({ ok: false, error: 'Gemini keys 未設定' }), { status: 500 })
  }

  const today = new Date().toISOString().split('T')[0]
  const { deals, source, searched } = await scrapeDeals(geminiKeys, today)

  // Alert if real scraping produced nothing (falling back to knowledge means HTML structure changed)
  if (source !== 'scraped' || deals.length === 0) {
    const resendKey = import.meta.env.RESEND_API_KEY || process.env.RESEND_API_KEY || ''
    if (resendKey) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'onboarding@resend.dev',
          to: 'acikacik@gmail.com',
          subject: `⚠️ 郵輪爬蟲告警 ${today}`,
          text: `爬蟲月更 (${today}) 結果異常：\nsource=${source}\ndeals=${deals.length}\nsearched=${searched}\n\n請手動確認東南旅遊/可樂旅遊/雄獅旅遊頁面結構是否改版。`,
        }),
      }).catch(() => {})
    }
    if (!deals.length) {
      return new Response(JSON.stringify({ ok: true, inserted: 0, skipped: 0, searched, source }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  let inserted = 0
  let skipped = 0

  for (const deal of deals) {
    // Skip deals without a price
    if (!deal.current_price || Number(deal.current_price) <= 0) { skipped++; continue }

    // Dedup: same ship + departure_date + cabin_type already exists
    const { data: existing } = await supabaseAdmin
      .from('cruise_deals')
      .select('id')
      .eq('ship_name', deal.ship_name || '')
      .eq('departure_date', deal.departure_date || '')
      .eq('cabin_type', deal.cabin_type || '內艙')
      .maybeSingle()

    if (existing) { skipped++; continue }

    const { error } = await supabaseAdmin.from('cruise_deals').insert({
      ship_name:       deal.ship_name       || '',
      cruise_line:     deal.cruise_line     || '',
      destination:     deal.destination     || '',
      departure_port:  deal.departure_port  || '基隆',
      departure_date:  deal.departure_date  || null,
      duration_nights: deal.duration_nights || 0,
      cabin_type:      deal.cabin_type      || '內艙',
      original_price:  deal.original_price  || null,
      current_price:   Number(deal.current_price),
      price_currency:  deal.price_currency  || 'TWD',
      source_url:      deal.source_url      || '',
      affiliate_url:   deal.affiliate_url   || '',
      source:          deal.source          || '',
      notes:           deal.notes           || '',
      has_3rd_free:    deal.has_3rd_free    || false,
      has_kids_free:   deal.has_kids_free   || false,
      has_obc:         deal.has_obc         || false,
      is_repositioning: deal.is_repositioning || false,
      is_last_minute:  deal.is_last_minute  || false,
      is_featured:     false,
      status:          'pending',
    })

    if (error) skipped++
    else inserted++
  }

  return new Response(JSON.stringify({ ok: true, inserted, skipped, searched, source }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
