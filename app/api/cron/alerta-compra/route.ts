// GET /api/cron/alerta-compra — avisa os admins quantos produtos precisam
// entrar na compra de quinta-feira.
//
// SEM AGENDAMENTO ATIVO: o cron em vercel.json foi removido de propósito —
// a rota continua aqui, mas não é mais chamada automaticamente. Pra reativar
// (toda quarta 18h America/Bahia = 21h UTC), volte a adicionar em vercel.json:
//   { "crons": [{ "path": "/api/cron/alerta-compra", "schedule": "0 21 * * 3" }] }
//

// Autenticação: não há sessão de usuário aqui (é o Vercel quem chama, não um
// browser logado) — por isso o /api/cron/ é liberado no proxy.ts e a
// autorização é feita só pelo header Authorization: Bearer CRON_SECRET,
// exatamente como a documentação do Vercel Cron recomenda.
import webpush from 'web-push'
import { createSupabaseAdmin } from '../../../lib/supabase-admin'

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  // Tudo dentro de um try/catch: qualquer erro (schema errado, env var
  // faltando, webpush rejeitando por motivo inesperado etc.) vira um JSON
  // diagnosticável em vez de um 500 em branco do Next — já pegou um bug real
  // de schema (push_subscriptions não tem endpoint/keys/user_id como se
  // assumia, ver migration de correção) que só apareceu assim.
  try {
    const admin = createSupabaseAdmin()

    const { data: previsao, error: erroPrevisao } = await admin
      .from('vw_previsao_compras')
      .select('status')
      .in('status', ['CRITICO', 'COMPRAR_QUINTA'])

    if (erroPrevisao) throw new Error(`vw_previsao_compras: ${erroPrevisao.message}`)

    const total = previsao?.length ?? 0
    if (total === 0) return Response.json({ ok: true, enviadas: 0, motivo: 'Nenhum produto precisa entrar na compra' })

    // Só os admins — busca os perfis admin e filtra as subscriptions por usuario_id
    const { data: admins, error: erroAdmins } = await admin
      .from('perfis')
      .select('id')
      .eq('perfil', 'admin')
    if (erroAdmins) throw new Error(`perfis: ${erroAdmins.message}`)

    const idsAdmins = (admins ?? []).map((a) => a.id)
    if (idsAdmins.length === 0) return Response.json({ ok: true, enviadas: 0, motivo: 'Nenhum admin cadastrado' })

    // Schema real: subscription (jsonb) tem o objeto inteiro ({ endpoint, keys,
    // ... }), e a coluna de dono é usuario_id — não existem endpoint/keys/user_id
    // como colunas no topo (ver app/api/notificacoes/subscribe/route.ts).
    // Também cobre o caso de nenhuma subscription ainda ter usuario_id
    // preenchido (subscriptions criadas antes da correção deste bug): a query
    // simplesmente não acha nada e cai no "Nenhum admin com push ativado" — 200,
    // não erro.
    const { data: subs, error: erroSubs } = await admin
      .from('push_subscriptions')
      .select('id, subscription')
      .in('usuario_id', idsAdmins)
    if (erroSubs) throw new Error(`push_subscriptions: ${erroSubs.message}`)
    if (!subs?.length) return Response.json({ ok: true, enviadas: 0, motivo: 'Nenhum admin com push ativado' })

    webpush.setVapidDetails(
      process.env.VAPID_CONTACT!,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    )

    const payload = JSON.stringify({
      title: 'Compra de quinta',
      body: `${total} produto${total > 1 ? 's' : ''} precisa${total > 1 ? 'm' : ''} entrar na compra de amanhã`,
      icon: '/icon-192.png',
      url: '/compras-quinta',
    })

    // Promise.allSettled: subscription expirada (410/404) de um admin não pode
    // derrubar o envio pros outros — cada falha é só marcada pra limpeza abaixo.
    const resultados = await Promise.allSettled(
      subs.map((s) => webpush.sendNotification(s.subscription, payload))
    )
    const enviadas = resultados.filter((r) => r.status === 'fulfilled').length

    // Remove subscriptions inválidas (410 Gone ou 404) pelo id da linha —
    // mesmo padrão de /api/notificacoes/enviar
    const invalidas: string[] = []
    resultados.forEach((r, i) => {
      if (r.status === 'rejected') {
        const err = r.reason as { statusCode?: number }
        if (err?.statusCode === 410 || err?.statusCode === 404) invalidas.push(subs[i].id)
      }
    })
    if (invalidas.length > 0) {
      await admin.from('push_subscriptions').delete().in('id', invalidas)
    }

    return Response.json({ ok: true, enviadas, falhas: resultados.length - enviadas, produtosNaCompra: total })
  } catch (e) {
    const erro = e instanceof Error ? e.message : 'Erro desconhecido'
    console.error('[cron/alerta-compra] erro:', e)
    return Response.json({ ok: false, erro }, { status: 500 })
  }
}
