import { createSupabaseServer } from '../../lib/supabase-server'
import { createSupabaseAdmin } from '../../lib/supabase-admin'
import { temPermissao } from '@/app/lib/exigirPermissao'

// Nome do canal Realtime Broadcast — um por canal de chat (geral ou grupo).
// Broadcast, não postgres_changes: o banco usa RLS deny-all (ver
// supabase/migrations/20260825130000_enable_rls_all_tables.sql) e todo acesso
// é só via service_role. postgres_changes RESPEITA RLS — com RLS deny-all o
// cliente (anon key) não receberia nenhuma linha. Broadcast é pub/sub por
// canal, não depende de policy nenhuma na tabela. Atenção: o canal de
// Broadcast em si não confere se a pessoa é membro do grupo — a checagem de
// membro fica no GET/POST abaixo (histórico e envio).
function canalChat(grupo_id: string | null) {
  return `chat:${grupo_id ?? 'geral'}`
}

// Grupo: só admin ou membro lê/escreve (mesma regra da lista em /api/grupos).
// O canal geral (grupo_id null) é de todos.
async function podeUsarGrupo(userId: string, grupo_id: string | null) {
  if (!grupo_id) return true
  if (await temPermissao(userId, 'admin')) return true
  const { count } = await createSupabaseAdmin()
    .from('grupo_membros')
    .select('usuario_id', { count: 'exact', head: true })
    .eq('grupo_id', grupo_id)
    .eq('usuario_id', userId)
  return (count ?? 0) > 0
}

const SEM_ACESSO_GRUPO = () => Response.json({ erro: 'Sem permissão: você não é membro deste grupo' }, { status: 403 })

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const grupo_id = searchParams.get('grupo_id')

  const server = await createSupabaseServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })
  if (!await podeUsarGrupo(user.id, grupo_id)) return SEM_ACESSO_GRUPO()

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
  if (!await podeUsarGrupo(user.id, grupo_id)) return SEM_ACESSO_GRUPO()

  const admin = createSupabaseAdmin()
  const { data: perfil } = await admin.from('perfis').select('nome').eq('id', user.id).single()
  const usuario_nome = perfil?.nome ?? user.email ?? 'Usuário'

  const { data, error } = await admin
    .from('mensagens')
    .insert({ usuario_id: user.id, usuario_nome, texto: texto || '', grupo_id, imagem_url })
    .select()
    .single()

  if (error) return Response.json({ erro: error.message }, { status: 500 })

  // Best-effort: quem estiver com o chat aberto recebe na hora via Broadcast.
  // Se falhar (rede, canal sem ninguém ouvindo etc.) não é fatal — a própria
  // resposta desta request já tem a mensagem (quem enviou vê na hora do mesmo
  // jeito) e o polling de fallback de 30s cobre o resto.
  admin.channel(canalChat(grupo_id)).httpSend('nova-mensagem', data).catch(() => {})

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
  const grupo_id = searchParams.get('grupo_id') || null
  if (!id) return Response.json({ erro: 'id obrigatório' }, { status: 400 })

  const { error } = await admin.from('mensagens').delete().eq('id', id)
  if (error) return Response.json({ erro: error.message }, { status: 500 })

  // Avisa quem está com o chat aberto para remover a mensagem na hora (sem isso,
  // só o admin que apagou veria a remoção — os outros só no próximo reconnect)
  admin.channel(canalChat(grupo_id)).httpSend('mensagem-apagada', { id }).catch(() => {})

  return Response.json({ ok: true })
}
