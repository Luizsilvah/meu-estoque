import { createSupabaseAdmin } from '../../lib/supabase-admin'
import { createSupabaseServer } from '../../lib/supabase-server'

export type ItemPrevisao = {
  produto_id: string
  nome: string
  unidade: string
  fornecedor: string
  qtd_atual: number
  qtd_base: number
  total_saidas_30d: number
  media_dia: number       // saídas/dia (2 casas)
  dias_ate_acabar: number // Infinity → 9999
}

export async function GET() {
  const server = await createSupabaseServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })

  const admin = createSupabaseAdmin()

  const inicio30d = new Date()
  inicio30d.setDate(inicio30d.getDate() - 30)
  inicio30d.setHours(0, 0, 0, 0)

  const [{ data: estoque, error: e1 }, { data: movs, error: e2 }] = await Promise.all([
    admin
      .from('estoque')
      .select('produto_id, qtd_atual, qtd_base, produtos(nome, unidade, fornecedores(nome))'),
    admin
      .from('movimentacoes')
      .select('produto_id, tipo, quantidade')
      .eq('tipo', 'saida')
      .gte('data_hora', inicio30d.toISOString()),
  ])

  if (e1) return Response.json({ erro: e1.message }, { status: 500 })

  // Soma saídas dos últimos 30 dias por produto
  const saidasPor: Record<string, number> = {}
  for (const m of movs ?? []) {
    saidasPor[m.produto_id] = (saidasPor[m.produto_id] ?? 0) + m.quantidade
  }

  const resultado: ItemPrevisao[] = (estoque ?? [])
    .map((item: any) => {
      const total_saidas_30d = saidasPor[item.produto_id] ?? 0
      const media_dia = Math.round((total_saidas_30d / 30) * 100) / 100
      const dias_ate_acabar =
        media_dia > 0
          ? Math.round(item.qtd_atual / media_dia)
          : 9999

      return {
        produto_id:      item.produto_id,
        nome:            item.produtos?.nome ?? '—',
        unidade:         item.produtos?.unidade ?? 'un',
        fornecedor:      item.produtos?.fornecedores?.nome ?? '—',
        qtd_atual:       item.qtd_atual,
        qtd_base:        item.qtd_base ?? 0,
        total_saidas_30d,
        media_dia,
        dias_ate_acabar,
      }
    })
    // Só inclui produtos com algum consumo nos últimos 30 dias
    .filter((i) => i.media_dia > 0)
    .sort((a, b) => a.dias_ate_acabar - b.dias_ate_acabar)

  return Response.json(resultado)
}
