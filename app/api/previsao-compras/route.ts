// Endpoint GET /api/previsao-compras — status de cada produto (CRITICO /
// COMPRAR_QUINTA / OK) com base na vw_previsao_compras (cálculo feito no
// banco, ver supabase/migrations/20261001120000_previsao_compra_quinta.sql).
// Usado pelo badge da tela de Estoque e pela página "Lista de Compras da Quinta".
import { createSupabaseAdmin } from '../../lib/supabase-admin'
import { createSupabaseServer } from '../../lib/supabase-server'

export type ItemPrevisaoCompra = {
  produto_id: string
  nome: string
  unidade: string
  fornecedor_id: string | null
  fornecedor: string | null
  qtd_atual: number
  estoque_minimo: number
  dias_ate_quinta: number
  consumo_medio_diario: number
  estoque_previsto: number
  qtd_sugerida: number
  status: 'CRITICO' | 'COMPRAR_QUINTA' | 'OK'
}

export async function GET() {
  const server = await createSupabaseServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from('vw_previsao_compras')
    .select('*')
    .order('status', { ascending: true }) // CRITICO < COMPRAR_QUINTA < OK (ordem alfabética ajuda)

  if (error) return Response.json({ erro: error.message }, { status: 500 })

  return Response.json(data as ItemPrevisaoCompra[])
}
