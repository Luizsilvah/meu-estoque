// Endpoint GET /api/estoque — retorna todos os itens do estoque com dados do produto e fornecedor
import { createSupabaseAdmin } from '@/app/lib/supabase-admin'
import { createSupabaseServer } from '@/app/lib/supabase-server'

export async function GET() {
  const server = await createSupabaseServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })
  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from('estoque')
    .select('*, produtos(id, nome, unidade, fornecedor_id, foto_url, codigo_barras, preco_custo, fornecedores(nome))')

  if (error) return Response.json({ erro: error.message }, { status: 500 })
  return Response.json(data)
}
