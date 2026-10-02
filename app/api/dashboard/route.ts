// Endpoint GET /api/dashboard — agrega os dados resumidos exibidos na tela inicial
import { createSupabaseAdmin } from '../../lib/supabase-admin'
import { createSupabaseServer } from '../../lib/supabase-server'

export async function GET() {
  const server = await createSupabaseServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })
  const admin = createSupabaseAdmin()

  // Janela de 7 dias para alertas de validade
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const em7dias = new Date(hoje)
  em7dias.setDate(hoje.getDate() + 7)

  // Busca estoque, validades próximas e a previsão de compra (view no banco) em
  // paralelo para economizar tempo
  const [{ data: estoque, error: erroEstoque }, { data: validades, error: erroVal }, { data: previsaoCompras }] =
    await Promise.all([
      admin.from('estoque').select('produto_id, qtd_atual, qtd_base, qtd_max, produtos(nome, preco_custo)'),
      admin
        .from('validades')
        .select('data_validade, produto_id, produtos(nome)')
        .lte('data_validade', em7dias.toISOString().slice(0, 10)),
      admin.from('vw_previsao_compras').select('status'),
    ])

  // Contagem para o card "Compra de quinta" — críticos (já no mínimo) e os que
  // vão ficar abaixo do mínimo antes da próxima quinta (ver vw_previsao_compras)
  const criticos = (previsaoCompras ?? []).filter((i) => i.status === 'CRITICO').length
  const comprarQuinta = (previsaoCompras ?? []).filter((i) => i.status === 'COMPRAR_QUINTA').length

  if (erroEstoque) return Response.json({ erro: erroEstoque.message }, { status: 500 })

  // Produto precisa de pedido quando qtd_atual <= qtd_base (inclui zerado)
  const total = (estoque ?? []).length
  const precisamPedir = (estoque ?? []).filter((item) => item.qtd_atual <= item.qtd_base)
  const estoqueOk = total - precisamPedir.length

  // Lista ordenada dos produtos que precisam de reposição, com a quantidade a pedir
  const listaPedir = precisamPedir
    .map((item) => ({
      nome: (item.produtos as any)?.nome ?? '—',
      qtd_atual: item.qtd_atual,
      pedir: item.qtd_max - item.qtd_atual,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  // Só alertamos sobre lotes de produtos que ainda têm estoque físico (qtd_atual > 0).
  // Lotes de produtos zerados ou já removidos ("órfãos") não geram alerta de validade.
  const idsComEstoqueAtivo = new Set(
    (estoque ?? []).filter((item) => item.qtd_atual > 0).map((item) => item.produto_id),
  )
  const validadesAtivas = erroVal
    ? []
    : (validades ?? []).filter((v) => idsComEstoqueAtivo.has(v.produto_id))

  // Contagem de lotes vencidos ou a vencer nos próximos 7 dias
  const vencendo7d = validadesAtivas.length

  const agora = new Date()
  agora.setHours(0, 0, 0, 0)
  const listaVencendo = validadesAtivas
    .map((v) => {
      const valDate = new Date(v.data_validade + 'T00:00:00')
      const dias = Math.floor((valDate.getTime() - agora.getTime()) / 86400000)
      return {
        nome: (v.produtos as any)?.nome ?? '—',
        data_validade: v.data_validade,
        dias,
      }
    })
    .sort((a, b) => a.dias - b.dias)

  // Valor total do estoque = soma(qtd_atual × preco_custo) para produtos com preço cadastrado
  const valorEstoque = (estoque ?? []).reduce((soma, item) => {
    const preco = (item.produtos as any)?.preco_custo ?? null
    return preco != null ? soma + item.qtd_atual * preco : soma
  }, 0)

  return Response.json({ total, precisamPedir: precisamPedir.length, estoqueOk, vencendo7d, listaPedir, listaVencendo, valorEstoque, criticos, comprarQuinta })
}
