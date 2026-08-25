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
    .upsert(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      { onConflict: 'endpoint' }
    )

  if (error) return Response.json({ erro: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
