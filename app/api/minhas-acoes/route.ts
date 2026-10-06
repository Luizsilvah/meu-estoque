// Endpoint GET /api/minhas-acoes — últimas 5 movimentações feitas pelo usuário
// logado (seção "Suas últimas ações" da tela inicial do funcionário). O id vem
// sempre da sessão no servidor, nunca do cliente.
import { createSupabaseAdmin } from '../../lib/supabase-admin'
import { createSupabaseServer } from '../../lib/supabase-server'

export type MinhaAcao = {
  id: string
  tipo: 'entrada' | 'saida'
  quantidade: number
  data_hora: string
  produto: string
}

export async function GET() {
  const server = await createSupabaseServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from('movimentacoes')
    .select('id, tipo, quantidade, data_hora, produtos(nome)')
    .eq('usuario_id', user.id)
    .order('data_hora', { ascending: false })
    .limit(5)

  if (error) return Response.json({ erro: error.message }, { status: 500 })

  const acoes: MinhaAcao[] = (data ?? []).map((m) => ({
    id: m.id,
    tipo: m.tipo,
    quantidade: m.quantidade,
    data_hora: m.data_hora,
    produto: (m.produtos as { nome?: string } | null)?.nome ?? '—',
  }))
  return Response.json(acoes)
}
