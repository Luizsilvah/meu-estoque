import { createSupabaseServer } from '../../../lib/supabase-server'
import { createSupabaseAdmin } from '../../../lib/supabase-admin'

export async function GET() {
  const serverClient = await createSupabaseServer()
  const { data: { user } } = await serverClient.auth.getUser()

  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })

  const adminClient = createSupabaseAdmin()
  const { data: perfil } = await adminClient
    .from('perfis')
    .select('perfil, nome, permissoes')
    .eq('id', user.id)
    .single()

  return Response.json({
    id: user.id,
    email: user.email,
    nome: perfil?.nome ?? user.user_metadata?.nome ?? user.email?.split('@')[0] ?? 'Usuário',
    perfil: perfil?.perfil ?? 'funcionario',
    permissoes: perfil?.permissoes ?? {},
  })
}
