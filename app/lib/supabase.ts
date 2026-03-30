import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

export const supabase = createClient(supabaseUrl, supabaseKey)

export function checkEnv(): string | null {
  if (!supabaseUrl) return 'NEXT_PUBLIC_SUPABASE_URL não definida no .env.local'
  if (!supabaseKey) return 'NEXT_PUBLIC_SUPABASE_ANON_KEY não definida no .env.local'
  if (!supabaseKey.startsWith('eyJ')) return `Chave inválida (começa com "${supabaseKey.slice(0, 12)}..."). Copie a "anon public" em: Supabase → Project Settings → API`
  return null
}
