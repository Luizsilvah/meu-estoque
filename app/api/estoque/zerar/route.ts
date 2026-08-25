import { createSupabaseServer } from '@/app/lib/supabase-server'
import { createSupabaseAdmin } from '@/app/lib/supabase-admin'

export async function DELETE() {
  const serverClient = await createSupabaseServer()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })

  const adminClient = createSupabaseAdmin()
  const { data: perfil } = await adminClient
    .from('perfis')
    .select('perfil')
    .eq('id', user.id)
    .single()

  if (perfil?.perfil !== 'admin') return Response.json({ erro: 'Acesso negado' }, { status: 403 })

  const { error } = await adminClient
    .from('estoque')
    .update({ qtd_atual: 0, qtd_cozinha: 0, atualizado_em: new Date().toISOString() })
    .not('id', 'is', null)

  if (error) return Response.json({ erro: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
