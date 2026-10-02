// Script manual de QA — compara o resultado do caminho ANTIGO (passos separados,
// como o /api/nota/lancar fazia antes) contra o caminho NOVO (1 chamada à função
// nota_lancar_item) rodando os dois de verdade contra o banco, em dois produtos
// de teste descartáveis, e conferindo se o estado final é idêntico.
//
// PRÉ-REQUISITO: a migration supabase/migrations/20261001120000_previsao_compra_quinta.sql
// precisa já estar aplicada (é dela que vem a função nota_lancar_item). Sem isso
// o passo "NOVO" vai falhar com "function nota_lancar_item does not exist".
//
// Não apaga nada que já existia — cria produtos/estoque/validades/movimentações
// novos com nome bem marcado ("[TESTE QA nota_lancar]") e remove tudo no final,
// em qualquer caso (sucesso ou erro).
//
// Rodar com: node scripts/testar-nota-lancar-rpc.js

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const env = {}
for (const line of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2]
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const MARCA = '[TESTE QA nota_lancar]'
const QTD_INICIAL = 10
const QTD_BASE = 2
const QTD_MAX = 20
const QUANTIDADE_ENTRADA = 7
const LOTES = [
  { data_validade: '2026-12-31', quantidade: 4 },
  { data_validade: '2027-01-15', quantidade: 3 },
]

async function criarProdutoTeste(nome, fornecedor_id) {
  const { data: produto, error: e1 } = await supabase
    .from('produtos').insert({ nome, fornecedor_id, unidade: 'un' }).select('id').single()
  if (e1) throw new Error(`criar produto ${nome}: ${e1.message}`)
  const { error: e2 } = await supabase
    .from('estoque').insert({ produto_id: produto.id, qtd_atual: QTD_INICIAL, qtd_base: QTD_BASE, qtd_max: QTD_MAX })
  if (e2) throw new Error(`criar estoque ${nome}: ${e2.message}`)
  return produto.id
}

// Cópia fiel do caminho ANTIGO (o que o route.ts fazia antes desta mudança)
async function lancarCaminhoAntigo(produto_id, usuario_id, usuario_nome) {
  const { error: erroMov } = await supabase.from('movimentacoes').insert({
    produto_id, tipo: 'entrada', quantidade: QUANTIDADE_ENTRADA, data_hora: new Date().toISOString(), usuario_id, usuario_nome,
  })
  if (erroMov) throw new Error(erroMov.message)

  const { error: erroRpc } = await supabase.rpc('estoque_aplicar_movimentacao', {
    p_produto_id: produto_id, p_delta_atual: QUANTIDADE_ENTRADA, p_delta_cozinha: 0,
  }).single()
  if (erroRpc) throw new Error(erroRpc.message)

  const { data: valsExistentes } = await supabase.from('validades').select('id, data_validade, quantidade').eq('produto_id', produto_id)
  const porData = new Map((valsExistentes ?? []).map((v) => [v.data_validade, v]))
  for (const l of LOTES) {
    const existente = porData.get(l.data_validade)
    if (existente) {
      await supabase.from('validades').update({ quantidade: existente.quantidade + l.quantidade }).eq('id', existente.id)
    } else {
      await supabase.from('validades').insert({ produto_id, data_validade: l.data_validade, quantidade: l.quantidade })
    }
  }
}

// Caminho NOVO: 1 chamada RPC só
async function lancarCaminhoNovo(produto_id, usuario_id, usuario_nome) {
  const { error } = await supabase.rpc('nota_lancar_item', {
    p_produto_id: produto_id,
    p_novo_nome: null, p_novo_fornecedor_id: null, p_novo_unidade: null,
    p_novo_codigo_barras: null, p_novo_preco_custo: null, p_novo_qtd_base: null, p_novo_qtd_max: null,
    p_quantidade: QUANTIDADE_ENTRADA, p_usuario_id: usuario_id, p_usuario_nome: usuario_nome,
    p_lotes: LOTES,
  }).single()
  if (error) throw new Error(error.message)
}

async function estadoFinal(produto_id) {
  const { data: estoque } = await supabase.from('estoque').select('qtd_atual, qtd_cozinha').eq('produto_id', produto_id).single()
  const { data: movs } = await supabase.from('movimentacoes').select('tipo, quantidade').eq('produto_id', produto_id)
  const { data: validades } = await supabase.from('validades').select('data_validade, quantidade').eq('produto_id', produto_id).order('data_validade')
  return { qtd_atual: estoque?.qtd_atual, movs: movs?.map((m) => `${m.tipo}:${m.quantidade}`).sort(), validades }
}

async function limpar(produto_id) {
  await supabase.from('validades').delete().eq('produto_id', produto_id)
  await supabase.from('movimentacoes').delete().eq('produto_id', produto_id)
  await supabase.from('estoque').delete().eq('produto_id', produto_id)
  await supabase.from('produtos').delete().eq('id', produto_id)
}

async function main() {
  const { data: fornecedor, error: erroForn } = await supabase.from('fornecedores').select('id').limit(1).single()
  if (erroForn || !fornecedor) throw new Error('Nenhum fornecedor encontrado para o teste — crie um fornecedor antes de rodar este script.')

  // Usa o primeiro admin cadastrado como "usuário" do teste (só pra preencher usuario_id/usuario_nome)
  const { data: admin, error: erroAdmin } = await supabase.from('perfis').select('id, nome').eq('perfil', 'admin').limit(1).single()
  if (erroAdmin || !admin) throw new Error('Nenhum admin encontrado para o teste.')

  let idLegado = null
  let idNovo = null
  try {
    idLegado = await criarProdutoTeste(`${MARCA} legado`, fornecedor.id)
    idNovo = await criarProdutoTeste(`${MARCA} novo`, fornecedor.id)

    await lancarCaminhoAntigo(idLegado, admin.id, admin.nome)
    await lancarCaminhoNovo(idNovo, admin.id, admin.nome)

    const [estadoLegado, estadoNovo] = await Promise.all([estadoFinal(idLegado), estadoFinal(idNovo)])

    console.log('Estado final (legado):', JSON.stringify(estadoLegado, null, 2))
    console.log('Estado final (novo):  ', JSON.stringify(estadoNovo, null, 2))

    const iguais =
      estadoLegado.qtd_atual === estadoNovo.qtd_atual &&
      JSON.stringify(estadoLegado.movs) === JSON.stringify(estadoNovo.movs) &&
      JSON.stringify(estadoLegado.validades) === JSON.stringify(estadoNovo.validades)

    if (iguais) {
      console.log('\n✓ PASSOU — caminho antigo e novo produzem exatamente o mesmo estado final.')
    } else {
      console.error('\n❌ FALHOU — os estados finais são diferentes. Veja acima.')
      process.exitCode = 1
    }
  } finally {
    if (idLegado) await limpar(idLegado)
    if (idNovo) await limpar(idNovo)
    console.log('\n(produtos de teste removidos)')
  }
}

main().catch((e) => { console.error('ERRO:', e.message); process.exit(1) })
