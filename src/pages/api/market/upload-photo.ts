export const prerender = false

import type { APIRoute } from 'astro'
import { supabaseAdmin } from '../../../lib/supabase'

export const POST: APIRoute = async ({ request }) => {
  const formData = await request.formData()
  const file = formData.get('photo') as File | null
  if (!file) return new Response(JSON.stringify({ error: 'No photo' }), { status: 400 })

  const arrayBuffer = await file.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  const isPng = file.type === 'image/png' || file.name?.endsWith('.png')
  const ext = isPng ? 'png' : 'jpg'
  const mimeType = file.type || 'image/jpeg'
  const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`

  const { data, error } = await supabaseAdmin.storage
    .from('market-images')
    .upload(fileName, bytes, { contentType: mimeType })

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  const { data: urlData } = supabaseAdmin.storage.from('market-images').getPublicUrl(data.path)

  return new Response(JSON.stringify({ url: urlData.publicUrl }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
