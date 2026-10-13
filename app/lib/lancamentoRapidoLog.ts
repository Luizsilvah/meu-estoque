// Formato de lancamento_rapido_log.itens (aba "Histórico" do Lançamento rápido).
// Gravado por POST /api/lancamento-rapido/lancar e lido por
// GET /api/lancamento-rapido/historico.

export type LocalLog = 'principal' | 'cozinha'

export type ItemLog = {
  /** null quando o produto veio inválido do cliente. */
  produto_id: string | null
  nome: string | null
  /** null quando o tipo veio inválido. */
  tipo: 'entrada' | 'saida' | 'transferencia' | null
  /** Entrada: onde entrou. Saída: de onde saiu. Transferência: origem. */
  local: LocalLog | null
  /** Só transferência: para onde foi. */
  destino?: LocalLog | null
  quantidade: number | null
  /** Entrada: validades que entraram. Saída: lotes de onde saiu (já com FEFO aplicado). */
  lotes: { data_validade: string; quantidade: number }[]
  status: 'ok' | 'erro'
  erro: string | null
}

export type RegistroLog = {
  id: string
  usuario_id: string | null
  usuario_nome: string | null
  texto: string | null
  itens: ItemLog[]
  criado_em: string
}
