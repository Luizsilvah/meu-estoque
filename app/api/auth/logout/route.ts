import { createSupabaseServer } from '../../../lib/supabase-server'

export async function POST() {
  const supabase = await createSupabaseServer()
  await supabase.auth.signOut()
  return Response.json({ ok: true })
}
