export const prerender = false

import type { APIRoute } from 'astro'
import { supabase } from '../../../lib/supabase'
import { findMatchingItems } from '../../../lib/gemini'

export const POST: APIRoute = async ({ request }) => {
  let message: string
  try {
    const body = await request.json()
    message = body.message
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: 'No message' }), { status: 400 })
  }

  const { data: items } = await supabase
    .from('market_items')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(50)

  const result = await findMatchingItems(message, items || [])

  const matchedItems = (items || []).filter(item => result.matches.includes(String(item.id)))

  return new Response(JSON.stringify({ reply: result.reply, matches: result.matches, items: matchedItems }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
