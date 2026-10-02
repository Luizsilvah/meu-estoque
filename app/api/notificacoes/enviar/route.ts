import webpush from 'web-push'
import { createSupabaseServer } from '../../../lib/supabase-server'
import { createSupabaseAdmin } from '../../../lib/supabase-admin'

export async function POST(req: Request) {
  const server = await createSupabaseServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })
  webpush.setVapidDetails(
    process.env.VAPID_CONTACT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )
  const { titulo, corpo } = await req.json()

  const admin = createSupabaseAdmin()
  // Schema real: não existem colunas endpoint/keys — o objeto inteiro da
  // subscription fica no jsonb `subscription` (ver app/api/notificacoes/subscribe).
  const { data: subs, error } = await admin
    .from('push_subscriptions')
    .select('id, subscription')

  if (error) return Response.json({ erro: error.message }, { status: 500 })
  if (!subs || subs.length === 0) return Response.json({ enviadas: 0 })

  const payload = JSON.stringify({
    title: titulo ?? 'Fluxio',
    body: corpo ?? 'Você tem alertas de estoque.',
    icon: '/icon-192.png',
    url: '/',
  })

  const resultados = await Promise.allSettled(
    subs.map((s) => webpush.sendNotification(s.subscription, payload))
  )

  const enviadas = resultados.filter((r) => r.status === 'fulfilled').length
  const falhas = resultados.length - enviadas

  // Remove subscriptions inválidas (410 Gone) pelo id da linha
  const invalidos: string[] = []
  resultados.forEach((r, i) => {
    if (r.status === 'rejected') {
      const err = r.reason as { statusCode?: number }
      if (err?.statusCode === 410) invalidos.push(subs[i].id)
    }
  })
  if (invalidos.length > 0) {
    await admin
      .from('push_subscriptions')
      .delete()
      .in('id', invalidos)
  }

  return Response.json({ enviadas, falhas })
}
