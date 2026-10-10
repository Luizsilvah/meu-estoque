import type { Funcao } from '@/app/lib/permissoes'

export const COR = {
  roxo: '#8B5CF6',
  indigo: '#6366F1',
  azul: '#3B82F6',
  ciano: '#06B6D4',
  verde: '#10B981',
  vermelho: '#EF4444',
  laranja: '#F97316',
  amarelo: '#F59E0B',
  rosa: '#EC4899',
  teal: '#14B8A6',
}

// Visual de cada função (ícone, cor, nome no botão, nome curto). As funções em si
// vêm da lista única em app/lib/permissoes.ts; id sem entrada aqui usa o padrão.
// curto = botões pequenos (grade "Mais") e botões grandes de ação rápida.
const VISUAL: Record<string, { icone: string; cor: string; nome?: string; curto?: string }> = {
  estoque:                 { icone: 'box',       cor: COR.roxo },
  movimentacao:            { icone: 'upDown',    cor: COR.azul, curto: 'Movimentar' },
  conferencia:             { icone: 'check',     cor: COR.verde },
  historico:               { icone: 'clock',     cor: COR.amarelo },
  chat:                    { icone: 'chat',      cor: COR.rosa, curto: 'Chat' },
  transferencia:           { icone: 'leftRight', cor: COR.ciano, curto: 'Transferir' },
  'lancamento-rapido':     { icone: 'zap',       cor: COR.indigo, curto: 'Lanç. rápido' },
  nota:                    { icone: 'file',      cor: COR.roxo, curto: 'Nota fiscal' },
  equipe:                  { icone: 'users',     cor: COR.indigo },
  codigos:                 { icone: 'barcode',   cor: COR.indigo },
  // Relatório e Gráficos são abas da mesma página: um botão só, "Relatórios".
  relatorio:               { icone: 'lineChart', cor: COR.teal, nome: 'Relatórios' },
  graficos:                { icone: 'lineChart', cor: COR.teal, nome: 'Relatórios' },
  scanner:                 { icone: 'scan',      cor: COR.roxo },
  'compras-quinta':        { icone: 'cart',      cor: COR.vermelho, curto: 'Compras' },
  'validades-divergentes': { icone: 'timer',     cor: COR.laranja, curto: 'Validades' },
  cadastrar:               { icone: 'plus',      cor: COR.verde },
}

export function visual(f: Funcao) {
  const v = VISUAL[f.id]
  const nome = v?.nome ?? f.nome
  return { icone: v?.icone ?? 'box', cor: v?.cor ?? COR.indigo, nome, curto: v?.curto ?? nome }
}

export function gradiente(cor: string) {
  return `linear-gradient(135deg, ${cor}, color-mix(in srgb, ${cor} 70%, #000))`
}

export const tituloSecaoStyle = {
  color: 'var(--text2)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', margin: '0 0 10px 2px',
} as const
