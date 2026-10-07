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

  // Produtos existentes que não controlam validade: entram sem lote (a função
  // nota_lancar_item também ignora os lotes deles). Lido do banco, não do cliente.
  const idsExistentes = [...new Set(itens.map((i) => i.produto_id).filter((id): id is string => !!id))]
  const semValidade = new Set<string>()
  if (idsExistentes.length > 0) {
    const { data: semControle } = await admin
      .from('produtos').select('id').in('id', idsExistentes).eq('controla_validade', false)
    for (const p of semControle ?? []) semValidade.add(p.id as string)
  }

  const lancados: { nome: string; produto_id: string; quantidade: number }[] = []
  const falhas: { nome: string; erro: string }[] = []

  // Cada item é independente: a falha de um não impede os outros de serem lançados.
  for (const item of itens) {
    try {
      const quantidade = Number(item.quantidade)
      if (!quantidade || quantidade <= 0) throw new Error('Quantidade inválida')

      const controla = !(item.produto_id && semValidade.has(item.produto_id))
      const lotes = !controla ? [] : Array.isArray(item.lotes) ? item.lotes : []
      if (controla) {
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
      }

      // Valida os dados do produto novo aqui (antes da RPC) para manter a mesma
      // mensagem de erro de antes — a função no banco não sabe distinguir "campo
      // vazio" de "produto_id null porque é mesmo pra criar"
      let novoProdutoPayload: {
        nome: string; fornecedor_id: string; unidade: string
        codigo_barras: string | null; preco_custo: number | null
        qtd_base: number; qtd_max: number
      } | null = null
      if (!item.produto_id) {
        const np = item.novoProduto
        const fornecedorId = np?.fornecedor_id || body.fornecedor_id
        if (!np?.nome?.trim() || !fornecedorId || !np?.unidade?.trim()) {
          throw new Error('Dados do novo produto incompletos (nome, fornecedor e unidade)')
        }
        novoProdutoPayload = {
          nome: np.nome.trim(),
          fornecedor_id: fornecedorId,
          unidade: np.unidade.trim(),
          codigo_barras: np.codigo_barras?.toString().trim() || null,
          preco_custo: np.preco_custo != null && np.preco_custo !== '' ? Number(np.preco_custo) : null,
          qtd_base: Number(np.qtd_base) || 0,
          qtd_max: Number(np.qtd_max) || 0,
        }
      }

      // Mescla lotes repetidos do próprio payload (mesma regra de sempre: soma na
      // data já existente, senão insere — ver comentário na função nota_lancar_item)
      const lotesMesclados = new Map<string, number>()
      for (const l of lotes) {
        lotesMesclados.set(l.data_validade, (lotesMesclados.get(l.data_validade) ?? 0) + (Number(l.quantidade) || 0))
      }
      const lotesParaRpc = [...lotesMesclados].map(([data_validade, qtd]) => ({ data_validade, quantidade: qtd }))

      // Tudo isto (criar produto novo se precisar, inserir a movimentação, aplicar
      // o delta no estoque e mesclar os lotes de validade) virou 1 chamada RPC —
      // antes eram até 4 + N round-trips sequenciais por item (N = nº de lotes).
      // Ver supabase/migrations/20261001120000_previsao_compra_quinta.sql.
      const { data: resultado, error: erroRpc } = await admin
        .rpc('nota_lancar_item', {
          p_produto_id: item.produto_id || null,
          p_novo_nome: novoProdutoPayload?.nome ?? null,
          p_novo_fornecedor_id: novoProdutoPayload?.fornecedor_id ?? null,
          p_novo_unidade: novoProdutoPayload?.unidade ?? null,
          p_novo_codigo_barras: novoProdutoPayload?.codigo_barras ?? null,
          p_novo_preco_custo: novoProdutoPayload?.preco_custo ?? null,
          p_novo_qtd_base: novoProdutoPayload?.qtd_base ?? null,
          p_novo_qtd_max: novoProdutoPayload?.qtd_max ?? null,
          p_quantidade: quantidade,
          p_usuario_id: user.id,
          p_usuario_nome: usuario_nome,
          p_lotes: lotesParaRpc,
        })
        .single<{ produto_id: string }>()
      if (erroRpc || !resultado) throw new Error(erroRpc?.message ?? 'Erro ao lançar item')

      const produto_id = resultado.produto_id

      lancados.push({ nome: item.nome_nota, produto_id, quantidade })
    } catch (e) {
      falhas.push({ nome: item.nome_nota, erro: e instanceof Error ? e.message : 'Erro desconhecido' })
    }
  }

  return Response.json({ lancados, falhas })
}
