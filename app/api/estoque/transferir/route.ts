import { createSupabaseAdmin } from '@/app/lib/supabase-admin'
import { createSupabaseServer } from '@/app/lib/supabase-server'

type ResultadoTransferir = { qtd_atual: number; qtd_cozinha: number }

export async function POST(request: Request) {
  const server = await createSupabaseServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })
  let body: { produto_id: string; quantidade: number; direction?: 'cozinha' | 'principal' }
  try { body = await request.json() } catch {
    return Response.json({ erro: 'Body inválido' }, { status: 400 })
  }

  const { produto_id, quantidade, direction = 'cozinha' } = body
  if (!produto_id || !quantidade || quantidade <= 0) {
    return Response.json({ erro: 'produto_id e quantidade > 0 são obrigatórios' }, { status: 400 })
  }

  const supabase = createSupabaseAdmin()

  // Leitura, validação de saldo e escrita em uma única transação atômica no Postgres —
  // evita que duas transferências concorrentes do mesmo produto validem contra o
  // mesmo saldo "antigo" e juntas ultrapassem o disponível (oversell)
  const { data: resultado, error: erro } = await supabase
    .rpc('estoque_transferir', {
      p_produto_id: produto_id,
      p_quantidade: quantidade,
      p_direction: direction,
    })
    .single<ResultadoTransferir>()

  if (erro || !resultado) {
    const status = erro?.code === 'ESTK1' ? 404 : erro?.code === 'ESTK2' ? 400 : 500
    return Response.json({ erro: erro?.message ?? 'Erro ao transferir' }, { status })
  }

  return Response.json({ ok: true, qtd_cozinha: resultado.qtd_cozinha })
}
