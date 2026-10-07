'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { D } from '@/app/lib/theme'
import BarcodeCameraButton from '@/app/components/BarcodeCameraButton'
import Page from '@/app/components/ui/Page'
import PageHeader from '@/app/components/ui/PageHeader'
import Card from '@/app/components/ui/Card'
import Icon from '@/app/components/ui/Icon'
import { invalidarEstoqueCache } from '@/app/lib/estoqueCache'
import ModalLotes, { type LoteAdd, type LoteRemover } from '@/app/components/ModalLotes'
import { controlaValidade, type Validade } from '@/app/lib/validades'

type Produto = {
  produto_id: string
  estoque_id: string | null
  qtd_atual: number
  qtd_cozinha?: number
  qtd_base: number
  qtd_max: number
  nome: string
  unidade: string
  fornecedor_nome: string | null
  controla_validade?: boolean
}

type Modal = { produto: Produto; tipo: 'entrada' | 'saida' } | null
// Segundo passo: validades (entrada) ou lotes de onde sai (saída), já com os lotes do produto
type ModalLotesMov = { produto: Produto; tipo: 'entrada' | 'saida'; quantidade: number; validades: Validade[] } | null

const ENTRADA = '#16A34A'
const SAIDA   = '#DC2626'
const ACCENT  = '#6366F1'

export default function Scanner() {
  const router = useRouter()
  const [buscando, setBuscando] = useState(false)
  const [produto, setProduto] = useState<Produto | null>(null)
  const [naoEncontrado, setNaoEncontrado] = useState(false)
  const [modal, setModal] = useState<Modal>(null)
  const [quantidade, setQuantidade] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null)
  const [modalLotes, setModalLotes] = useState<ModalLotesMov>(null)

  async function onScanned(codigo: string) {
    setBuscando(true)
    setNaoEncontrado(false)
    setProduto(null)
    try {
      const res = await fetch(`/api/produto/barcode?codigo=${encodeURIComponent(codigo)}`)
      const json = await res.json()
      if (!res.ok || json.erro) { setNaoEncontrado(true); return }
      setProduto(json)
    } catch {
      setNaoEncontrado(true)
    } finally {
      setBuscando(false)
    }
  }

  function reiniciar() {
    setProduto(null)
    setNaoEncontrado(false)
    setFeedback(null)
  }

  function abrirModal(tipo: 'entrada' | 'saida') {
    if (!produto) return
    setModal({ produto, tipo })
    setQuantidade('')
    setFeedback(null)
  }

  function fecharModal() {
    setModal(null)
    setQuantidade('')
  }

  // Passo 1: quantidade. Busca os lotes do produto e abre o modal de lotes —
  // a gravação (quantidade + histórico + lotes) acontece só lá, numa chamada.
  async function salvar() {
    if (!modal || !quantidade || Number(quantidade) <= 0) return

    // Produto que não controla validade: grava direto, sem o passo de lotes.
    if (!controlaValidade(modal.produto)) {
      const { produto: prod, tipo } = modal
      const qtd = Math.floor(Number(quantidade))
      setSalvando(true); setFeedback(null)
      try {
        const res = await fetch('/api/movimentacao', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ produto_id: prod.produto_id, tipo, quantidade: qtd, lotes_add: [], lotes_remover: [] }),
        })
        const json = await res.json()
        if (!res.ok || json.erro) { setFeedback({ msg: json.erro ?? 'Erro ao salvar', ok: false }); return }
        invalidarEstoqueCache()
        setProduto((p) => p ? { ...p, qtd_atual: json.qtd_atual ?? p.qtd_atual, qtd_cozinha: json.qtd_cozinha ?? p.qtd_cozinha } : p)
        setFeedback({ msg: tipo === 'entrada' ? 'Entrada registrada!' : 'Saída registrada!', ok: true })
        setTimeout(() => { setModal(null); setQuantidade(''); setFeedback(null) }, 900)
      } catch {
        setFeedback({ msg: 'Erro de conexão', ok: false })
      } finally {
        setSalvando(false)
      }
      return
    }

    setSalvando(true)
    try {
      const res = await fetch(`/api/validades?produto_id=${modal.produto.produto_id}`)
      const json = await res.json()
      if (!res.ok || !Array.isArray(json)) {
        setFeedback({ msg: json?.erro ?? 'Erro ao buscar validades', ok: false })
        return
      }
      setFeedback(null)
      setModalLotes({ produto: modal.produto, tipo: modal.tipo, quantidade: Math.floor(Number(quantidade)), validades: json })
      setModal(null)
    } catch {
      setFeedback({ msg: 'Erro de conexão', ok: false })
    } finally {
      setSalvando(false)
    }
  }

  // Passo 2: grava tudo pela RPC movimentacao_registrar (via /api/movimentacao).
  async function registrar(lotesAdd: LoteAdd[], lotesRemover: LoteRemover[]) {
    if (!modalLotes) return
    const { produto: prod, tipo, quantidade: qtd } = modalLotes
    setSalvando(true); setFeedback(null)
    try {
      const res = await fetch('/api/movimentacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produto_id: prod.produto_id, tipo, quantidade: qtd, lotes_add: lotesAdd, lotes_remover: lotesRemover }),
      })
      const json = await res.json()
      if (!res.ok || json.erro) {
        setFeedback({ msg: json.erro ?? 'Erro ao salvar', ok: false })
        return
      }
      invalidarEstoqueCache()
      setProduto((p) => p ? { ...p, qtd_atual: json.qtd_atual ?? p.qtd_atual, qtd_cozinha: json.qtd_cozinha ?? p.qtd_cozinha } : p)
      setFeedback({ msg: tipo === 'entrada' ? 'Entrada registrada!' : 'Saída registrada!', ok: true })
      setTimeout(() => { setModalLotes(null); setQuantidade(''); setFeedback(null) }, 900)
    } catch {
      setFeedback({ msg: 'Erro de conexão', ok: false })
    } finally {
      setSalvando(false)
    }
  }

  function voltarParaQuantidade() {
    if (!modalLotes) return
    setModal({ produto: modalLotes.produto, tipo: modalLotes.tipo })
    setQuantidade(String(modalLotes.quantidade))
    setFeedback(null)
    setModalLotes(null)
  }

  const precisaPedir = produto ? produto.qtd_atual < produto.qtd_base : false
  // Scanner só tira do principal: total − cozinha
  const qtdMaxSaida = modal?.tipo === 'saida' ? modal.produto.qtd_atual - (modal.produto.qtd_cozinha ?? 0) : Infinity
  const qtdSaidaExcedida = modal?.tipo === 'saida' && !!quantidade && Number(quantidade) > qtdMaxSaida

  const btnBase: React.CSSProperties = {
    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
  }
  const botaoGrande: React.CSSProperties = {
    ...btnBase, width: '100%', height: 52, borderRadius: 14, color: '#fff', fontSize: 15, fontWeight: 800,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  }

  return (
    <Page>
      <PageHeader titulo="Scanner" subtitulo="Aponte para o código de barras do produto" onVoltar={() => router.back()} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Buscando */}
        {buscando && (
          <Card style={{ padding: '48px 20px', textAlign: 'center' }}>
            <span className="animate-pulse" style={{ display: 'inline-flex', color: 'var(--accent-text)' }}><Icon nome="search" size={36} /></span>
            <p style={{ color: D.text2, fontSize: 14, margin: '10px 0 0' }}>Buscando produto...</p>
          </Card>
        )}

        {/* Não encontrado */}
        {naoEncontrado && !buscando && (
          <Card style={{ padding: '28px 20px', textAlign: 'center' }}>
            <span style={{ width: 64, height: 64, borderRadius: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239,68,68,0.12)', color: '#EF4444' }}>
              <Icon nome="alert" size={30} />
            </span>
            <p style={{ color: D.text, fontWeight: 800, fontSize: 16, margin: '14px 0 6px' }}>
              Produto não encontrado
            </p>
            <p style={{ color: D.text2, fontSize: 13, margin: '0 0 20px' }}>
              Código não cadastrado ou sem campo código de barras
            </p>
            <BarcodeCameraButton
              onScanned={onScanned}
              instanceId="scanner-page"
              renderTrigger={(abrir) => (
                <button onClick={abrir} style={{ ...botaoGrande, background: ACCENT }}>
                  <Icon nome="scan" size={20} /> Escanear novamente
                </button>
              )}
            />
          </Card>
        )}

        {/* Idle — estado inicial */}
        {!buscando && !produto && !naoEncontrado && (
          <Card style={{ padding: '36px 20px', textAlign: 'center' }}>
            <span style={{ width: 80, height: 80, borderRadius: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-bg)', color: 'var(--accent-text)' }}>
              <Icon nome="scan" size={40} />
            </span>
            <p style={{ color: D.text, fontWeight: 800, fontSize: 17, margin: '16px 0 6px' }}>
              Pronto para escanear
            </p>
            <p style={{ color: D.text2, fontSize: 13, margin: '0 0 24px' }}>
              Toque no botão abaixo para abrir a câmera
            </p>
            <BarcodeCameraButton
              onScanned={onScanned}
              instanceId="scanner-page"
              renderTrigger={(abrir) => (
                <button onClick={abrir} style={{ ...botaoGrande, background: ACCENT }}>
                  <Icon nome="camera" size={20} /> Abrir câmera
                </button>
              )}
            />
          </Card>
        )}

        {/* Produto encontrado */}
        {produto && !buscando && (
          <>
            <Card style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px' }}>
              <span style={{ width: 52, height: 52, borderRadius: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: D.input, color: D.text2 }}>
                <Icon nome="box" size={24} traco={1.8} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: D.text, fontWeight: 800, fontSize: 16, margin: 0, overflowWrap: 'anywhere' }}>
                  {produto.nome}
                </p>
                <p style={{ color: D.text2, fontSize: 13, margin: '3px 0 0' }}>
                  {produto.fornecedor_nome ?? '—'} · {produto.unidade}
                </p>
                {precisaPedir && (
                  <span style={{ display: 'inline-block', marginTop: 6, fontSize: 11, fontWeight: 800, letterSpacing: '0.3px', padding: '2px 7px', borderRadius: 6, background: 'rgba(239,68,68,0.15)', color: SAIDA }}>
                    PEDIR {produto.qtd_max - produto.qtd_atual} {produto.unidade}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                <span style={{ fontSize: 34, fontWeight: 800, lineHeight: 1, color: precisaPedir ? SAIDA : ENTRADA, fontVariantNumeric: 'tabular-nums' }}>{produto.qtd_atual}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: D.text2, marginTop: 3 }}>em estoque</span>
              </div>
            </Card>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button onClick={() => abrirModal('saida')} style={{ ...botaoGrande, background: 'rgba(239,68,68,0.15)', color: SAIDA }}>
                <Icon nome="minus" size={20} traco={2.6} /> Saída
              </button>
              <button onClick={() => abrirModal('entrada')} style={{ ...botaoGrande, background: 'rgba(16,185,129,0.15)', color: ENTRADA }}>
                <Icon nome="plus" size={20} traco={2.6} /> Entrada
              </button>
            </div>

            <button onClick={reiniciar}
              style={{ ...botaoGrande, background: D.card, color: D.text2, border: `1px solid ${D.border}` }}>
              <Icon nome="scan" size={20} /> Escanear outro produto
            </button>
          </>
        )}
      </div>

      {/* Modal de movimentação */}
      {modal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 60 }}
          onClick={(e) => { if (e.target === e.currentTarget) fecharModal() }}
        >
          <div style={{ width: '100%', maxWidth: 480, background: D.card, borderRadius: '24px 24px 0 0', padding: '24px 20px calc(32px + env(safe-area-inset-bottom))', boxSizing: 'border-box', boxShadow: '0 -4px 30px rgba(0,0,0,0.25)' }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: D.border, margin: '0 auto 20px' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                background: modal.tipo === 'entrada' ? ENTRADA : SAIDA,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff',
              }}>
                <Icon nome={modal.tipo === 'entrada' ? 'plus' : 'minus'} size={18} traco={2.8} />
              </div>
              <div>
                <p style={{ color: D.text2, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 1 }}>
                  {modal.tipo === 'entrada' ? 'Entrada' : 'Saída'}
                </p>
                <p style={{ color: D.text, fontWeight: 600, fontSize: 14 }}>{modal.produto.nome}</p>
              </div>
            </div>

            <p style={{ color: D.text2, fontSize: 12, marginLeft: 44, marginBottom: 20 }}>
              Estoque atual:{' '}
              <span style={{ color: D.text, fontWeight: 600 }}>{modal.produto.qtd_atual}</span>
              {' '}· {modal.produto.unidade}
            </p>

            <p style={{ color: D.text2, fontSize: 11, fontWeight: 600, marginBottom: 6, marginLeft: 4 }}>
              Quantidade
            </p>
            <input
              type="number"
              min="1"
              placeholder="0"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') salvar() }}
              autoFocus
              style={{
                width: '100%', boxSizing: 'border-box',
                border: `2px solid ${modal.tipo === 'entrada' ? ENTRADA : SAIDA}`,
                borderRadius: 14, padding: '12px 16px',
                fontSize: 28, fontWeight: 700, textAlign: 'center',
                color: D.text, background: D.input, outline: 'none', marginBottom: 16,
                fontFamily: 'inherit',
              }}
            />

            {modal.tipo === 'saida' && qtdSaidaExcedida && (
              <p style={{ fontSize: 12, color: SAIDA, fontWeight: 600, marginBottom: 8, textAlign: 'center' }}>
                Quantidade máxima disponível: {qtdMaxSaida}
              </p>
            )}

            {feedback && (
              <p style={{ textAlign: 'center', fontSize: 13, fontWeight: 500, color: feedback.ok ? ENTRADA : SAIDA, marginBottom: 12 }}>
                {feedback.msg}
              </p>
            )}

            <button
              onClick={salvar}
              disabled={salvando || !quantidade || Number(quantidade) <= 0 || qtdSaidaExcedida}
              style={{
                ...btnBase, width: '100%',
                background: modal.tipo === 'entrada' ? ENTRADA : SAIDA,
                color: '#fff', borderRadius: 14, height: 52,
                fontSize: 15, fontWeight: 800,
                opacity: salvando || !quantidade || Number(quantidade) <= 0 ? 0.4 : 1,
                cursor: salvando || !quantidade || Number(quantidade) <= 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {salvando ? 'Carregando...' : 'Continuar'}
            </button>

            <button
              onClick={fecharModal}
              style={{ ...btnBase, width: '100%', background: 'none', color: D.text2, fontSize: 13, marginTop: 12, padding: '8px 0' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Modal de lotes — validade na entrada, lotes (FEFO) na saída */}
      {modalLotes && (
        <ModalLotes
          produtoNome={modalLotes.produto.nome}
          unidade={modalLotes.produto.unidade}
          delta={modalLotes.tipo === 'entrada' ? modalLotes.quantidade : -modalLotes.quantidade}
          validades={modalLotes.validades}
          titulo={modalLotes.tipo === 'entrada' ? 'Entrada — validade das unidades' : 'Saída — de quais lotes?'}
          textoConfirmar={modalLotes.tipo === 'entrada' ? 'Registrar entrada' : 'Confirmar saída'}
          corConfirmar={modalLotes.tipo === 'entrada' ? ENTRADA : SAIDA}
          salvando={salvando}
          feedback={feedback}
          onVoltar={voltarParaQuantidade}
          onConfirmar={registrar}
        />
      )}
    </Page>
  )
}
