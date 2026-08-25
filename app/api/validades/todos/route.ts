import { createSupabaseAdmin } from '../../../lib/supabase-admin'
import { createSupabaseServer } from '../../../lib/supabase-server'

export async function GET() {
  const server = await createSupabaseServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })
  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from('validades')
    .select('id, produto_id, data_validade, quantidade')
    .order('data_validade', { ascending: true })

  if (error) return Response.json({ erro: error.message }, { status: 500 })
  return Response.json(data)
}
