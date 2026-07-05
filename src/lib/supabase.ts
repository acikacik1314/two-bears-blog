import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (import.meta.env.SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '') as string
const supabaseAnonKey = (import.meta.env.SUPABASE_ANON_KEY || import.meta.env.PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '') as string
const supabaseServiceKey = (import.meta.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '') as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : supabase
