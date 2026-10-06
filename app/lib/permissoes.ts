// Lista única das funções do app (botões da tela inicial). É a fonte de verdade
// para o menu (app/page.tsx), para a tela de usuários (app/admin/usuarios) e
// para a trava das páginas no proxy (proxy.ts) — botão novo entra AQUI.
//
// Cada função tem a sua própria chave em perfis.permissoes (jsonb). As chaves
// compras-quinta e validades-divergentes são novas: antes reaproveitavam a
// permissão de estoque e de conferência. Para ninguém perder acesso sem
// migração de dados, se a chave não existir no jsonb ela herda o valor da
// permissão antiga (herdaDe). Quando o admin salva o usuário, a chave nova
// passa a ser gravada explicitamente.

export type GrupoFuncao = 'Estoque' | 'Compras' | 'Validades' | 'Equipe e chat' | 'Relatórios'

export type Funcao = {
  id: string
  nome: string
  emoji: string
  descricao: string
  href: string
  /** Página travada no proxy por esta função, quando difere do href (ex.: href com ?aba=). */
  rota?: string
  grupo: GrupoFuncao
  /** Valor inicial ao criar um funcionário novo. */
  padrao: boolean
  /** Chave antiga usada quando a chave desta função ainda não existe no jsonb. */
  herdaDe?: string
  /** Só admin — não aparece como interruptor para funcionário. */
  somenteAdmin?: boolean
  /** Tem permissão e trava de página, mas não aparece como botão no menu. */
  foraDoMenu?: boolean
  /** Visual de destaque do botão no menu. */
  gradient?: string
  shadow?: string
}

export const GRUPOS: GrupoFuncao[] = ['Estoque', 'Compras', 'Validades', 'Equipe e chat', 'Relatórios']

// Ordem = ordem original dos botões no menu (o funcionário vê nesta ordem).
export const FUNCOES: Funcao[] = [
  { id: 'estoque',       href: '/estoque',       emoji: '📦', nome: 'Estoque',       grupo: 'Estoque', padrao: true,  descricao: 'Ver e cadastrar produtos',
    gradient: 'linear-gradient(145deg,#7C3AED,#4C1D95)', shadow: '0 4px 20px rgba(124,58,237,0.25)' },
  { id: 'movimentacao',  href: '/movimentacao',  emoji: '🔄', nome: 'Movimentação',  grupo: 'Estoque', padrao: true,  descricao: 'Registrar entradas e saídas',
    gradient: 'linear-gradient(145deg,#2563EB,#1E40AF)', shadow: '0 4px 20px rgba(37,99,235,0.25)' },
  { id: 'historico', href: '/historico', emoji: '📋', nome: 'Histórico', grupo: 'Relatórios', padrao: true,  descricao: 'Movimentações registradas' },
  { id: 'chat',   href: '/chat',           emoji: '💬', nome: 'Chat IA', grupo: 'Equipe e chat', padrao: true,  descricao: 'Conversar com a equipe e a IA' },
  { id: 'checklist',      href: '/checklist',      emoji: '🛒', nome: 'Checklist',      grupo: 'Compras', padrao: true,  descricao: 'Checklist de compras' },
  { id: 'transferencia', href: '/transferencia', emoji: '↔️', nome: 'Transferência', grupo: 'Estoque', padrao: true,  descricao: 'Mover entre principal e cozinha' },
  { id: 'nota',           href: '/nota',           emoji: '📷', nome: 'Lançar nota',    grupo: 'Compras', padrao: false, descricao: 'Dar entrada pela nota fiscal' },
  { id: 'equipe', href: '/admin/usuarios', emoji: '👥', nome: 'Equipe',  grupo: 'Equipe e chat', padrao: false, somenteAdmin: true, descricao: 'Usuários e permissões' },
  { id: 'codigos',       href: '/codigos',       emoji: '🔢', nome: 'Etiquetas',       grupo: 'Estoque', padrao: false, descricao: 'Gerenciar códigos de barras' },
  // Relatório e Gráficos são abas da mesma página /relatorio: cada aba aparece
  // só para quem tem a permissão dela, e a página abre para quem tiver qualquer uma.
  { id: 'relatorio', href: '/relatorio', emoji: '📊', nome: 'Relatório', grupo: 'Relatórios', padrao: false, descricao: 'Relatório do estoque' },
  { id: 'graficos',  href: '/relatorio?aba=graficos', rota: '/relatorio', emoji: '📈', nome: 'Gráficos', grupo: 'Relatórios', padrao: false, descricao: 'Gráficos de consumo' },
  { id: 'conferencia',   href: '/conferencia',   emoji: '✅', nome: 'Conferência',   grupo: 'Estoque', padrao: false, descricao: 'Contar e ajustar o estoque' },
  { id: 'scanner',       href: '/scanner',       emoji: '🔍', nome: 'Scanner',       grupo: 'Estoque', padrao: true,  descricao: 'Buscar produto pelo código de barras' },
  { id: 'compras-quinta', href: '/compras-quinta', emoji: '🗓️', nome: 'Compras quinta', grupo: 'Compras', padrao: true,  herdaDe: 'estoque', descricao: 'Lista de compras da quinta-feira' },
  // id antigo mantido para não perder as permissões já salvas; a página agora é
  // /validades (abas Vencendo, Divergentes e Sem validade). /validades-divergentes redireciona.
  { id: 'validades-divergentes', href: '/validades', emoji: '📅', nome: 'Validades', grupo: 'Validades', padrao: false, herdaDe: 'conferencia', descricao: 'Vencendo, divergentes e sem validade' },
  // Sem botão no menu: só interruptor na tela de usuários + trava no proxy.
  { id: 'cadastrar', href: '/cadastro', emoji: '➕', nome: 'Cadastro', grupo: 'Estoque', padrao: false, herdaDe: 'estoque', foraDoMenu: true, descricao: 'Cadastrar produtos e fornecedores' },
]

export type Permissoes = Record<string, boolean>

/** Funções que o admin pode ligar/desligar por funcionário. */
export const FUNCOES_CONFIGURAVEIS = FUNCOES.filter((f) => !f.somenteAdmin)

/** Mesma regra no menu, na tela de usuários e no proxy. */
export function podeAcessar(funcao: Funcao, perfil: string | null | undefined, permissoes: Permissoes | null | undefined): boolean {
  if (perfil === 'admin') return true
  if (funcao.somenteAdmin) return false
  const valor = permissoes?.[funcao.id]
  if (typeof valor === 'boolean') return valor
  return funcao.herdaDe ? permissoes?.[funcao.herdaDe] === true : false
}

/**
 * Valor efetivo de cada função configurável para um funcionário (já com a
 * herança aplicada). Chaves que não são funções (ex.: dashboard, cadastrar)
 * são mantidas como estão, para não sumirem do jsonb ao salvar.
 */
export function permissoesEfetivas(permissoes: Permissoes | null | undefined): Permissoes {
  const resultado: Permissoes = { ...(permissoes ?? {}) }
  for (const f of FUNCOES_CONFIGURAVEIS) resultado[f.id] = podeAcessar(f, 'funcionario', permissoes)
  return resultado
}

export function permissoesPadrao(): Permissoes {
  return Object.fromEntries(FUNCOES_CONFIGURAVEIS.map((f) => [f.id, f.padrao]))
}

/**
 * Funções cuja página é o caminho informado (ou um subcaminho dele). Pode vir
 * mais de uma quando a página é compartilhada (ex.: /relatorio = Relatório +
 * Gráficos); o acesso é liberado se o usuário tiver qualquer uma delas.
 */
export function funcoesDaRota(pathname: string): Funcao[] {
  return FUNCOES.filter((f) => {
    const rota = f.rota ?? f.href
    return pathname === rota || pathname.startsWith(rota + '/')
  })
}
