'use client'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Page from '@/app/components/ui/Page'
import PageHeader from '@/app/components/ui/PageHeader'
import SearchBar from '@/app/components/ui/SearchBar'
import Card, { CARD_THUMB } from '@/app/components/ui/Card'
import Icon from '@/app/components/ui/Icon'
import CampoQuantidade from '@/app/components/ui/CampoQuantidade'

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
    controla_validade?: boolean
    fornecedores: { nome: string } | null
  } | null
}

import { Validade, diasAteVencer, controlaValidade } from '@/app/lib/validades'

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
  /** Lotes marcados → quantidade digitada (texto; '' enquanto a pessoa apaga). Marcado = tem a chave. */
  const [lotesSelecionados, setLotesSelecionados] = useState<Record<string, string>>({})
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

  // Mesma regra na tela e no confirmar: com validades cadastradas a quantidade
  // é a soma dos lotes marcados; sem validades, é o campo Quantidade.
  function usaLotes(item: Item) {
    return controlaValidade(item.produtos) && (validadesPorProduto[item.produto_id] ?? []).length > 0
  }
  const totalLotes = Object.values(lotesSelecionados).reduce((s, q) => s + (Number(q) || 0), 0)

  async function confirmar() {
    if (!selecionado || transferindo) return
    const qtd = usaLotes(selecionado) ? totalLotes : Number(quantidade) || 0
    if (!Number.isInteger(qtd) || qtd <= 0) return
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
    <Page>

      <PageHeader titulo="Transferência" subtitulo="Entre Principal e Cozinha" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        <SearchBar value={busca} onChange={setBusca} placeholder="Buscar produto..." />

        {/* Lista */}
        {filtrados.length === 0 ? (
          <p style={{ color: D.text2, fontSize: 14, textAlign: 'center', paddingTop: 40 }}>Nenhum produto encontrado.</p>
        ) : filtrados.map((item) => {
          const principal = Math.max(0, item.qtd_atual - (item.qtd_cozinha ?? 0))
          const cozinha = item.qtd_cozinha ?? 0
          const ultVal = ultimaValidadeTransferida[item.produto_id]

          return (
            <Card key={item.id}>
              <button onClick={() => abrirModal(item)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', width: '100%', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
                <FotoThumb src={item.produtos?.foto_url ?? null} size={CARD_THUMB} radius={14} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: D.text, fontWeight: 800, fontSize: 16, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.produtos?.nome ?? '—'}</p>
                  <p style={{ color: D.text2, fontSize: 13, margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.produtos?.fornecedores?.nome ?? '—'} · {item.produtos?.unidade}
                  </p>
                  <p style={{ color: D.text2, fontSize: 13, margin: '3px 0 0' }}>
                    Principal <strong style={{ color: D.text }}>{principal}</strong>
                    <span style={{ display: 'inline-block', width: 12 }} />
                    Cozinha <strong style={{ color: D.text }}>{cozinha}</strong>
                  </p>
                  {ultVal && (
                    <p style={{ display: 'flex', alignItems: 'center', gap: 6, color: D.text2, fontSize: 12, margin: '4px 0 0' }}>
                      <Icon nome="leftRight" size={14} />
                      Último lote: <strong style={{ color: D.text }}>{new Date(ultVal + 'T00:00:00').toLocaleDateString('pt-BR')}</strong>
                    </p>
                  )}
                </div>
                <span style={{ fontSize: 34, fontWeight: 800, lineHeight: 1, color: D.text, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {item.qtd_atual}
                </span>
              </button>
            </Card>
          )
        })}
      </div>

      {/* Modal transferência */}
      {selecionado && (() => {
        const principal = Math.max(0, selecionado.qtd_atual - (selecionado.qtd_cozinha ?? 0))
        const cozinha = selecionado.qtd_cozinha ?? 0
        const unidade = selecionado.produtos?.unidade ?? 'un'
        const disponivelOrigem = direcao === 'cozinha' ? principal : cozinha
        const semEstoque = disponivelOrigem === 0
        // Produto que não controla validade (ou sem validades cadastradas): só a quantidade
        const comLotes = usaLotes(selecionado)
        const vals = comLotes ? [...(validadesPorProduto[selecionado.produto_id] ?? [])].sort((a, b) => a.data_validade.localeCompare(b.data_validade)) : []
        const somaLotes = vals.reduce((s, v) => s + v.quantidade, 0)
        const semValidadeDisp = Math.max(0, selecionado.qtd_atual - somaLotes)
        const maxDoLote = (id: string) => id === '__sem__' ? semValidadeDisp : vals.find((v) => v.id === id)?.quantidade ?? 0
        const loteInvalido = Object.entries(lotesSelecionados).some(([id, q]) => !(Number(q) >= 1) || Number(q) > maxDoLote(id))
        const qtdEfetiva = comLotes ? totalLotes : Number(quantidade) || 0
        const marcarLote = (id: string, max: number) => setLotesSelecionados((prev) => {
          const next = { ...prev }
          if (id in next) delete next[id]
          else next[id] = String(Math.min(1, max))
          return next
        })
        const campoLote = (id: string, max: number) => (
          <CampoQuantidade tamanho="pequeno" valor={lotesSelecionados[id]} max={max} rotulo="Quantidade do lote"
            onMudar={(v) => setLotesSelecionados((prev) => ({ ...prev, [id]: v }))} />
        )

        return (
          <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50, background: 'rgba(0,0,0,0.6)' }}
            onClick={(e) => { if (e.target === e.currentTarget) fechar() }}>
            <div style={{ width: '100%', maxWidth: 480, background: D.card, borderRadius: '24px 24px 0 0', padding: '24px 18px calc(40px + env(safe-area-inset-bottom))', boxSizing: 'border-box', boxShadow: '0 -4px 40px rgba(0,0,0,0.5)', maxHeight: '90vh', overflowY: 'auto', overflowX: 'hidden' }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: D.border, margin: '0 auto 20px' }} />

              <p style={{ color: D.text2, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>Transferir</p>
              <p style={{ color: D.text, fontWeight: 700, fontSize: 16, marginBottom: 2 }}>{selecionado.produtos?.nome}</p>
              <p style={{ color: D.text2, fontSize: 12, marginBottom: 20 }}>
                Principal <strong style={{ color: D.text }}>{principal}</strong> · Cozinha <strong style={{ color: D.text }}>{cozinha}</strong>
              </p>

              {/* Direção */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                <button onClick={() => { setDirecao('cozinha'); setErroTransf(null) }}
                  style={{ padding: '16px 10px', borderRadius: 16, border: `2px solid ${direcao === 'cozinha' ? '#6366F1' : D.border}`, background: direcao === 'cozinha' ? 'rgba(99,102,241,0.1)' : D.input, color: direcao === 'cozinha' ? 'var(--accent-text)' : D.text, fontSize: 13, fontWeight: 700, cursor: 'pointer', lineHeight: 1.4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
                  <Icon nome="leftRight" size={20} />
                  Para cozinha
                </button>
                <button onClick={() => { setDirecao('principal'); setErroTransf(null) }}
                  style={{ padding: '16px 10px', borderRadius: 16, border: `2px solid ${direcao === 'principal' ? '#6366F1' : D.border}`, background: direcao === 'principal' ? 'rgba(99,102,241,0.1)' : D.input, color: direcao === 'principal' ? 'var(--accent-text)' : D.text, fontSize: 13, fontWeight: 700, cursor: 'pointer', lineHeight: 1.4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
                  <Icon nome="leftRight" size={20} />
                  Para principal
                </button>
              </div>

              {/* Validades — multi-select com qtd por lote */}
              {comLotes && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.25)', borderRadius: 10, padding: '8px 12px', marginBottom: 10 }}>
                      <Icon nome="alert" size={16} cor="#F97316" />
                      <p style={{ color: '#F97316', fontSize: 11, fontWeight: 700 }}>Retire sempre o lote mais antigo primeiro</p>
                    </div>
                    <p style={{ color: D.text2, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Selecione os lotes transferidos:</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {vals.map((v, idx) => {
                        const checked = v.id in lotesSelecionados
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
                            <button type="button" aria-label={checked ? 'Desmarcar lote' : 'Marcar lote'} onClick={() => marcarLote(v.id, v.quantidade)} style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${checked ? '#6366F1' : D.border}`, background: checked ? '#6366F1' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer', padding: 0 }}>
                              {checked && <Icon nome="tick" size={14} cor="#fff" traco={3} />}
                            </button>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                                <span style={{ color: corData, fontSize: 13, fontWeight: 700 }}>{dataFmt}</span>
                                {isFifo && <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 5, background: '#6366F1', color: '#fff' }}>FIFO</span>}
                                {urgBadge && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 5, background: `${urgColor}22`, color: urgColor }}>{urgBadge}</span>}
                              </div>
                              <span style={{ color: D.text2, fontSize: 11 }}>{v.quantidade} {unidade}</span>
                            </div>
                            {checked && campoLote(v.id, v.quantidade)}
                          </div>
                        )
                      })}

                      {semValidadeDisp > 0 && (() => {
                        const checked = '__sem__' in lotesSelecionados
                        return (
                          <div style={{ padding: '10px 14px', borderRadius: 12, border: `1.5px solid ${checked ? '#6366F1' : D.border}`, background: checked ? 'rgba(99,102,241,0.08)' : D.input, display: 'flex', alignItems: 'center', gap: 10 }}>
                            <button type="button" aria-label={checked ? 'Desmarcar lote' : 'Marcar lote'} onClick={() => marcarLote('__sem__', semValidadeDisp)} style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${checked ? '#6366F1' : D.border}`, background: checked ? '#6366F1' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer', padding: 0 }}>
                              {checked && <Icon nome="tick" size={14} cor="#fff" traco={3} />}
                            </button>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: D.text }}>Sem validade</span>
                              <span style={{ fontSize: 11, color: D.text2, display: 'block' }}>{semValidadeDisp} {unidade}</span>
                            </div>
                            {checked && campoLote('__sem__', semValidadeDisp)}
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
              )}

              {/* Quantidade — apenas quando não há lotes */}
              {!comLotes && (
                <>
                  <p style={{ color: D.text2, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
                    Quantidade <span style={{ color: D.muted }}>({disponivelOrigem} disponível)</span>
                  </p>
                  <div style={{ marginBottom: 20 }}>
                    <CampoQuantidade valor={quantidade} max={disponivelOrigem} onMudar={setQuantidade} onEnter={confirmar} />
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
                const semLote = comLotes && Object.keys(lotesSelecionados).length === 0
                const acima = !semEstoque && qtdEfetiva > disponivelOrigem
                const desabilitado = transferindo || semEstoque || semLote || loteInvalido || qtdEfetiva <= 0 || acima
                return (
                  <>
                    {acima && (
                      <p style={{ color: '#EF4444', fontSize: 12, fontWeight: 600, textAlign: 'center', marginBottom: 10 }}>
                        {direcao === 'cozinha' ? 'O principal' : 'A cozinha'} só tem {disponivelOrigem} {unidade}
                      </p>
                    )}
                    <button onClick={confirmar} disabled={desabilitado}
                      style={{ width: '100%', padding: '14px', borderRadius: 16, background: '#6366F1', color: '#fff', border: 'none', fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: desabilitado ? 0.5 : 1 }}>
                      {transferindo ? 'Transferindo...' : semEstoque ? 'Sem estoque na origem' : semLote ? 'Selecione pelo menos 1 lote'
                        : qtdEfetiva > 0 ? `Transferir ${qtdEfetiva} ${unidade}` : 'Confirmar'}
                    </button>
                  </>
                )
              })()}
            </div>
          </div>
        )
      })()}
    </Page>
  )
}
