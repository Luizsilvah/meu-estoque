import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createSupabaseAdmin } from './app/lib/supabase-admin'
import { funcoesDaRota, podeAcessar, type Permissoes } from './app/lib/permissoes'

// Cache curto do perfil por usuário, só para a trava de páginas abaixo. O proxy
// roda na borda perto do usuário (gru1, São Paulo), longe do Supabase
// (us-west-2): cada leitura de perfis daqui custa ~300 ms. Com 10 s, quem
// perde uma permissão na tela Equipe deixa de abrir a página em até 10 s — e
// as rotas /api conferem o perfil direto no banco a cada chamada, então nada
// é gravado nem lido com permissão vencida.
type PerfilProxy = { perfil: string | null; permissoes: Permissoes | null } | null
const PERFIL_TTL_MS = 10_000
const perfisEmCache = new Map<string, { perfil: PerfilProxy; expiraEm: number }>()

async function perfilDoProxy(userId: string): Promise<{ perfil: PerfilProxy; doCache: boolean }> {
  const agora = Date.now()
  const guardado = perfisEmCache.get(userId)
  if (guardado && guardado.expiraEm > agora) return { perfil: guardado.perfil, doCache: true }
  const { data } = await createSupabaseAdmin()
    .from('perfis')
    .select('perfil, permissoes')
    .eq('id', userId)
    .maybeSingle()
  if (perfisEmCache.size > 500) perfisEmCache.clear() // não cresce sem limite numa instância longa
  perfisEmCache.set(userId, { perfil: data, expiraEm: agora + PERFIL_TTL_MS })
  return { perfil: data, doCache: false }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // IMPORTANTE: supabaseResponse deve ser sempre o objeto base retornado.
  // Nunca crie um novo NextResponse sem copiar os cookies deste objeto —
  // o @supabase/ssr usa setAll() para gravar tokens renovados aqui,
  // e eles precisam chegar ao browser em todas as respostas.
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Atualiza cookies na request (para leitura downstream)
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          // Cria nova supabaseResponse com request atualizada e aplica cookies
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // NÃO adicione lógica entre createServerClient e getClaims().
  // getClaims() renova o token se necessário (via getSession) e confere a
  // assinatura do JWT localmente com a chave pública do projeto (ES256, JWKS em
  // cache) — sem ir ao servidor do Supabase a cada navegação, como o getUser()
  // ia (~270 ms daqui). Não detecta sessão encerrada em outro aparelho antes do
  // JWT expirar (até 1 h), mas o proxy é só a trava otimista: toda rota /api
  // continua chamando getUser() (usuarioLogado em app/lib/exigirPermissao.ts).
  // getSession() sozinho lê só do cookie e não é confiável para autorização.
  const inicioAuth = performance.now()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims.sub ?? null
  const user = userId ? { id: userId } : null
  const tempos = [`proxy-auth;dur=${(performance.now() - inicioAuth).toFixed(1)}`]

  // Cria redirect copiando os cookies renovados do supabaseResponse.
  // Sem isso, um token recém-renovado seria perdido e o browser ficaria
  // em loop redirecionando com o token expirado.
  function redirecionar(url: URL) {
    const redirectResponse = NextResponse.redirect(url)
    redirectResponse.headers.set('Server-Timing', tempos.join(', '))
    supabaseResponse.cookies.getAll().forEach(({ name, value, ...options }) => {
      redirectResponse.cookies.set(name, value, options)
    })
    return redirectResponse
  }

  // /api/cron/* não tem sessão de usuário — é chamado pelo Vercel Cron (server-to-server)
  // e se autentica com o header Authorization: Bearer CRON_SECRET, verificado dentro da
  // própria rota. Sem esse bypass, o 401 abaixo bloquearia o cron antes de chegar na rota.
  if (pathname.startsWith('/api/cron/')) return comTempos(supabaseResponse)

  // Rotas de API sem sessão → 401 JSON. NUNCA redireciona: o browser seguiria o
  // 307 e o fetch(...).json() receberia HTML. Cobre TAMBÉM /api/auth/* (me, logout) —
  // login/reset-senha são client-side (supabase-browser), não há endpoint em
  // /api/auth/ que precise rodar sem sessão.
  if (!user && pathname.startsWith('/api/')) {
    return Response.json({ erro: 'Não autenticado' }, { status: 401, headers: { 'Server-Timing': tempos.join(', ') } })
  }

  const rotasPublicas = ['/login', '/reset-senha']
  const isPublica = rotasPublicas.some(r => pathname.startsWith(r))

  // Páginas protegidas sem sessão → /login
  if (!user && !isPublica) {
    return redirecionar(new URL('/login', request.url))
  }

  // Já logado acessando rota pública → home
  if (user && isPublica) {
    return redirecionar(new URL('/', request.url))
  }

  // Página de uma função do menu sem permissão → home (mesma regra do menu, ver
  // app/lib/permissoes.ts). Checagem otimista: esconde a página; as rotas de
  // API conferem a permissão de novo (exigirPermissao). perfis não tem policy
  // para o usuário logado (RLS), por isso a leitura usa a service role.
  // Página compartilhada (ex.: /relatorio = Relatório + Gráficos): basta uma das
  // funções. /validades usa a chave 'validades-divergentes' (ver permissoes.ts).
  const funcoes = user && !pathname.startsWith('/api/') ? funcoesDaRota(pathname) : []
  if (user && funcoes.length > 0) {
    const inicioPerfil = performance.now()
    const { perfil, doCache } = await perfilDoProxy(user.id)
    tempos.push(`proxy-perfil;dur=${(performance.now() - inicioPerfil).toFixed(1)};desc="${doCache ? 'cache' : 'banco'}"`)
    if (!funcoes.some((f) => podeAcessar(f, perfil?.perfil, perfil?.permissoes))) {
      return redirecionar(new URL('/', request.url))
    }
  }

  // IMPORTANTE: retorna supabaseResponse — nunca um NextResponse.next() novo,
  // pois os cookies renovados ficam neste objeto.
  return comTempos(supabaseResponse)

  // Server-Timing: tempo do proxy por etapa, visível no DevTools (Network →
  // Timing) para conferir em produção. Só durações, nada do usuário.
  function comTempos(resposta: NextResponse) {
    resposta.headers.set('Server-Timing', tempos.join(', '))
    return resposta
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
