// Endpoint GET /api/estoque — retorna todos os itens do estoque com dados do produto e fornecedor
import { createSupabaseAdmin } from '@/app/lib/supabase-admin'
import { createSupabaseServer } from '@/app/lib/supabase-server'

export async function GET() {
  const server = await createSupabaseServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })
  const supabase = createSupabaseAdmin()
  // Colunas explícitas em vez de '*' — essa é a rota mais chamada do app (quase toda
  // página busca o estoque inteiro), então o payload importa. Lista conferida contra
  // o uso real nos 7 lugares que consomem esta rota (checklist, códigos, conferência,
  // estoque, movimentação, nota, transferência); atualizado_em e qualquer outra coluna
  // da tabela não aparecem em nenhum deles.
  const { data, error } = await supabase
    .from('estoque')
    .select('id, produto_id, qtd_atual, qtd_base, qtd_max, qtd_cozinha, produtos(id, nome, unidade, fornecedor_id, foto_url, codigo_barras, preco_custo, controla_validade, fornecedores(nome))')

  if (error) return Response.json({ erro: error.message }, { status: 500 })
  return Response.json(data)
}
