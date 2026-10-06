// Endpoint POST /api/validades-divergentes/corrigir — acerta os lotes de
// validade de um produto para a soma bater com estoque.qtd_atual.
//
// Reaproveita a RPC conferencia_ajustar (ver
// supabase/migrations/20261003120000_conferencia_ajustar.sql) com
// p_nova_qtd_atual = qtd atual, p_nova_qtd_cozinha = null e p_tipo = null:
// nesse modo ela só processa p_lotes_add / p_lotes_remover — não muda a
// quantidade nem grava movimentação.
//
// A RPC não confere se a soma final bate com o estoque, então isso é validado
// aqui ANTES de chamá-la, com o estoque e os lotes lidos do banco agora (não
// os que o cliente tinha na tela). Se outra pessoa mexer no produto entre
// esta leitura e a RPC, a RPC grava qtd_atual de volta ao valor lido — janela
// de milissegundos, aceitável para uma tela de correção manual.
import { createSupabaseAdmin } from '@/app/lib/supabase-admin'
import { createSupabaseServer } from '@/app/lib/supabase-server'

type LoteAdd = { data_validade: string; quantidade: number }
type LoteRemover = { validade_id: string; quantidade: number }

function inteiroPositivo(v: unknown): number {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : 0
}

export async function POST(request: Request) {
  const server = await createSupabaseServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const { produto_id, lotes_add, lotes_remover } = body ?? {}
  if (!produto_id) return Response.json({ erro: 'produto_id é obrigatório' }, { status: 400 })

  const add: LoteAdd[] = []
  for (const l of Array.isArray(lotes_add) ? lotes_add : []) {
    const quantidade = inteiroPositivo(l?.quantidade)
    if (typeof l?.data_validade !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(l.data_validade) || !quantidade) {
      return Response.json({ erro: 'Lote a adicionar inválido (data e quantidade inteira > 0)' }, { status: 400 })
    }
    add.push({ data_validade: l.data_validade, quantidade })
  }

  // Junta remoções repetidas do mesmo lote, para a checagem de saldo abaixo valer.
  const remPorLote = new Map<string, number>()
  for (const l of Array.isArray(lotes_remover) ? lotes_remover : []) {
    const quantidade = inteiroPositivo(l?.quantidade)
    if (typeof l?.validade_id !== 'string' || !quantidade) {
      return Response.json({ erro: 'Lote a remover inválido' }, { status: 400 })
    }
    remPorLote.set(l.validade_id, (remPorLote.get(l.validade_id) ?? 0) + quantidade)
  }
  const remover: LoteRemover[] = [...remPorLote].map(([validade_id, quantidade]) => ({ validade_id, quantidade }))

  if (add.length === 0 && remover.length === 0) {
    return Response.json({ erro: 'Nenhum lote informado' }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const [{ data: estoque, error: erroEstoque }, { data: lotes, error: erroLotes }] = await Promise.all([
    admin.from('estoque').select('qtd_atual').eq('produto_id', produto_id).maybeSingle(),
    admin.from('validades').select('id, quantidade').eq('produto_id', produto_id),
  ])
  if (erroEstoque || erroLotes) {
    return Response.json({ erro: erroEstoque?.message ?? erroLotes?.message }, { status: 500 })
  }
  if (!estoque) return Response.json({ erro: 'Produto não encontrado no estoque' }, { status: 404 })

  const qtdAtual = estoque.qtd_atual ?? 0
  const saldoLote = new Map((lotes ?? []).map((l) => [l.id as string, l.quantidade as number]))
  for (const r of remover) {
    const saldo = saldoLote.get(r.validade_id)
    if (saldo == null || r.quantidade > saldo) {
      return Response.json({ erro: 'Os lotes mudaram desde que a tela foi aberta. Recarregue e tente de novo.' }, { status: 409 })
    }
  }

  const somaAtual = [...saldoLote.values()].reduce((s, q) => s + q, 0)
  const somaFinal = somaAtual
    + add.reduce((s, l) => s + l.quantidade, 0)
    - remover.reduce((s, l) => s + l.quantidade, 0)
  if (somaFinal !== qtdAtual) {
    return Response.json({
      erro: `Depois da correção os lotes somariam ${somaFinal}, mas o estoque é ${qtdAtual}. Recarregue e tente de novo.`,
    }, { status: 409 })
  }

  const { error } = await admin.rpc('conferencia_ajustar', {
    p_produto_id: produto_id,
    p_nova_qtd_atual: qtdAtual,
    p_nova_qtd_cozinha: null,
    p_tipo: null,
    p_lotes_add: add,
    p_lotes_remover: remover,
    p_usuario_id: user.id,
    p_usuario_nome: user.email?.split('@')[0] ?? null, // não usado com p_tipo null (não grava movimentação)
  })

  if (error) {
    const status = error.code?.startsWith('CNF') ? 400 : 500
    return Response.json({ erro: error.message }, { status })
  }

  return Response.json({ ok: true })
}
