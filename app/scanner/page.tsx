'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { D } from '@/app/lib/theme'
import BarcodeCameraButton from '@/app/components/BarcodeCameraButton'

type Produto = {
  produto_id: string
  estoque_id: string | null
  qtd_atual: number
  qtd_base: number
  qtd_max: number
  nome: string
  unidade: string
  fornecedor_nome: string | null
}

type Modal = { produto: Produto; tipo: 'entrada' | 'saida' } | null

const ENTRADA = '#16A34A'
const SAIDA   = '#DC2626'
const HEADER  = '#1A3C5E'

export default function Scanner() {
  const router = useRouter()
  const [buscando, setBuscando] = useState(false)
  const [produto, setProduto] = useState<Produto | null>(null)
  const [naoEncontrado, setNaoEncontrado] = useState(false)
  const [modal, setModal] = useState<Modal>(null)
  const [quantidade, setQuantidade] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null)

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

  async function salvar() {
    if (!modal || !quantidade || Number(quantidade) <= 0) return
    setSalvando(true)
    try {
      const res = await fetch('/api/movimentacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          produto_id: modal.produto.produto_id,
          tipo: modal.tipo,
          quantidade: Number(quantidade),
        }),
      })
      const json = await res.json()
      if (!res.ok || json.erro) {
        setFeedback({ msg: json.erro ?? 'Erro ao salvar', ok: false })
        return
      }
      setProduto((p) => p ? { ...p, qtd_atual: json.qtd_atual ?? p.qtd_atual } : p)
      setFeedback({ msg: modal.tipo === 'entrada' ? 'Entrada registrada!' : 'Saída registrada!', ok: true })
      setTimeout(fecharModal, 900)
    } catch {
      setFeedback({ msg: 'Erro de conexão', ok: false })
    } finally {
      setSalvando(false)
    }
  }

  const precisaPedir = produto ? produto.qtd_atual < produto.qtd_base : false
  const qtdMaxSaida = modal?.tipo === 'saida' ? modal.produto.qtd_atual : Infinity
  const qtdSaidaExcedida = modal?.tipo === 'saida' && !!quantidade && Number(quantidade) > qtdMaxSaida

  const btnBase: React.CSSProperties = {
    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
  }

  return (
    <div style={{ minHeight: '100vh', background: D.bg }}>

      {/* Header */}
      <div style={{ background: HEADER, padding: '40px 20px 24px' }}>
        <button
          onClick={() => router.back()}
          style={{ ...btnBase, background: 'none', color: '#93C5FD', fontSize: 12, marginBottom: 12, display: 'block', padding: 0 }}
        >
          ← Voltar
        </button>
        <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
          Scanner
        </h1>
        <p style={{ color: '#BFDBFE', fontSize: 13, marginTop: 4, marginBottom: 0 }}>
          Aponte para o código de barras do produto
        </p>
      </div>

      <div style={{ maxWidth: 448, margin: '0 auto', padding: '24px 16px' }}>

        {/* Buscando */}
        {buscando && (
          <div style={{ textAlign: 'center', padding: '56px 0' }}>
            <p style={{ color: D.text2, fontSize: 14 }}>Buscando produto...</p>
          </div>
        )}

        {/* Não encontrado */}
        {naoEncontrado && !buscando && (
          <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 16, padding: '28px 24px', textAlign: 'center' }}>
            <p style={{ color: D.text, fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
              Produto não encontrado
            </p>
            <p style={{ color: D.text2, fontSize: 13, marginBottom: 24 }}>
              Código não cadastrado ou sem campo código de barras
            </p>
            <BarcodeCameraButton
              onScanned={onScanned}
              instanceId="scanner-page"
              renderTrigger={(abrir) => (
                <button
                  onClick={abrir}
                  style={{ ...btnBase, background: HEADER, color: '#fff', borderRadius: 12, padding: '12px 28px', fontSize: 14, fontWeight: 600 }}
                >
                  Escanear novamente
                </button>
              )}
            />
          </div>
        )}

        {/* Idle — estado inicial */}
        {!buscando && !produto && !naoEncontrado && (
          <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 16, padding: '44px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>🔍</div>
            <p style={{ color: D.text, fontWeight: 600, fontSize: 15, marginBottom: 8 }}>
              Pronto para escanear
            </p>
            <p style={{ color: D.text2, fontSize: 13, marginBottom: 28 }}>
              Toque no botão abaixo para abrir a câmera
            </p>
            <BarcodeCameraButton
              onScanned={onScanned}
              instanceId="scanner-page"
              renderTrigger={(abrir) => (
                <button
                  onClick={abrir}
                  style={{ ...btnBase, background: HEADER, color: '#fff', borderRadius: 12, padding: '14px 32px', fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8 }}
                >
                  📷 Abrir câmera
                </button>
              )}
            />
          </div>
        )}

        {/* Produto encontrado */}
        {produto && !buscando && (
          <>
            <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 16, padding: '16px 20px', marginBottom: 12 }}>
              <p style={{ color: D.text, fontWeight: 700, fontSize: 15, marginBottom: 2 }}>
                {produto.nome}
              </p>
              <p style={{ color: D.text2, fontSize: 12, marginBottom: 14 }}>
                {produto.fornecedor_nome ?? '—'} · {produto.unidade}
              </p>
              <p style={{ fontSize: 30, fontWeight: 700, color: precisaPedir ? SAIDA : ENTRADA, marginBottom: 4 }}>
                {produto.qtd_atual}
                <span style={{ fontSize: 13, fontWeight: 400, color: D.text2, marginLeft: 6 }}>
                  em estoque
                </span>
              </p>
              {precisaPedir && (
                <span style={{ display: 'inline-block', background: 'rgba(220,38,38,0.10)', color: SAIDA, border: '1px solid rgba(220,38,38,0.25)', borderRadius: 20, fontSize: 11, fontWeight: 600, padding: '2px 10px', marginTop: 2 }}>
                  Pedir {produto.qtd_max - produto.qtd_atual} {produto.unidade}
                </span>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <button
                onClick={() => abrirModal('entrada')}
                style={{ ...btnBase, background: ENTRADA, color: '#fff', borderRadius: 14, padding: '16px 0', fontSize: 14, fontWeight: 700 }}
              >
                + Entrada
              </button>
              <button
                onClick={() => abrirModal('saida')}
                style={{ ...btnBase, background: SAIDA, color: '#fff', borderRadius: 14, padding: '16px 0', fontSize: 14, fontWeight: 700 }}
              >
                − Saída
              </button>
            </div>

            <button
              onClick={reiniciar}
              style={{ ...btnBase, width: '100%', background: D.card, color: D.text2, border: `1px solid ${D.border}`, borderRadius: 14, padding: '13px 0', fontSize: 13, fontWeight: 600 }}
            >
              Escanear outro produto
            </button>
          </>
        )}
      </div>

      {/* Modal de movimentação */}
      {modal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}
          onClick={(e) => { if (e.target === e.currentTarget) fecharModal() }}
        >
          <div style={{ width: '100%', maxWidth: 448, background: D.card, borderRadius: '24px 24px 0 0', padding: '24px 24px 40px', boxShadow: '0 -4px 30px rgba(0,0,0,0.15)' }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: D.border, margin: '0 auto 20px' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                background: modal.tipo === 'entrada' ? ENTRADA : SAIDA,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 700, fontSize: 18,
              }}>
                {modal.tipo === 'entrada' ? '+' : '−'}
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
                color: '#fff', borderRadius: 14, padding: '16px 0',
                fontSize: 15, fontWeight: 700,
                opacity: salvando || !quantidade || Number(quantidade) <= 0 ? 0.4 : 1,
                cursor: salvando || !quantidade || Number(quantidade) <= 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {salvando ? 'Salvando...' : `Confirmar ${modal.tipo === 'entrada' ? 'entrada' : 'saída'}`}
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
    </div>
  )
}
