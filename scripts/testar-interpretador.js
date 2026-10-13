// Script manual de QA — roda o interpretador do Lançamento rápido
// (app/lib/interpretarLancamento.ts) contra o catálogo REAL de produtos e
// imprime o que ele entendeu de cada frase.
//
// Sem argumento, roda os CASOS abaixo e confere tipo + lugar (✓/✗).
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

// Frase → o que se espera de cada item, na ordem: "TIPO lugar" (transferência:
// "TRANSFERENCIA origem→destino"; sem tipo: "TIPO? lugar"). Só confere tipo e
// lugar — o produto é impresso para conferir a olho.
const CASOS = [
  ['usei 10 leite cozinha', ['SAIDA cozinha']],
  ['passei 1 creme de ninho pra cozinha', ['TRANSFERENCIA principal→cozinha']],
  ['usei 20 casquina cozinha', ['SAIDA cozinha']],
  ['chegou 10 casquinha 15/01', ['ENTRADA principal']],
  ['2 cobertura choc', ['TIPO? principal']],
  ['peguei 10 leite da cozinha pra usar, passei 1 creme de ninho do principal pra cozinha, usei 20 casquinha da cozinha',
    ['SAIDA cozinha', 'TRANSFERENCIA principal→cozinha', 'SAIDA cozinha']],
  // Lugar: cozinha x principal
  ['usei 2 leite da cozinha', ['SAIDA cozinha']],
  ['chegou 10 copo', ['ENTRADA principal']],
  ['coloquei 5 açaí na cozinha', ['ENTRADA cozinha']],
  ['chegou 6 granola no freezer', ['ENTRADA principal']],
  ['tirei 2 bis da câmara', ['SAIDA principal']],
  ['usei 3 leite do depósito', ['SAIDA principal']],
  ['usei 1 bis coz', ['SAIDA cozinha']],
  // Transferência
  ['passei 3 leite pra cozinha', ['TRANSFERENCIA principal→cozinha']],
  ['levei 3 leite pra cozinha', ['TRANSFERENCIA principal→cozinha']],
  ['mandei 3 leite pra cozinha', ['TRANSFERENCIA principal→cozinha']],
  ['voltei 2 leite pro estoque', ['TRANSFERENCIA cozinha→principal']],
  ['voltei 2 leite', ['TRANSFERENCIA cozinha→principal']],
  ['levei 4 bis do freezer pra cozinha', ['TRANSFERENCIA principal→cozinha']],
  ['devolvi 2 leite pro estoque', ['TRANSFERENCIA cozinha→principal']],
  ['devolvi 2 leite', ['TIPO? principal']],
  // Herança de tipo e lugar na mesma linha
  ['usei 2 leite da cozinha, 3 bis', ['SAIDA cozinha', 'SAIDA cozinha']],
  ['usei 2 leite da cozinha, 3 bis do estoque', ['SAIDA cozinha', 'SAIDA principal']],
  ['voltei 2 leite, 1 granola', ['TRANSFERENCIA cozinha→principal', 'TRANSFERENCIA cozinha→principal']],
  ['usei 2 leite, devolvi 1 bis', ['SAIDA principal', 'TIPO? principal']],
]

function resumo(item) {
  if (!item.tipo) return `TIPO? ${item.local}`
  if (item.tipo === 'transferencia') return `TRANSFERENCIA ${item.origem}→${item.destino}`
  return `${item.tipo.toUpperCase()} ${item.local}`
}

function descrever(item) {
  const tipo = item.tipo ? item.tipo.toUpperCase() + (item.tipo_herdado ? ' (herdado)' : '') : 'TIPO?'
  const onde = item.tipo === 'transferencia' ? `${item.origem} → ${item.destino}` : item.local
  const linhas = [`  • "${item.texto_original}"`, `      ${tipo} · qtd ${item.quantidade} · ${onde}` +
    (item.data_validade ? ` · validade ${item.data_validade}` : '') + ` · termo "${item.termo}"`]
  if (item.duvida_tipo) linhas.push(`      ? ${item.duvida_tipo}`)
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

  const casos = process.argv.length > 2 ? process.argv.slice(2).map((f) => [f, null]) : CASOS
  let falhas = 0
  for (const [frase, esperado] of casos) {
    const itens = interpretarLancamento(frase, catalogo)
    const obtido = itens.map(resumo)
    const ok = !esperado || JSON.stringify(obtido) === JSON.stringify(esperado)
    if (!ok) falhas++
    console.log(`${esperado ? (ok ? '✓' : '✗') : '>'} ${frase}`)
    if (!ok) console.log(`      ESPERADO: ${esperado.join(' | ')}\n      OBTIDO:   ${obtido.join(' | ')}`)
    for (const item of itens) console.log(descrever(item))
    console.log('')
  }
  if (process.argv.length <= 2) {
    console.log(falhas ? `${falhas} de ${casos.length} frases com lugar/tipo errado` : `Todas as ${casos.length} frases com tipo e lugar certos`)
    if (falhas) process.exitCode = 1
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
