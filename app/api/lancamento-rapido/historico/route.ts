// Endpoint GET /api/lancamento-rapido/historico — aba "Histórico" do Lançamento
// rápido. Lê lancamento_rapido_log (gravado por /api/lancamento-rapido/lancar).
//
// Funcionário: só os registros dele. Admin: de todos, com ?usuario=<id> para
// filtrar por pessoa (na 1ª página volta também a lista de pessoas do filtro).
// Últimos 30 dias, 20 por página, mais recentes primeiro. "Carregar mais" manda
// ?antes=<criado_em do último registro> (cursor — não repete nem pula registro
// quando entra um lançamento novo no meio).
import { createSupabaseServer } from '@/app/lib/supabase-server'
import { createSupabaseAdmin } from '@/app/lib/supabase-admin'
import type { RegistroLog } from '@/app/lib/lancamentoRapidoLog'

const POR_PAGINA = 20
const DIAS = 30
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request) {
  const server = await createSupabaseServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })

  const supabase = createSupabaseAdmin()
  const { data: perfil } = await supabase.from('perfis').select('perfil').eq('id', user.id).maybeSingle()
  const admin = perfil?.perfil === 'admin'

  const params = new URL(request.url).searchParams
  const antes = params.get('antes')
  if (antes && Number.isNaN(Date.parse(antes))) return Response.json({ erro: 'Cursor inválido' }, { status: 400 })
  const filtroUsuario = params.get('usuario')
  if (filtroUsuario && !UUID.test(filtroUsuario)) return Response.json({ erro: 'Pessoa inválida' }, { status: 400 })

  const desde = new Date(Date.now() - DIAS * 24 * 60 * 60 * 1000).toISOString()
  let query = supabase
    .from('lancamento_rapido_log')
    .select('id, usuario_id, usuario_nome, texto, itens, criado_em')
    .gte('criado_em', desde)
    .order('criado_em', { ascending: false })
    .order('id', { ascending: false })
    .limit(POR_PAGINA + 1)
  // Funcionário nunca vê de outra pessoa, mesmo mandando ?usuario=.
  const usuarioId = admin ? filtroUsuario : user.id
  if (usuarioId) query = query.eq('usuario_id', usuarioId)
  if (antes) query = query.lt('criado_em', antes)

  const { data, error } = await query
  if (error) return Response.json({ erro: 'Erro ao carregar o histórico' }, { status: 500 })

  const linhas = (data ?? []) as RegistroLog[]
  const registros = linhas.slice(0, POR_PAGINA).map((r) => ({ ...r, itens: Array.isArray(r.itens) ? r.itens : [] }))

  // Pessoas do filtro do admin: quem lançou nos últimos 30 dias (só na 1ª página).
  let pessoas: { id: string; nome: string }[] | undefined
  if (admin && !antes) {
    const { data: quem } = await supabase
      .from('lancamento_rapido_log').select('usuario_id, usuario_nome')
      .gte('criado_em', desde).not('usuario_id', 'is', null)
      .order('criado_em', { ascending: false })
      .limit(1000)
    const porId = new Map<string, string>()
    for (const q of quem ?? []) if (q.usuario_id && !porId.has(q.usuario_id)) porId.set(q.usuario_id, q.usuario_nome ?? 'Sem nome')
    pessoas = [...porId].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }

  return Response.json({ admin, registros, tem_mais: linhas.length > POR_PAGINA, pessoas })
}
