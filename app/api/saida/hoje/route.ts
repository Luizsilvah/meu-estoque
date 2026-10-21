// Endpoint GET /api/saida/hoje — saídas de hoje (fuso America/Bahia) feitas
// pelo usuário logado, para a seção "Suas últimas saídas" da tela /saida.
// Só leitura. O id vem sempre da sessão no servidor, nunca do cliente.
// movimentacoes não guarda o lugar (principal/cozinha): a tela completa isso
// com o que ela mesma anotou no aparelho.
import { createSupabaseAdmin } from '@/app/lib/supabase-admin'
import { createSupabaseServer } from '@/app/lib/supabase-server'

export type SaidaHoje = {
  id: string
  produto_id: string
  produto: string
  unidade: string
  quantidade: number
  data_hora: string
}

// Meia-noite de hoje na Bahia (UTC−3, sem horário de verão)
function inicioDeHojeBahia(): string {
  const agoraBahia = new Date(Date.now() - 3 * 3600_000)
  return `${agoraBahia.toISOString().slice(0, 10)}T00:00:00-03:00`
}

export async function GET() {
  const server = await createSupabaseServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from('movimentacoes')
    .select('id, produto_id, quantidade, data_hora, produtos(nome, unidade)')
    .eq('usuario_id', user.id)
    .eq('tipo', 'saida')
    .gte('data_hora', inicioDeHojeBahia())
    .order('data_hora', { ascending: false })
    .limit(30)

  if (error) return Response.json({ erro: error.message }, { status: 500 })

  const saidas: SaidaHoje[] = (data ?? []).map((m) => {
    const p = m.produtos as { nome?: string; unidade?: string } | null
    return {
      id: m.id,
      produto_id: m.produto_id,
      produto: p?.nome ?? '—',
      unidade: p?.unidade ?? '',
      quantidade: m.quantidade,
      data_hora: m.data_hora,
    }
  })
  return Response.json(saidas)
}
