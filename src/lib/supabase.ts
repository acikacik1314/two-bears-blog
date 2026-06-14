import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (import.meta.env.SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '') as string
const supabaseAnonKey = (import.meta.env.SUPABASE_ANON_KEY || import.meta.env.PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '') as string
const supabaseServiceKey = (import.meta.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '') as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : supabase

export type MarketItem = {
  id: string
  created_at: string
  seller_id: string
  seller_name: string
  seller_email: string
  contact_type: 'line' | 'phone' | 'form' | 'both'
  contact_line_id?: string
  contact_phone?: string
  title: string
  category: string
  description_story: string
  description_plain: string
  condition: 'like_new' | 'good' | 'fair'
  condition_notes?: string
  years_used?: number
  deal_type: 'sell' | 'trade' | 'free'
  price?: number
  market_price?: number
  trade_want?: string
  location_city?: string
  location_note?: string
  image_urls: string[]
  status: 'active' | 'sold' | 'removed'
  view_count: number
  inquiry_count: number
}
