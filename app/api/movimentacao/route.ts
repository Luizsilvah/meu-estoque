// Endpoint POST /api/movimentacao — registra entradas e saídas de produtos no estoque
import { createSupabaseServer } from '@/app/lib/supabase-server'
import { createSupabaseAdmin } from '@/app/lib/supabase-admin'

type ResultadoMovimentacao = { qtd_atual: number; qtd_cozinha: number; qtd_base: number | null }

export async function POST(request: Request) {
  let body: { produto_id: string; tipo: 'entrada' | 'saida'; quantidade: number; local?: 'principal' | 'cozinha'; motivo?: string; skip_stock_update?: boolean }
  try {
    body = await request.json()
  } catch {
    return Response.json({ erro: 'Body inválido' }, { status: 400 })
  }

  const { produto_id, tipo, quantidade, local, skip_stock_update } = body

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
  const usuario_id = user.id
  const usuario_nome = perfil?.nome ?? user.email?.split('@')[0] ?? null

  // Grava o registro histórico da movimentação
  const { error: erroMov } = await supabase
    .from('movimentacoes')
    .insert({
      produto_id,
      tipo,
      quantidade,
      data_hora: new Date().toISOString(),
      usuario_id,
      usuario_nome,
    })

  if (erroMov) {
    console.error('[movimentacao] erro ao inserir movimentação:', erroMov)
    return Response.json({ erro: erroMov.message }, { status: 500 })
  }

  // Entrada soma, saída subtrai
  const delta = tipo === 'entrada' ? quantidade : -quantidade

  // Quando chamado pela conferência, o /api/estoque/conferencia já atualizou o estoque
  // com os valores absolutos finais — apenas registra o histórico sem tocar no estoque
  if (skip_stock_update) {
    return Response.json({ ok: true })
  }

  // Aplica o delta em qtd_atual (e em qtd_cozinha quando é saída da cozinha) de forma
  // atômica no Postgres — leitura+cálculo+escrita em uma única transação via RPC,
  // evitando corrida entre requisições concorrentes no mesmo produto
  const deltaCozinha = tipo === 'saida' && local === 'cozinha' ? -quantidade : 0
  const { data: resultado, error: erroUpdate } = await supabase
    .rpc('estoque_aplicar_movimentacao', {
      p_produto_id: produto_id,
      p_delta_atual: delta,
      p_delta_cozinha: deltaCozinha,
    })
    .single<ResultadoMovimentacao>()

  if (erroUpdate || !resultado) {
    console.error('[movimentacao] erro ao atualizar estoque:', erroUpdate?.message)
    const status = erroUpdate?.code === 'ESTK1' ? 404 : 500
    return Response.json({ erro: erroUpdate?.message ?? 'Erro ao atualizar estoque' }, { status })
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
        const { data: subs } = await supabase.from('push_subscriptions').select('endpoint, keys')
        if (!subs?.length) return
        const { data: prod } = await supabase.from('produtos').select('nome').eq('id', produto_id).single()
        const payload = JSON.stringify({
          title: 'Estoque baixo',
          body: `${prod?.nome ?? 'Produto'} atingiu ${novaQtd} unidades (mínimo: ${qtdBase ?? 0})`,
          icon: '/icon-192.png',
          url: '/estoque',
        })
        await Promise.allSettled(
          subs.map((s) => webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload))
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
