import { createSupabaseAdmin } from '../../lib/supabase-admin'
import { createSupabaseServer } from '../../lib/supabase-server'

export async function GET(request: Request) {
  const server = await createSupabaseServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const ano = parseInt(searchParams.get('ano') ?? String(new Date().getFullYear()))
  const mes = parseInt(searchParams.get('mes') ?? String(new Date().getMonth() + 1))

  const admin = createSupabaseAdmin()

  const inicioMes = new Date(ano, mes - 1, 1).toISOString()
  const fimMes   = new Date(ano, mes, 0, 23, 59, 59, 999).toISOString()

  const [{ data: estoque, error: e1 }, { data: movimentacoes, error: e2 }] = await Promise.all([
    admin
      .from('estoque')
      .select('id, produto_id, qtd_atual, qtd_base, qtd_max, produtos(nome, unidade, preco_custo, fornecedores(nome))'),
    admin
      .from('movimentacoes')
      .select('id, tipo, quantidade, data_hora, usuario_nome, produto_id, produtos(nome)')
      .gte('data_hora', inicioMes)
      .lte('data_hora', fimMes)
      .order('data_hora', { ascending: true }),
  ])

  if (e1) return Response.json({ erro: e1.message }, { status: 500 })

  return Response.json({
    estoque:       estoque       ?? [],
    movimentacoes: movimentacoes ?? [],
  })
}
