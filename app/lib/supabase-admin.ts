import { createClient } from '@supabase/supabase-js'

// Cliente com service role — bypassa RLS e pode criar usuários via auth.admin.*
// NUNCA expor em variáveis NEXT_PUBLIC_ ou código client-side
export function createSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não definidas')
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
