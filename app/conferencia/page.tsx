'use client'
import { useEffect, useMemo, useState } from 'react'
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
  qtd_max: number
  produtos: {
    id: string
    nome: string
    unidade: string
    foto_url: string | null
    fornecedores: { nome: string } | null
  } | null
}

import { Validade, diasAteVencer, proximaValidade } from '@/app/lib/validades'

type MotivoPendente = {
  item: Item
  novaQtdTotal: number
  diff: number
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: D.input, border: `1px solid ${D.border}`, borderRadius: 12,
  padding: '10px 14px', fontSize: 14, color: D.text, outline: 'none', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: D.text2, marginBottom: 4, marginLeft: 2 }

export default function Conferencia() {
  const [dados, setDados] = useState<Item[]>([])
  const [validadesPorProduto, setValidadesPorProduto] = useState<Record<string, Validade[]>>({})
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  const [isAdmin, setIsAdmin] = useState(false)
  const [mostrarZerar, setMostrarZerar] = useState(false)
  const [senhaZerar, setSenhaZerar] = useState('')
  const [zerandoEstoque, setZerandoEstoque] = useState(false)
  const [erroZerar, setErroZerar] = useState('')

  const [conferidos, setConferidos] = useState<Set<string>>(new Set())

  const [editando, setEditando] = useState<Item | null>(null)
  const [formCozinha, setFormCozinha] = useState('')
  const [formPrincipal, setFormPrincipal] = useState('')
  const [formTotal, setFormTotal] = useState('')
  const [carregandoModal, setCarregandoModal] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null)

  const [motivoPendente, setMotivoPendente] = useState<MotivoPendente | null>(null)
  const [registrandoMotivo, setRegistrandoMotivo] = useState(false)
  const [tipoMotivoEscolhido, setTipoMotivoEscolhido] = useState<string | null>(null)
  const [mostrarInputNovaData, setMostrarInputNovaData] = useState(false)
  const [novaDataEntrada, setNovaDataEntrada] = useState('')

  useEffect(() => {
    async function carregar() {
      try {
        const [jsonE, resV, resMe] = await Promise.all([buscarEstoque(), fetch('/api/validades/todos'), fetch('/api/auth/me')])
        setDados(jsonE as unknown as Item[])
        if (resV.ok) {
          const all: Validade[] = await resV.json()
          const mapa: Record<string, Validade[]> = {}
          for (const v of all) {
            if (!mapa[v.produto_id]) mapa[v.produto_id] = []
            mapa[v.produto_id].push(v)
          }
          setValidadesPorProduto(mapa)
        }
        if (resMe.ok) {
          const me = await resMe.json()
          setIsAdmin(me.perfil === 'admin')
        }
      } catch (err) {
        setErro(err instanceof Error ? err.message : 'Erro desconhecido')
      } finally { setLoading(false) }
    }
    carregar()
  }, [])

  const itensFiltrados = useMemo(() => {
    const filtrados = busca
      ? dados.filter((i) => i.produtos?.nome.toLowerCase().includes(busca.toLowerCase()))
      : dados
    return [...filtrados].sort((a, b) => (a.produtos?.nome ?? '').localeCompare(b.produtos?.nome ?? '', 'pt-BR'))
  }, [dados, busca])

  async function zerarEstoque() {
    if (!senhaZerar || zerandoEstoque) return
    setZerandoEstoque(true)
    setErroZerar('')
    try {
      const res = await fetch('/api/estoque/zerar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha: senhaZerar }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || json?.erro) {
        setErroZerar(json?.erro ?? 'Erro ao zerar o estoque')
        return
      }
      invalidarEstoqueCache()
      setDados((prev) => prev.map((item) => ({ ...item, qtd_atual: 0, qtd_cozinha: 0 })))
      setValidadesPorProduto({})
      setConferidos(new Set())
      setMostrarZerar(false)
      setSenhaZerar('')
    } catch {
      setErroZerar('Erro de conexão')
    }
    finally { setZerandoEstoque(false) }
  }

  async function abrirEditar(item: Item) {
    setEditando(item)
    setFormCozinha('')
    setFormPrincipal('')
    setFormTotal('')
    setFeedback(null)
    setCarregandoModal(true)
    try {
      // forcar=true: ignora o cache de 30s de propósito — ao abrir pra editar,
      // precisa do valor mais fresco possível, não do que já estava em memória.
      const lista = await buscarEstoque(true) as unknown as Item[]
      const fresco = lista.find((i) => i.id === item.id)
      if (fresco) {
        setDados((prev) => prev.map((i) => i.id === fresco.id ? fresco : i))
        setEditando(fresco)
        const cozinha = fresco.qtd_cozinha ?? 0
        const principal = Math.max(0, fresco.qtd_atual - cozinha)
        setFormCozinha(String(cozinha))
        setFormPrincipal(String(principal))
        setFormTotal(String(fresco.qtd_atual))
        return
      }
    } catch { /* ignora — usa valor local como fallback */ }
    finally { setCarregandoModal(false) }
    const cozinha = item.qtd_cozinha ?? 0
    const principal = Math.max(0, item.qtd_atual - cozinha)
    setFormCozinha(String(cozinha))
    setFormPrincipal(String(principal))
    setFormTotal(String(item.qtd_atual))
  }

  function fecharEditar() { setEditando(null); setFeedback(null) }

  function handleCozinhaChange(val: string) {
    setFormCozinha(val)
    const c = Math.max(0, Number(val) || 0)
    const p = Math.max(0, Number(formPrincipal) || 0)
    setFormTotal(String(c + p))
  }

  function handlePrincipalChange(val: string) {
    setFormPrincipal(val)
    const c = Math.max(0, Number(formCozinha) || 0)
    const p = Math.max(0, Number(val) || 0)
    setFormTotal(String(c + p))
  }

  function handleTotalChange(val: string) {
    setFormTotal(val)
    const total = Math.max(0, Number(val) || 0)
    const c = Math.max(0, Math.min(Number(formCozinha) || 0, total))
    setFormCozinha(String(c))
    setFormPrincipal(String(Math.max(0, total - c)))
  }

  async function salvar() {
    if (!editando) return
    const cozinha = Math.max(0, Number(formCozinha) || 0)
    const principal = Math.max(0, Number(formPrincipal) || 0)
    const total = cozinha + principal
    setSalvando(true); setFeedback(null)
    try {
      const res = await fetch('/api/estoque/conferencia', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estoque_id: editando.id, qtd_atual: total, qtd_cozinha: cozinha }),
      })
      const json = await res.json()
      if (!res.ok || json.erro) { setFeedback({ msg: json.erro ?? 'Erro ao salvar', ok: false }); return }
      invalidarEstoqueCache()
      const diff = total - editando.qtd_atual
      setDados((prev) => prev.map((item) =>
        item.id === editando.id ? { ...item, qtd_atual: json.qtd_atual, qtd_cozinha: json.qtd_cozinha } : item
      ))
      setConferidos((prev) => new Set([...prev, editando.id]))
      if (diff !== 0) {
        setMotivoPendente({ item: editando, novaQtdTotal: total, diff })
        fecharEditar()
      } else {
        setFeedback({ msg: 'Salvo!', ok: true })
        setTimeout(fecharEditar, 800)
      }
    } catch {
      setFeedback({ msg: 'Erro de conexão', ok: false })
    } finally { setSalvando(false) }
  }

  async function registrarMotivo(tipo: string) {
    if (!motivoPendente) return
    const prodId = motivoPendente.item.produtos?.id ?? ''
    const vals = validadesPorProduto[prodId] ?? []
    // Correção: mostra lotes disponíveis se existirem, senão fecha direto
    if (tipo === 'correcao') {
      if (vals.length > 0) { setTipoMotivoEscolhido(tipo); return }
      setMotivoPendente(null); return
    }
    // Para saídas, pede validade antes se existirem lotes cadastrados
    if ((tipo === 'saida_uso' || tipo === 'descarte_vencido') && motivoPendente.diff < 0) {
      if (vals.length > 0) { setTipoMotivoEscolhido(tipo); return }
    }
    // Para entradas, sempre pede validade (nova ou existente)
    if (tipo === 'entrada' && motivoPendente.diff > 0) {
      setTipoMotivoEscolhido(tipo); return
    }
    await finalizarMotivo(null, tipo)
  }

  async function finalizarMotivo(validadeId: string | null, tipoOverride?: string, novaDataVal?: string) {
    if (!motivoPendente) return
    const tipo = tipoOverride ?? tipoMotivoEscolhido
    if (!tipo) return
    const { item, diff } = motivoPendente
    setRegistrandoMotivo(true)
    try {
      // Correção não registra movimentação — apenas anota qual lote foi ajustado
      if (tipo === 'correcao') return
      const payload: Record<string, unknown> = {
        produto_id: item.produto_id,
        tipo: diff < 0 ? 'saida' : 'entrada',
        quantidade: Math.abs(diff),
        motivo: tipo,
        local: 'principal',
        skip_stock_update: true,
      }
      if (validadeId) payload.validade_id = validadeId
      await fetch('/api/movimentacao', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      // Cria o lote de validade se o usuário informou uma data nova na entrada
      if (novaDataVal && diff > 0) {
        const novoLote = await fetch('/api/validades', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ produto_id: item.produto_id, data_validade: novaDataVal, quantidade: Math.abs(diff) }),
        })
        if (novoLote.ok) {
          const val = await novoLote.json()
          if (val && !val.erro) {
            setValidadesPorProduto((prev) => {
              const key = item.produto_id
              const lista = [...(prev[key] ?? []), val].sort((a, b) => a.data_validade.localeCompare(b.data_validade))
              return { ...prev, [key]: lista }
            })
          }
        }
      }
    } finally {
      setRegistrandoMotivo(false)
      setMotivoPendente(null)
      setTipoMotivoEscolhido(null)
      setMostrarInputNovaData(false)
      setNovaDataEntrada('')
    }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: D.bg }}>
      <p style={{ color: D.text2, fontSize: 14 }}>Carregando...</p>
    </div>
  )

  if (erro) return (
    <div style={{ minHeight: '100vh', padding: 24, background: D.bg }}>
      <p style={{ color: '#EF4444', fontWeight: 700 }}>Erro</p>
      <pre style={{ color: '#EF4444', fontSize: 12, marginTop: 8, background: 'rgba(239,68,68,0.1)', borderRadius: 12, padding: 16, whiteSpace: 'pre-wrap' }}>{erro}</pre>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: D.bg }}>

      <div style={{ background: 'var(--page-header)', borderBottom: `1px solid ${D.border}`, padding: '48px 20px 20px' }}>
        <Link href="/" style={{ color: D.text2, fontSize: 13, textDecoration: 'none', display: 'block', marginBottom: 12 }}>← Voltar</Link>
        <h1 style={{ color: D.text, fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>Conferência</h1>
        <p style={{ color: D.muted, fontSize: 13, marginTop: 4 }}>{itensFiltrados.length} itens · {conferidos.size} conferidos</p>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Busca + Limpar */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: D.muted }}>🔍</span>
            <input type="text" placeholder="Buscar produto..."
              value={busca} onChange={(e) => setBusca(e.target.value)}
              style={{ width: '100%', background: D.card, border: `1px solid ${D.border}`, borderRadius: 14, padding: '12px 14px 12px 36px', fontSize: 14, color: D.text, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          {conferidos.size > 0 && (
            <button onClick={() => setConferidos(new Set())}
              style={{ flexShrink: 0, padding: '12px 14px', borderRadius: 14, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#10B981', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Limpar ({conferidos.size})
            </button>
          )}
        </div>

        {/* Cards */}
        {itensFiltrados.length === 0 ? (
          <p style={{ color: D.text2, fontSize: 14, textAlign: 'center', paddingTop: 40 }}>Nenhum produto encontrado.</p>
        ) : itensFiltrados.map((item) => {
          const prodId = item.produtos?.id ?? ''
          const vals = validadesPorProduto[prodId] ?? []
          const proxVal = proximaValidade(vals)
          const precisaPedir = item.qtd_atual <= item.qtd_base
          const qtdPrincipal = item.qtd_atual - (item.qtd_cozinha ?? 0)
          const conferido = conferidos.has(item.id)

          return (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Checkbox */}
              <div
                onClick={() => setConferidos((prev) => {
                  const next = new Set(prev)
                  if (next.has(item.id)) next.delete(item.id)
                  else next.add(item.id)
                  return next
                })}
                role="checkbox"
                aria-checked={conferido}
                style={{
                  width: 24, height: 24, minWidth: 24, borderRadius: 7,
                  border: conferido ? '2px solid #10B981' : `2px solid ${D.border}`,
                  background: conferido ? '#10B981' : 'transparent',
                  flexShrink: 0, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.15s, border-color 0.15s',
                }}>
                {conferido && <span style={{ color: '#fff', fontSize: 13, fontWeight: 900, lineHeight: 1 }}>✓</span>}
              </div>

              {/* Card */}
              <button onClick={() => abrirEditar(item)}
                style={{ background: conferido ? 'rgba(16,185,129,0.08)' : D.card, border: conferido ? '1px solid rgba(16,185,129,0.3)' : `1px solid ${D.border}`, borderRadius: 16, padding: '14px', flex: 1, textAlign: 'left', cursor: 'pointer', transition: 'background 0.15s, border-color 0.15s' }}>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <FotoThumb src={item.produtos?.foto_url ?? null} style={{ marginRight: 10, marginTop: 1 }} />
                  <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
                    <p style={{ color: conferido ? '#10B981' : D.text, fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.produtos?.nome ?? '—'}
                    </p>
                    <p style={{ color: D.text2, fontSize: 12, marginTop: 2 }}>
                      {item.produtos?.fornecedores?.nome ?? '—'} · {item.produtos?.unidade}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {precisaPedir && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(239,68,68,0.15)', color: '#EF4444' }}>
                        Pedir
                      </span>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div style={{ display: 'flex', gap: 0, background: D.input, borderRadius: 12, overflow: 'hidden' }}>
                  {[
                    { label: '🏪 Principal', value: qtdPrincipal },
                    { label: '🍳 Cozinha', value: item.qtd_cozinha ?? 0 },
                    { label: 'Total', value: item.qtd_atual },
                  ].map((stat, i) => (
                    <div key={i} style={{ flex: 1, padding: '8px 10px', textAlign: 'center', borderRight: i < 2 ? `1px solid ${D.border}` : 'none' }}>
                      <p style={{ fontSize: 10, color: D.muted, fontWeight: 600, marginBottom: 2 }}>{stat.label}</p>
                      <p style={{ fontSize: 18, fontWeight: 800, color: i === 2 && precisaPedir ? '#EF4444' : D.text }}>{stat.value}</p>
                    </div>
                  ))}
                </div>

                {/* Validade */}
                {proxVal && (
                  <p style={{ fontSize: 11, color: proxVal.cor, marginTop: 8, fontWeight: 600 }}>
                    📅 Val: {proxVal.texto}
                  </p>
                )}
              </button>
            </div>
          )
        })}
      </div>

      {/* Rodapé admin — zerar estoque */}
      {isAdmin && (
        <div style={{ padding: '8px 16px 40px', borderTop: `1px solid ${D.border}`, marginTop: 8 }}>
          {!mostrarZerar ? (
            <button onClick={() => { setMostrarZerar(true); setSenhaZerar(''); setErroZerar('') }}
              style={{ width: '100%', padding: '13px', borderRadius: 16, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#EF4444', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Zerar todo o estoque
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ color: '#EF4444', fontSize: 13, fontWeight: 600, textAlign: 'center', margin: 0 }}>
                ⚠️ Esta ação vai zerar todos os produtos e apagar todas as validades
              </p>
              <input type="password" placeholder="Sua senha de login" autoComplete="current-password"
                value={senhaZerar} onChange={(e) => { setSenhaZerar(e.target.value); setErroZerar('') }} autoFocus
                style={{ ...inputStyle, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }} />
              {erroZerar && (
                <p style={{ color: '#EF4444', fontSize: 12, textAlign: 'center', margin: 0 }}>{erroZerar}</p>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setMostrarZerar(false); setSenhaZerar(''); setErroZerar('') }}
                  style={{ flex: 1, padding: '12px', borderRadius: 14, border: `1px solid ${D.border}`, background: 'none', color: D.text2, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button onClick={zerarEstoque} disabled={zerandoEstoque || !senhaZerar}
                  style={{ flex: 1, padding: '12px', borderRadius: 14, background: '#EF4444', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: (zerandoEstoque || !senhaZerar) ? 0.4 : 1 }}>
                  {zerandoEstoque ? 'Zerando...' : 'Confirmar'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal editar quantidades */}
      {editando && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50, background: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) fecharEditar() }}>
          <div style={{ width: '100%', maxWidth: 480, background: D.card, borderRadius: '24px 24px 0 0', padding: '24px 24px 40px', boxShadow: '0 -4px 40px rgba(0,0,0,0.5)' }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: D.border, margin: '0 auto 20px' }} />

            <p style={{ color: D.text2, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>Ajustar estoque</p>
            <p style={{ color: D.text, fontWeight: 700, fontSize: 16, marginBottom: 2 }}>{editando.produtos?.nome}</p>
            <p style={{ color: D.text2, fontSize: 12, marginBottom: 20 }}>
              {editando.produtos?.fornecedores?.nome} · {editando.produtos?.unidade}
            </p>

            {carregandoModal ? (
              <p style={{ textAlign: 'center', color: D.muted, fontSize: 14, padding: '18px 0' }}>Buscando valores atuais...</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>🍳 Cozinha</label>
                  <input type="number" min="0" style={{ ...inputStyle, textAlign: 'center', padding: '10px 6px', fontSize: 20, fontWeight: 800 }}
                    value={formCozinha} onChange={(e) => handleCozinhaChange(e.target.value)} autoFocus />
                </div>
                <div>
                  <label style={labelStyle}>🏪 Principal</label>
                  <input type="number" min="0" style={{ ...inputStyle, textAlign: 'center', padding: '10px 6px', fontSize: 20, fontWeight: 800 }}
                    value={formPrincipal} onChange={(e) => handlePrincipalChange(e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Total</label>
                  <input type="number" min="0" style={{ ...inputStyle, textAlign: 'center', padding: '10px 6px', fontSize: 20, fontWeight: 800, border: `1px solid #6366F1`, color: '#6366F1' }}
                    value={formTotal} onChange={(e) => handleTotalChange(e.target.value)} />
                </div>
              </div>
            )}

            {feedback && (
              <p style={{ fontSize: 13, textAlign: 'center', fontWeight: 600, marginTop: 12, color: feedback.ok ? '#10B981' : '#EF4444' }}>
                {feedback.msg}
              </p>
            )}

            <button onClick={salvar} disabled={salvando || carregandoModal}
              style={{ width: '100%', padding: '14px', borderRadius: 16, background: '#6366F1', color: '#fff', border: 'none', fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: salvando || carregandoModal ? 0.6 : 1, marginTop: 16 }}>
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      )}

      {/* Modal selecionar validade (lote) */}
      {motivoPendente && tipoMotivoEscolhido && (() => {
        const isEntrada = tipoMotivoEscolhido === 'entrada'
        const isCorrecao = tipoMotivoEscolhido === 'correcao'
        const prodId = motivoPendente.item.produtos?.id ?? ''
        const vals = [...(validadesPorProduto[prodId] ?? [])].sort((a, b) => a.data_validade.localeCompare(b.data_validade))
        return (
          <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 70, background: 'rgba(0,0,0,0.6)' }}>
            <div style={{ width: '100%', maxWidth: 480, background: D.card, borderRadius: '24px 24px 0 0', padding: '24px 24px 40px', boxShadow: '0 -4px 40px rgba(0,0,0,0.5)' }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: D.border, margin: '0 auto 20px' }} />
              <p style={{ color: D.text2, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>
                {isCorrecao ? 'Qual lote foi corrigido?' : isEntrada ? 'Em qual validade entra?' : 'De qual validade?'}
              </p>
              <p style={{ color: D.text, fontWeight: 700, fontSize: 15, marginBottom: 20 }}>{motivoPendente.item.produtos?.nome}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {vals.map((v) => {
                  const dias = diasAteVencer(v.data_validade)
                  const dataFmt = new Date(v.data_validade + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                  const cor = dias < 0 ? '#EF4444' : dias <= 7 ? '#F97316' : D.text
                  return (
                    <button key={v.id} onClick={() => finalizarMotivo(v.id)} disabled={registrandoMotivo}
                      style={{ padding: '14px 16px', borderRadius: 16, border: `1px solid ${D.border}`, background: D.input, color: D.text, fontSize: 14, fontWeight: 600, cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: cor }}>{dataFmt}{dias < 0 ? ' · Vencido' : ''}</span>
                      <span style={{ color: D.text2, fontSize: 13 }}>{v.quantidade} {motivoPendente.item.produtos?.unidade}</span>
                    </button>
                  )
                })}
                {isEntrada && (
                  mostrarInputNovaData ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input type="date" value={novaDataEntrada} onChange={(e) => setNovaDataEntrada(e.target.value)} autoFocus
                        style={{ width: '100%', background: D.input, border: `1px solid ${D.border}`, borderRadius: 12, padding: '10px 14px', fontSize: 14, color: D.text, outline: 'none', boxSizing: 'border-box' }} />
                      <button onClick={() => { if (novaDataEntrada) finalizarMotivo(null, undefined, novaDataEntrada) }}
                        disabled={!novaDataEntrada || registrandoMotivo}
                        style={{ padding: '14px', borderRadius: 16, background: '#6366F1', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: (!novaDataEntrada || registrandoMotivo) ? 0.5 : 1 }}>
                        Confirmar data
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setMostrarInputNovaData(true)} disabled={registrandoMotivo}
                      style={{ padding: '14px 16px', borderRadius: 16, border: '1px solid #6366F1', background: 'rgba(99,102,241,0.08)', color: '#6366F1', fontSize: 14, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
                      📅 Validade nova
                    </button>
                  )
                )}
                <button onClick={() => finalizarMotivo(null)} disabled={registrandoMotivo}
                  style={{ padding: '14px 16px', borderRadius: 16, border: `1px solid ${D.border}`, background: 'none', color: D.text2, fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>
                  {isCorrecao ? 'Sem validade específica' : 'Não especificar'}
                </button>
              </div>
              {registrandoMotivo && <p style={{ color: D.text2, fontSize: 12, textAlign: 'center', marginTop: 12 }}>Registrando...</p>}
            </div>
          </div>
        )
      })()}

      {/* Modal motivo da alteração */}
      {motivoPendente && !tipoMotivoEscolhido && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 60, background: 'rgba(0,0,0,0.6)' }}>
          <div style={{ width: '100%', maxWidth: 480, background: D.card, borderRadius: '24px 24px 0 0', padding: '24px 24px 40px', boxShadow: '0 -4px 40px rgba(0,0,0,0.5)' }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: D.border, margin: '0 auto 20px' }} />

            <p style={{ color: D.text2, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>Motivo da alteração</p>
            <p style={{ color: D.text, fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{motivoPendente.item.produtos?.nome}</p>
            <p style={{ color: motivoPendente.diff < 0 ? '#EF4444' : '#10B981', fontSize: 13, fontWeight: 600, marginBottom: 20 }}>
              {motivoPendente.diff < 0
                ? `↓ Diminuiu ${Math.abs(motivoPendente.diff)} ${motivoPendente.item.produtos?.unidade}`
                : `↑ Aumentou ${motivoPendente.diff} ${motivoPendente.item.produtos?.unidade}`}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {motivoPendente.diff < 0 ? (
                <>
                  <button onClick={() => registrarMotivo('saida_uso')} disabled={registrandoMotivo}
                    style={{ padding: '14px 16px', borderRadius: 16, border: `1px solid ${D.border}`, background: D.input, color: D.text, fontSize: 14, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
                    📤 Saída normal de uso
                  </button>
                  <button onClick={() => registrarMotivo('descarte_vencido')} disabled={registrandoMotivo}
                    style={{ padding: '14px 16px', borderRadius: 16, border: `1px solid ${D.border}`, background: D.input, color: D.text, fontSize: 14, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
                    🗑 Produto vencido descartado
                  </button>
                  <button onClick={() => registrarMotivo('correcao')} disabled={registrandoMotivo}
                    style={{ padding: '14px 16px', borderRadius: 16, border: `1px solid ${D.border}`, background: D.input, color: D.text, fontSize: 14, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
                    ✏️ Correção de contagem
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => registrarMotivo('entrada')} disabled={registrandoMotivo}
                    style={{ padding: '14px 16px', borderRadius: 16, border: `1px solid ${D.border}`, background: D.input, color: D.text, fontSize: 14, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
                    📥 Entrada de produto
                  </button>
                  <button onClick={() => registrarMotivo('correcao')} disabled={registrandoMotivo}
                    style={{ padding: '14px 16px', borderRadius: 16, border: `1px solid ${D.border}`, background: D.input, color: D.text, fontSize: 14, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
                    ✏️ Correção de contagem
                  </button>
                </>
              )}
            </div>
            {registrandoMotivo && (
              <p style={{ color: D.text2, fontSize: 12, textAlign: 'center', marginTop: 12 }}>Registrando...</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
