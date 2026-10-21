'use client'
// Tela "Dar saída": a mesma tela da Movimentação (app/components/MovimentacaoTela.tsx)
// só com saída, mais "Suas últimas saídas (hoje)" embaixo. Grava pela mesma
// rota (/api/movimentacao → RPC movimentacao_registrar com p_delta_cozinha).
import { Suspense, useState } from 'react'

import { D } from '@/app/lib/theme'
import Card from '@/app/components/ui/Card'
import { tituloSecaoStyle } from '@/app/components/ui/visualFuncoes'
import MovimentacaoTela, { type MovimentacaoRegistrada } from '@/app/components/MovimentacaoTela'
import { useRecarregarAoVoltar } from '@/app/lib/useRecarregarAoVoltar'
import type { SaidaHoje } from '@/app/api/saida/hoje/route'

type Local = 'principal' | 'cozinha'

// O banco não guarda o lugar da saída: a tela anota no aparelho o que ela
// mesma gravou hoje e casa com a lista do servidor (produto + qtd + hora).
type LocalAnotado = { produto_id: string; quantidade: number; local: Local; hora: number }

const NOME_LOCAL: Record<Local, string> = { principal: 'Principal', cozinha: 'Cozinha' }
const NUM = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

function hojeISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const chaveLocais = () => `saida:locais:${hojeISO()}`

function lerLocais(): LocalAnotado[] {
  try {
    const json = JSON.parse(localStorage.getItem(chaveLocais()) ?? '[]')
    return Array.isArray(json) ? json : []
  } catch { return [] }
}

function anotarLocal(item: LocalAnotado) {
  try {
    localStorage.setItem(chaveLocais(), JSON.stringify([...lerLocais(), item].slice(-100)))
    // Limpa anotações de dias anteriores
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k?.startsWith('saida:locais:') && k !== chaveLocais()) localStorage.removeItem(k)
    }
  } catch { /* sem localStorage: a lista só fica sem o lugar */ }
}

// Casa cada saída do servidor com uma anotação ainda não usada (mesmo produto,
// mesma quantidade, até 2 min de diferença).
function comLocal(saidas: SaidaHoje[], anotados: LocalAnotado[]): (SaidaHoje & { local: Local | null })[] {
  const livres = [...anotados]
  return saidas.map((s) => {
    const t = new Date(s.data_hora).getTime()
    const idx = livres.findIndex((a) => a.produto_id === s.produto_id && a.quantidade === s.quantidade && Math.abs(a.hora - t) < 120_000)
    if (idx < 0) return { ...s, local: null }
    const [a] = livres.splice(idx, 1)
    return { ...s, local: a.local }
  })
}

export default function Page() {
  return (
    <Suspense>
      <DarSaida />
    </Suspense>
  )
}

function DarSaida() {
  const [saidas, setSaidas] = useState<(SaidaHoje & { local: Local | null })[]>([])

  async function carregarSaidas() {
    try {
      const res = await fetch('/api/saida/hoje', { cache: 'no-store' })
      const json = await res.json()
      if (Array.isArray(json)) setSaidas(comLocal(json as SaidaHoje[], lerLocais()))
    } catch { /* lista é só informativa */ }
  }
  useRecarregarAoVoltar(carregarSaidas)

  function registrado(m: MovimentacaoRegistrada) {
    if (m.tipo !== 'saida') return
    anotarLocal({ produto_id: m.produto_id, quantidade: m.quantidade, local: m.local, hora: Date.now() })
    carregarSaidas()
  }

  const rodape = (
    <section style={{ marginTop: 24 }}>
      <p style={tituloSecaoStyle}>Suas últimas saídas (hoje)</p>
      {saidas.length === 0 ? (
        <p style={{ color: D.text2, fontSize: 14, margin: '0 0 0 2px' }}>Nenhuma saída hoje ainda.</p>
      ) : (
        <Card>
          {saidas.map((s, idx) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderTop: idx > 0 ? `1px solid ${D.border}` : 'none' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', color: D.text, fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.produto}</span>
                <span style={{ display: 'block', color: D.text2, fontSize: 12, marginTop: 2 }}>
                  {NUM.format(s.quantidade)} {s.unidade}{s.local ? ` · ${NOME_LOCAL[s.local]}` : ''}
                </span>
              </span>
              <span suppressHydrationWarning style={{ color: D.text2, fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                {new Date(s.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}
        </Card>
      )}
    </section>
  )

  return <MovimentacaoTela titulo="Dar saída" subtitulo="Só saída · Principal ou Cozinha" somenteSaida onRegistrado={registrado} rodape={rodape} />
}
