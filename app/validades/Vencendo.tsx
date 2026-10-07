'use client'
import { useMemo, useState } from 'react'

import { D } from '@/app/lib/theme'
import { Validade, diasAteVencer } from '@/app/lib/validades'
import SearchBar from '@/app/components/ui/SearchBar'
import Chips from '@/app/components/ui/Chips'
import Card from '@/app/components/ui/Card'
import Icon from '@/app/components/ui/Icon'

// Aba "Vencendo" de /validades: lotes vencidos e que vencem na janela escolhida,
// só de produtos com estoque > 0 (mesma regra do card da tela inicial, ver
// app/api/dashboard/route.ts), do mais urgente para o menos urgente.

export type Janela = 7 | 15 | 30
export const JANELAS: Janela[] = [7, 15, 30]

/** Linha de /api/estoque (só as colunas usadas aqui). */
export type ItemEstoqueValidade = {
  produto_id: string
  qtd_atual: number
  produtos: { nome: string; unidade: string | null; fornecedores: { nome: string } | null } | null
}

export type LoteVencendo = Validade & { nome: string; unidade: string; fornecedor: string | null; dias: number }

export function lotesVencendo(estoque: ItemEstoqueValidade[], validades: Validade[], janela: Janela): LoteVencendo[] {
  const produtos = new Map<string, ItemEstoqueValidade>()
  for (const item of estoque) if (item.qtd_atual > 0) produtos.set(item.produto_id, item)
  const lotes: LoteVencendo[] = []
  for (const v of validades) {
    const item = produtos.get(v.produto_id)
    if (!item) continue
    const dias = diasAteVencer(v.data_validade)
    if (dias > janela) continue
    lotes.push({
      ...v, dias,
      nome: item.produtos?.nome ?? '—',
      unidade: item.produtos?.unidade ?? '',
      fornecedor: item.produtos?.fornecedores?.nome ?? null,
    })
  }
  return lotes.sort((a, b) => a.dias - b.dias || a.nome.localeCompare(b.nome, 'pt-BR'))
}

function formatarData(data: string): string {
  return new Date(data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function badgeDias(dias: number): { texto: string; cor: string; bg: string } {
  if (dias < 0)   return { texto: `Vencido há ${-dias}d`, cor: '#EF4444', bg: 'rgba(239,68,68,0.15)' }
  if (dias === 0) return { texto: 'Vence hoje',            cor: '#EF4444', bg: 'rgba(239,68,68,0.15)' }
  if (dias <= 7)  return { texto: `Vence em ${dias}d`,     cor: '#F97316', bg: 'rgba(249,115,22,0.15)' }
  return            { texto: `Vence em ${dias}d`,          cor: '#F59E0B', bg: 'rgba(245,158,11,0.15)' }
}

export default function ListaVencendo({ lotes, janela, setJanela }: {
  lotes: LoteVencendo[]
  janela: Janela
  setJanela: (j: Janela) => void
}) {
  const [busca, setBusca] = useState('')

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return termo ? lotes.filter((l) => l.nome.toLowerCase().includes(termo)) : lotes
  }, [lotes, busca])

  const vencidos = lotes.filter((l) => l.dias < 0).length

  return (
    <>
      {/* Janela */}
      <div>
        <p style={{ color: D.text2, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 8px 2px' }}>Vencem em até</p>
        <Chips itens={JANELAS.map((j) => ({ chave: String(j), label: `${j} dias`, ativo: janela === j, onClick: () => setJanela(j) }))} />
      </div>

      {lotes.length > 0 && (
        <p style={{ color: D.text2, fontSize: 13, margin: '0 2px' }}>
          {vencidos > 0 && <><strong style={{ color: '#EF4444' }}>{vencidos} vencido{vencidos === 1 ? '' : 's'}</strong> · </>}
          {lotes.length - vencidos} vencendo em até {janela} dias
        </p>
      )}

      <SearchBar value={busca} onChange={setBusca} placeholder="Buscar produto..." />

      {visiveis.length === 0 ? (
        busca.trim() ? (
          <p style={{ color: D.text2, fontSize: 14, textAlign: 'center', paddingTop: 40 }}>Nenhum produto encontrado.</p>
        ) : (
          <Card style={{ background: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.25)', padding: 24, textAlign: 'center' }}>
            <span style={{ display: 'inline-flex', color: '#10B981' }}><Icon nome="check" size={32} /></span>
            <p style={{ color: '#10B981', fontWeight: 800, fontSize: 15, margin: '8px 0 0' }}>Nenhum lote vencido ou vencendo em até {janela} dias!</p>
          </Card>
        )
      ) : visiveis.map((l) => {
        const b = badgeDias(l.dias)
        const vencido = l.dias < 0
        return (
          <Card key={l.id} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
            ...(vencido ? { background: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.4)' } : {}),
          }}>
            <span style={{ width: 44, height: 44, borderRadius: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: b.bg, color: b.cor }}>
              <Icon nome="calendar" size={20} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: D.text, fontWeight: 800, fontSize: 15, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.nome}</p>
              <p style={{ color: D.text2, fontSize: 12, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {l.fornecedor ?? 'Sem fornecedor'} · Val. <strong style={{ color: vencido ? '#EF4444' : D.text }}>{formatarData(l.data_validade)}</strong>
              </p>
              <p style={{ display: 'flex', alignItems: 'center', gap: 6, color: b.cor, fontSize: 13, fontWeight: 700, margin: '4px 0 0' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
                {b.texto}
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
              <span style={{ fontSize: 28, fontWeight: 800, lineHeight: 1, color: b.cor, fontVariantNumeric: 'tabular-nums' }}>{l.quantidade}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: D.text2, marginTop: 3 }}>{l.unidade || 'un'} no lote</span>
            </div>
          </Card>
        )
      })}
    </>
  )
}
