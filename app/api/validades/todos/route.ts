import { createSupabaseAdmin } from '../../../lib/supabase-admin'
import { createSupabaseServer } from '../../../lib/supabase-server'

export async function GET() {
  const server = await createSupabaseServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })
  const admin = createSupabaseAdmin()
  const [{ data, error }, { data: semControle, error: erroProdutos }] = await Promise.all([
    admin
      .from('validades')
      .select('id, produto_id, data_validade, quantidade')
      .order('data_validade', { ascending: true }),
    admin.from('produtos').select('id').eq('controla_validade', false),
  ])

  if (error) return Response.json({ erro: error.message }, { status: 500 })
  if (erroProdutos) return Response.json({ erro: erroProdutos.message }, { status: 500 })
  // Produto que não controla validade não tem lote (são apagados ao desligar);
  // se sobrou algum, não aparece em lugar nenhum (Estoque, Vencendo, Movimentação...).
  const ignorar = new Set((semControle ?? []).map((p) => p.id as string))
  return Response.json((data ?? []).filter((v) => !ignorar.has(v.produto_id as string)))
}
