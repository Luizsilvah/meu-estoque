// Script manual de QA — roda o interpretador do Lançamento rápido
// (app/lib/interpretarLancamento.ts) contra o catálogo REAL de produtos e
// imprime o que ele entendeu de cada frase.
//
// SÓ LEITURA: faz um select em estoque/produtos e mais nada — não grava nada.
// O .ts é transpilado na hora com o typescript que já está nas devDependencies.
//
// Roda com: node scripts/testar-interpretador.js
//      ou:  node scripts/testar-interpretador.js "usei 3 casquinha cozinha"

const fs = require('fs')
const path = require('path')
const Module = require('module')
const ts = require('typescript')
const { createClient } = require('@supabase/supabase-js')

const env = {}
for (const line of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2]
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

function carregarInterpretador() {
  const arquivo = path.join(__dirname, '..', 'app', 'lib', 'interpretarLancamento.ts')
  const { outputText } = ts.transpileModule(fs.readFileSync(arquivo, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  })
  const mod = new Module(arquivo)
  mod._compile(outputText, arquivo)
  return mod.exports
}

const FRASES = [
  'usei 10 leite cozinha',
  'passei 1 creme de ninho pra cozinha',
  'usei 20 casquina cozinha',
  'chegou 10 casquinha 15/01',
  '2 cobertura choc',
  'peguei 10 leite da cozinha pra usar, passei 1 creme de ninho do principal pra cozinha, usei 20 casquinha da cozinha',
]

function descrever(item) {
  const tipo = item.tipo ? item.tipo.toUpperCase() + (item.tipo_herdado ? ' (herdado)' : '') : 'TIPO?'
  const onde = item.tipo === 'transferencia' ? `${item.origem} → ${item.destino}` : item.local
  const linhas = [`  • "${item.texto_original}"`, `      ${tipo} · qtd ${item.quantidade} · ${onde}` +
    (item.data_validade ? ` · validade ${item.data_validade}` : '') + ` · termo "${item.termo}"`]
  if (item.produto_id) {
    linhas.push(`      ✓ ${item.produto_nome}  (confiança ${item.confianca.toFixed(2)})`)
  } else if (item.candidatos.length) {
    linhas.push(`      QUAL? ` + item.candidatos.map((c) => `${c.nome} (${c.score.toFixed(2)})`).join(' | '))
  } else {
    linhas.push(`      ✗ não reconhecido`)
  }
  return linhas.join('\n')
}

async function main() {
  const { interpretarLancamento } = carregarInterpretador()
  const { data, error } = await supabase.from('estoque').select('produto_id, produtos(nome)')
  if (error) throw error
  const catalogo = data.filter((d) => d.produtos?.nome).map((d) => ({ produto_id: d.produto_id, nome: d.produtos.nome }))
  console.log(`Catálogo: ${catalogo.length} produtos (só leitura)\n`)

  const frases = process.argv.length > 2 ? process.argv.slice(2) : FRASES
  for (const frase of frases) {
    console.log(`> ${frase}`)
    for (const item of interpretarLancamento(frase, catalogo)) console.log(descrever(item))
    console.log('')
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
