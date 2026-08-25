import { createSupabaseServer } from '../../lib/supabase-server'
import { createSupabaseAdmin } from '../../lib/supabase-admin'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const grupo_id = searchParams.get('grupo_id')

  const admin = createSupabaseAdmin()
  let query = admin
    .from('mensagens')
    .select('id, usuario_id, usuario_nome, texto, criado_em, grupo_id, imagem_url')
    .order('criado_em', { ascending: true })
    .limit(100)

  if (grupo_id) query = query.eq('grupo_id', grupo_id)
  else query = query.is('grupo_id', null)

  const { data, error } = await query
  if (error) return Response.json({ erro: error.message }, { status: 500 })
  return Response.json(data)
}

export async function POST(request: Request) {
  const server = await createSupabaseServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const texto = body?.texto?.trim() ?? ''
  const grupo_id = body?.grupo_id ?? null
  const imagem_url = body?.imagem_url ?? null
  if (!texto && !imagem_url) return Response.json({ erro: 'Mensagem vazia' }, { status: 400 })

  const admin = createSupabaseAdmin()
  const { data: perfil } = await admin.from('perfis').select('nome').eq('id', user.id).single()
  const usuario_nome = perfil?.nome ?? user.email ?? 'Usuário'

  const { data, error } = await admin
    .from('mensagens')
    .insert({ usuario_id: user.id, usuario_nome, texto: texto || '', grupo_id, imagem_url })
    .select()
    .single()

  if (error) return Response.json({ erro: error.message }, { status: 500 })
  return Response.json(data, { status: 201 })
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

  const { error } = await admin.from('mensagens').delete().eq('id', id)
  if (error) return Response.json({ erro: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
