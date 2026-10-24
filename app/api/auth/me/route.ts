import { usuarioLogado, perfilDe } from '../../../lib/exigirPermissao'

export async function GET() {
  const user = await usuarioLogado()

  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })

  const perfil = await perfilDe(user)

  // Permissões mudam pela tela Equipe: nunca guardar em cache (navegador/CDN),
  // para valer no próximo carregamento sem precisar sair e entrar.
  return Response.json({
    id: user.id,
    email: user.email,
    nome: perfil?.nome ?? user.user_metadata?.nome ?? user.email?.split('@')[0] ?? 'Usuário',
    perfil: perfil?.perfil ?? 'funcionario',
    permissoes: perfil?.permissoes ?? {},
  }, { headers: { 'Cache-Control': 'no-store' } })
}
