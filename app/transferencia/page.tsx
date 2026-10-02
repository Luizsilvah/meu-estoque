'use client'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

import { D } from '@/app/lib/theme'
import FotoThumb from '@/app/components/FotoThumb'
import { buscarEstoque, invalidarEstoqueCache } from '@/app/lib/estoqueCache'

type Item = {
  id: string
  produto_id: string
  qtd_atual: number
  qtd_cozinha: number
  qtd_base: number
  produtos: {
    id: string
    nome: string
    unidade: string
    foto_url: string | null
    fornecedores: { nome: string } | null
  } | null
}

import { Validade, diasAteVencer } from '@/app/lib/validades'

const inputStyle: React.CSSProperties = {
  background: D.input, border: `1px solid ${D.border}`, borderRadius: 12,
  padding: '10px 14px', fontSize: 14, color: D.text, outline: 'none', width: '100%', boxSizing: 'border-box',
}

export default function Transferencia() {
  return (
    <Suspense>
      <TransferenciaContent />
    </Suspense>
  )
}

function TransferenciaContent() {
  const searchParams = useSearchParams()
  const [dados, setDados] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [validadesPorProduto, setValidadesPorProduto] = useState<Record<string, Validade[]>>({})

  const [selecionado, setSelecionado] = useState<Item | null>(null)
  const [direcao, setDirecao] = useState<'cozinha' | 'principal'>('cozinha')
  const [quantidade, setQuantidade] = useState('1')
  const [lotesSelecionados, setLotesSelecionados] = useState<Record<string, number>>({})
  const [transferindo, setTransferindo] = useState(false)
  const [erroTransf, setErroTransf] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [ultimaValidadeTransferida, setUltimaValidadeTransferida] = useState<Record<string, string>>({})

  useEffect(() => {
    Promise.all([
      buscarEstoque(),
      fetch('/api/validades/todos').then((r) => r.ok ? r.json() : []),
    ]).then(([jsonE, jsonV]) => {
      setDados(jsonE as unknown as Item[])
      if (Array.isArray(jsonV)) {
        const mapa: Record<string, Validade[]> = {}
        for (const v of jsonV as Validade[]) {
          if (!mapa[v.produto_id]) mapa[v.produto_id] = []
          mapa[v.produto_id].push(v)
        }
        setValidadesPorProduto(mapa)
      }
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  // Auto-seleciona produto passado via ?produto=NAME (ex: vindo do scanner da home)
  useEffect(() => {
    if (loading || dados.length === 0) return
    const nomeBuscado = searchParams.get('produto')
    if (!nomeBuscado) return
    const item = dados.find((i) => i.produtos?.nome.toLowerCase() === nomeBuscado.toLowerCase())
    if (item) abrirModal(item)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, dados])

  const filtrados = useMemo(() => {
    const f = busca
      ? dados.filter((i) => i.produtos?.nome.toLowerCase().includes(busca.toLowerCase()))
      : dados
    return [...f].sort((a, b) => (a.produtos?.nome ?? '').localeCompare(b.produtos?.nome ?? '', 'pt-BR'))
  }, [dados, busca])

  function abrirModal(item: Item) {
    setSelecionado(item)
    setDirecao('cozinha')
    setQuantidade('1')
    setLotesSelecionados({})
    setErroTransf(null)
    setFeedback(null)
  }

  function fechar() { setSelecionado(null); setFeedback(null); setErroTransf(null) }

  function ajustarQtd(delta: number) {
    setQuantidade((prev) => String(Math.max(1, (Number(prev) || 1) + delta)))
  }

  async function confirmar() {
    if (!selecionado) return
    const vals = [...(validadesPorProduto[selecionado.produto_id] ?? [])]
    const hasLotes = vals.length > 0
    const totalLotes = Object.values(lotesSelecionados).reduce((s, q) => s + q, 0)
    const qtd = hasLotes ? totalLotes : Math.max(1, Number(quantidade) || 1)
    if (qtd <= 0) return
    setTransferindo(true)
    setErroTransf(null)
    try {
      const res = await fetch('/api/estoque/transferir', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produto_id: selecionado.produto_id, quantidade: qtd, direction: direcao }),
      })
      const json = await res.json()
      if (!res.ok || json.erro) { setErroTransf(json.erro ?? 'Erro ao transferir'); return }
      invalidarEstoqueCache()
      const novaQtdCozinha: number = json.qtd_cozinha
      setDados((prev) => prev.map((item) =>
        item.id === selecionado.id ? { ...item, qtd_cozinha: novaQtdCozinha } : item
      ))
      setSelecionado((prev) => prev ? { ...prev, qtd_cozinha: novaQtdCozinha } : null)
      const firstLoteId = Object.keys(lotesSelecionados).find((k) => k !== '__sem__')
      if (firstLoteId) {
        const valObj = (validadesPorProduto[selecionado.produto_id] ?? []).find((v) => v.id === firstLoteId)
        if (valObj) setUltimaValidadeTransferida((prev) => ({ ...prev, [selecionado.produto_id]: valObj.data_validade }))
      }
      setFeedback('Transferido!')
      setQuantidade('1')
      setTimeout(fechar, 900)
    } catch { setErroTransf('Erro de conexão') }
    finally { setTransferindo(false) }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: D.bg }}>
      <p style={{ color: D.text2, fontSize: 14 }}>Carregando...</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: D.bg }}>

      {/* Header */}
      <div style={{ background: 'var(--page-header)', borderBottom: `1px solid ${D.border}`, padding: '48px 20px 20px' }}>
        <Link href="/" style={{ color: D.text2, fontSize: 13, textDecoration: 'none', display: 'block', marginBottom: 12 }}>← Voltar</Link>
        <h1 style={{ color: D.text, fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>Transferência</h1>
        <p style={{ color: D.muted, fontSize: 13, marginTop: 4 }}>Mover produtos entre Principal e Cozinha</p>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Busca */}
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: D.muted }}>🔍</span>
          <input type="text" placeholder="Buscar produto..."
            value={busca} onChange={(e) => setBusca(e.target.value)}
            style={{ width: '100%', background: D.card, border: `1px solid ${D.border}`, borderRadius: 14, padding: '12px 14px 12px 36px', fontSize: 14, color: D.text, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        {/* Lista */}
        {filtrados.length === 0 ? (
          <p style={{ color: D.text2, fontSize: 14, textAlign: 'center', paddingTop: 40 }}>Nenhum produto encontrado.</p>
        ) : filtrados.map((item) => {
          const principal = Math.max(0, item.qtd_atual - (item.qtd_cozinha ?? 0))
          const cozinha = item.qtd_cozinha ?? 0
          const ultVal = ultimaValidadeTransferida[item.produto_id]

          return (
            <button key={item.id} onClick={() => abrirModal(item)}
              style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 16, padding: 14, textAlign: 'left', cursor: 'pointer', width: '100%' }}>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <FotoThumb src={item.produtos?.foto_url ?? null} />
                <div style={{ minWidth: 0 }}>
                  <p style={{ color: D.text, fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.produtos?.nome ?? '—'}</p>
                  <p style={{ color: D.text2, fontSize: 12, marginTop: 2 }}>
                    {item.produtos?.fornecedores?.nome ?? '—'} · {item.produtos?.unidade}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 0, background: D.input, borderRadius: 12, overflow: 'hidden' }}>
                {[
                  { label: '🏪 Principal', value: principal },
                  { label: '🍳 Cozinha', value: cozinha },
                  { label: 'Total', value: item.qtd_atual },
                ].map((stat, i) => (
                  <div key={i} style={{ flex: 1, padding: '8px 10px', textAlign: 'center', borderRight: i < 2 ? `1px solid ${D.border}` : 'none' }}>
                    <p style={{ fontSize: 10, color: D.muted, fontWeight: 600, marginBottom: 2 }}>{stat.label}</p>
                    <p style={{ fontSize: 18, fontWeight: 800, color: D.text }}>{stat.value}</p>
                  </div>
                ))}
              </div>

              {ultVal && (
                <p style={{ fontSize: 11, color: D.muted, marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>↔</span>
                  <span>Último lote transferido: <span style={{ fontWeight: 700, color: D.text2 }}>{new Date(ultVal + 'T00:00:00').toLocaleDateString('pt-BR')}</span></span>
                </p>
              )}
            </button>
          )
        })}
      </div>

      {/* Modal transferência */}
      {selecionado && (() => {
        const principal = Math.max(0, selecionado.qtd_atual - (selecionado.qtd_cozinha ?? 0))
        const cozinha = selecionado.qtd_cozinha ?? 0
        const unidade = selecionado.produtos?.unidade ?? 'un'
        const disponivelOrigem = direcao === 'cozinha' ? principal : cozinha
        const qtd = Math.max(1, Number(quantidade) || 1)
        const semEstoque = disponivelOrigem === 0
        const vals = [...(validadesPorProduto[selecionado.produto_id] ?? [])].sort((a, b) => a.data_validade.localeCompare(b.data_validade))

        return (
          <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50, background: 'rgba(0,0,0,0.6)' }}
            onClick={(e) => { if (e.target === e.currentTarget) fechar() }}>
            <div style={{ width: '100%', maxWidth: 480, background: D.card, borderRadius: '24px 24px 0 0', padding: '24px 24px 40px', boxShadow: '0 -4px 40px rgba(0,0,0,0.5)', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: D.border, margin: '0 auto 20px' }} />

              <p style={{ color: D.text2, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>Transferir</p>
              <p style={{ color: D.text, fontWeight: 700, fontSize: 16, marginBottom: 2 }}>{selecionado.produtos?.nome}</p>
              <p style={{ color: D.text2, fontSize: 12, marginBottom: 20 }}>
                🏪 {principal} no principal · 🍳 {cozinha} na cozinha
              </p>

              {/* Direção */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                <button onClick={() => { setDirecao('cozinha'); setErroTransf(null) }}
                  style={{ padding: '16px 10px', borderRadius: 16, border: `2px solid ${direcao === 'cozinha' ? '#6366F1' : D.border}`, background: direcao === 'cozinha' ? 'rgba(99,102,241,0.1)' : D.input, color: direcao === 'cozinha' ? '#6366F1' : D.text, fontSize: 13, fontWeight: 700, cursor: 'pointer', lineHeight: 1.4 }}>
                  🏪 → 🍳{'\n'}Para cozinha
                </button>
                <button onClick={() => { setDirecao('principal'); setErroTransf(null) }}
                  style={{ padding: '16px 10px', borderRadius: 16, border: `2px solid ${direcao === 'principal' ? '#6366F1' : D.border}`, background: direcao === 'principal' ? 'rgba(99,102,241,0.1)' : D.input, color: direcao === 'principal' ? '#6366F1' : D.text, fontSize: 13, fontWeight: 700, cursor: 'pointer', lineHeight: 1.4 }}>
                  🍳 → 🏪{'\n'}Para principal
                </button>
              </div>

              {/* Validades — multi-select com qtd por lote */}
              {(() => {
                const somaLotes = vals.reduce((s, v) => s + v.quantidade, 0)
                const semValidadeDisp = Math.max(0, selecionado.qtd_atual - somaLotes)
                const hasLoteSection = vals.length > 0 || semValidadeDisp > 0
                const totalLotes = Object.values(lotesSelecionados).reduce((s, q) => s + q, 0)

                if (!hasLoteSection) return null
                return (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.25)', borderRadius: 10, padding: '8px 12px', marginBottom: 10 }}>
                      <span style={{ fontSize: 14 }}>📋</span>
                      <p style={{ color: '#F97316', fontSize: 11, fontWeight: 700 }}>Retire sempre o lote mais antigo primeiro</p>
                    </div>
                    <p style={{ color: D.text2, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Selecione os lotes transferidos:</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {vals.map((v, idx) => {
                        const qtdSel = lotesSelecionados[v.id] ?? 0
                        const checked = qtdSel > 0
                        const dias = diasAteVencer(v.data_validade)
                        const dataFmt = new Date(v.data_validade + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                        const isFifo = idx === 0
                        let corData: string = D.text
                        let urgBadge = ''
                        let urgColor = ''
                        if (dias < 0) { corData = '#EF4444'; urgBadge = 'Vencido'; urgColor = '#EF4444' }
                        else if (dias <= 7) { corData = '#F97316'; urgBadge = `${dias}d`; urgColor = '#F97316' }
                        else if (dias <= 30) { corData = '#F59E0B' }
                        return (
                          <div key={v.id} style={{ padding: '10px 14px', borderRadius: 12, border: `1.5px solid ${checked ? '#6366F1' : D.border}`, background: checked ? 'rgba(99,102,241,0.08)' : D.input, display: 'flex', alignItems: 'center', gap: 10 }}>
                            <button onClick={() => setLotesSelecionados((prev) => {
                              const next = { ...prev }
                              if (next[v.id]) { delete next[v.id] } else { next[v.id] = Math.min(1, v.quantidade) }
                              return next
                            })} style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${checked ? '#6366F1' : D.border}`, background: checked ? '#6366F1' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer', padding: 0 }}>
                              {checked && <span style={{ color: '#fff', fontSize: 11, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                            </button>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ color: corData, fontSize: 13, fontWeight: 700 }}>{dataFmt}</span>
                                {isFifo && <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 5, background: '#6366F1', color: '#fff' }}>FIFO</span>}
                                {urgBadge && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 5, background: `${urgColor}22`, color: urgColor }}>{urgBadge}</span>}
                              </div>
                              <span style={{ color: D.text2, fontSize: 11 }}>{v.quantidade} {unidade}</span>
                            </div>
                            {checked && (
                              <input type="number" min="1" max={v.quantidade} value={qtdSel}
                                onChange={(e) => {
                                  const val = Math.min(v.quantidade, Math.max(1, Number(e.target.value) || 1))
                                  setLotesSelecionados((prev) => ({ ...prev, [v.id]: val }))
                                }}
                                style={{ width: 60, background: D.card, border: `1px solid ${D.border}`, borderRadius: 8, padding: '5px 8px', fontSize: 14, fontWeight: 700, textAlign: 'center', color: D.text, outline: 'none' }}
                              />
                            )}
                          </div>
                        )
                      })}

                      {semValidadeDisp > 0 && (() => {
                        const qtdSel = lotesSelecionados['__sem__'] ?? 0
                        const checked = qtdSel > 0
                        return (
                          <div style={{ padding: '10px 14px', borderRadius: 12, border: `1.5px solid ${checked ? '#6366F1' : D.border}`, background: checked ? 'rgba(99,102,241,0.08)' : D.input, display: 'flex', alignItems: 'center', gap: 10 }}>
                            <button onClick={() => setLotesSelecionados((prev) => {
                              const next = { ...prev }
                              if (next['__sem__']) { delete next['__sem__'] } else { next['__sem__'] = Math.min(1, semValidadeDisp) }
                              return next
                            })} style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${checked ? '#6366F1' : D.border}`, background: checked ? '#6366F1' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer', padding: 0 }}>
                              {checked && <span style={{ color: '#fff', fontSize: 11, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                            </button>
                            <div style={{ flex: 1 }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: D.text }}>Sem validade</span>
                              <span style={{ fontSize: 11, color: D.text2, display: 'block' }}>{semValidadeDisp} {unidade}</span>
                            </div>
                            {checked && (
                              <input type="number" min="1" max={semValidadeDisp} value={qtdSel}
                                onChange={(e) => {
                                  const val = Math.min(semValidadeDisp, Math.max(1, Number(e.target.value) || 1))
                                  setLotesSelecionados((prev) => ({ ...prev, ['__sem__']: val }))
                                }}
                                style={{ width: 60, background: D.card, border: `1px solid ${D.border}`, borderRadius: 8, padding: '5px 8px', fontSize: 14, fontWeight: 700, textAlign: 'center', color: D.text, outline: 'none' }}
                              />
                            )}
                          </div>
                        )
                      })()}
                    </div>

                    {totalLotes > 0 && (
                      <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: '8px 12px', marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: D.text2 }}>Total a transferir</span>
                        <span style={{ fontSize: 15, fontWeight: 800, color: '#6366F1' }}>{totalLotes} {unidade}</span>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Quantidade — apenas quando não há lotes */}
              {vals.length === 0 && (
                <>
                  <p style={{ color: D.text2, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
                    Quantidade <span style={{ color: D.muted }}>({disponivelOrigem} disponível)</span>
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                    <button onClick={() => ajustarQtd(-1)}
                      style={{ width: 48, height: 48, borderRadius: 14, border: `1px solid ${D.border}`, background: D.input, color: D.text, fontSize: 22, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                      −
                    </button>
                    <input type="number" min="1" value={quantidade} onChange={(e) => setQuantidade(e.target.value)}
                      style={{ ...inputStyle, textAlign: 'center', fontSize: 24, fontWeight: 800, padding: '10px 6px' }} />
                    <button onClick={() => ajustarQtd(1)}
                      style={{ width: 48, height: 48, borderRadius: 14, border: `1px solid ${D.border}`, background: D.input, color: D.text, fontSize: 22, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                      +
                    </button>
                  </div>
                </>
              )}

              {erroTransf && (
                <p style={{ color: '#EF4444', fontSize: 13, fontWeight: 600, textAlign: 'center', marginBottom: 12 }}>{erroTransf}</p>
              )}
              {feedback && (
                <p style={{ color: '#10B981', fontSize: 13, fontWeight: 600, textAlign: 'center', marginBottom: 12 }}>{feedback}</p>
              )}

              {(() => {
                const somaLotes = vals.reduce((s, v) => s + v.quantidade, 0)
                const semValidadeDisp = Math.max(0, selecionado.qtd_atual - somaLotes)
                const hasLotes = vals.length > 0 || semValidadeDisp > 0
                const totalLotes = Object.values(lotesSelecionados).reduce((s, q) => s + q, 0)
                const qtdEfetiva = hasLotes ? totalLotes : qtd
                const desabilitado = transferindo || semEstoque || qtdEfetiva <= 0 || qtdEfetiva > disponivelOrigem || (hasLotes && totalLotes === 0)
                return (
                  <button onClick={confirmar} disabled={desabilitado}
                    style={{ width: '100%', padding: '14px', borderRadius: 16, background: '#6366F1', color: '#fff', border: 'none', fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: desabilitado ? 0.5 : 1 }}>
                    {transferindo ? 'Transferindo...' : semEstoque ? 'Sem estoque na origem' : (hasLotes && totalLotes === 0) ? 'Selecione pelo menos 1 lote' : 'Confirmar'}
                  </button>
                )
              })()}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
