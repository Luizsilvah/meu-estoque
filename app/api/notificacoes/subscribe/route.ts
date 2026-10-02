import { createSupabaseAdmin } from '../../../lib/supabase-admin'
import { createSupabaseServer } from '../../../lib/supabase-server'

export async function POST(req: Request) {
  const server = await createSupabaseServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })
  const subscription = await req.json()
  if (!subscription?.endpoint || !subscription?.keys) {
    return Response.json({ erro: 'Subscription inválida' }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  // Schema real da tabela: subscription é um jsonb com o objeto inteiro
  // ({ endpoint, keys, ... }), e usuario_id (não "user_id") é a coluna de
  // dono — não existem colunas endpoint/keys no topo (isso quebrava toda
  // leitura/escrita aqui, em /api/notificacoes/enviar e no push de estoque
  // baixo de /api/movimentacao; corrigido junto com o alerta de quarta).
  // onConflict em usuario_id: 1 subscription por usuário — reautorizar (ou o
  // auto-refresh de app/page.tsx) substitui a antiga em vez de acumular linha.
  const { error } = await admin
    .from('push_subscriptions')
    .upsert(
      { usuario_id: user.id, subscription },
      { onConflict: 'usuario_id' }
    )

  if (error) return Response.json({ erro: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
