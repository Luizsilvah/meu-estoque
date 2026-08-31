import { createSupabaseServer } from '../../../lib/supabase-server'
import { createSupabaseAdmin } from '../../../lib/supabase-admin'

type LoteInput = { data_validade: string; quantidade: number }

type NovoProdutoInput = {
  nome: string
  fornecedor_id: string
  unidade: string
  qtd_base?: number | string
  qtd_max?: number | string
  codigo_barras?: string | null
  preco_custo?: number | string | null
}

type ItemInput = {
  nome_nota: string
  produto_id: string | null
  novoProduto?: NovoProdutoInput | null
  quantidade: number
  lotes: LoteInput[]
}

type Body = { fornecedor_id: string | null; itens: ItemInput[] }

// O guard real de "não dar entrada com validade no passado" é client-side, usando a
// data local do usuário (fuso do Brasil). Aqui é só um backstop contra erro de digitação
// de ano — aceita a partir de ontem (UTC) para não rejeitar um lote de "hoje" quando o
// servidor já virou o dia em UTC.
function dataNoPassado(dataStr: string): boolean {
  const ontem = new Date()
  ontem.setUTCDate(ontem.getUTCDate() - 1)
  return dataStr < ontem.toISOString().slice(0, 10)
}

export async function POST(req: Request) {
  const server = await createSupabaseServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })

  let body: Body
  try {
    body = await req.json()
  } catch {
    return Response.json({ erro: 'Body inválido' }, { status: 400 })
  }

  const itens = Array.isArray(body?.itens) ? body.itens : []
  if (itens.length === 0) {
    return Response.json({ erro: 'Nenhum item para lançar' }, { status: 400 })
  }

  const admin = createSupabaseAdmin()

  // Nome amigável para o histórico de movimentações (mesmo padrão de /api/movimentacao)
  const { data: perfil } = await admin
    .from('perfis')
    .select('nome')
    .eq('id', user.id)
    .single()
  const usuario_nome = perfil?.nome ?? user.email?.split('@')[0] ?? null

  const lancados: { nome: string; produto_id: string; quantidade: number }[] = []
  const falhas: { nome: string; erro: string }[] = []

  // Cada item é independente: a falha de um não impede os outros de serem lançados.
  for (const item of itens) {
    try {
      const quantidade = Number(item.quantidade)
      if (!quantidade || quantidade <= 0) throw new Error('Quantidade inválida')

      const lotes = Array.isArray(item.lotes) ? item.lotes : []
      if (lotes.length === 0) throw new Error('Item sem validade')
      for (const l of lotes) {
        if (!l.data_validade) throw new Error('Lote sem data de validade')
        if (dataNoPassado(l.data_validade)) {
          throw new Error(`Validade no passado (${l.data_validade}) — verifique o ano`)
        }
      }
      const somaLotes = lotes.reduce((s, l) => s + (Number(l.quantidade) || 0), 0)
      if (somaLotes !== quantidade) {
        throw new Error(`Soma dos lotes (${somaLotes}) diferente da quantidade (${quantidade})`)
      }

      // 1. Resolve o produto_id — cria o produto (e a linha de estoque zerada) se for novo
      let produto_id = item.produto_id
      if (!produto_id) {
        const np = item.novoProduto
        const fornecedorId = np?.fornecedor_id || body.fornecedor_id
        if (!np?.nome?.trim() || !fornecedorId || !np?.unidade?.trim()) {
          throw new Error('Dados do novo produto incompletos (nome, fornecedor e unidade)')
        }

        const { data: produtoCriado, error: erroProduto } = await admin
          .from('produtos')
          .insert({
            nome: np.nome.trim(),
            fornecedor_id: fornecedorId,
            unidade: np.unidade.trim(),
            codigo_barras: np.codigo_barras?.toString().trim() || null,
            preco_custo: np.preco_custo != null && np.preco_custo !== '' ? Number(np.preco_custo) : null,
          })
          .select('id')
          .single()
        if (erroProduto || !produtoCriado) throw new Error(erroProduto?.message ?? 'Erro ao criar produto')

        const { error: erroEstoque } = await admin
          .from('estoque')
          .insert({
            produto_id: produtoCriado.id,
            qtd_atual: 0,
            qtd_base: Number(np.qtd_base) || 0,
            qtd_max: Number(np.qtd_max) || 0,
          })
        if (erroEstoque) throw new Error(erroEstoque.message)

        produto_id = produtoCriado.id
      }

      // 2. Registra a movimentação de entrada no histórico
      const { error: erroMov } = await admin
        .from('movimentacoes')
        .insert({
          produto_id,
          tipo: 'entrada',
          quantidade,
          data_hora: new Date().toISOString(),
          usuario_id: user.id,
          usuario_nome,
        })
      if (erroMov) throw new Error(erroMov.message)

      // 3. Aplica o delta no estoque de forma atômica (mesma RPC de /api/movimentacao)
      const { error: erroRpc } = await admin
        .rpc('estoque_aplicar_movimentacao', {
          p_produto_id: produto_id,
          p_delta_atual: quantidade,
          p_delta_cozinha: 0,
        })
        .single()
      if (erroRpc) throw new Error(erroRpc.message)

      // 4. Grava os lotes de validade — soma na data já existente, senão insere.
      //    (a tabela `validades` não tem constraint única em produto_id+data)
      const { data: valsExistentes } = await admin
        .from('validades')
        .select('id, data_validade, quantidade')
        .eq('produto_id', produto_id)
      const porData = new Map<string, { id: string; quantidade: number }>()
      for (const v of valsExistentes ?? []) {
        porData.set(v.data_validade, { id: v.id, quantidade: v.quantidade })
      }

      // Mescla lotes repetidos do próprio payload antes de gravar
      const lotesMesclados = new Map<string, number>()
      for (const l of lotes) {
        lotesMesclados.set(l.data_validade, (lotesMesclados.get(l.data_validade) ?? 0) + (Number(l.quantidade) || 0))
      }

      for (const [data_validade, qtd] of lotesMesclados) {
        const existente = porData.get(data_validade)
        if (existente) {
          const { error } = await admin
            .from('validades')
            .update({ quantidade: existente.quantidade + qtd })
            .eq('id', existente.id)
          if (error) throw new Error(`Lote ${data_validade}: ${error.message}`)
        } else {
          const { error } = await admin
            .from('validades')
            .insert({ produto_id, data_validade, quantidade: qtd })
          if (error) throw new Error(`Lote ${data_validade}: ${error.message}`)
        }
      }

      lancados.push({ nome: item.nome_nota, produto_id: produto_id as string, quantidade })
    } catch (e) {
      falhas.push({ nome: item.nome_nota, erro: e instanceof Error ? e.message : 'Erro desconhecido' })
    }
  }

  return Response.json({ lancados, falhas })
}
