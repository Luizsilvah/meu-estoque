import { createSupabaseAdmin } from '../../lib/supabase-admin'
import { usuarioLogado } from '../../lib/exigirPermissao'

export async function GET() {
  const user = await usuarioLogado()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })

  const supabase = createSupabaseAdmin()

  const { data, error } = await supabase
    .from('movimentacoes')
    .select('id, tipo, quantidade, data_hora, usuario_nome, produtos(nome)')
    .order('data_hora', { ascending: false })
    .limit(200)

  if (error) {
    return Response.json({ erro: error.message }, { status: 500 })
  }

  return Response.json(data)
}
