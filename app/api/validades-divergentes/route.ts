// Endpoint GET /api/validades-divergentes — produtos cuja soma de lotes de
// validade não bate com estoque.qtd_atual (cálculo no banco, ver
// supabase/migrations/20261005120000_vw_validades_divergentes.sql), já com os
// lotes atuais de cada um para a página /validades-divergentes.
import { createSupabaseAdmin } from '../../lib/supabase-admin'
import { createSupabaseServer } from '../../lib/supabase-server'
import type { Validade } from '../../lib/validades'

export type TipoDivergencia = 'SOBRA_VALIDADE' | 'FALTA_VALIDADE' | 'SEM_VALIDADE'

export type ItemValidadeDivergente = {
  produto_id: string
  nome: string
  fornecedor: string | null
  qtd_estoque: number
  qtd_validades: number
  diferenca: number
  tipo: TipoDivergencia
  unidade: string | null
  lotes: Validade[]
}

export async function GET() {
  const server = await createSupabaseServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })

  const admin = createSupabaseAdmin()
  const { data: itens, error } = await admin
    .from('vw_validades_divergentes')
    .select('*')
    .order('nome', { ascending: true })

  if (error) return Response.json({ erro: error.message }, { status: 500 })
  if (!itens || itens.length === 0) return Response.json([])

  const ids = itens.map((i) => i.produto_id as string)
  const [{ data: lotes, error: erroLotes }, { data: produtos }] = await Promise.all([
    admin
      .from('validades')
      .select('id, produto_id, data_validade, quantidade')
      .in('produto_id', ids)
      .order('data_validade', { ascending: true }),
    admin.from('produtos').select('id, unidade').in('id', ids),
  ])

  if (erroLotes) return Response.json({ erro: erroLotes.message }, { status: 500 })

  const lotesPorProduto: Record<string, Validade[]> = {}
  for (const l of (lotes ?? []) as Validade[]) {
    if (!lotesPorProduto[l.produto_id]) lotesPorProduto[l.produto_id] = []
    lotesPorProduto[l.produto_id].push(l)
  }
  const unidadePorProduto = new Map((produtos ?? []).map((p) => [p.id as string, (p.unidade as string | null) ?? null]))

  const resultado: ItemValidadeDivergente[] = itens.map((i) => ({
    ...(i as Omit<ItemValidadeDivergente, 'lotes' | 'unidade'>),
    unidade: unidadePorProduto.get(i.produto_id) ?? null,
    lotes: lotesPorProduto[i.produto_id] ?? [],
  }))

  return Response.json(resultado)
}
