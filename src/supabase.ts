import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Null when the project has no Supabase credentials — the app then runs local-only. */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null
