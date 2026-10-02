// Script manual de QA — testa a função conferencia_ajustar direto contra o
// banco real, com um produto/estoque descartáveis criados e removidos aqui.
//
// PRÉ-REQUISITO: a migration supabase/migrations/20261003120000_conferencia_ajustar.sql
// precisa já estar aplicada (é dela que vem a função conferencia_ajustar e a
// coluna movimentacoes.motivo). Sem isso os cenários abaixo falham com
// "function conferencia_ajustar does not exist".
//
// Cenários (conferem o enunciado da Etapa 1):
//   (a) 10 un + 1 lote de 10 → conferência +1 com validade NOVA
//       → espera qtd_atual = 11 e soma dos lotes = 11
//   (b) -1 escolhendo o lote existente
//       → espera qtd_atual = 10 e soma dos lotes = 10
//   (c) tenta remover mais do que o lote tem
//       → espera erro (CNF06) e NADA alterado (qtd e lotes iguais ao estado antes da tentativa)
//
// Roda com: node scripts/testar-conferencia.js

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const env = {}
for (const line of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2]
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const MARCA = '[TESTE QA conferencia_ajustar]'
const DATA_LOTE_INICIAL = '2026-12-31'
const DATA_LOTE_NOVO = '2027-01-15'

let produtoId = null
let falhas = 0

function checar(nome, condicao, detalhe) {
  if (condicao) {
    console.log(`✓ ${nome}`)
  } else {
    falhas++
    console.error(`❌ ${nome}` + (detalhe ? ` — ${detalhe}` : ''))
  }
}

async function estadoAtual() {
  const { data: estoque } = await supabase.from('estoque').select('qtd_atual, qtd_cozinha').eq('produto_id', produtoId).single()
  const { data: lotes } = await supabase.from('validades').select('id, data_validade, quantidade').eq('produto_id', produtoId).order('data_validade')
  const somaLotes = (lotes ?? []).reduce((s, l) => s + l.quantidade, 0)
  return { qtd_atual: estoque?.qtd_atual, qtd_cozinha: estoque?.qtd_cozinha, lotes: lotes ?? [], somaLotes }
}

async function chamarRpc(params) {
  return supabase.rpc('conferencia_ajustar', {
    p_produto_id: produtoId,
    p_nova_qtd_atual: params.novaQtdAtual,
    p_nova_qtd_cozinha: params.novaQtdCozinha ?? null,
    p_tipo: params.tipo ?? null,
    p_lotes_add: params.lotesAdd ?? [],
    p_lotes_remover: params.lotesRemover ?? [],
    p_usuario_id: params.usuarioId,
    p_usuario_nome: params.usuarioNome ?? 'Teste QA',
  }).single()
}

async function main() {
  const { data: fornecedor, error: erroForn } = await supabase.from('fornecedores').select('id').limit(1).single()
  if (erroForn || !fornecedor) throw new Error('Nenhum fornecedor encontrado — crie um fornecedor antes de rodar este script.')

  const { data: admin, error: erroAdmin } = await supabase.from('perfis').select('id, nome').limit(1).single()
  if (erroAdmin || !admin) throw new Error('Nenhum usuário em perfis encontrado para usar como usuario_id de teste.')

  // Setup: produto de teste com 10 unidades e 1 lote de 10
  const { data: produto, error: erroProduto } = await supabase
    .from('produtos').insert({ nome: `${MARCA} produto`, fornecedor_id: fornecedor.id, unidade: 'un' }).select('id').single()
  if (erroProduto) throw new Error(`criar produto: ${erroProduto.message}`)
  produtoId = produto.id

  const { error: erroEstoque } = await supabase
    .from('estoque').insert({ produto_id: produtoId, qtd_atual: 10, qtd_cozinha: 0, qtd_base: 2, qtd_max: 20 })
  if (erroEstoque) throw new Error(`criar estoque: ${erroEstoque.message}`)

  const { data: lote10, error: erroLote } = await supabase
    .from('validades').insert({ produto_id: produtoId, data_validade: DATA_LOTE_INICIAL, quantidade: 10 }).select('id').single()
  if (erroLote) throw new Error(`criar lote inicial: ${erroLote.message}`)

  console.log(`Produto de teste: ${produtoId}\n`)

  try {
    // ── (a) +1, validade NOVA ────────────────────────────────────────────
    console.log('── (a) +1 com validade nova ──')
    const { data: resA, error: erroA } = await chamarRpc({
      novaQtdAtual: 11, novaQtdCozinha: 0, tipo: 'correcao',
      lotesAdd: [{ data_validade: DATA_LOTE_NOVO, quantidade: 1 }],
      usuarioId: admin.id, usuarioNome: admin.nome,
    })
    checar('(a) RPC não retornou erro', !erroA, erroA?.message)
    checar('(a) retornou qtd_atual = 11', resA?.qtd_atual === 11, `veio ${resA?.qtd_atual}`)

    const estadoA = await estadoAtual()
    checar('(a) qtd_atual no banco = 11', estadoA.qtd_atual === 11, `veio ${estadoA.qtd_atual}`)
    checar('(a) soma dos lotes = 11', estadoA.somaLotes === 11, `veio ${estadoA.somaLotes} (${JSON.stringify(estadoA.lotes)})`)
    checar('(a) lote novo foi criado (2 lotes)', estadoA.lotes.length === 2, `veio ${estadoA.lotes.length} lote(s)`)
    const loteNovo = estadoA.lotes.find((l) => l.data_validade === DATA_LOTE_NOVO)
    checar('(a) lote novo tem 1 unidade', loteNovo?.quantidade === 1, `veio ${loteNovo?.quantidade}`)

    const { data: movA } = await supabase.from('movimentacoes').select('tipo, quantidade, motivo').eq('produto_id', produtoId).order('data_hora', { ascending: false }).limit(1)
    checar('(a) logou movimentação tipo=entrada, motivo=correcao', movA?.[0]?.tipo === 'entrada' && movA?.[0]?.motivo === 'correcao', JSON.stringify(movA?.[0]))

    // ── (b) -1, escolhendo o lote existente de 10 ───────────────────────
    console.log('\n── (b) -1 escolhendo o lote de 10 ──')
    const { data: resB, error: erroB } = await chamarRpc({
      novaQtdAtual: 10, novaQtdCozinha: 0, tipo: 'correcao',
      lotesRemover: [{ validade_id: lote10.id, quantidade: 1 }],
      usuarioId: admin.id, usuarioNome: admin.nome,
    })
    checar('(b) RPC não retornou erro', !erroB, erroB?.message)
    checar('(b) retornou qtd_atual = 10', resB?.qtd_atual === 10, `veio ${resB?.qtd_atual}`)

    const estadoB = await estadoAtual()
    checar('(b) qtd_atual no banco = 10', estadoB.qtd_atual === 10, `veio ${estadoB.qtd_atual}`)
    checar('(b) soma dos lotes = 10', estadoB.somaLotes === 10, `veio ${estadoB.somaLotes} (${JSON.stringify(estadoB.lotes)})`)
    const loteOriginal = estadoB.lotes.find((l) => l.id === lote10.id)
    checar('(b) lote original caiu para 9', loteOriginal?.quantidade === 9, `veio ${loteOriginal?.quantidade}`)

    // ── (c) tenta remover mais do que o lote tem ────────────────────────
    console.log('\n── (c) remover mais do que o lote tem (deve dar erro e não alterar nada) ──')
    const estadoAntesC = await estadoAtual()
    const { error: erroC } = await chamarRpc({
      novaQtdAtual: 0, novaQtdCozinha: 0, tipo: 'descarte_vencido',
      lotesRemover: [{ validade_id: lote10.id, quantidade: 999 }],
      usuarioId: admin.id, usuarioNome: admin.nome,
    })
    checar('(c) RPC retornou erro', !!erroC, erroC ? undefined : 'não retornou erro nenhum')
    checar('(c) erro é CNF06 (quantidade maior que o lote)', erroC?.code === 'CNF06', `código veio: ${erroC?.code} — ${erroC?.message}`)

    const estadoC = await estadoAtual()
    checar('(c) qtd_atual NÃO mudou', estadoC.qtd_atual === estadoAntesC.qtd_atual, `era ${estadoAntesC.qtd_atual}, ficou ${estadoC.qtd_atual}`)
    checar('(c) soma dos lotes NÃO mudou', estadoC.somaLotes === estadoAntesC.somaLotes, `era ${estadoAntesC.somaLotes}, ficou ${estadoC.somaLotes}`)
    // Como a transação inteira dá rollback no erro, nem a tentativa de
    // mexer em qtd_atual (0) nem a remoção do lote devem ter persistido.
    checar('(c) qtd_atual não foi pro valor tentado (0)', estadoC.qtd_atual !== 0, `ficou ${estadoC.qtd_atual}`)

  } finally {
    await supabase.from('validades').delete().eq('produto_id', produtoId)
    await supabase.from('movimentacoes').delete().eq('produto_id', produtoId)
    await supabase.from('estoque').delete().eq('produto_id', produtoId)
    await supabase.from('produtos').delete().eq('id', produtoId)
    console.log('\n(produto de teste e dados relacionados removidos)')
  }

  console.log(`\n${falhas === 0 ? '✓ TUDO PASSOU' : `❌ ${falhas} verificação(ões) falharam`}`)
  if (falhas > 0) process.exitCode = 1
}

main().catch((e) => {
  console.error('ERRO FATAL:', e.message)
  process.exitCode = 1
})
