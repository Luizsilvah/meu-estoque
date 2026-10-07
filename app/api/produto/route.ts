import { createSupabaseAdmin } from '../../lib/supabase-admin'
import { createSupabaseServer } from '../../lib/supabase-server'

async function autenticar() {
  const s = await createSupabaseServer()
  const { data: { user } } = await s.auth.getUser()
  return user
}

export async function DELETE(request: Request) {
  if (!await autenticar()) return Response.json({ erro: 'Não autenticado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const produto_id = searchParams.get('produto_id')
  const estoque_id = searchParams.get('estoque_id')
  if (!produto_id || !estoque_id) return Response.json({ erro: 'produto_id e estoque_id obrigatórios' }, { status: 400 })

  const supabase = createSupabaseAdmin()

  // Remove registros dependentes em ordem para evitar violação de foreign key
  const { error: erroVal } = await supabase.from('validades').delete().eq('produto_id', produto_id)
  if (erroVal) return Response.json({ erro: erroVal.message }, { status: 500 })

  const { error: erroMov } = await supabase.from('movimentacoes').delete().eq('produto_id', produto_id)
  if (erroMov) return Response.json({ erro: erroMov.message }, { status: 500 })

  const { error: erroEstoque } = await supabase.from('estoque').delete().eq('id', estoque_id)
  if (erroEstoque) return Response.json({ erro: erroEstoque.message }, { status: 500 })

  const { error: erroProduto } = await supabase.from('produtos').delete().eq('id', produto_id)
  if (erroProduto) return Response.json({ erro: erroProduto.message }, { status: 500 })

  return Response.json({ ok: true })
}

export async function PATCH(request: Request) {
  if (!await autenticar()) return Response.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  // qtd_atual/qtd_cozinha NÃO são gravadas aqui: mudar a quantidade sem mexer
  // nos lotes de validade dessincronizava estoque x validades. A tela de
  // edição grava quantidade + lotes por /api/estoque/conferencia (RPC
  // conferencia_ajustar, tipo 'correcao').
  const { estoque_id, produto_id, nome, fornecedor_id, unidade, qtd_base, qtd_max, foto_url, codigo_barras, preco_custo } = body ?? {}

  if (!estoque_id || !produto_id || !nome?.trim() || !fornecedor_id || !unidade?.trim()) {
    return Response.json({ erro: 'Campos obrigatórios ausentes' }, { status: 400 })
  }

  const supabase = createSupabaseAdmin()

  const produtoUpdate: Record<string, unknown> = { nome: nome.trim(), fornecedor_id, unidade: unidade.trim() }
  if (foto_url !== undefined) produtoUpdate.foto_url = foto_url
  if (codigo_barras !== undefined) produtoUpdate.codigo_barras = codigo_barras
  if (preco_custo !== undefined) produtoUpdate.preco_custo = preco_custo != null ? Number(preco_custo) : null

  const { error: erroProduto } = await supabase
    .from('produtos')
    .update(produtoUpdate)
    .eq('id', produto_id)

  if (erroProduto) return Response.json({ erro: erroProduto.message }, { status: 500 })

  const estoqueUpdate = { qtd_base: Number(qtd_base) || 0, qtd_max: Number(qtd_max) || 0 }

  const { error: erroEstoque } = await supabase
    .from('estoque')
    .update(estoqueUpdate)
    .eq('id', estoque_id)

  if (erroEstoque) return Response.json({ erro: erroEstoque.message }, { status: 500 })

  return Response.json({ ok: true })
}
