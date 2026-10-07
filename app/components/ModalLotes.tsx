'use client'
// Modal de lotes de validade usado pela Movimentação, pelo Scanner e pelo
// "Editar produto" do Estoque. Mesmo visual e mesmas regras do modal de lotes
// da Conferência (app/conferencia/page.tsx):
//   delta > 0 → N linhas data+qtd (pode somar num lote existente); a soma tem
//               que bater com o delta. Produto sem nenhum lote: data opcional.
//   delta < 0 → quanto sai de cada lote, já pré-preenchido em FEFO. Se os lotes
//               somam menos que o delta, tira tudo dos lotes e o resto sai sem lote.
// Só monta a lista; quem chama grava (movimentacao_registrar / conferencia_ajustar).
// Use `key` no componente para recomeçar o estado a cada abertura.
import { useState } from 'react'

import { D } from '@/app/lib/theme'
import { Validade, diasAteVencer } from '@/app/lib/validades'

export type LoteAdd = { data_validade: string; quantidade: number }
export type LoteRemover = { validade_id: string; quantidade: number }

type LinhaEntrada = { key: number; data: string; qtd: string }

// Quantidades de lote são inteiras nas RPCs (jsonb_to_recordset ... quantidade integer).
function parseQtd(v: string): number {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) && n > 0 ? n : 0
}

function formatarData(data: string): string {
  return new Date(data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: D.input, border: `1px solid ${D.border}`, borderRadius: 12,
  padding: '10px 14px', fontSize: 14, color: D.text, outline: 'none', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: D.text2, marginBottom: 4, marginLeft: 2 }

export default function ModalLotes({
  produtoNome, unidade, delta, validades, titulo, textoConfirmar = 'Salvar', corConfirmar = '#6366F1',
  salvando, feedback, onVoltar, onConfirmar,
}: {
  produtoNome: string
  unidade: string
  delta: number
  validades: Validade[]
  titulo?: string
  textoConfirmar?: string
  corConfirmar?: string
  salvando: boolean
  feedback: { msg: string; ok: boolean } | null
  onVoltar: () => void
  onConfirmar: (lotesAdd: LoteAdd[], lotesRemover: LoteRemover[]) => void
}) {
  const aumenta = delta > 0
  const alvo = Math.abs(delta)
  const vals = [...validades].sort((a, b) => a.data_validade.localeCompare(b.data_validade))
  const semControle = vals.length === 0

  // Aumentou: 1 linha já trazendo o delta inteiro — o usuário só põe a data.
  const [linhasEntrada, setLinhasEntrada] = useState<LinhaEntrada[]>(() => [{ key: Date.now(), data: '', qtd: String(alvo) }])
  // Diminuiu: FEFO — tira primeiro do que vence antes até completar o delta.
  const [qtdSaidaPorLote, setQtdSaidaPorLote] = useState<Record<string, string>>(() => {
    let restante = alvo
    const mapa: Record<string, string> = {}
    for (const v of vals) {
      const tira = Math.min(v.quantidade, restante)
      mapa[v.id] = tira > 0 ? String(tira) : ''
      restante -= tira
    }
    return mapa
  })

  let soma = 0
  let alvoContador = alvo
  let motivoBloqueio = ''
  let aviso = ''
  const lotesAdd: LoteAdd[] = []
  const lotesRemover: LoteRemover[] = []

  if (aumenta) {
    soma = linhasEntrada.reduce((s, l) => s + parseQtd(l.qtd), 0)
    const algumaData = linhasEntrada.some((l) => l.data)
    // Produto sem nenhum lote: validade opcional — sem data em nenhuma
    // linha, salva só a quantidade. Se preencheu alguma data, valida normal.
    if (semControle) aviso = 'Produto sem controle de validade — a data é opcional.'
    if (!(semControle && !algumaData)) {
      if (linhasEntrada.some((l) => parseQtd(l.qtd) > 0 && !l.data)) motivoBloqueio = 'Informe a data de validade de todos os lotes.'
      else if (linhasEntrada.some((l) => l.data && parseQtd(l.qtd) === 0)) motivoBloqueio = 'Informe a quantidade de todos os lotes.'
      else if (soma < alvo) motivoBloqueio = `Faltam ${alvo - soma} ${unidade} nos lotes.`
      else if (soma > alvo) motivoBloqueio = `Os lotes passam ${soma - alvo} ${unidade} do total.`
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
  } else {
    const disponivel = vals.reduce((s, v) => s + v.quantidade, 0)
    for (const v of vals) {
      const q = Math.min(parseQtd(qtdSaidaPorLote[v.id] ?? ''), v.quantidade)
      soma += q
      if (q > 0) lotesRemover.push({ validade_id: v.id, quantidade: q })
    }
    alvoContador = Math.min(alvo, disponivel)
    if (semControle) aviso = 'Produto sem controle de validade — sai sem lote.'
    else if (disponivel < alvo) aviso = `Os lotes cadastrados somam só ${disponivel} ${unidade} — os outros ${alvo - disponivel} saem sem lote.`
    if (soma < alvoContador) motivoBloqueio = `Faltam ${alvoContador - soma} ${unidade} nos lotes.`
    else if (soma > alvoContador) motivoBloqueio = `Os lotes passam ${soma - alvoContador} ${unidade} do total.`
  }

  const podeSalvar = !motivoBloqueio && !salvando
  const contadorOk = soma === alvoContador

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

  const campoStyle: React.CSSProperties = { ...inputStyle, fontSize: 16, padding: '12px 10px', minWidth: 0 }

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 70, background: 'rgba(0,0,0,0.6)' }}>
      <div style={{ width: '100%', maxWidth: 480, maxHeight: '92vh', overflowY: 'auto', overflowX: 'hidden', background: D.card, borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', boxShadow: '0 -4px 40px rgba(0,0,0,0.5)' }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: D.border, margin: '0 auto 20px' }} />
        <p style={{ color: D.text2, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>
          {titulo ?? (aumenta ? 'Em qual validade entra?' : 'De quais lotes sai?')}
        </p>
        <p style={{ color: D.text, fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{produtoNome}</p>
        <p style={{ color: aumenta ? '#10B981' : '#EF4444', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
          {aumenta ? `↑ Entram ${alvo} ${unidade}` : `↓ Saem ${alvo} ${unidade}`}
        </p>

        {!aumenta && !semControle && (
          <p style={{ color: '#F97316', fontSize: 12, fontWeight: 700, marginBottom: 12 }}>📋 Já sugerido: o lote que vence primeiro sai primeiro</p>
        )}

        {aumenta ? (
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
              <label style={{ ...labelStyle, marginBottom: 0 }}>Validade{semControle ? ' (opcional)' : ''}</label>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Qtd</label>
              <span />
            </div>
            {linhasEntrada.map((l) => {
              const dias = l.data ? diasAteVencer(l.data) : null
              const vencido = dias != null && dias < 0
              return (
                <div key={l.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 88px 44px', gap: 8, alignItems: 'center' }}>
                  <input type="date" value={l.data} disabled={salvando}
                    onChange={(e) => { const data = e.target.value; setLinhasEntrada((prev) => prev.map((x) => x.key === l.key ? { ...x, data } : x)) }}
                    style={{ ...campoStyle, ...(vencido ? { border: '1px solid rgba(239,68,68,0.5)', color: '#EF4444' } : {}) }} />
                  <input type="number" min="1" step="1" inputMode="numeric" value={l.qtd} disabled={salvando}
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
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {vals.map((v, idx) => {
              const dias = diasAteVencer(v.data_validade)
              const vencido = dias < 0
              const cor = vencido ? '#EF4444' : dias <= 7 ? '#F97316' : D.text
              return (
                <div key={v.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 88px', gap: 10, alignItems: 'center', padding: '10px 12px', borderRadius: 16, border: `1px solid ${vencido ? 'rgba(239,68,68,0.4)' : D.border}`, background: vencido ? 'rgba(239,68,68,0.08)' : D.input }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ color: cor, fontSize: 14, fontWeight: 700, margin: 0 }}>
                      {formatarData(v.data_validade)}{vencido ? ' · Vencido' : ''}
                      {idx === 0 && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 5, background: '#6366F1', color: '#fff', verticalAlign: 'middle' }}>FEFO</span>}
                    </p>
                    <p style={{ color: D.text2, fontSize: 12, margin: '2px 0 0' }}>Lote tem {v.quantidade} {unidade}</p>
                  </div>
                  <input type="number" min="0" max={v.quantidade} step="1" inputMode="numeric" placeholder="0" disabled={salvando}
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
        )}

        {/* Contador + motivo do bloqueio */}
        <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 12, background: contadorOk ? 'rgba(16,185,129,0.1)' : 'rgba(249,115,22,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ color: contadorOk ? '#10B981' : '#F97316', fontSize: 14, fontWeight: 700 }}>
            Lotes: {soma} de {alvoContador} {unidade}
          </span>
          {contadorOk && <span style={{ color: '#10B981', fontSize: 14, fontWeight: 800 }}>✓</span>}
        </div>
        {aviso && <p style={{ color: '#F59E0B', fontSize: 12, fontWeight: 600, marginTop: 8 }}>⚠️ {aviso}</p>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8, marginTop: 16 }}>
          <button type="button" onClick={onVoltar} disabled={salvando}
            style={{ padding: '14px', borderRadius: 16, border: `1px solid ${D.border}`, background: 'none', color: D.text2, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Voltar
          </button>
          <button type="button" onClick={() => onConfirmar(lotesAdd, lotesRemover)} disabled={!podeSalvar}
            style={{ padding: '14px', borderRadius: 16, background: corConfirmar, color: '#fff', border: 'none', fontSize: 15, fontWeight: 700, cursor: podeSalvar ? 'pointer' : 'not-allowed', opacity: podeSalvar ? 1 : 0.5 }}>
            {salvando ? 'Salvando...' : textoConfirmar}
          </button>
        </div>
        {motivoBloqueio && (
          <p style={{ color: '#EF4444', fontSize: 12, fontWeight: 600, textAlign: 'center', marginTop: 8 }}>{motivoBloqueio}</p>
        )}
        {feedback && (
          <p style={{ fontSize: 13, textAlign: 'center', fontWeight: 600, marginTop: 12, color: feedback.ok ? '#10B981' : '#EF4444' }}>
            {feedback.msg}
          </p>
        )}
      </div>
    </div>
  )
}
