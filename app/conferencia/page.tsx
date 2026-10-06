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
  novaQtdCozinha: number
  diff: number
}

// Linha do modal de lote ao AUMENTAR: data de validade + quantidade (texto cru
// do input; parse só na validação). key só serve de chave estável no React.
type LinhaEntrada = { key: number; data: string; qtd: string }

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
  const [linhasEntrada, setLinhasEntrada] = useState<LinhaEntrada[]>([])
  const [qtdSaidaPorLote, setQtdSaidaPorLote] = useState<Record<string, string>>({})

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

  // Chama a RPC unificada (ver supabase/migrations/20261003120000_conferencia_ajustar.sql).
  // p_tipo null = só ajusta as quantidades, sem logar movimentação nem tocar lote
  // (usado quando o total não mudou — só o split cozinha/principal).
  async function chamarConferenciaAjustar(params: {
    produtoId: string
    novaQtdAtual: number
    novaQtdCozinha: number
    tipo?: string | null
    lotesAdd?: { data_validade: string; quantidade: number }[]
    lotesRemover?: { validade_id: string; quantidade: number }[]
  }) {
    const res = await fetch('/api/estoque/conferencia', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        produto_id: params.produtoId,
        nova_qtd_atual: params.novaQtdAtual,
        nova_qtd_cozinha: params.novaQtdCozinha,
        tipo: params.tipo ?? null,
        lotes_add: params.lotesAdd ?? [],
        lotes_remover: params.lotesRemover ?? [],
      }),
    })
    const json = await res.json()
    if (!res.ok || json.erro) throw new Error(json.erro ?? 'Erro ao salvar')
    return json as { qtd_atual: number; qtd_cozinha: number }
  }

  async function salvar() {
    if (!editando) return
    const cozinha = Math.max(0, Number(formCozinha) || 0)
    const principal = Math.max(0, Number(formPrincipal) || 0)
    const total = cozinha + principal
    const diff = total - editando.qtd_atual

    // Mudou a quantidade total: não salva ainda — primeiro precisa saber o
    // motivo (e, se houver, o lote afetado), que agora vai tudo junto na
    // mesma chamada de conferencia_ajustar. Ver registrarMotivo/finalizarMotivo.
    if (diff !== 0) {
      setMotivoPendente({ item: editando, novaQtdTotal: total, novaQtdCozinha: cozinha, diff })
      fecharEditar()
      return
    }

    // Total igual — só pode ter mudado o split cozinha/principal (ou nada).
    // Sem motivo, sem lote: 1 chamada direta.
    setSalvando(true); setFeedback(null)
    try {
      const resultado = await chamarConferenciaAjustar({ produtoId: editando.produto_id, novaQtdAtual: total, novaQtdCozinha: cozinha, tipo: null })
      invalidarEstoqueCache()
      setDados((prev) => prev.map((item) =>
        item.id === editando.id ? { ...item, qtd_atual: resultado.qtd_atual, qtd_cozinha: resultado.qtd_cozinha } : item
      ))
      setConferidos((prev) => new Set([...prev, editando.id]))
      setFeedback({ msg: 'Salvo!', ok: true })
      setTimeout(fecharEditar, 800)
    } catch (e) {
      setFeedback({ msg: e instanceof Error ? e.message : 'Erro de conexão', ok: false })
    } finally { setSalvando(false) }
  }

  async function registrarMotivo(tipo: string) {
    if (!motivoPendente) return
    setFeedback(null)
    const prodId = motivoPendente.item.produtos?.id ?? ''
    const vals = lotesOrdenados(validadesPorProduto[prodId] ?? [])
    const { diff } = motivoPendente

    // Aumentou (entrada/correção): sempre abre o modal de lotes, com 1 linha
    // já trazendo o delta inteiro — o usuário só precisa pôr a data.
    if (diff > 0 && (tipo === 'entrada' || tipo === 'correcao')) {
      setLinhasEntrada([{ key: Date.now(), data: '', qtd: String(diff) }])
      setTipoMotivoEscolhido(tipo)
      return
    }

    // Diminuiu: se há lotes, abre o modal já pré-preenchido em FEFO (tira
    // primeiro do que vence antes até completar o delta). Sem lote nenhum
    // não há o que escolher — salva direto, sem tocar validade.
    if (diff < 0 && vals.length > 0) {
      let restante = Math.abs(diff)
      const mapa: Record<string, string> = {}
      for (const v of vals) {
        const tira = Math.min(v.quantidade, restante)
        mapa[v.id] = tira > 0 ? String(tira) : ''
        restante -= tira
      }
      setQtdSaidaPorLote(mapa)
      setTipoMotivoEscolhido(tipo)
      return
    }

    await finalizarMotivo(tipo, [], [])
  }

  function fecharModalLote() {
    setTipoMotivoEscolhido(null)
    setLinhasEntrada([])
    setQtdSaidaPorLote({})
    setFeedback(null)
  }

  async function finalizarMotivo(
    tipo: string,
    lotesAdd: { data_validade: string; quantidade: number }[],
    lotesRemover: { validade_id: string; quantidade: number }[],
  ) {
    if (!motivoPendente) return
    const { item, novaQtdTotal, novaQtdCozinha } = motivoPendente
    setRegistrandoMotivo(true)
    setFeedback(null)
    try {
      const resultado = await chamarConferenciaAjustar({
        produtoId: item.produto_id, novaQtdAtual: novaQtdTotal, novaQtdCozinha, tipo, lotesAdd, lotesRemover,
      })
      invalidarEstoqueCache()
      setDados((prev) => prev.map((i) =>
        i.id === item.id ? { ...i, qtd_atual: resultado.qtd_atual, qtd_cozinha: resultado.qtd_cozinha } : i
      ))
      setConferidos((prev) => new Set([...prev, item.id]))

      // Rebusca as validades reais deste produto em vez de tentar mesclar
      // localmente — um lote novo criado pela RPC não tem id no cliente até
      // buscar de volta, e inventar um placeholder quebraria uma 2ª ação no
      // mesmo lote dentro da mesma sessão (ex.: remover dele de novo).
      if (lotesAdd.length > 0 || lotesRemover.length > 0) {
        const resVal = await fetch(`/api/validades?produto_id=${item.produto_id}`)
        if (resVal.ok) {
          const lista: Validade[] = await resVal.json()
          if (Array.isArray(lista)) {
            setValidadesPorProduto((prev) => ({ ...prev, [item.produto_id]: lista }))
          }
        }
      }

      // Sucesso: fecha os modais de motivo/lote. (finally, abaixo, só cuida do
      // spinner — se desse erro, os setters de fechamento não rodam, e o modal
      // continua aberto com a mensagem visível para o usuário tentar de novo.)
      setMotivoPendente(null)
      setTipoMotivoEscolhido(null)
      setLinhasEntrada([])
      setQtdSaidaPorLote({})
    } catch (e) {
      setFeedback({ msg: e instanceof Error ? e.message : 'Erro ao salvar', ok: false })
    } finally {
      setRegistrandoMotivo(false)
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
        const tipo = tipoMotivoEscolhido
        const isCorrecao = tipo === 'correcao'
        // Aumentou (entrada ou correção pra cima): N linhas data+qtd, podendo
        // somar num lote existente (lotes_add com a mesma data). Diminuiu
        // (saídas ou correção pra baixo): qtd a tirar de cada lote existente.
        const aumenta = motivoPendente.diff > 0
        const alvo = Math.abs(motivoPendente.diff)
        const unidade = motivoPendente.item.produtos?.unidade ?? ''
        const prodId = motivoPendente.item.produtos?.id ?? ''
        const vals = lotesOrdenados(validadesPorProduto[prodId] ?? [])
        const semControle = vals.length === 0

        let soma = 0
        let alvoContador = alvo
        let motivoBloqueio = ''
        let aviso = ''
        const lotesAdd: { data_validade: string; quantidade: number }[] = []
        const lotesRemover: { validade_id: string; quantidade: number }[] = []

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
            else if (soma > alvo) motivoBloqueio = `Os lotes passam ${soma - alvo} ${unidade} do ajuste.`
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
          // Se os lotes somam menos que o delta (estoque e validades fora de
          // sincronia), exige tirar tudo que dá dos lotes; o resto sai sem lote.
          alvoContador = Math.min(alvo, disponivel)
          if (disponivel < alvo) aviso = `Os lotes cadastrados somam só ${disponivel} ${unidade} — os outros ${alvo - disponivel} saem sem lote.`
          if (soma < alvoContador) motivoBloqueio = `Faltam ${alvoContador - soma} ${unidade} nos lotes.`
          else if (soma > alvoContador) motivoBloqueio = `Os lotes passam ${soma - alvoContador} ${unidade} do ajuste.`
        }

        const podeSalvar = !motivoBloqueio && !registrandoMotivo
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
                {isCorrecao && aumenta ? 'Em qual validade entra a correção?' : isCorrecao ? 'De quais lotes sai a correção?' : aumenta ? 'Em qual validade entra?' : 'De quais lotes sai?'}
              </p>
              <p style={{ color: D.text, fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{motivoPendente.item.produtos?.nome}</p>
              <p style={{ color: aumenta ? '#10B981' : '#EF4444', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
                {aumenta ? `↑ Aumentou ${alvo} ${unidade}` : `↓ Diminuiu ${alvo} ${unidade}`}
              </p>

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
                            <button key={v.id} type="button" onClick={() => somarEmLoteExistente(v.data_validade)} disabled={registrandoMotivo || usado}
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
                        <input type="date" value={l.data} disabled={registrandoMotivo}
                          onChange={(e) => { const data = e.target.value; setLinhasEntrada((prev) => prev.map((x) => x.key === l.key ? { ...x, data } : x)) }}
                          style={{ ...campoStyle, ...(vencido ? { border: '1px solid rgba(239,68,68,0.5)', color: '#EF4444' } : {}) }} />
                        <input type="number" min="1" step="1" inputMode="numeric" value={l.qtd} disabled={registrandoMotivo}
                          onChange={(e) => { const qtd = e.target.value; setLinhasEntrada((prev) => prev.map((x) => x.key === l.key ? { ...x, qtd } : x)) }}
                          style={{ ...campoStyle, textAlign: 'center', fontWeight: 700 }} />
                        <button type="button" aria-label="Remover lote" disabled={registrandoMotivo || linhasEntrada.length === 1}
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
                  <button type="button" onClick={adicionarLinha} disabled={registrandoMotivo}
                    style={{ padding: '12px 16px', borderRadius: 16, border: '1px dashed #6366F1', background: 'rgba(99,102,241,0.08)', color: '#6366F1', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                    + adicionar lote
                  </button>
                </div>
              ) : (
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
                        <input type="number" min="0" max={v.quantidade} step="1" inputMode="numeric" placeholder="0" disabled={registrandoMotivo}
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
                  Lotes: {soma} de {alvo} {unidade}
                </span>
                {contadorOk && <span style={{ color: '#10B981', fontSize: 14, fontWeight: 800 }}>✓</span>}
              </div>
              {aviso && <p style={{ color: '#F59E0B', fontSize: 12, fontWeight: 600, marginTop: 8 }}>⚠️ {aviso}</p>}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8, marginTop: 16 }}>
                <button type="button" onClick={fecharModalLote} disabled={registrandoMotivo}
                  style={{ padding: '14px', borderRadius: 16, border: `1px solid ${D.border}`, background: 'none', color: D.text2, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  Voltar
                </button>
                <button type="button" onClick={() => finalizarMotivo(tipo, lotesAdd, lotesRemover)} disabled={!podeSalvar}
                  style={{ padding: '14px', borderRadius: 16, background: '#6366F1', color: '#fff', border: 'none', fontSize: 15, fontWeight: 700, cursor: podeSalvar ? 'pointer' : 'not-allowed', opacity: podeSalvar ? 1 : 0.5 }}>
                  {registrandoMotivo ? 'Salvando...' : 'Salvar'}
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
            {feedback && (
              <p style={{ fontSize: 13, textAlign: 'center', fontWeight: 600, marginTop: 12, color: feedback.ok ? '#10B981' : '#EF4444' }}>
                {feedback.msg}
              </p>
            )}
            {registrandoMotivo && (
              <p style={{ color: D.text2, fontSize: 12, textAlign: 'center', marginTop: 12 }}>Registrando...</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
