import { createSupabaseServer } from '../../lib/supabase-server'
import { createSupabaseAdmin } from '../../lib/supabase-admin'

export async function GET() {
  const server = await createSupabaseServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })

  const admin = createSupabaseAdmin()

  // Busca perfil para saber se é admin
  const { data: perfil } = await admin.from('perfis').select('perfil').eq('id', user.id).single()
  const isAdmin = perfil?.perfil === 'admin'

  let query = admin
    .from('grupos')
    .select('id, nome, criado_por, criado_em, grupo_membros(usuario_id)')
    .order('nome')

  // Admin vê todos; funcionário vê só os grupos em que é membro
  const { data, error } = await query
  if (error) return Response.json({ erro: error.message }, { status: 500 })

  const visíveis = isAdmin
    ? data
    : (data ?? []).filter((g: any) =>
        (g.grupo_membros as { usuario_id: string }[]).some((m) => m.usuario_id === user.id)
      )

  return Response.json(visíveis)
}

export async function DELETE(request: Request) {
  const server = await createSupabaseServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })

  const admin = createSupabaseAdmin()
  const { data: perfil } = await admin.from('perfis').select('perfil').eq('id', user.id).single()
  if (perfil?.perfil !== 'admin') return Response.json({ erro: 'Acesso negado' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return Response.json({ erro: 'id obrigatório' }, { status: 400 })

  const { error } = await admin.from('grupos').delete().eq('id', id)
  if (error) return Response.json({ erro: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

export async function POST(request: Request) {
  const server = await createSupabaseServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const nome = body?.nome?.trim()
  if (!nome) return Response.json({ erro: 'Nome obrigatório' }, { status: 400 })

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from('grupos')
    .insert({ nome, criado_por: user.id })
    .select()
    .single()

  if (error) return Response.json({ erro: error.message }, { status: 500 })
  return Response.json(data, { status: 201 })
}
