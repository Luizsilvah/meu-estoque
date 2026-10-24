// Trava de permissão das rotas /api. Mesma regra do menu e da trava das
// páginas no proxy.ts (podeAcessar de app/lib/permissoes.ts, com herança e
// alias) — o proxy só esconde a página; quem grava de verdade é a rota, então
// é aqui que a permissão tem que ser conferida.
//
// Uso numa rota:
//   const user = await usuarioLogado()
//   const negado = await exigirPermissao(user, 'nota')
//   if (negado) return negado
//
// Lista = basta uma das funções (ex.: ['conferencia', 'estoque']).
// 'admin' = só perfil admin. Admin passa em qualquer função.
//
// Desempenho: o perfil é lido UMA vez por requisição (perfilDe guarda a
// leitura junto do objeto user), e usuarioLogado já começa essa leitura em
// paralelo com o getUser — exigirPermissao, temPermissao e o nome do
// histórico reaproveitam a mesma consulta.
import type { User } from '@supabase/supabase-js'
import { createSupabaseAdmin } from './supabase-admin'
import { createSupabaseServer } from './supabase-server'
import { FUNCOES, podeAcessar, type Permissoes } from './permissoes'

export type Exigido = 'admin' | string | string[]
export type PerfilLido = { perfil: string | null; permissoes: Permissoes | null; nome: string | null } | null

async function lerPerfil(userId: string): Promise<PerfilLido> {
  // perfis não tem policy para o usuário logado (RLS): lê com a service role, como o proxy
  const { data } = await createSupabaseAdmin()
    .from('perfis')
    .select('perfil, permissoes, nome')
    .eq('id', userId)
    .maybeSingle()
  return data
}

// Chave = o objeto user da requisição (cada requisição tem o seu), então não
// vaza entre requisições nem entre usuários e some junto com o objeto.
const perfisDaRequisicao = new WeakMap<object, Promise<PerfilLido>>()

/** Perfil do usuário desta requisição — lido no máximo uma vez. */
export function perfilDe(usuario: { id: string }): Promise<PerfilLido> {
  let perfil = perfisDaRequisicao.get(usuario)
  if (!perfil) {
    perfil = lerPerfil(usuario.id)
    perfisDaRequisicao.set(usuario, perfil)
  }
  return perfil
}

/**
 * Usuário logado (ou null). Continua usando getUser() — que confere a sessão
 * no servidor do Supabase (pega sessão encerrada/usuário removido) —, mas
 * enquanto ele vai e volta já lê o perfil: o id sai do JWT verificado
 * localmente (getClaims, assinatura ES256) e o perfil só é aproveitado se o
 * getUser confirmar o mesmo id.
 */
export async function usuarioLogado(): Promise<User | null> {
  const server = await createSupabaseServer()
  const { data: claims } = await server.auth.getClaims()
  const id = claims?.claims.sub
  if (!id) return null
  const perfil = lerPerfil(id)
  perfil.catch(() => {}) // se o getUser falhar, ninguém espera essa promise
  const { data: { user } } = await server.auth.getUser()
  if (!user || user.id !== id) return null
  perfisDaRequisicao.set(user, perfil)
  return user
}

function nomesDe(exigido: Exigido): string {
  if (exigido === 'admin') return 'apenas administradores'
  const ids = Array.isArray(exigido) ? exigido : [exigido]
  return ids.map((id) => FUNCOES.find((f) => f.id === id)?.nome ?? id).join(' ou ')
}

/** true se o perfil tem a permissão (ou qualquer uma da lista). */
export function perfilPermite(perfil: PerfilLido, exigido: Exigido): boolean {
  if (perfil?.perfil === 'admin') return true
  if (exigido === 'admin') return false
  const ids = Array.isArray(exigido) ? exigido : [exigido]
  return ids.some((id) => {
    const funcao = FUNCOES.find((f) => f.id === id)
    if (!funcao) console.error(`[exigirPermissao] função desconhecida: ${id}`)
    return !!funcao && podeAcessar(funcao, perfil?.perfil, perfil?.permissoes)
  })
}

/** true se o usuário tem a permissão (ou qualquer uma da lista). */
export async function temPermissao(usuario: { id: string }, exigido: Exigido): Promise<boolean> {
  return perfilPermite(await perfilDe(usuario), exigido)
}

/**
 * null = pode seguir. Senão, a resposta pronta para devolver:
 * 401 sem login, 403 sem a permissão.
 */
export async function exigirPermissao(usuario: { id: string } | null | undefined, exigido: Exigido): Promise<Response | null> {
  if (!usuario) return Response.json({ erro: 'Não autenticado' }, { status: 401 })
  if (await temPermissao(usuario, exigido)) return null
  return Response.json({ erro: `Sem permissão: ${nomesDe(exigido)}` }, { status: 403 })
}
