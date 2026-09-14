import { createClient } from '@supabase/supabase-js'
import { createSupabaseServer } from '@/app/lib/supabase-server'
import { createSupabaseAdmin } from '@/app/lib/supabase-admin'

// POST /api/estoque/zerar — "Zerar todo o estoque" (ação de admin da tela de Conferência).
// Zera qtd_atual/qtd_cozinha de todos os produtos e apaga todas as validades, de forma
// atômica (RPC estoque_zerar_tudo). NÃO mexe em qtd_base/qtd_max nem apaga produtos.
export async function POST(request: Request) {
  // 1. Usuário logado
  const serverClient = await createSupabaseServer()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user?.email) return Response.json({ erro: 'Não autenticado' }, { status: 401 })

  // 2. Perfil admin
  const adminClient = createSupabaseAdmin()
  const { data: perfil } = await adminClient
    .from('perfis')
    .select('perfil')
    .eq('id', user.id)
    .single()
  if (perfil?.perfil !== 'admin') return Response.json({ erro: 'Acesso negado' }, { status: 403 })

  // 3. Senha do body
  const body = await request.json().catch(() => null)
  const senha = typeof body?.senha === 'string' ? body.senha : ''
  if (!senha) return Response.json({ erro: 'Informe sua senha para confirmar' }, { status: 400 })

  // 4. Confere a senha de login do admin sem tocar na sessão atual.
  //    Cliente isolado: anon key, sem persistência e sem adaptador de cookie — o
  //    signInWithPassword autentica no GoTrue e devolve o resultado só em memória,
  //    nada é gravado nos cookies do admin (não rotaciona/desloga a sessão).
  //    O email vem do usuário já autenticado, nunca do body.
  const authCheck = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
  const { error: erroSenha } = await authCheck.auth.signInWithPassword({
    email: user.email,
    password: senha,
  })
  if (erroSenha) {
    if (erroSenha.status === 429) {
      return Response.json({ erro: 'Muitas tentativas. Aguarde um momento e tente de novo.' }, { status: 429 })
    }
    return Response.json({ erro: 'Senha incorreta' }, { status: 403 })
  }

  // 5. Zera tudo (atômico no banco).
  //    Sem .single(): pede a resposta como array (o formato padrão do PostgREST pra
  //    funções "returns table"), em vez do Accept: application/vnd.pgrst.object+json
  //    que .single() força — isolando se é essa a causa do erro visto em produção.
  const { data, error } = await adminClient.rpc('estoque_zerar_tudo')
  const linhas = data as { produtos_zerados: number; validades_apagadas: number }[] | null
  const resultado = linhas?.[0]

  if (error || !resultado) {
    console.error('[estoque/zerar] erro na RPC:', JSON.stringify(error))
    return Response.json({ erro: 'Erro ao zerar o estoque' }, { status: 500 })
  }

  return Response.json({
    ok: true,
    produtos_zerados: resultado.produtos_zerados,
    validades_apagadas: resultado.validades_apagadas,
  })
}
