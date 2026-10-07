// Endpoint POST /api/movimentacao — registra entradas e saídas de produtos no estoque.
// Quantidade, histórico e lotes de validade vão numa única chamada à função
// movimentacao_registrar (1 transação no banco) — ver
// supabase/migrations/20261006120000_movimentacao_registrar.sql. Antes, o
// histórico, o estoque e cada lote eram gravados em chamadas separadas, e uma
// falha no meio deixava qtd_atual diferente da soma dos lotes.
import { createSupabaseServer } from '@/app/lib/supabase-server'
import { createSupabaseAdmin } from '@/app/lib/supabase-admin'

type ResultadoMovimentacao = { qtd_atual: number; qtd_cozinha: number; qtd_base: number | null }
type LoteAdd = { data_validade: string; quantidade: number }
type LoteRemover = { validade_id: string; quantidade: number }

export async function POST(request: Request) {
  let body: {
    produto_id: string
    tipo: 'entrada' | 'saida'
    quantidade: number
    local?: 'principal' | 'cozinha'
    lotes_add?: LoteAdd[]
    lotes_remover?: LoteRemover[]
  }
  try {
    body = await request.json()
  } catch {
    return Response.json({ erro: 'Body inválido' }, { status: 400 })
  }

  const { produto_id, tipo, quantidade, local, lotes_add, lotes_remover } = body

  // Validação dos campos obrigatórios
  if (!produto_id || !tipo || !quantidade || quantidade <= 0) {
    return Response.json({ erro: 'Campos obrigatórios: produto_id, tipo, quantidade > 0' }, { status: 400 })
  }
  if (tipo !== 'entrada' && tipo !== 'saida') {
    return Response.json({ erro: 'tipo deve ser "entrada" ou "saida"' }, { status: 400 })
  }

  // Identifica o usuário logado — obrigatório para registrar movimentação
  const serverClient = await createSupabaseServer()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })

  const supabase = createSupabaseAdmin()

  // Busca o nome amigável do perfil; usa email como fallback
  const { data: perfil } = await supabase
    .from('perfis')
    .select('nome')
    .eq('id', user.id)
    .single()
  const usuario_nome = perfil?.nome ?? user.email?.split('@')[0] ?? null

  // Saída da cozinha também baixa qtd_cozinha; o resto só mexe em qtd_atual
  const deltaCozinha = tipo === 'saida' && local === 'cozinha' ? -quantidade : 0
  const { data: resultado, error } = await supabase
    .rpc('movimentacao_registrar', {
      p_produto_id: produto_id,
      p_tipo: tipo,
      p_quantidade: Math.floor(Number(quantidade)),
      p_delta_cozinha: deltaCozinha,
      p_lotes_add: Array.isArray(lotes_add) ? lotes_add : [],
      p_lotes_remover: Array.isArray(lotes_remover) ? lotes_remover : [],
      p_usuario_id: user.id,
      p_usuario_nome: usuario_nome,
    })
    .single<ResultadoMovimentacao>()

  if (error || !resultado) {
    console.error('[movimentacao] erro ao registrar:', error?.message)
    // Erros de validação da própria função (MOVxx, CNFxx de lote) são erro do
    // usuário — 400; produto inexistente (ESTK1) — 404; o resto — 500.
    const code = error?.code ?? ''
    const status = code === 'ESTK1' ? 404 : code.startsWith('MOV') || code.startsWith('CNF') ? 400 : 500
    return Response.json({ erro: error?.message ?? 'Erro ao registrar movimentação' }, { status })
  }

  const { qtd_atual: novaQtd, qtd_cozinha: novaQtdCozinha, qtd_base: qtdBase } = resultado

  // Dispara push se saída levou o estoque ao mínimo ou abaixo
  if (tipo === 'saida' && novaQtd <= (qtdBase ?? 0)) {
    void (async () => {
      try {
        const webpush = (await import('web-push')).default
        webpush.setVapidDetails(
          process.env.VAPID_CONTACT!,
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
          process.env.VAPID_PRIVATE_KEY!
        )
        // Schema real: subscription (jsonb) tem o objeto inteiro — não há
        // colunas endpoint/keys no topo (ver app/api/notificacoes/subscribe)
        const { data: subs } = await supabase.from('push_subscriptions').select('subscription')
        if (!subs?.length) return
        const { data: prod } = await supabase.from('produtos').select('nome').eq('id', produto_id).single()
        const payload = JSON.stringify({
          title: 'Estoque baixo',
          body: `${prod?.nome ?? 'Produto'} atingiu ${novaQtd} unidades (mínimo: ${qtdBase ?? 0})`,
          icon: '/icon-192.png',
          url: '/estoque',
        })
        await Promise.allSettled(
          subs.map((s) => webpush.sendNotification(s.subscription, payload))
        )
      } catch { /* notificação é best-effort */ }
    })()
  }

  return Response.json({
    ok: true,
    qtd_atual: novaQtd,
    qtd_cozinha: novaQtdCozinha,
  })
}
