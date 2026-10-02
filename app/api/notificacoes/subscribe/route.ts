import { createSupabaseAdmin } from '../../../lib/supabase-admin'
import { createSupabaseServer } from '../../../lib/supabase-server'

export async function POST(req: Request) {
  const server = await createSupabaseServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })
  const subscription = await req.json()
  if (!subscription?.endpoint || !subscription?.keys) {
    return Response.json({ erro: 'Subscription inválida' }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { error } = await admin
    .from('push_subscriptions')
    // user_id vai junto para permitir filtrar só admins (ex.: alerta de compra
    // de quarta-feira). Subscriptions antigas são re-enviadas aqui automaticamente
    // (ver app/page.tsx) e ganham o user_id sem o usuário precisar reautorizar nada.
    .upsert(
      { endpoint: subscription.endpoint, keys: subscription.keys, user_id: user.id },
      { onConflict: 'endpoint' }
    )

  if (error) return Response.json({ erro: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
