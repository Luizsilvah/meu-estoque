// GET /api/cron/alerta-compra — chamado pelo Vercel Cron toda quarta 18h
// (America/Bahia), ver vercel.json. Avisa os admins quantos produtos
// precisam entrar na compra de quinta-feira.
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

  const admin = createSupabaseAdmin()

  const { data: previsao, error: erroPrevisao } = await admin
    .from('vw_previsao_compras')
    .select('status')
    .in('status', ['CRITICO', 'COMPRAR_QUINTA'])

  if (erroPrevisao) return Response.json({ erro: erroPrevisao.message }, { status: 500 })

  const total = previsao?.length ?? 0
  if (total === 0) return Response.json({ enviadas: 0, motivo: 'Nenhum produto precisa entrar na compra' })

  // Só os admins — busca os perfis admin e filtra as subscriptions por user_id
  const { data: admins, error: erroAdmins } = await admin
    .from('perfis')
    .select('id')
    .eq('perfil', 'admin')
  if (erroAdmins) return Response.json({ erro: erroAdmins.message }, { status: 500 })

  const idsAdmins = (admins ?? []).map((a) => a.id)
  if (idsAdmins.length === 0) return Response.json({ enviadas: 0, motivo: 'Nenhum admin cadastrado' })

  const { data: subs, error: erroSubs } = await admin
    .from('push_subscriptions')
    .select('endpoint, keys')
    .in('user_id', idsAdmins)
  if (erroSubs) return Response.json({ erro: erroSubs.message }, { status: 500 })
  if (!subs?.length) return Response.json({ enviadas: 0, motivo: 'Nenhum admin com push ativado' })

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

  const resultados = await Promise.allSettled(
    subs.map((s) => webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload))
  )
  const enviadas = resultados.filter((r) => r.status === 'fulfilled').length

  // Remove subscriptions inválidas (410 Gone), mesmo padrão de /api/notificacoes/enviar
  const invalidas: string[] = []
  resultados.forEach((r, i) => {
    if (r.status === 'rejected') {
      const err = r.reason as { statusCode?: number }
      if (err?.statusCode === 410) invalidas.push(subs[i].endpoint)
    }
  })
  if (invalidas.length > 0) {
    await admin.from('push_subscriptions').delete().in('endpoint', invalidas)
  }

  return Response.json({ enviadas, falhas: resultados.length - enviadas, produtosNaCompra: total })
}
