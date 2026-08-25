import { createSupabaseServer } from '../../../../lib/supabase-server'
import { createSupabaseAdmin } from '../../../../lib/supabase-admin'

// GET /api/grupos/[id]/membros — lista membros do grupo
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const server = await createSupabaseServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })
  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from('grupo_membros')
    .select('usuario_id, perfis(id, nome)')
    .eq('grupo_id', id)

  if (error) return Response.json({ erro: error.message }, { status: 500 })
  return Response.json(data)
}

// POST /api/grupos/[id]/membros — adiciona membro { usuario_id }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const server = await createSupabaseServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const usuario_id = body?.usuario_id
  if (!usuario_id) return Response.json({ erro: 'usuario_id obrigatório' }, { status: 400 })

  const admin = createSupabaseAdmin()
  const { error } = await admin
    .from('grupo_membros')
    .upsert({ grupo_id: id, usuario_id }, { onConflict: 'grupo_id,usuario_id' })

  if (error) return Response.json({ erro: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

// DELETE /api/grupos/[id]/membros?usuario_id=... — remove membro
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const server = await createSupabaseServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const usuario_id = searchParams.get('usuario_id')
  if (!usuario_id) return Response.json({ erro: 'usuario_id obrigatório' }, { status: 400 })

  const admin = createSupabaseAdmin()
  const { error } = await admin
    .from('grupo_membros')
    .delete()
    .eq('grupo_id', id)
    .eq('usuario_id', usuario_id)

  if (error) return Response.json({ erro: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
