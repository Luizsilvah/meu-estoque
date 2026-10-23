import { createSupabaseAdmin } from '../../../lib/supabase-admin'
import { createSupabaseServer } from '../../../lib/supabase-server'
import { exigirPermissao } from '@/app/lib/exigirPermissao'

type LoteAdd = { data_validade: string; quantidade: number }

export async function POST(request: Request) {
  const server = await createSupabaseServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })
  const negado = await exigirPermissao(user, 'cadastrar')
  if (negado) return negado
  const body = await request.json().catch(() => null)
  const nome = body?.nome?.trim()
  const fornecedor_id = body?.fornecedor_id
  const unidade = body?.unidade?.trim()
  // Inteira: os lotes de validade são inteiros e têm que somar exatamente isto
  const qtd_atual = Math.max(0, Math.floor(Number(body?.qtd_atual) || 0))
  const qtd_base = Number(body?.qtd_base) || 0
  const qtd_max = Number(body?.qtd_max) || 0
  const codigo_barras = body?.codigo_barras ?? null
  const preco_custo   = body?.preco_custo != null ? Number(body.preco_custo) : null
  // Padrão da coluna é true; só grava false quando vier explicitamente
  const controla_validade = body?.controla_validade !== false

  if (!nome || !fornecedor_id || !unidade) {
    return Response.json({ erro: 'Nome, fornecedor e unidade são obrigatórios' }, { status: 400 })
  }

  // Validade obrigatória (mesma regra de toda entrada, ver /api/movimentacao):
  // produto que controla validade e já nasce com quantidade precisa dos lotes
  // somando a quantidade. Validado antes de gravar qualquer coisa.
  const lotes: LoteAdd[] = []
  if (controla_validade && qtd_atual > 0) {
    const porData = new Map<string, number>()
    for (const l of Array.isArray(body?.lotes) ? body.lotes : []) {
      const q = Number(l?.quantidade)
      if (typeof l?.data_validade !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(l.data_validade) || !Number.isInteger(q) || q <= 0) {
        return Response.json({ erro: 'Lote inválido (data e quantidade inteira > 0)' }, { status: 400 })
      }
      porData.set(l.data_validade, (porData.get(l.data_validade) ?? 0) + q)
    }
    for (const [data_validade, quantidade] of porData) lotes.push({ data_validade, quantidade })
    const soma = lotes.reduce((s, l) => s + l.quantidade, 0)
    if (soma === 0) return Response.json({ erro: `Informe a validade das ${qtd_atual} unidades` }, { status: 400 })
    if (soma !== qtd_atual) return Response.json({ erro: `Os lotes somam ${soma} mas a quantidade é ${qtd_atual}` }, { status: 400 })
  }

  const supabase = createSupabaseAdmin()

  // Insere produto
  const { data: produto, error: erroProduto } = await supabase
    .from('produtos')
    .insert({ nome, fornecedor_id, unidade, codigo_barras, preco_custo, controla_validade })
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

  if (lotes.length > 0) {
    const { error: erroLotes } = await supabase
      .from('validades')
      .insert(lotes.map((l) => ({ produto_id: produto.id, ...l })))
    if (erroLotes) {
      // Sem os lotes o produto nasceria com estoque ≠ soma das validades:
      // desfaz o cadastro para a pessoa tentar de novo.
      await supabase.from('estoque').delete().eq('produto_id', produto.id)
      await supabase.from('produtos').delete().eq('id', produto.id)
      return Response.json({ erro: `Produto não cadastrado: erro ao gravar as validades (${erroLotes.message})` }, { status: 500 })
    }
  }

  return Response.json({ ...produto, estoque_id: estoqueRow?.id ?? null }, { status: 201 })
}
