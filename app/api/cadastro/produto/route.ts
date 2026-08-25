import { createSupabaseAdmin } from '../../../lib/supabase-admin'
import { createSupabaseServer } from '../../../lib/supabase-server'

export async function POST(request: Request) {
  const server = await createSupabaseServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const nome = body?.nome?.trim()
  const fornecedor_id = body?.fornecedor_id
  const unidade = body?.unidade?.trim()
  const qtd_atual = Number(body?.qtd_atual) || 0
  const qtd_base = Number(body?.qtd_base) || 0
  const qtd_max = Number(body?.qtd_max) || 0
  const codigo_barras = body?.codigo_barras ?? null
  const preco_custo   = body?.preco_custo != null ? Number(body.preco_custo) : null

  if (!nome || !fornecedor_id || !unidade) {
    return Response.json({ erro: 'Nome, fornecedor e unidade são obrigatórios' }, { status: 400 })
  }

  const supabase = createSupabaseAdmin()

  // Insere produto
  const { data: produto, error: erroProduto } = await supabase
    .from('produtos')
    .insert({ nome, fornecedor_id, unidade, codigo_barras, preco_custo })
    .select('id, nome')
    .single()

  if (erroProduto) return Response.json({ erro: erroProduto.message }, { status: 500 })

  // Cria entrada no estoque com a quantidade inicial informada
  const { data: estoqueRow, error: erroEstoque } = await supabase
    .from('estoque')
    .insert({ produto_id: produto.id, qtd_atual, qtd_base, qtd_max })
    .select('id')
    .single()

  if (erroEstoque) return Response.json({ erro: erroEstoque.message }, { status: 500 })

  return Response.json({ ...produto, estoque_id: estoqueRow?.id ?? null }, { status: 201 })
}
