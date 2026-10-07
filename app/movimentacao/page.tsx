'use client'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import { D } from '@/app/lib/theme'
import FotoThumb from '@/app/components/FotoThumb'
import { buscarEstoque, invalidarEstoqueCache } from '@/app/lib/estoqueCache'
import ModalLotes, { type LoteAdd, type LoteRemover } from '@/app/components/ModalLotes'

type Produto = {
  id: string
  produto_id: string
  qtd_atual: number
  qtd_base: number
  qtd_max: number
  qtd_cozinha: number
  produtos: { nome: string; unidade: string; foto_url: string | null; fornecedores: { nome: string } | null } | null
}

import { Validade, formatarDataCurta, badgeValidade } from '@/app/lib/validades'

type Modal = { produto: Produto; tipo: 'entrada' | 'saida'; local: 'principal' | 'cozinha'; validade?: Validade } | null
// Segundo passo: validades das unidades (entrada) ou lotes de onde sai (saída)
type ModalLotesMov = { produto: Produto; tipo: 'entrada' | 'saida'; quantidade: number; local: 'principal' | 'cozinha' } | null

export default function Page() {
  return (
    <Suspense>
      <Movimentacao />
    </Suspense>
  )
}

function Movimentacao() {
  const searchParams = useSearchParams()
  const [itens, setItens] = useState<Produto[]>([])
  const [validadesPorProduto, setValidadesPorProduto] = useState<Record<string, Validade[]>>({})
  const [busca, setBusca] = useState('')
  const [fornecedorAtivo, setFornecedorAtivo] = useState<string | null>(null)
  const [modal, setModal] = useState<Modal>(null)
  const [modalLotes, setModalLotes] = useState<ModalLotesMov>(null)
  const [salvandoLotes, setSalvandoLotes] = useState(false)
  const [feedbackLotes, setFeedbackLotes] = useState<{ msg: string; ok: boolean } | null>(null)
  const [modalLocalSaida, setModalLocalSaida] = useState<{ produto: Produto } | null>(null)
  const [localSelecionado, setLocalSelecionado] = useState<'principal' | 'cozinha'>('principal')
  const [quantidade, setQuantidade] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null)
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(true)

  const [modalTipoScan, setModalTipoScan] = useState<Produto | null>(null)

  const [scannerAberto, setScannerAberto] = useState(false)
  const [scannerStatus, setScannerStatus] = useState<'lendo' | 'buscando' | 'nao_encontrado'>('lendo')
  const qrcodeRef = useRef<any>(null)
  const processandoRef = useRef(false)

  const scannerFisicoBuffer = useRef('')
  const scannerFisicoInicio = useRef(0)
  const SCANNER_FISICO_TIMEOUT_MS = 300

  useEffect(() => {
    async function buscarItens() {
      try {
        const [json, resVal] = await Promise.all([buscarEstoque(), fetch('/api/validades/todos')])
        setItens(json as unknown as Produto[])

        if (resVal.ok) {
          const valJson: Validade[] = await resVal.json()
          if (Array.isArray(valJson)) {
            const agrupado: Record<string, Validade[]> = {}
            for (const v of valJson) {
              if (!agrupado[v.produto_id]) agrupado[v.produto_id] = []
              agrupado[v.produto_id].push(v)
            }
            setValidadesPorProduto(agrupado)
          }
        }
      } catch (err) {
        setErro(err instanceof Error ? err.message : 'Erro desconhecido')
      } finally {
        setLoading(false)
      }
    }
    buscarItens()
  }, [])

  const fornecedores = useMemo(() => {
    const nomes = itens.map((i) => i.produtos?.fornecedores?.nome).filter((n): n is string => Boolean(n))
    return [...new Set(nomes)].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [itens])

  const itensFiltrados = useMemo(() =>
    itens
      .filter((item) => item.produtos?.nome.toLowerCase().includes(busca.toLowerCase()))
      .filter((item) => !fornecedorAtivo || item.produtos?.fornecedores?.nome === fornecedorAtivo)
      .sort((a, b) => (a.produtos?.nome ?? '').localeCompare(b.produtos?.nome ?? '', 'pt-BR')),
    [itens, busca, fornecedorAtivo])

  function abrirModal(produto: Produto, tipo: 'entrada' | 'saida', local: 'principal' | 'cozinha' = 'principal', validade?: Validade) {
    setModal({ produto, tipo, local, validade }); setQuantidade('1'); setFeedback(null)
  }

  function fecharModal() { setModal(null); setQuantidade('') }

  function abrirSaida(item: Produto) {
    if ((item.qtd_cozinha ?? 0) > 0) {
      setLocalSelecionado('principal')
      setModalLocalSaida({ produto: item })
    } else {
      abrirModal(item, 'saida', 'principal')
    }
  }

  function confirmarLocal() {
    if (!modalLocalSaida) return
    const item = modalLocalSaida.produto
    setModalLocalSaida(null)
    abrirModal(item, 'saida', localSelecionado)
  }

  // Grava quantidade + histórico + lotes numa chamada só (RPC movimentacao_registrar).
  async function registrarMovimentacao(lotesAdd: LoteAdd[], lotesRemover: LoteRemover[]) {
    if (!modalLotes) return
    const { produto, tipo, quantidade: qtd, local } = modalLotes
    setSalvandoLotes(true); setFeedbackLotes(null)
    try {
      const res = await fetch('/api/movimentacao', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produto_id: produto.produto_id, tipo, quantidade: qtd, local, lotes_add: lotesAdd, lotes_remover: lotesRemover }),
      })
      const json = await res.json()
      if (!res.ok || json.erro) { setFeedbackLotes({ msg: json.erro ?? 'Erro ao salvar', ok: false }); return }
      invalidarEstoqueCache()
      setItens((prev) => prev.map((item) =>
        item.id === produto.id ? { ...item, qtd_atual: json.qtd_atual, qtd_cozinha: json.qtd_cozinha ?? item.qtd_cozinha } : item
      ))
      // Rebusca os lotes reais — um lote novo criado pela RPC não tem id no cliente.
      if (lotesAdd.length > 0 || lotesRemover.length > 0) {
        const resVal = await fetch(`/api/validades?produto_id=${produto.produto_id}`)
        if (resVal.ok) {
          const lista: Validade[] = await resVal.json()
          if (Array.isArray(lista)) setValidadesPorProduto((prev) => ({ ...prev, [produto.produto_id]: lista }))
        }
      }
      setFeedbackLotes({ msg: tipo === 'entrada' ? 'Entrada registrada!' : `Saída de ${qtd} ${produto.produtos?.unidade ?? ''} registrada!`, ok: true })
      setTimeout(() => { setModalLotes(null); setFeedbackLotes(null) }, 900)
    } catch (err) {
      setFeedbackLotes({ msg: err instanceof Error ? err.message : 'Erro', ok: false })
    } finally { setSalvandoLotes(false) }
  }

  function voltarParaQuantidade() {
    if (!modalLotes) return
    const { produto, tipo, local, quantidade: qtd } = modalLotes
    setModalLotes(null)
    abrirModal(produto, tipo, local)
    setQuantidade(String(qtd))
  }

  useEffect(() => {
    if (loading || itens.length === 0) return
    const nomeBuscado = searchParams.get('produto')
    const tipoBuscado = searchParams.get('tipo') as 'entrada' | 'saida' | null
    if (!nomeBuscado || !tipoBuscado) return
    const item = itens.find((i) => i.produtos?.nome.toLowerCase() === nomeBuscado.toLowerCase())
    if (!item) return
    if (tipoBuscado === 'saida') abrirSaida(item)
    else abrirModal(item, 'entrada')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, itens])

  async function salvar() {
    if (!modal || !quantidade || Number(quantidade) <= 0) return

    // A quantidade aqui é só o total — o próximo passo pede as validades
    // (entrada) ou distribui entre os lotes (saída), e aí grava tudo junto.
    const { produto, tipo, local } = modal
    setFeedbackLotes(null)
    setModalLotes({ produto, tipo, quantidade: Math.floor(Number(quantidade)), local })
    fecharModal()
  }

  async function buscarPorCodigo(codigo: string) {
    try {
      const res = await fetch(`/api/produto/barcode?codigo=${encodeURIComponent(codigo)}`)
      const json = await res.json()
      if (!res.ok || json.erro) return
      const item = itens.find((i) => i.produto_id === json.produto_id)
      if (item) {
        setModalTipoScan(item)
      } else {
        const temp: Produto = {
          id: json.id ?? '', produto_id: json.produto_id, qtd_atual: json.qtd_atual, qtd_base: json.qtd_base, qtd_max: json.qtd_max,
          qtd_cozinha: json.qtd_cozinha ?? 0,
          produtos: { nome: json.nome, unidade: json.unidade, foto_url: null, fornecedores: json.fornecedor_nome ? { nome: json.fornecedor_nome } : null },
        }
        setModalTipoScan(temp)
      }
    } catch { /* ignorar */ }
  }

  function handleBuscaKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      const elapsed = Date.now() - scannerFisicoInicio.current
      const codigo = scannerFisicoBuffer.current
      scannerFisicoBuffer.current = ''; scannerFisicoInicio.current = 0
      if (codigo.length >= 3 && elapsed < SCANNER_FISICO_TIMEOUT_MS) { e.preventDefault(); setBusca(''); buscarPorCodigo(codigo) }
      return
    }
    if (e.key.length === 1) {
      if (scannerFisicoBuffer.current === '') scannerFisicoInicio.current = Date.now()
      scannerFisicoBuffer.current += e.key
    } else if (e.key === 'Backspace') {
      scannerFisicoBuffer.current = scannerFisicoBuffer.current.slice(0, -1)
    }
  }

  async function abrirScanner() {
    processandoRef.current = false; setScannerStatus('lendo'); setScannerAberto(true)
    setTimeout(async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        const qrcode = new Html5Qrcode('mov-scanner-div')
        qrcodeRef.current = qrcode
        await qrcode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 260, height: 100 } },
          async (codigo: string) => {
            if (processandoRef.current) return
            processandoRef.current = true
            try { await qrcode.stop() } catch { /* ignorar */ }
            setScannerStatus('buscando')
            try {
              const res = await fetch(`/api/produto/barcode?codigo=${encodeURIComponent(codigo)}`)
              const json = await res.json()
              if (!res.ok || json.erro) { setScannerStatus('nao_encontrado'); return }
              setScannerAberto(false); buscarPorCodigo(codigo)
            } catch { setScannerStatus('nao_encontrado') }
          },
          () => {}
        )
      } catch { setScannerAberto(false) }
    }, 150)
  }

  async function fecharScanner() {
    try { await qrcodeRef.current?.stop() } catch { /* ignorar */ }
    qrcodeRef.current = null; setScannerAberto(false)
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

  const qtdMaxSaida = modal?.tipo === 'saida'
    // Principal = total − cozinha (a RPC recusa saída do principal acima disso)
    ? (modal.local === 'cozinha' ? (modal.produto.qtd_cozinha ?? 0) : modal.produto.qtd_atual - (modal.produto.qtd_cozinha ?? 0))
    : Infinity
  const qtdSaidaExcedida = modal?.tipo === 'saida' && !!quantidade && Number(quantidade) > qtdMaxSaida

  return (
    <div style={{ minHeight: '100vh', background: D.bg }}>

      {/* Header */}
      <div style={{ background: 'var(--page-header)', borderBottom: `1px solid ${D.border}`, padding: '48px 20px 20px' }}>
        <Link href="/" style={{ color: D.text2, fontSize: 13, textDecoration: 'none', display: 'block', marginBottom: 12 }}>← Voltar</Link>
        <h1 style={{ color: D.text, fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>Movimentação</h1>
        <p style={{ color: D.muted, fontSize: 13, marginTop: 4 }}>{itens.length} produtos</p>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Busca + scanner */}
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: D.muted }}>🔍</span>
          <input type="text" placeholder="Buscar produto ou bipe o código..."
            value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={handleBuscaKeyDown}
            style={{ width: '100%', background: D.card, border: `1px solid ${D.border}`, borderRadius: 14, padding: '12px 48px 12px 36px', fontSize: 14, color: D.text, outline: 'none', boxSizing: 'border-box' }}
          />
          <button onClick={abrirScanner} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>📷</button>
        </div>

        {/* Filtro por fornecedor */}
        {fornecedores.length > 0 && (
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            <button onClick={() => setFornecedorAtivo(null)}
              style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, border: `1px solid ${!fornecedorAtivo ? '#6366F1' : D.border}`, cursor: 'pointer',
                background: !fornecedorAtivo ? 'rgba(99,102,241,0.2)' : D.card, color: !fornecedorAtivo ? 'var(--accent-text)' : D.text2 }}>
              Todos
            </button>
            {fornecedores.map((f) => (
              <button key={f} onClick={() => setFornecedorAtivo(f === fornecedorAtivo ? null : f)}
                style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, border: `1px solid ${fornecedorAtivo === f ? '#6366F1' : D.border}`, cursor: 'pointer',
                  background: fornecedorAtivo === f ? 'rgba(99,102,241,0.2)' : D.card, color: fornecedorAtivo === f ? 'var(--accent-text)' : D.text2 }}>
                {f}
              </button>
            ))}
          </div>
        )}

        {/* Lista */}
        {itensFiltrados.length === 0 ? (
          <p style={{ color: D.text2, fontSize: 14, textAlign: 'center', paddingTop: 40 }}>Nenhum produto encontrado.</p>
        ) : (
          itensFiltrados.map((item) => {
            const precisaPedir = item.qtd_atual < item.qtd_base
            const validades = validadesPorProduto[item.produto_id] ?? []
            const badge = badgeValidade(validades)
            const valSorted = [...validades].sort((a, b) => a.data_validade.localeCompare(b.data_validade))
            const valTexto = valSorted.map((v) => `${formatarDataCurta(v.data_validade)} (${v.quantidade}un)`).join(' · ')

            return (
              <div key={item.produto_id} style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 16, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <FotoThumb src={item.produtos?.foto_url ?? null} style={{ marginRight: 12 }} />
                <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
                  <p style={{ color: D.text, fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.produtos?.nome ?? '—'}
                  </p>
                  <p style={{ color: D.text2, fontSize: 12, marginTop: 2 }}>
                    {item.produtos?.fornecedores?.nome ?? 'Fornecedor desconhecido'} · {item.produtos?.unidade}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: precisaPedir ? '#EF4444' : '#10B981' }}>
                      {item.qtd_atual} em estoque
                    </p>
                    {(item.qtd_cozinha ?? 0) > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'rgba(99,102,241,0.1)', color: 'var(--accent-text)' }}>
                        🏪 {item.qtd_atual - item.qtd_cozinha} · 🍳 {item.qtd_cozinha}
                      </span>
                    )}
                    {badge && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: badge.bg, color: badge.cor }}>
                        {badge.texto}
                      </span>
                    )}
                  </div>
                  {valTexto && (
                    <p style={{ fontSize: 11, color: D.muted, marginTop: 2 }}>Val: {valTexto}</p>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button onClick={() => abrirModal(item, 'entrada')}
                    style={{ width: 36, height: 36, borderRadius: '50%', background: '#10B981', border: 'none', color: '#fff', fontSize: 20, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    +
                  </button>
                  <button onClick={() => abrirSaida(item)}
                    style={{ width: 36, height: 36, borderRadius: '50%', background: '#EF4444', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ display: 'block', width: 14, height: 2, background: '#fff', borderRadius: 2 }} />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Overlay do scanner */}
      {scannerAberto && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', background: '#000' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '48px 20px 16px' }}>
            <p style={{ color: '#fff', fontWeight: 600 }}>Aponte para o código de barras</p>
            <button onClick={fecharScanner} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer' }}>✕</button>
          </div>
          <div id="mov-scanner-div" style={{ flex: 1 }} />

          {scannerStatus === 'buscando' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}>
              <p style={{ color: '#fff', fontSize: 14 }}>Buscando produto...</p>
            </div>
          )}

          {scannerStatus === 'nao_encontrado' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', gap: 16 }}>
              <p style={{ color: '#fff', fontWeight: 600 }}>Produto não encontrado</p>
              <button onClick={() => { processandoRef.current = false; setScannerStatus('lendo'); abrirScanner(); setScannerAberto(false) }}
                style={{ padding: '12px 24px', borderRadius: 16, background: '#6366F1', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>
                Tentar novamente
              </button>
              <button onClick={fecharScanner} style={{ color: D.text2, fontSize: 14, background: 'none', border: 'none', cursor: 'pointer' }}>Cancelar</button>
            </div>
          )}
        </div>
      )}

      {/* Modal tipo de movimentação após scan */}
      {modalTipoScan && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 60, background: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setModalTipoScan(null) }}>
          <div style={{ width: '100%', maxWidth: 480, background: D.card, borderRadius: '24px 24px 0 0', padding: '24px 24px 40px', boxShadow: '0 -4px 40px rgba(0,0,0,0.5)' }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: D.border, margin: '0 auto 20px' }} />
            <p style={{ color: D.text2, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>Código escaneado</p>
            <p style={{ color: D.text, fontWeight: 700, fontSize: 16, marginBottom: 2 }}>{modalTipoScan.produtos?.nome}</p>
            <p style={{ color: D.text2, fontSize: 13, marginBottom: 24 }}>
              {modalTipoScan.qtd_atual} em estoque · {modalTipoScan.produtos?.unidade}
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => { const item = modalTipoScan; setModalTipoScan(null); abrirModal(item, 'entrada') }}
                style={{ flex: 1, padding: '20px 12px', borderRadius: 20, background: '#10B981', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>+</span>
                <span style={{ fontSize: 15, fontWeight: 700 }}>Entrada</span>
              </button>
              <button
                onClick={() => { const item = modalTipoScan; setModalTipoScan(null); abrirSaida(item) }}
                style={{ flex: 1, padding: '20px 12px', borderRadius: 20, background: '#EF4444', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>−</span>
                <span style={{ fontSize: 15, fontWeight: 700 }}>Saída</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal seleção de local (saída) */}
      {modalLocalSaida && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50, background: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setModalLocalSaida(null) }}>
          <div style={{ width: '100%', maxWidth: 480, background: D.card, borderRadius: '24px 24px 0 0', padding: '24px 24px 40px', boxShadow: '0 -4px 40px rgba(0,0,0,0.5)' }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: D.border, margin: '0 auto 20px' }} />
            <p style={{ color: D.text2, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>Saída</p>
            <p style={{ color: D.text, fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{modalLocalSaida.produto.produtos?.nome}</p>
            <p style={{ color: D.text2, fontSize: 12, marginBottom: 16 }}>De qual local?</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {([
                { local: 'principal' as const, label: '🏪 Principal', qtd: modalLocalSaida.produto.qtd_atual - (modalLocalSaida.produto.qtd_cozinha ?? 0) },
                { local: 'cozinha' as const, label: '🍳 Cozinha', qtd: modalLocalSaida.produto.qtd_cozinha ?? 0 },
              ]).map(({ local, label, qtd }) => (
                <button key={local} onClick={() => setLocalSelecionado(local)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, padding: '12px 14px', border: `2px solid ${localSelecionado === local ? '#6366F1' : D.border}`, background: localSelecionado === local ? 'rgba(99,102,241,0.12)' : D.input, cursor: 'pointer', outline: 'none' }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: D.text }}>{label}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: D.text }}>{qtd} {modalLocalSaida.produto.produtos?.unidade}</p>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${localSelecionado === local ? '#6366F1' : D.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {localSelecionado === local && <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#6366F1' }} />}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <button onClick={confirmarLocal}
              style={{ width: '100%', padding: '14px', borderRadius: 16, background: '#EF4444', color: '#fff', border: 'none', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
              Continuar
            </button>
          </div>
        </div>
      )}

      {/* Modal de lotes — validade na entrada, lotes (FEFO) na saída */}
      {modalLotes && (
        <ModalLotes
          key={`${modalLotes.produto.produto_id}-${modalLotes.tipo}-${modalLotes.quantidade}`}
          produtoNome={modalLotes.produto.produtos?.nome ?? ''}
          unidade={modalLotes.produto.produtos?.unidade ?? 'un'}
          delta={modalLotes.tipo === 'entrada' ? modalLotes.quantidade : -modalLotes.quantidade}
          validades={validadesPorProduto[modalLotes.produto.produto_id] ?? []}
          titulo={modalLotes.tipo === 'entrada' ? 'Entrada — validade das unidades' : `Saída${modalLotes.local === 'cozinha' ? ' da cozinha' : ''} — de quais lotes?`}
          textoConfirmar={modalLotes.tipo === 'entrada' ? 'Registrar entrada' : 'Confirmar saída'}
          corConfirmar={modalLotes.tipo === 'entrada' ? '#10B981' : '#EF4444'}
          salvando={salvandoLotes}
          feedback={feedbackLotes}
          onVoltar={voltarParaQuantidade}
          onConfirmar={registrarMovimentacao}
        />
      )}

      {/* Modal movimentação (saída apenas) */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50, background: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) fecharModal() }}>
          <div style={{ width: '100%', maxWidth: 480, background: D.card, borderRadius: '24px 24px 0 0', padding: '24px 24px 40px', boxShadow: '0 -4px 40px rgba(0,0,0,0.5)' }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: D.border, margin: '0 auto 20px' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: modal.tipo === 'entrada' ? '#10B981' : '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 18 }}>
                {modal.tipo === 'entrada' ? '+' : <span style={{ display: 'block', width: 10, height: 2, background: '#fff', borderRadius: 2 }} />}
              </div>
              <div>
                <p style={{ fontSize: 11, color: D.text2, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
                  {modal.tipo === 'entrada' ? 'Entrada' : 'Saída'}
                </p>
                <p style={{ color: D.text, fontWeight: 600, fontSize: 14 }}>{modal.produto.produtos?.nome}</p>
              </div>
            </div>

            <p style={{ color: D.text2, fontSize: 12, marginLeft: 44, marginBottom: modal.validade ? 4 : 20 }}>
              {modal.tipo === 'saida' && modal.local === 'cozinha'
                ? <>🍳 Cozinha: <span style={{ fontWeight: 700, color: D.text }}>{modal.produto.qtd_cozinha}</span> {modal.produto.produtos?.unidade}</>
                : <>Estoque atual: <span style={{ fontWeight: 700, color: D.text }}>{modal.produto.qtd_atual}</span> · {modal.produto.produtos?.unidade}</>
              }
            </p>
            {modal.validade && (
              <p style={{ fontSize: 12, marginLeft: 44, marginBottom: 20 }}>
                <span style={{ color: D.text2 }}>Lote: </span>
                <span style={{ fontWeight: 700, color: D.text }}>{new Date(modal.validade.data_validade + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                <span style={{ color: D.text2 }}> · {modal.validade.quantidade}un disponível</span>
              </p>
            )}

            <label style={{ display: 'block', fontSize: 12, color: D.text2, fontWeight: 600, marginBottom: 8, marginLeft: 2 }}>Quantidade</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <button
                onClick={() => setQuantidade((q) => String(Math.max(1, (Number(q) || 1) - 1)))}
                style={{ width: 48, height: 56, borderRadius: 14, border: `2px solid ${modal.tipo === 'entrada' ? '#10B981' : '#EF4444'}`, background: D.input, color: modal.tipo === 'entrada' ? '#10B981' : '#EF4444', fontSize: 26, fontWeight: 800, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                −
              </button>
              <input type="number" inputMode="numeric" min="1" value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => { if (e.key === 'Enter') salvar() }}
                autoFocus
                style={{ flex: 1, border: `2px solid ${modal.tipo === 'entrada' ? '#10B981' : '#EF4444'}`, borderRadius: 16, padding: '12px', fontSize: 28, fontWeight: 800, textAlign: 'center', color: D.text, background: D.input, outline: 'none', boxSizing: 'border-box' }}
              />
              <button
                onClick={() => setQuantidade((q) => modal.tipo === 'saida' ? String(Math.min(qtdMaxSaida, (Number(q) || 0) + 1)) : String((Number(q) || 0) + 1))}
                style={{ width: 48, height: 56, borderRadius: 14, border: `2px solid ${modal.tipo === 'entrada' ? '#10B981' : '#EF4444'}`, background: modal.tipo === 'entrada' ? '#10B981' : '#EF4444', color: '#fff', fontSize: 26, fontWeight: 800, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                +
              </button>
            </div>

            {modal.tipo === 'saida' && qtdSaidaExcedida && (
              <p style={{ fontSize: 12, color: '#EF4444', fontWeight: 600, marginBottom: 8, textAlign: 'center' }}>
                Quantidade máxima disponível: {qtdMaxSaida}
              </p>
            )}

            {feedback && (
              <p style={{ fontSize: 14, textAlign: 'center', fontWeight: 600, marginBottom: 12, color: feedback.ok ? '#10B981' : '#EF4444' }}>
                {feedback.msg}
              </p>
            )}

            <button onClick={salvar} disabled={salvando || !quantidade || Number(quantidade) <= 0 || qtdSaidaExcedida}
              style={{ width: '100%', padding: '14px', borderRadius: 16, background: modal.tipo === 'entrada' ? '#10B981' : '#EF4444', color: '#fff', border: 'none', fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: (salvando || !quantidade || Number(quantidade) <= 0) ? 0.4 : 1 }}>
              {salvando ? 'Salvando...' : `Confirmar ${modal.tipo === 'entrada' ? 'entrada' : 'saída'}`}
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
