import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createSupabaseAdmin } from './app/lib/supabase-admin'
import { funcoesDaRota, podeAcessar } from './app/lib/permissoes'

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

  // NÃO adicione lógica entre createServerClient e getUser().
  // getUser() valida o JWT no servidor Supabase e renova o token se necessário.
  // getSession() lê só do cookie e não é confiável para autorização.
  const { data: { user } } = await supabase.auth.getUser()

  // Cria redirect copiando os cookies renovados do supabaseResponse.
  // Sem isso, um token recém-renovado seria perdido e o browser ficaria
  // em loop redirecionando com o token expirado.
  function redirecionar(url: URL) {
    const redirectResponse = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach(({ name, value, ...options }) => {
      redirectResponse.cookies.set(name, value, options)
    })
    return redirectResponse
  }

  // /api/cron/* não tem sessão de usuário — é chamado pelo Vercel Cron (server-to-server)
  // e se autentica com o header Authorization: Bearer CRON_SECRET, verificado dentro da
  // própria rota. Sem esse bypass, o 401 abaixo bloquearia o cron antes de chegar na rota.
  if (pathname.startsWith('/api/cron/')) return supabaseResponse

  // Rotas de API sem sessão → 401 JSON. NUNCA redireciona: o browser seguiria o
  // 307 e o fetch(...).json() receberia HTML. Cobre TAMBÉM /api/auth/* (me, logout) —
  // login/reset-senha são client-side (supabase-browser), não há endpoint em
  // /api/auth/ que precise rodar sem sessão.
  if (!user && pathname.startsWith('/api/')) {
    return Response.json({ erro: 'Não autenticado' }, { status: 401 })
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
  // app/lib/permissoes.ts). Checagem otimista: esconde a página, mas as rotas
  // de API continuam conferindo só o login. perfis não tem policy para o
  // usuário logado (RLS), por isso a leitura usa a service role.
  // Página compartilhada (ex.: /relatorio = Relatório + Gráficos): basta uma das
  // funções. /validades usa a chave 'validades-divergentes' (ver permissoes.ts).
  const funcoes = user && !pathname.startsWith('/api/') ? funcoesDaRota(pathname) : []
  if (user && funcoes.length > 0) {
    const { data: perfil } = await createSupabaseAdmin()
      .from('perfis')
      .select('perfil, permissoes')
      .eq('id', user.id)
      .maybeSingle()
    if (!funcoes.some((f) => podeAcessar(f, perfil?.perfil, perfil?.permissoes))) {
      return redirecionar(new URL('/', request.url))
    }
  }

  // IMPORTANTE: retorna supabaseResponse — nunca um NextResponse.next() novo,
  // pois os cookies renovados ficam neste objeto.
  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
