import { createSupabaseAdmin } from '../../../lib/supabase-admin'
import { createSupabaseServer } from '../../../lib/supabase-server'

export async function GET(request: Request) {
  const server = await createSupabaseServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const codigo = searchParams.get('codigo')
  if (!codigo) return Response.json({ erro: 'codigo obrigatório' }, { status: 400 })

  const supabase = createSupabaseAdmin()

  const { data: produto, error } = await supabase
    .from('produtos')
    .select('id, nome, unidade, fornecedores(nome), estoque(id, qtd_atual, qtd_base, qtd_max)')
    .eq('codigo_barras', codigo)
    .single()

  if (error || !produto) {
    return Response.json({ erro: 'Produto não encontrado' }, { status: 404 })
  }

  const est = Array.isArray(produto.estoque) ? produto.estoque[0] : produto.estoque

  return Response.json({
    produto_id: produto.id,
    estoque_id: est?.id ?? null,
    qtd_atual: est?.qtd_atual ?? 0,
    qtd_base: est?.qtd_base ?? 0,
    qtd_max: est?.qtd_max ?? 0,
    nome: produto.nome,
    unidade: produto.unidade,
    fornecedor_nome: (produto.fornecedores as any)?.nome ?? null,
  })
}
