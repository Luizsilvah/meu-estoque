// Endpoint PATCH /api/estoque/conferencia — ajusta estoque (qtd_atual/qtd_cozinha),
// registra a movimentação e atualiza os lotes de validade, tudo numa única
// chamada à função conferencia_ajustar (1 transação no banco). Antes disto,
// a atualização de estoque e os ajustes de validade eram passos separados
// (PATCH aqui + POST /api/movimentacao + POST /api/validades em
// app/conferencia/page.tsx), e o motivo "correcao" nem chegava a tocar a
// validade — ver supabase/migrations/20261003120000_conferencia_ajustar.sql.
import { createSupabaseAdmin } from '@/app/lib/supabase-admin'
import { createSupabaseServer } from '@/app/lib/supabase-server'
import { exigirPermissao } from '@/app/lib/exigirPermissao'

const TIPOS_VALIDOS = new Set(['entrada', 'saida_uso', 'descarte_vencido', 'correcao'])

type LoteAdd = { data_validade: string; quantidade: number }
type LoteRemover = { validade_id: string; quantidade: number }

export async function PATCH(request: Request) {
  const server = await createSupabaseServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })
  const negado = await exigirPermissao(user, ['conferencia', 'estoque'])
  if (negado) return negado

  const body = await request.json().catch(() => null)
  const { produto_id, nova_qtd_atual, nova_qtd_cozinha, tipo, lotes_add, lotes_remover } = body ?? {}

  if (!produto_id || nova_qtd_atual == null) {
    return Response.json({ erro: 'produto_id e nova_qtd_atual são obrigatórios' }, { status: 400 })
  }
  if (tipo != null && !TIPOS_VALIDOS.has(tipo)) {
    return Response.json({ erro: `tipo inválido: ${tipo}` }, { status: 400 })
  }

  const admin = createSupabaseAdmin()

  // Validade obrigatória no aumento — entrada ou correção pra cima (mesma
  // regra/mensagens de /api/movimentacao): produto que controla validade tem
  // que trazer lotes somando as unidades novas, mesmo sem nenhum lote
  // cadastrado. Estoque e opção lidos do banco.
  if (tipo === 'entrada' || tipo === 'correcao') {
    const [{ data: prod, error: erroProd }, { data: est, error: erroEst }] = await Promise.all([
      admin.from('produtos').select('controla_validade').eq('id', produto_id).maybeSingle(),
      admin.from('estoque').select('qtd_atual').eq('produto_id', produto_id).maybeSingle(),
    ])
    if (erroProd || erroEst) return Response.json({ erro: 'Erro ao ler o produto' }, { status: 500 })
    if (prod?.controla_validade ?? true) {
      const novas = Math.floor(Math.max(0, Number(nova_qtd_atual) || 0)) - Math.floor(Number(est?.qtd_atual) || 0)
      const somaLotes = (Array.isArray(lotes_add) ? (lotes_add as LoteAdd[]) : []).reduce((s, l) => s + (Number(l?.quantidade) || 0), 0)
      if (novas > 0 && somaLotes === 0) return Response.json({ erro: `Informe a validade das ${novas} unidades` }, { status: 400 })
      if (novas > 0 && somaLotes !== novas) return Response.json({ erro: `Os lotes somam ${somaLotes} mas ${tipo === 'entrada' ? 'a entrada' : 'o aumento'} é de ${novas}` }, { status: 400 })
    }
  }

  // Nome amigável para o histórico — mesmo padrão de /api/movimentacao e /api/nota/lancar
  const { data: perfil } = await admin.from('perfis').select('nome').eq('id', user.id).single()
  const usuario_nome = perfil?.nome ?? user.email?.split('@')[0] ?? null

  const { data, error } = await admin
    .rpc('conferencia_ajustar', {
      p_produto_id: produto_id,
      p_nova_qtd_atual: Math.max(0, Number(nova_qtd_atual) || 0),
      p_nova_qtd_cozinha: nova_qtd_cozinha != null ? Math.max(0, Number(nova_qtd_cozinha) || 0) : null,
      p_tipo: tipo ?? null,
      p_lotes_add: Array.isArray(lotes_add) ? (lotes_add as LoteAdd[]) : [],
      p_lotes_remover: Array.isArray(lotes_remover) ? (lotes_remover as LoteRemover[]) : [],
      p_usuario_id: user.id,
      p_usuario_nome: usuario_nome,
    })
    .single<{ qtd_atual: number; qtd_cozinha: number }>()

  if (error || !data) {
    // Erros de validação da própria função (CNFxx) são erro do usuário (lote sem
    // saldo, tipo inválido etc.) — 400. Qualquer outra coisa é erro de servidor.
    const status = error?.code?.startsWith('CNF') ? 400 : 500
    return Response.json({ erro: error?.message ?? 'Erro ao ajustar conferência' }, { status })
  }

  return Response.json({ ok: true, qtd_atual: data.qtd_atual, qtd_cozinha: data.qtd_cozinha })
}
