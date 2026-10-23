// Trava de permissão das rotas /api. Mesma regra do menu e da trava das
// páginas no proxy.ts (podeAcessar de app/lib/permissoes.ts, com herança e
// alias) — o proxy só esconde a página; quem grava de verdade é a rota, então
// é aqui que a permissão tem que ser conferida.
//
// Uso numa rota:
//   const { data: { user } } = await server.auth.getUser()
//   const negado = await exigirPermissao(user, 'nota')
//   if (negado) return negado
//
// Lista = basta uma das funções (ex.: ['conferencia', 'estoque']).
// 'admin' = só perfil admin. Admin passa em qualquer função.
import { createSupabaseAdmin } from './supabase-admin'
import { FUNCOES, podeAcessar } from './permissoes'

export type Exigido = 'admin' | string | string[]

async function lerPerfil(userId: string) {
  // perfis não tem policy para o usuário logado (RLS): lê com a service role, como o proxy
  const { data } = await createSupabaseAdmin()
    .from('perfis')
    .select('perfil, permissoes')
    .eq('id', userId)
    .maybeSingle()
  return data
}

function nomesDe(exigido: Exigido): string {
  if (exigido === 'admin') return 'apenas administradores'
  const ids = Array.isArray(exigido) ? exigido : [exigido]
  return ids.map((id) => FUNCOES.find((f) => f.id === id)?.nome ?? id).join(' ou ')
}

/** true se o usuário tem a permissão (ou qualquer uma da lista). */
export async function temPermissao(userId: string, exigido: Exigido): Promise<boolean> {
  const perfil = await lerPerfil(userId)
  if (perfil?.perfil === 'admin') return true
  if (exigido === 'admin') return false
  const ids = Array.isArray(exigido) ? exigido : [exigido]
  return ids.some((id) => {
    const funcao = FUNCOES.find((f) => f.id === id)
    if (!funcao) console.error(`[exigirPermissao] função desconhecida: ${id}`)
    return !!funcao && podeAcessar(funcao, perfil?.perfil, perfil?.permissoes)
  })
}

/**
 * null = pode seguir. Senão, a resposta pronta para devolver:
 * 401 sem login, 403 sem a permissão.
 */
export async function exigirPermissao(usuario: { id: string } | null | undefined, exigido: Exigido): Promise<Response | null> {
  if (!usuario) return Response.json({ erro: 'Não autenticado' }, { status: 401 })
  if (await temPermissao(usuario.id, exigido)) return null
  return Response.json({ erro: `Sem permissão: ${nomesDe(exigido)}` }, { status: 403 })
}
