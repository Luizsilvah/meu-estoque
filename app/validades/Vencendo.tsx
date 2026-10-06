'use client'
import { useMemo, useState } from 'react'

import { D } from '@/app/lib/theme'
import { Validade, diasAteVencer } from '@/app/lib/validades'

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ color: D.text2, fontSize: 13, fontWeight: 600, marginLeft: 2 }}>Vencem em até</span>
        {JANELAS.map((j) => {
          const ativa = janela === j
          return (
            <button key={j} onClick={() => setJanela(j)}
              style={{ padding: '7px 14px', borderRadius: 20, border: `1px solid ${ativa ? '#6366F1' : D.border}`, background: ativa ? 'rgba(99,102,241,0.12)' : D.card, color: ativa ? '#6366F1' : D.text2, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              {j} dias
            </button>
          )
        })}
      </div>

      {lotes.length > 0 && (
        <p style={{ color: D.muted, fontSize: 13, margin: '0 2px' }}>
          {vencidos > 0 && <><strong style={{ color: '#EF4444' }}>{vencidos} vencido{vencidos === 1 ? '' : 's'}</strong> · </>}
          {lotes.length - vencidos} vencendo em até {janela} dias
        </p>
      )}

      {/* Busca */}
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: D.muted }}>🔍</span>
        <input type="text" placeholder="Buscar produto..."
          value={busca} onChange={(e) => setBusca(e.target.value)}
          style={{ width: '100%', background: D.card, border: `1px solid ${D.border}`, borderRadius: 14, padding: '12px 14px 12px 36px', fontSize: 16, color: D.text, outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      {visiveis.length === 0 ? (
        busca.trim() ? (
          <p style={{ color: D.text2, fontSize: 14, textAlign: 'center', paddingTop: 40 }}>Nenhum produto encontrado.</p>
        ) : (
          <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 16, padding: 24, textAlign: 'center' }}>
            <p style={{ color: '#10B981', fontWeight: 700, fontSize: 15 }}>Nenhum lote vencido ou vencendo em até {janela} dias!</p>
          </div>
        )
      ) : visiveis.map((l) => {
        const b = badgeDias(l.dias)
        const vencido = l.dias < 0
        return (
          <div key={l.id} style={{ background: vencido ? 'rgba(239,68,68,0.06)' : D.card, border: `1px solid ${vencido ? 'rgba(239,68,68,0.4)' : D.border}`, borderRadius: 16, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ color: D.text, fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.nome}</p>
                <p style={{ color: D.text2, fontSize: 12, marginTop: 2 }}>{l.fornecedor ?? 'Sem fornecedor'}</p>
              </div>
              <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 800, padding: '4px 10px', borderRadius: 20, background: b.bg, color: b.cor, whiteSpace: 'nowrap' }}>
                {b.texto}
              </span>
            </div>
            <p style={{ color: D.text2, fontSize: 13, marginTop: 8 }}>
              Validade <strong style={{ color: vencido ? '#EF4444' : D.text }}>{formatarData(l.data_validade)}</strong> · Lote <strong style={{ color: D.text }}>{l.quantidade}{l.unidade ? ` ${l.unidade}` : ''}</strong>
            </p>
          </div>
        )
      })}
    </>
  )
}
