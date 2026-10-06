'use client'
import { useMemo, useState } from 'react'

import { D } from '@/app/lib/theme'
import { Validade, diasAteVencer } from '@/app/lib/validades'
import type { ItemValidadeDivergente } from '@/app/api/validades-divergentes/route'

// Abas "Divergentes" e "Sem validade cadastrada" de /validades (conteúdo que
// antes era a página /validades-divergentes; a lista é carregada pela página).
export type AbaDivergentes = 'divergentes' | 'sem_validade'

// Linha de lote a ADICIONAR (falta de validade): texto cru do input; parse só
// na validação. key só serve de chave estável no React.
type LinhaEntrada = { key: number; data: string; qtd: string }

const COR_SOBRA = '#F97316'
const COR_FALTA = '#EF4444'

// Quantidades de lote são inteiras na RPC (jsonb_to_recordset ... quantidade integer).
function parseQtd(v: string): number {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) && n > 0 ? n : 0
}

function formatarData(data: string): string {
  return new Date(data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function lotesOrdenados(vals: Validade[]): Validade[] {
  return [...vals].sort((a, b) => a.data_validade.localeCompare(b.data_validade))
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: D.input, border: `1px solid ${D.border}`, borderRadius: 12,
  padding: '10px 14px', fontSize: 14, color: D.text, outline: 'none', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: D.text2, marginBottom: 4, marginLeft: 2 }

function resumoDiferenca(item: ItemValidadeDivergente): { texto: string; cor: string; bg: string } {
  const n = Math.abs(item.diferenca)
  const un = item.unidade ? ` ${item.unidade}` : ''
  if (item.tipo === 'SOBRA_VALIDADE') return { texto: `+${n}${un} sobrando`, cor: COR_SOBRA, bg: 'rgba(249,115,22,0.15)' }
  if (item.tipo === 'FALTA_VALIDADE') return { texto: `−${n}${un} faltando`, cor: COR_FALTA, bg: 'rgba(239,68,68,0.15)' }
  return { texto: `${n}${un} sem validade`, cor: COR_FALTA, bg: 'rgba(239,68,68,0.15)' }
}

export default function ListaDivergentes({ aba, itens, setItens, recarregar }: {
  aba: AbaDivergentes
  itens: ItemValidadeDivergente[]
  setItens: React.Dispatch<React.SetStateAction<ItemValidadeDivergente[]>>
  recarregar: () => void
}) {
  const [busca, setBusca] = useState('')
  const [corrigindo, setCorrigindo] = useState<ItemValidadeDivergente | null>(null)
  const [aviso, setAviso] = useState<{ msg: string; ok: boolean } | null>(null)

  const visiveis = useMemo(() => {
    const base = itens.filter((i) => aba === 'divergentes' ? i.tipo !== 'SEM_VALIDADE' : i.tipo === 'SEM_VALIDADE')
    const termo = busca.trim().toLowerCase()
    return termo ? base.filter((i) => i.nome.toLowerCase().includes(termo)) : base
  }, [aba, itens, busca])

  function aoCorrigir(produtoId: string, nome: string) {
    setCorrigindo(null)
    setItens((prev) => prev.filter((i) => i.produto_id !== produtoId))
    setAviso({ msg: `✓ ${nome} corrigido`, ok: true })
    setTimeout(() => setAviso(null), 2500)
  }

  // Estoque/lotes mudaram por fora desde que a lista carregou: fecha o modal
  // (os números dele estão velhos) e recarrega a lista.
  function aoDesatualizar(msg: string) {
    setCorrigindo(null)
    setAviso({ msg, ok: false })
    recarregar()
  }

  return (
    <>
        <p style={{ color: D.muted, fontSize: 13, margin: '0 2px' }}>
          {aba === 'divergentes'
            ? 'Produtos em que a soma dos lotes não bate com o estoque'
            : 'Produtos com estoque e nenhuma validade cadastrada'}
        </p>

        {/* Busca */}
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: D.muted }}>🔍</span>
          <input type="text" placeholder="Buscar produto..."
            value={busca} onChange={(e) => setBusca(e.target.value)}
            style={{ width: '100%', background: D.card, border: `1px solid ${D.border}`, borderRadius: 14, padding: '12px 14px 12px 36px', fontSize: 16, color: D.text, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        {aviso && (
          <p style={{ color: aviso.ok ? '#10B981' : '#EF4444', fontSize: 13, fontWeight: 700, textAlign: 'center', background: aviso.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', borderRadius: 12, padding: '10px 14px' }}>{aviso.msg}</p>
        )}

        {visiveis.length === 0 ? (
          busca.trim() ? (
            <p style={{ color: D.text2, fontSize: 14, textAlign: 'center', paddingTop: 40 }}>Nenhum produto encontrado.</p>
          ) : (
            <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 16, padding: 24, textAlign: 'center' }}>
              <p style={{ color: '#10B981', fontWeight: 700, fontSize: 15 }}>
                {aba === 'divergentes' ? 'Todas as validades batem com o estoque!' : 'Todo produto com estoque tem validade cadastrada!'}
              </p>
            </div>
          )
        ) : visiveis.map((item) => {
          const dif = resumoDiferenca(item)
          return (
            <div key={item.produto_id} style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 16, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ color: D.text, fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.nome}</p>
                  <p style={{ color: D.text2, fontSize: 12, marginTop: 2 }}>{item.fornecedor ?? 'Sem fornecedor'}</p>
                </div>
                <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 800, padding: '4px 10px', borderRadius: 20, background: dif.bg, color: dif.cor, whiteSpace: 'nowrap' }}>
                  {dif.texto}
                </span>
              </div>

              <p style={{ color: D.text2, fontSize: 13, marginTop: 8 }}>
                Estoque <strong style={{ color: D.text }}>{item.qtd_estoque}</strong> · Validades <strong style={{ color: D.text }}>{item.qtd_validades}</strong>
              </p>

              {item.lotes.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {lotesOrdenados(item.lotes).map((l) => {
                    const vencido = diasAteVencer(l.data_validade) < 0
                    return (
                      <span key={l.id} style={{ fontSize: 12, fontWeight: 600, padding: '4px 9px', borderRadius: 10, border: `1px solid ${vencido ? 'rgba(239,68,68,0.4)' : D.border}`, background: vencido ? 'rgba(239,68,68,0.08)' : D.input, color: vencido ? '#EF4444' : D.text }}>
                        {formatarData(l.data_validade)}{vencido ? ' · Vencido' : ''}
                        <span style={{ color: vencido ? '#EF4444' : D.text2, fontWeight: 500 }}> · {l.quantidade}</span>
                      </span>
                    )
                  })}
                </div>
              )}

              <button onClick={() => setCorrigindo(item)}
                style={{ width: '100%', marginTop: 12, padding: '11px', borderRadius: 12, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.35)', color: '#6366F1', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                Corrigir
              </button>
            </div>
          )
        })}

      {corrigindo && (
        <ModalCorrigir
          key={corrigindo.produto_id}
          item={corrigindo}
          onFechar={() => setCorrigindo(null)}
          onSalvo={() => aoCorrigir(corrigindo.produto_id, corrigindo.nome)}
          onDesatualizado={aoDesatualizar}
        />
      )}
    </>
  )
}

// Mesmo visual do modal de lotes da Conferência (app/conferencia/page.tsx).
// SOBRA: escolhe quanto tirar de cada lote (pré-preenchido por data — os
// vencidos são os mais antigos, então saem primeiro; depois FEFO).
// FALTA / SEM_VALIDADE: N linhas data + qtd para as unidades sem lote.
function ModalCorrigir({ item, onFechar, onSalvo, onDesatualizado }: {
  item: ItemValidadeDivergente
  onFechar: () => void
  onSalvo: () => void
  onDesatualizado: (msg: string) => void
}) {
  const sobra = item.tipo === 'SOBRA_VALIDADE'
  const alvo = Math.abs(item.diferenca)
  const unidade = item.unidade ?? ''
  const vals = useMemo(() => lotesOrdenados(item.lotes), [item.lotes])

  const [linhasEntrada, setLinhasEntrada] = useState<LinhaEntrada[]>(() => [{ key: Date.now(), data: '', qtd: String(alvo) }])
  const [qtdSaidaPorLote, setQtdSaidaPorLote] = useState<Record<string, string>>(() => {
    const mapa: Record<string, string> = {}
    if (!sobra) return mapa
    let restante = alvo
    for (const v of vals) {
      const tira = Math.min(v.quantidade, restante)
      mapa[v.id] = tira > 0 ? String(tira) : ''
      restante -= tira
    }
    return mapa
  })
  const [salvando, setSalvando] = useState(false)
  const [erroSalvar, setErroSalvar] = useState('')

  let soma = 0
  let motivoBloqueio = ''
  const lotesAdd: { data_validade: string; quantidade: number }[] = []
  const lotesRemover: { validade_id: string; quantidade: number }[] = []

  if (sobra) {
    for (const v of vals) {
      const q = Math.min(parseQtd(qtdSaidaPorLote[v.id] ?? ''), v.quantidade)
      soma += q
      if (q > 0) lotesRemover.push({ validade_id: v.id, quantidade: q })
    }
    if (soma < alvo) motivoBloqueio = `Faltam ${alvo - soma} ${unidade} para zerar a sobra.`
    else if (soma > alvo) motivoBloqueio = `Está removendo ${soma - alvo} ${unidade} a mais.`
  } else {
    soma = linhasEntrada.reduce((s, l) => s + parseQtd(l.qtd), 0)
    if (linhasEntrada.some((l) => parseQtd(l.qtd) > 0 && !l.data)) motivoBloqueio = 'Informe a data de validade de todos os lotes.'
    else if (linhasEntrada.some((l) => l.data && parseQtd(l.qtd) === 0)) motivoBloqueio = 'Informe a quantidade de todos os lotes.'
    else if (soma < alvo) motivoBloqueio = `Faltam ${alvo - soma} ${unidade} nos lotes.`
    else if (soma > alvo) motivoBloqueio = `Os lotes passam ${soma - alvo} ${unidade} do que falta.`
    if (!motivoBloqueio) {
      // Junta linhas com a mesma data (a RPC somaria igual, mas manda limpo).
      const porData = new Map<string, number>()
      for (const l of linhasEntrada) {
        const q = parseQtd(l.qtd)
        if (l.data && q > 0) porData.set(l.data, (porData.get(l.data) ?? 0) + q)
      }
      for (const [data_validade, quantidade] of porData) lotesAdd.push({ data_validade, quantidade })
    }
  }

  const contadorOk = soma === alvo
  const podeSalvar = !motivoBloqueio && !salvando

  function somarEmLoteExistente(data: string) {
    setLinhasEntrada((prev) => {
      if (prev.some((l) => l.data === data)) return prev
      const vazia = prev.findIndex((l) => !l.data)
      if (vazia >= 0) return prev.map((l, i) => i === vazia ? { ...l, data } : l)
      const resto = alvo - prev.reduce((s, l) => s + parseQtd(l.qtd), 0)
      return [...prev, { key: Date.now(), data, qtd: resto > 0 ? String(resto) : '' }]
    })
  }

  function adicionarLinha() {
    setLinhasEntrada((prev) => {
      const resto = alvo - prev.reduce((s, l) => s + parseQtd(l.qtd), 0)
      return [...prev, { key: Date.now(), data: '', qtd: resto > 0 ? String(resto) : '' }]
    })
  }

  async function salvar() {
    if (!podeSalvar) return
    setSalvando(true)
    setErroSalvar('')
    try {
      const res = await fetch('/api/validades-divergentes/corrigir', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produto_id: item.produto_id, lotes_add: lotesAdd, lotes_remover: lotesRemover }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || json?.erro) {
        const msg = json?.erro ?? 'Erro ao salvar'
        if (res.status === 409) onDesatualizado(msg)
        else setErroSalvar(msg)
        return
      }
      onSalvo()
    } catch {
      setErroSalvar('Erro de conexão')
    } finally { setSalvando(false) }
  }

  const campoStyle: React.CSSProperties = { ...inputStyle, fontSize: 16, padding: '12px 10px', minWidth: 0 }
  const corDif = sobra ? COR_SOBRA : COR_FALTA

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 70, background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => { if (e.target === e.currentTarget && !salvando) onFechar() }}>
      <div style={{ width: '100%', maxWidth: 480, maxHeight: '92vh', overflowY: 'auto', overflowX: 'hidden', background: D.card, borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', boxShadow: '0 -4px 40px rgba(0,0,0,0.5)' }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: D.border, margin: '0 auto 20px' }} />
        <p style={{ color: D.text2, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>
          {sobra ? 'Quais lotes remover?' : 'Qual a validade das unidades sem lote?'}
        </p>
        <p style={{ color: D.text, fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{item.nome}</p>
        <p style={{ color: D.text2, fontSize: 13, marginBottom: 2 }}>
          Estoque {item.qtd_estoque} · Validades {item.qtd_validades}
        </p>
        <p style={{ color: corDif, fontSize: 13, fontWeight: 700, marginBottom: 16 }}>
          {sobra ? `Sobram ${alvo} ${unidade} nos lotes` : `Faltam ${alvo} ${unidade} sem validade`}
        </p>

        {sobra ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {vals.map((v) => {
              const dias = diasAteVencer(v.data_validade)
              const vencido = dias < 0
              const cor = vencido ? '#EF4444' : dias <= 7 ? '#F97316' : D.text
              return (
                <div key={v.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 88px', gap: 10, alignItems: 'center', padding: '10px 12px', borderRadius: 16, border: `1px solid ${vencido ? 'rgba(239,68,68,0.4)' : D.border}`, background: vencido ? 'rgba(239,68,68,0.08)' : D.input }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ color: cor, fontSize: 14, fontWeight: 700, margin: 0 }}>{formatarData(v.data_validade)}{vencido ? ' · Vencido' : ''}</p>
                    <p style={{ color: D.text2, fontSize: 12, margin: '2px 0 0' }}>Lote tem {v.quantidade} {unidade}</p>
                  </div>
                  <input type="number" min="0" max={v.quantidade} step="1" inputMode="numeric" placeholder="0" disabled={salvando}
                    aria-label={`Remover do lote ${formatarData(v.data_validade)}`}
                    value={qtdSaidaPorLote[v.id] ?? ''}
                    onChange={(e) => {
                      const raw = e.target.value
                      // Não deixa passar do que o lote tem.
                      const val = raw === '' ? '' : String(Math.min(parseQtd(raw), v.quantidade))
                      setQtdSaidaPorLote((prev) => ({ ...prev, [v.id]: val }))
                    }}
                    style={{ ...campoStyle, background: D.card, textAlign: 'center', fontWeight: 700 }} />
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {vals.length > 0 && (
              <div>
                <label style={labelStyle}>Somar num lote existente</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {vals.map((v) => {
                    const dias = diasAteVencer(v.data_validade)
                    const vencido = dias < 0
                    const usado = linhasEntrada.some((l) => l.data === v.data_validade)
                    return (
                      <button key={v.id} type="button" onClick={() => somarEmLoteExistente(v.data_validade)} disabled={salvando || usado}
                        style={{ padding: '10px 12px', borderRadius: 12, border: `1px solid ${vencido ? 'rgba(239,68,68,0.4)' : usado ? '#6366F1' : D.border}`, background: vencido ? 'rgba(239,68,68,0.08)' : usado ? 'rgba(99,102,241,0.08)' : D.input, color: vencido ? '#EF4444' : dias <= 7 ? '#F97316' : D.text, fontSize: 13, fontWeight: 600, cursor: usado ? 'default' : 'pointer', opacity: usado ? 0.7 : 1 }}>
                        {usado ? '✓ ' : '+ '}{formatarData(v.data_validade)}{vencido ? ' · Vencido' : ''}
                        <span style={{ color: D.text2, fontWeight: 500 }}> · {v.quantidade} {unidade}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 88px 44px', gap: 8, marginTop: 4 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Validade</label>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Qtd</label>
              <span />
            </div>
            {linhasEntrada.map((l) => {
              const dias = l.data ? diasAteVencer(l.data) : null
              const vencido = dias != null && dias < 0
              return (
                <div key={l.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 88px 44px', gap: 8, alignItems: 'center' }}>
                  <input type="date" value={l.data} disabled={salvando} aria-label="Data de validade"
                    onChange={(e) => { const data = e.target.value; setLinhasEntrada((prev) => prev.map((x) => x.key === l.key ? { ...x, data } : x)) }}
                    style={{ ...campoStyle, ...(vencido ? { border: '1px solid rgba(239,68,68,0.5)', color: '#EF4444' } : {}) }} />
                  <input type="number" min="1" step="1" inputMode="numeric" value={l.qtd} disabled={salvando} aria-label="Quantidade"
                    onChange={(e) => { const qtd = e.target.value; setLinhasEntrada((prev) => prev.map((x) => x.key === l.key ? { ...x, qtd } : x)) }}
                    style={{ ...campoStyle, textAlign: 'center', fontWeight: 700 }} />
                  <button type="button" aria-label="Remover lote" disabled={salvando || linhasEntrada.length === 1}
                    onClick={() => setLinhasEntrada((prev) => prev.filter((x) => x.key !== l.key))}
                    style={{ height: 46, borderRadius: 12, border: `1px solid ${D.border}`, background: 'none', color: D.text2, fontSize: 16, cursor: 'pointer', opacity: linhasEntrada.length === 1 ? 0.3 : 1 }}>
                    ✕
                  </button>
                  {vencido && (
                    <p style={{ gridColumn: '1 / -1', color: '#EF4444', fontSize: 11, fontWeight: 600, margin: '-2px 0 0 2px' }}>Data já vencida</p>
                  )}
                </div>
              )
            })}
            <button type="button" onClick={adicionarLinha} disabled={salvando}
              style={{ padding: '12px 16px', borderRadius: 16, border: '1px dashed #6366F1', background: 'rgba(99,102,241,0.08)', color: '#6366F1', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              + adicionar lote
            </button>
          </div>
        )}

        {/* Contador + motivo do bloqueio */}
        <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 12, background: contadorOk ? 'rgba(16,185,129,0.1)' : 'rgba(249,115,22,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ color: contadorOk ? '#10B981' : '#F97316', fontSize: 14, fontWeight: 700 }}>
            Lotes: {soma} de {alvo} {unidade}
          </span>
          {contadorOk && <span style={{ color: '#10B981', fontSize: 14, fontWeight: 800 }}>✓</span>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8, marginTop: 16 }}>
          <button type="button" onClick={onFechar} disabled={salvando}
            style={{ padding: '14px', borderRadius: 16, border: `1px solid ${D.border}`, background: 'none', color: D.text2, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button type="button" onClick={salvar} disabled={!podeSalvar}
            style={{ padding: '14px', borderRadius: 16, background: '#6366F1', color: '#fff', border: 'none', fontSize: 15, fontWeight: 700, cursor: podeSalvar ? 'pointer' : 'not-allowed', opacity: podeSalvar ? 1 : 0.5 }}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
        {motivoBloqueio && (
          <p style={{ color: '#EF4444', fontSize: 12, fontWeight: 600, textAlign: 'center', marginTop: 8 }}>{motivoBloqueio}</p>
        )}
        {erroSalvar && (
          <p style={{ fontSize: 13, textAlign: 'center', fontWeight: 600, marginTop: 12, color: '#EF4444' }}>{erroSalvar}</p>
        )}
      </div>
    </div>
  )
}
