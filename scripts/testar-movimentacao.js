// Script manual de QA — testa a função movimentacao_registrar direto contra o
// banco real, com um produto/estoque descartáveis criados e removidos aqui.
//
// PRÉ-REQUISITO: a migration supabase/migrations/20261006120000_movimentacao_registrar.sql
// precisa já estar aplicada.
//
// Setup: produto com 5 un e 1 lote A (5 un).
// Cenários:
//   (a) entrada +3 com 2 lotes novos (B=1, C=2)
//       → qtd_atual = 8, soma dos lotes = 8, movimentação entrada/motivo null
//   (b) saída -2 escolhendo o lote A (o que vence primeiro)
//       → qtd_atual = 6, lote A = 3, soma dos lotes = 6
//   (c) saída de 4 tirando 4 do lote B (que só tem 1)
//       → erro CNF06 e NADA alterado (qtd, lotes, movimentações)
//   (d) extras: saída maior que o estoque → MOV02; entrada sem lote em
//       produto com lotes → MOV03; ambos sem alterar nada
//
// Roda com: node scripts/testar-movimentacao.js

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const env = {}
for (const line of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2]
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const MARCA = '[TESTE QA movimentacao_registrar]'
const DATA_A = '2026-12-31'
const DATA_B = '2027-01-15'
const DATA_C = '2027-02-20'

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
  const { count: nMov } = await supabase.from('movimentacoes').select('id', { count: 'exact', head: true }).eq('produto_id', produtoId)
  const somaLotes = (lotes ?? []).reduce((s, l) => s + l.quantidade, 0)
  return { qtd_atual: estoque?.qtd_atual, qtd_cozinha: estoque?.qtd_cozinha, lotes: lotes ?? [], somaLotes, nMov }
}

function mesmoEstado(a, b) {
  return a.qtd_atual === b.qtd_atual && a.qtd_cozinha === b.qtd_cozinha && a.nMov === b.nMov
    && JSON.stringify(a.lotes) === JSON.stringify(b.lotes)
}

let usuario = null
async function chamarRpc({ tipo, quantidade, deltaCozinha = 0, lotesAdd = [], lotesRemover = [] }) {
  return supabase.rpc('movimentacao_registrar', {
    p_produto_id: produtoId,
    p_tipo: tipo,
    p_quantidade: quantidade,
    p_delta_cozinha: deltaCozinha,
    p_lotes_add: lotesAdd,
    p_lotes_remover: lotesRemover,
    p_usuario_id: usuario.id,
    p_usuario_nome: usuario.nome ?? 'Teste QA',
  }).single()
}

async function main() {
  const { data: fornecedor, error: erroForn } = await supabase.from('fornecedores').select('id').limit(1).single()
  if (erroForn || !fornecedor) throw new Error('Nenhum fornecedor encontrado — crie um fornecedor antes de rodar este script.')

  const { data: perfil, error: erroPerfil } = await supabase.from('perfis').select('id, nome').limit(1).single()
  if (erroPerfil || !perfil) throw new Error('Nenhum usuário em perfis encontrado para usar como usuario_id de teste.')
  usuario = perfil

  const { data: produto, error: erroProduto } = await supabase
    .from('produtos').insert({ nome: `${MARCA} produto`, fornecedor_id: fornecedor.id, unidade: 'un' }).select('id').single()
  if (erroProduto) throw new Error(`criar produto: ${erroProduto.message}`)
  produtoId = produto.id

  try {
    const { error: erroEstoque } = await supabase
      .from('estoque').insert({ produto_id: produtoId, qtd_atual: 5, qtd_cozinha: 0, qtd_base: 2, qtd_max: 20 })
    if (erroEstoque) throw new Error(`criar estoque: ${erroEstoque.message}`)

    const { data: loteA, error: erroLote } = await supabase
      .from('validades').insert({ produto_id: produtoId, data_validade: DATA_A, quantidade: 5 }).select('id').single()
    if (erroLote) throw new Error(`criar lote A: ${erroLote.message}`)

    console.log(`Produto de teste: ${produtoId} (5 un, lote A ${DATA_A} = 5)\n`)

    // ── (a) entrada +3 com 2 lotes ─────────────────────────────────────
    console.log('── (a) entrada +3 com 2 lotes (B=1, C=2) ──')
    const { data: resA, error: erroA } = await chamarRpc({
      tipo: 'entrada', quantidade: 3,
      lotesAdd: [{ data_validade: DATA_B, quantidade: 1 }, { data_validade: DATA_C, quantidade: 2 }],
    })
    checar('(a) RPC não retornou erro', !erroA, erroA?.message)
    checar('(a) retornou qtd_atual = 8', resA?.qtd_atual === 8, `veio ${resA?.qtd_atual}`)
    const estA = await estadoAtual()
    checar('(a) qtd_atual no banco = 8', estA.qtd_atual === 8, `veio ${estA.qtd_atual}`)
    checar('(a) soma dos lotes = 8', estA.somaLotes === 8, `veio ${estA.somaLotes} (${JSON.stringify(estA.lotes)})`)
    checar('(a) 3 lotes (A=5, B=1, C=2)', estA.lotes.map((l) => l.quantidade).join(',') === '5,1,2', JSON.stringify(estA.lotes))
    const { data: movA } = await supabase.from('movimentacoes').select('tipo, quantidade, motivo').eq('produto_id', produtoId).order('data_hora', { ascending: false }).limit(1)
    checar('(a) movimentação entrada, 3, motivo null', movA?.[0]?.tipo === 'entrada' && movA?.[0]?.quantidade === 3 && movA?.[0]?.motivo === null, JSON.stringify(movA?.[0]))

    // ── (b) saída -2 escolhendo o lote A (FEFO) ───────────────────────
    console.log('\n── (b) saída -2 escolhendo o lote A ──')
    const { data: resB, error: erroB } = await chamarRpc({
      tipo: 'saida', quantidade: 2, lotesRemover: [{ validade_id: loteA.id, quantidade: 2 }],
    })
    checar('(b) RPC não retornou erro', !erroB, erroB?.message)
    checar('(b) retornou qtd_atual = 6', resB?.qtd_atual === 6, `veio ${resB?.qtd_atual}`)
    const estB = await estadoAtual()
    checar('(b) qtd_atual no banco = 6', estB.qtd_atual === 6, `veio ${estB.qtd_atual}`)
    checar('(b) soma dos lotes = 6', estB.somaLotes === 6, `veio ${estB.somaLotes}`)
    checar('(b) lote A caiu para 3', estB.lotes.find((l) => l.id === loteA.id)?.quantidade === 3, JSON.stringify(estB.lotes))
    const { data: movB } = await supabase.from('movimentacoes').select('tipo, quantidade, motivo').eq('produto_id', produtoId).order('data_hora', { ascending: false }).limit(1)
    checar('(b) movimentação saida, 2, motivo null', movB?.[0]?.tipo === 'saida' && movB?.[0]?.quantidade === 2 && movB?.[0]?.motivo === null, JSON.stringify(movB?.[0]))

    // ── (c) saída maior que o lote ────────────────────────────────────
    console.log('\n── (c) saída de 4 tirando 4 do lote B (que tem 1) — erro e nada alterado ──')
    const loteB = estB.lotes.find((l) => l.data_validade === DATA_B)
    const antesC = await estadoAtual()
    const { error: erroC } = await chamarRpc({
      tipo: 'saida', quantidade: 4, lotesRemover: [{ validade_id: loteB.id, quantidade: 4 }],
    })
    checar('(c) RPC retornou erro', !!erroC, 'não retornou erro nenhum')
    checar('(c) erro é CNF06', erroC?.code === 'CNF06', `código ${erroC?.code} — ${erroC?.message}`)
    checar('(c) nada alterado (qtd, lotes, movimentações)', mesmoEstado(antesC, await estadoAtual()))

    // ── (d) extras ────────────────────────────────────────────────────
    console.log('\n── (d) extras: estoque insuficiente / entrada sem lote ──')
    const antesD = await estadoAtual()
    const { error: erroD1 } = await chamarRpc({
      tipo: 'saida', quantidade: 7, lotesRemover: [{ validade_id: loteA.id, quantidade: 3 }, { validade_id: loteB.id, quantidade: 1 }],
    })
    checar('(d1) saída maior que o estoque → MOV02', erroD1?.code === 'MOV02', `código ${erroD1?.code} — ${erroD1?.message}`)
    const { error: erroD2 } = await chamarRpc({ tipo: 'entrada', quantidade: 1 })
    checar('(d2) entrada sem lote em produto com lotes → MOV03', erroD2?.code === 'MOV03', `código ${erroD2?.code} — ${erroD2?.message}`)
    checar('(d) nada alterado', mesmoEstado(antesD, await estadoAtual()))
  } finally {
    await supabase.from('validades').delete().eq('produto_id', produtoId)
    await supabase.from('movimentacoes').delete().eq('produto_id', produtoId)
    await supabase.from('estoque').delete().eq('produto_id', produtoId)
    await supabase.from('produtos').delete().eq('id', produtoId)
    const { count } = await supabase.from('produtos').select('id', { count: 'exact', head: true }).eq('id', produtoId)
    console.log(`\n(produto de teste e dados relacionados removidos — sobrou ${count ?? '?'} produto)`)
  }

  console.log(`\n${falhas === 0 ? '✓ TUDO PASSOU' : `❌ ${falhas} verificação(ões) falharam`}`)
  if (falhas > 0) process.exitCode = 1
}

main().catch((e) => {
  console.error('ERRO FATAL:', e.message)
  process.exitCode = 1
})
