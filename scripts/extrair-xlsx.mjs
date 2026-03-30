import XLSX from 'xlsx'
import { randomUUID } from 'crypto'
import { writeFileSync } from 'fs'

const ARQUIVO = 'C:/Users/Luiz/Downloads/Controle_Estoque_v2 (2).xlsx'
const ABAS_FORNECEDOR = [
  'Atacadão', 'Atacadão Berimbau', 'Lucidata', 'Mascarenha',
  'Maxlimp', 'Milênio', 'Wagner', 'Willian Embalagens', 'Wilson'
]

const wb = XLSX.readFile(ARQUIVO)

const fornecedores = []
const produtos = []
const estoque = []

for (const nomeAba of ABAS_FORNECEDOR) {
  const ws = wb.Sheets[nomeAba]
  if (!ws) { console.warn(`Aba "${nomeAba}" não encontrada, pulando.`); continue }

  // linha 0 = título, linha 1 = cabeçalhos, linha 2+ = dados
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const dados = rows.slice(2).filter(r => r[1] && String(r[1]).trim() !== '')

  const fornecedorId = randomUUID()
  fornecedores.push({ id: fornecedorId, nome: nomeAba })

  for (const row of dados) {
    const nomeProduto = String(row[1]).trim()
    const unidade    = 'Pc'               // planilha não tem coluna de unidade
    const qtdAtual   = Number(row[2]) || 0
    const qtdBase    = Number(row[3]) || 0
    const qtdMax     = Number(row[4]) || 0

    const produtoId = randomUUID()
    produtos.push({ id: produtoId, nome: nomeProduto, unidade, fornecedor_id: fornecedorId })
    estoque.push({ id: randomUUID(), produto_id: produtoId, qtd_atual: qtdAtual, qtd_base: qtdBase, qtd_max: qtdMax })
  }

  console.log(`✓ ${nomeAba}: ${dados.length} produtos`)
}

// Gera SQL
const esc = v => String(v).replace(/'/g, "''")

let sql = `-- Gerado de: Controle_Estoque_v2 (2).xlsx
-- Cole no Supabase → SQL Editor → New query → Run

BEGIN;

-- 1. Fornecedores (${fornecedores.length})
INSERT INTO fornecedores (id, nome, criado_em) VALUES
${fornecedores.map(f => `  ('${f.id}', '${esc(f.nome)}', NOW())`).join(',\n')}
ON CONFLICT (id) DO NOTHING;

-- 2. Produtos (${produtos.length})
INSERT INTO produtos (id, nome, unidade, fornecedor_id, criado_em) VALUES
${produtos.map(p => `  ('${p.id}', '${esc(p.nome)}', '${esc(p.unidade)}', '${p.fornecedor_id}', NOW())`).join(',\n')}
ON CONFLICT (id) DO NOTHING;

-- 3. Estoque (${estoque.length})
INSERT INTO estoque (id, produto_id, qtd_atual, qtd_base, qtd_max, atualizado_em) VALUES
${estoque.map(e => `  ('${e.id}', '${e.produto_id}', ${e.qtd_atual}, ${e.qtd_base}, ${e.qtd_max}, NOW())`).join(',\n')}
ON CONFLICT (id) DO NOTHING;

COMMIT;
`

const destino = 'C:/Users/Luiz/Desktop/dados_estoque.sql'
writeFileSync(destino, sql, 'utf8')

console.log(`\n✓ ${fornecedores.length} fornecedores`)
console.log(`✓ ${produtos.length} produtos`)
console.log(`✓ ${estoque.length} registros de estoque`)
console.log(`✓ Arquivo salvo em: ${destino}`)
