import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

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

  // Rotas de API sem sessão → 401 JSON (não redireciona para evitar quebrar fetch())
  if (!user && pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/')) {
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

  // IMPORTANTE: retorna supabaseResponse — nunca um NextResponse.next() novo,
  // pois os cookies renovados ficam neste objeto.
  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
