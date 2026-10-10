// Endpoint GET /api/previsao-compras — status de cada produto (CRITICO /
// COMPRAR_QUINTA / OK) com base na vw_previsao_compras (cálculo feito no
// banco, ver supabase/migrations/20261001120000_previsao_compra_quinta.sql).
// Usado pelo badge da tela de Estoque e pela página "Lista de Compras da Quinta".
import { createSupabaseAdmin } from '../../lib/supabase-admin'
import { createSupabaseServer } from '../../lib/supabase-server'

export type ItemPrevisaoCompra = {
  produto_id: string
  nome: string
  unidade: string
  fornecedor_id: string | null
  fornecedor: string | null
  qtd_atual: number
  estoque_minimo: number
  dias_ate_quinta: number
  consumo_medio_diario: number
  estoque_previsto: number
  qtd_sugerida: number
  status: 'CRITICO' | 'COMPRAR_QUINTA' | 'OK'
  // Vem de produtos (não da view); null = sem preço cadastrado
  preco_custo: number | null
  // Vem de estoque (não da view); usado na sugestão de item CRÍTICO na tela Compras
  qtd_max: number
}

// Estoque muda a cada movimentação: nunca cachear (servidor, CDN nem navegador)
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const server = await createSupabaseServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from('vw_previsao_compras')
    .select('*')
    .order('status', { ascending: true }) // CRITICO < COMPRAR_QUINTA < OK (ordem alfabética ajuda)

  if (error) return Response.json({ erro: error.message }, { status: 500 })

  // preco_custo (produtos) e qtd_max (estoque) ficam fora da view — busca à
  // parte e junta por produto_id, sem mexer na view
  const ids = (data ?? []).map((i) => i.produto_id)
  const [{ data: precos }, { data: maximos }] = ids.length
    ? await Promise.all([
        admin.from('produtos').select('id, preco_custo').in('id', ids),
        admin.from('estoque').select('produto_id, qtd_max').in('produto_id', ids),
      ])
    : [{ data: [] as { id: string; preco_custo: number | null }[] }, { data: [] as { produto_id: string; qtd_max: number | null }[] }]
  const precoPorId = new Map((precos ?? []).map((p) => [p.id, p.preco_custo as number | null]))
  const maxPorId = new Map((maximos ?? []).map((e) => [e.produto_id, Number(e.qtd_max ?? 0)]))

  const itens = (data ?? []).map((i) => ({
    ...i,
    preco_custo: precoPorId.get(i.produto_id) ?? null,
    qtd_max: maxPorId.get(i.produto_id) ?? 0,
  }))
  return Response.json(itens as ItemPrevisaoCompra[], { headers: { 'Cache-Control': 'no-store' } })
}
