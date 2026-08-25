export type Validade = { id: string; produto_id: string; data_validade: string; quantidade: number }

export function diasAteVencer(dataStr: string): number {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  return Math.round((new Date(dataStr + 'T00:00:00').getTime() - hoje.getTime()) / 86400000)
}

export function formatarDataCurta(dataStr: string): string {
  const [, mes, dia] = dataStr.split('-')
  return `${dia}/${mes}`
}

export function badgeValidade(validades: Validade[]): { texto: string; cor: string; bg: string } | null {
  if (!validades.length) return null
  const proxima = [...validades].sort((a, b) => a.data_validade.localeCompare(b.data_validade))[0]
  const dias = diasAteVencer(proxima.data_validade)
  if (dias < 0)  return { texto: 'Vencido',          cor: '#EF4444', bg: 'rgba(239,68,68,0.15)' }
  if (dias <= 7) return { texto: `Vence em ${dias}d`, cor: '#F97316', bg: 'rgba(249,115,22,0.15)' }
  return null
}

export function proximaValidade(validades: Validade[]): { texto: string; cor: string } | null {
  if (!validades.length) return null
  const v = [...validades].sort((a, b) => a.data_validade.localeCompare(b.data_validade))[0]
  const dias = diasAteVencer(v.data_validade)
  const data = new Date(v.data_validade + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  if (dias < 0)   return { texto: `Vencido (${data})`, cor: '#EF4444' }
  if (dias === 0) return { texto: 'Vence hoje',         cor: '#EF4444' }
  if (dias <= 7)  return { texto: `${data} (${dias}d)`, cor: '#F97316' }
  if (dias <= 30) return { texto: `${data} (${dias}d)`, cor: '#F59E0B' }
  return { texto: data, cor: 'var(--text2)' }
}
