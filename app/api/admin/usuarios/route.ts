import { createSupabaseAdmin } from '../../../lib/supabase-admin'
import { createSupabaseServer } from '../../../lib/supabase-server'

export async function POST(request: Request) {
  // 1. Identifica o usuário pela sessão (server client com cookies)
  const serverClient = await createSupabaseServer()
  const { data: { user } } = await serverClient.auth.getUser()

  if (!user) {
    return Response.json({ erro: 'Não autenticado' }, { status: 401 })
  }

  // 2. Verifica perfil usando service role (bypassa RLS da tabela perfis)
  const adminClient = createSupabaseAdmin()
  const { data: perfil } = await adminClient
    .from('perfis')
    .select('perfil')
    .eq('id', user.id)
    .single()

  if (perfil?.perfil !== 'admin') {
    return Response.json({ erro: 'Acesso negado: apenas admins podem criar usuários' }, { status: 403 })
  }

  // 2. Valida body
  let body: {
    nome: string
    email: string
    senha: string
    perfil: 'admin' | 'funcionario'
    permissoes: Record<string, boolean>
  }

  try {
    body = await request.json()
  } catch {
    return Response.json({ erro: 'Body inválido' }, { status: 400 })
  }

  const { nome, email, senha, perfil: novoPerfil, permissoes } = body

  if (!nome || !email || !senha || !novoPerfil) {
    return Response.json({ erro: 'Campos obrigatórios: nome, email, senha, perfil' }, { status: 400 })
  }
  if (senha.length < 6) {
    return Response.json({ erro: 'Senha deve ter pelo menos 6 caracteres' }, { status: 400 })
  }

  // 3. Cria usuário no Supabase Auth (service role)
  const { data: novoUsuario, error: erroAuth } = await adminClient.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,           // já confirma o email automaticamente
    user_metadata: { nome },
  })

  if (erroAuth) {
    console.error('[admin/usuarios] erro ao criar usuário:', erroAuth)
    const msg = erroAuth.message.includes('already registered')
      ? 'Este email já está cadastrado'
      : erroAuth.message
    return Response.json({ erro: msg }, { status: 400 })
  }

  // 4. Insere perfil na tabela perfis
  const { error: erroPerfil } = await adminClient
    .from('perfis')
    .insert({
      id: novoUsuario.user.id,
      nome,
      perfil: novoPerfil,
      permissoes,
    })

  if (erroPerfil) {
    // Rollback: remove o usuário auth criado
    await adminClient.auth.admin.deleteUser(novoUsuario.user.id)
    console.error('[admin/usuarios] erro ao inserir perfil:', erroPerfil)
    return Response.json({ erro: erroPerfil.message }, { status: 500 })
  }

  return Response.json({ ok: true, id: novoUsuario.user.id })
}

export async function DELETE(request: Request) {
  const serverClient = await createSupabaseServer()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })

  const adminClient = createSupabaseAdmin()
  const { data: perfil } = await adminClient
    .from('perfis')
    .select('perfil')
    .eq('id', user.id)
    .single()

  if (perfil?.perfil !== 'admin') {
    return Response.json({ erro: 'Acesso negado' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return Response.json({ erro: 'id obrigatório' }, { status: 400 })
  if (id === user.id) return Response.json({ erro: 'Você não pode apagar sua própria conta' }, { status: 400 })

  const { error } = await adminClient.auth.admin.deleteUser(id)
  if (error) return Response.json({ erro: error.message }, { status: 500 })

  return Response.json({ ok: true })
}

export async function PATCH(request: Request) {
  const serverClient = await createSupabaseServer()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })

  const adminClient = createSupabaseAdmin()
  const { data: perfil } = await adminClient
    .from('perfis')
    .select('perfil')
    .eq('id', user.id)
    .single()

  if (perfil?.perfil !== 'admin') {
    return Response.json({ erro: 'Acesso negado' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const id = body?.id
  const nome = body?.nome
  const permissoes = body?.permissoes

  if (!id) return Response.json({ erro: 'id obrigatório' }, { status: 400 })

  // 3. Monta payload — permissoes é passado diretamente, sem nenhum filtro
  const payload: Record<string, unknown> = { permissoes }
  if (typeof nome === 'string' && nome.trim()) payload.nome = nome.trim()

  const { data, error } = await adminClient
    .from('perfis')
    .update(payload)
    .eq('id', id)
    .select()

  if (error) {
    console.error('[PATCH /api/admin/usuarios] erro no update:', error.message, '| código:', error.code, '| detalhes:', error.details)
    return Response.json({ erro: error.message, codigo: error.code, detalhes: error.details }, { status: 500 })
  }

  if (!data || data.length === 0) {
    return Response.json({ ok: false, aviso: 'Nenhuma linha atualizada — id não encontrado' }, { status: 200 })
  }

  return Response.json({ ok: true, data: data[0] })
}

// Lista todos os usuários (apenas admin)
export async function GET() {
  const serverClient = await createSupabaseServer()
  const { data: { user } } = await serverClient.auth.getUser()

  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })

  // Usa service role para bypassar RLS ao verificar e listar perfis
  const adminClient = createSupabaseAdmin()

  const { data: perfil } = await adminClient
    .from('perfis')
    .select('perfil')
    .eq('id', user.id)
    .single()

  if (perfil?.perfil !== 'admin') {
    return Response.json({ erro: 'Acesso negado' }, { status: 403 })
  }

  const { data, error } = await adminClient
    .from('perfis')
    .select('id, nome, perfil, permissoes, criado_em')
    .order('criado_em', { ascending: false })

  if (error) return Response.json({ erro: error.message }, { status: 500 })

  return Response.json(data)
}
