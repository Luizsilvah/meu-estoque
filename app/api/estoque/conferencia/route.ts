import { createSupabaseAdmin } from '@/app/lib/supabase-admin'
import { createSupabaseServer } from '@/app/lib/supabase-server'

export async function PATCH(request: Request) {
  const server = await createSupabaseServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const { estoque_id, qtd_atual, qtd_cozinha } = body ?? {}

  if (!estoque_id || qtd_atual == null) {
    return Response.json({ erro: 'estoque_id e qtd_atual são obrigatórios' }, { status: 400 })
  }

  // Valores finais recebidos no body — SET direto, sem somar ao valor existente
  const setQtdAtual = Math.max(0, Number(qtd_atual))
  const setQtdCozinha = qtd_cozinha != null
    ? Math.max(0, Math.min(Number(qtd_cozinha), setQtdAtual))
    : null

  const supabase = createSupabaseAdmin()

  const campos: Record<string, unknown> = {
    qtd_atual: setQtdAtual,
    atualizado_em: new Date().toISOString(),
  }
  if (setQtdCozinha !== null) campos.qtd_cozinha = setQtdCozinha

  const { error } = await supabase.from('estoque').update(campos).eq('id', estoque_id)
  if (error) return Response.json({ erro: error.message }, { status: 500 })

  return Response.json({ ok: true, qtd_atual: setQtdAtual, qtd_cozinha: setQtdCozinha })
}
