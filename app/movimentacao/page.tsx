'use client'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import { D } from '@/app/lib/theme'
import FotoThumb from '@/app/components/FotoThumb'

type Produto = {
  id: string
  produto_id: string
  qtd_atual: number
  qtd_base: number
  qtd_max: number
  qtd_cozinha: number
  produtos: { nome: string; unidade: string; foto_url: string | null; fornecedores: { nome: string } | null } | null
}

import { Validade, diasAteVencer, formatarDataCurta, badgeValidade } from '@/app/lib/validades'

type Modal = { produto: Produto; tipo: 'entrada' | 'saida'; local: 'principal' | 'cozinha'; validade?: Validade } | null
type ModalLote = { produto: Produto; validades: Validade[]; semValidadeDisp: number; alvo: number; local: 'principal' | 'cozinha' } | null

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
  const [modalLote, setModalLote] = useState<ModalLote>(null)
  const [modalLocalSaida, setModalLocalSaida] = useState<{ produto: Produto } | null>(null)
  const [localSelecionado, setLocalSelecionado] = useState<'principal' | 'cozinha'>('principal')
  const [lotesSelecionados, setLotesSelecionados] = useState<Record<string, number>>({})
  const [salvandoLotes, setSalvandoLotes] = useState(false)
  const [feedbackLotes, setFeedbackLotes] = useState<{ msg: string; ok: boolean } | null>(null)
  const [quantidade, setQuantidade] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null)
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(true)

  const [modalTipoScan, setModalTipoScan] = useState<Produto | null>(null)

  const [modalValidadeEntrada, setModalValidadeEntrada] = useState<{ produto: Produto; quantidade: number } | null>(null)
  const [validadeData, setValidadeData] = useState('')
  const [validadeQtd, setValidadeQtd] = useState('')
  const [semValidade, setSemValidade] = useState(false)
  const [salvandoEntrada, setSalvandoEntrada] = useState(false)
  const [feedbackEntrada, setFeedbackEntrada] = useState<{ msg: string; ok: boolean } | null>(null)
  const [validadeFluxo, setValidadeFluxo] = useState<'pergunta' | 'mesma' | 'diferentes'>('pergunta')
  const [lotesEntrada, setLotesEntrada] = useState<{ id: string; data: string; qtd: string }[]>([])

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
        const [resEstoque, resVal] = await Promise.all([fetch('/api/estoque'), fetch('/api/validades/todos')])
        if (!resEstoque.ok) { setErro(`HTTP ${resEstoque.status}`); return }
        const json = await resEstoque.json()
        if (json.erro) setErro(json.erro)
        else setItens(json)

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

  async function confirmarMultiLote() {
    if (!modalLote) return
    const totalQtd = Object.values(lotesSelecionados).reduce((s, q) => s + q, 0)
    if (totalQtd !== modalLote.alvo) return
    setSalvandoLotes(true)
    try {
      const { produto } = modalLote
      const res = await fetch('/api/movimentacao', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produto_id: produto.produto_id, tipo: 'saida', quantidade: totalQtd, local: localSelecionado }),
      })
      const json = await res.json()
      if (!res.ok || json.erro) { setFeedbackLotes({ msg: json.erro ?? 'Erro ao salvar', ok: false }); return }

      const produtoId = produto.produto_id
      // TODO: estas atualizações de lote são chamadas sequenciais e não atômicas — se uma
      // falhar no meio do loop, o total em estoque (já atualizado via RPC acima) pode ficar
      // dessincronizado da soma dos lotes em `validades`. Tratar depois com uma função
      // atômica no banco, no mesmo padrão de `estoque_aplicar_movimentacao` (ver migrations).
      for (const [key, qtdSaida] of Object.entries(lotesSelecionados)) {
        if (qtdSaida <= 0 || key === '__sem__') continue
        const validade = modalLote.validades.find((v) => v.id === key)
        if (!validade) continue
        const novaQtd = Math.max(0, validade.quantidade - qtdSaida)
        if (novaQtd === 0) {
          await fetch(`/api/validades?id=${encodeURIComponent(key)}`, { method: 'DELETE' })
          setValidadesPorProduto((prev) => ({
            ...prev, [produtoId]: (prev[produtoId] ?? []).filter((v) => v.id !== key),
          }))
        } else {
          const resVal = await fetch('/api/validades', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: key, quantidade: novaQtd }),
          })
          const jsonVal = await resVal.json()
          if (resVal.ok && !jsonVal.erro) {
            setValidadesPorProduto((prev) => ({
              ...prev, [produtoId]: (prev[produtoId] ?? []).map((v) => v.id === key ? jsonVal : v),
            }))
          }
        }
      }

      setItens((prev) => prev.map((item) =>
        item.id === produto.id ? { ...item, qtd_atual: json.qtd_atual, qtd_cozinha: json.qtd_cozinha ?? item.qtd_cozinha } : item
      ))
      setFeedbackLotes({ msg: `Saída de ${totalQtd} unidades registrada!`, ok: true })
      setTimeout(() => setModalLote(null), 900)
    } catch (err) {
      setFeedbackLotes({ msg: err instanceof Error ? err.message : 'Erro', ok: false })
    } finally { setSalvandoLotes(false) }
  }

  function voltarParaQuantidade() {
    if (!modalLote) return
    const { produto, local, alvo } = modalLote
    setModalLote(null)
    abrirModal(produto, 'saida', local)
    setQuantidade(String(alvo))
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

    if (modal.tipo === 'entrada') {
      const qtd = Number(quantidade)
      setModalValidadeEntrada({ produto: modal.produto, quantidade: qtd })
      setValidadeData('')
      setValidadeQtd(String(qtd))
      setSemValidade(false)
      setFeedbackEntrada(null)
      setValidadeFluxo('pergunta')
      setLotesEntrada([{ id: '0', data: '', qtd: '' }])
      fecharModal()
      return
    }

    // Saída: a quantidade aqui é só o alvo total — o próximo passo distribui entre os lotes
    const { produto, local } = modal
    const alvo = Number(quantidade)
    const validades = (validadesPorProduto[produto.produto_id] ?? []).slice().sort((a, b) => a.data_validade.localeCompare(b.data_validade))
    const somaLotes = validades.reduce((s, v) => s + v.quantidade, 0)
    const semValidadeDisp = Math.max(0, produto.qtd_atual - somaLotes)
    setLotesSelecionados({})
    setFeedbackLotes(null)
    setLocalSelecionado(local)
    setModalLote({ produto, validades, semValidadeDisp, alvo, local })
    fecharModal()
  }

  async function finalizarEntradaComValidade() {
    if (!modalValidadeEntrada) return
    setSalvandoEntrada(true)
    try {
      const { produto, quantidade } = modalValidadeEntrada
      const res = await fetch('/api/movimentacao', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produto_id: produto.produto_id, tipo: 'entrada', quantidade, local: 'principal' }),
      })
      const json = await res.json()
      if (!res.ok || json.erro) { setFeedbackEntrada({ msg: json.erro ?? 'Erro ao registrar', ok: false }); return }
      setItens((prev) => prev.map((item) =>
        item.id === produto.id ? { ...item, qtd_atual: json.qtd_atual, qtd_cozinha: json.qtd_cozinha ?? item.qtd_cozinha } : item
      ))
      if (!semValidade && validadeData) {
        const produtoId = produto.produto_id
        const valsExistentes = validadesPorProduto[produtoId] ?? []
        const existente = valsExistentes.find((v) => v.data_validade === validadeData)
        if (existente) {
          const novaQtd = existente.quantidade + (Number(validadeQtd) || quantidade)
          const resVal = await fetch('/api/validades', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: existente.id, quantidade: novaQtd }),
          })
          const jsonVal = await resVal.json()
          if (resVal.ok && !jsonVal.erro) {
            setValidadesPorProduto((prev) => ({
              ...prev,
              [produtoId]: (prev[produtoId] ?? []).map((v) => v.id === existente.id ? jsonVal : v),
            }))
          }
        } else {
          const resVal = await fetch('/api/validades', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ produto_id: produtoId, data_validade: validadeData, quantidade: Number(validadeQtd) || quantidade }),
          })
          const jsonVal = await resVal.json()
          if (resVal.ok && !jsonVal.erro) {
            setValidadesPorProduto((prev) => ({
              ...prev,
              [produtoId]: [...(prev[produtoId] ?? []), jsonVal].sort((a, b) => a.data_validade.localeCompare(b.data_validade)),
            }))
          }
        }
      }
      setFeedbackEntrada({ msg: 'Entrada registrada!', ok: true })
      setTimeout(() => { setModalValidadeEntrada(null); setFeedbackEntrada(null) }, 900)
    } catch (err) {
      setFeedbackEntrada({ msg: err instanceof Error ? err.message : 'Erro', ok: false })
    } finally { setSalvandoEntrada(false) }
  }

  function adicionarLote() {
    setLotesEntrada((prev) => [...prev, { id: String(Date.now()), data: '', qtd: '' }])
  }

  function removerLote(id: string) {
    setLotesEntrada((prev) => prev.filter((l) => l.id !== id))
  }

  async function finalizarEntradaMultiplosLotes() {
    if (!modalValidadeEntrada) return

    // Snapshot imediato dos lotes e do produto — evita closure stale durante await
    const { produto, quantidade } = modalValidadeEntrada
    const produtoId = produto.produto_id
    const lotesParaSalvar = lotesEntrada.filter((l) => l.data.trim() && Number(l.qtd) > 0)

    console.log('[finalizarEntradaMultiplosLotes] produto_id:', produtoId, '| quantidade total:', quantidade)
    console.log('[finalizarEntradaMultiplosLotes] lotes a salvar:', lotesParaSalvar)

    setSalvandoEntrada(true)
    try {
      const res = await fetch('/api/movimentacao', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produto_id: produtoId, tipo: 'entrada', quantidade, local: 'principal' }),
      })
      const json = await res.json()
      if (!res.ok || json.erro) { setFeedbackEntrada({ msg: json.erro ?? 'Erro ao registrar', ok: false }); return }
      setItens((prev) => prev.map((item) =>
        item.id === produto.id ? { ...item, qtd_atual: json.qtd_atual, qtd_cozinha: json.qtd_cozinha ?? item.qtd_cozinha } : item
      ))

      // Snapshot local das validades — atualizado sincronamente a cada iteração
      // para que lotes com mesma data não criem registros duplicados
      let valsLocais = [...(validadesPorProduto[produtoId] ?? [])]
      console.log('[finalizarEntradaMultiplosLotes] validades existentes no início:', valsLocais.map((v) => ({ id: v.id, data: v.data_validade, qtd: v.quantidade })))

      for (const lote of lotesParaSalvar) {
        const existente = valsLocais.find((v) => v.data_validade === lote.data)
        if (existente) {
          const novaQtd = existente.quantidade + Number(lote.qtd)
          console.log('[finalizarEntradaMultiplosLotes] PATCH id:', existente.id, '| data:', lote.data, '| qtd anterior:', existente.quantidade, '→', novaQtd)
          const resVal = await fetch('/api/validades', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: existente.id, quantidade: novaQtd }),
          })
          const jsonVal = await resVal.json()
          if (resVal.ok && !jsonVal.erro) {
            // Atualiza o snapshot local sincronamente — próximas iterações veem o novo valor
            valsLocais = valsLocais.map((v) => v.id === existente.id ? jsonVal : v)
          }
        } else {
          console.log('[finalizarEntradaMultiplosLotes] POST data:', lote.data, '| qtd:', Number(lote.qtd))
          const resVal = await fetch('/api/validades', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ produto_id: produtoId, data_validade: lote.data, quantidade: Number(lote.qtd) }),
          })
          const jsonVal = await resVal.json()
          if (resVal.ok && !jsonVal.erro) {
            // Adiciona ao snapshot local — próximas iterações com mesma data farão PATCH, não POST
            valsLocais = [...valsLocais, jsonVal]
          }
        }
      }

      // Atualiza React state de uma vez com o estado final ordenado
      const valsFinal = [...valsLocais].sort((a, b) => a.data_validade.localeCompare(b.data_validade))
      console.log('[finalizarEntradaMultiplosLotes] validades finais:', valsFinal.map((v) => ({ id: v.id, data: v.data_validade, qtd: v.quantidade })))
      setValidadesPorProduto((prev) => ({ ...prev, [produtoId]: valsFinal }))

      setFeedbackEntrada({ msg: 'Entrada registrada!', ok: true })
      setTimeout(() => { setModalValidadeEntrada(null); setFeedbackEntrada(null) }, 900)
    } catch (err) {
      setFeedbackEntrada({ msg: err instanceof Error ? err.message : 'Erro', ok: false })
    } finally { setSalvandoEntrada(false) }
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
    ? (modal.local === 'cozinha' ? (modal.produto.qtd_cozinha ?? 0) : modal.produto.qtd_atual)
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

      {/* Modal seleção de lotes - multi-select com qtd por lote */}
      {modalLote && (() => {
        const totalSel = Object.values(lotesSelecionados).reduce((s, q) => s + q, 0)
        const unidade = modalLote.produto.produtos?.unidade ?? 'un'
        const faltam = modalLote.alvo - totalSel
        const okAlvo = faltam === 0
        return (
          <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50, background: 'rgba(0,0,0,0.6)' }}>
            <div style={{ width: '100%', maxWidth: 480, background: D.card, borderRadius: '24px 24px 0 0', padding: '24px 24px 40px', boxShadow: '0 -4px 40px rgba(0,0,0,0.5)', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: D.border, margin: '0 auto 20px' }} />

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.25)', borderRadius: 12, padding: '10px 14px', marginBottom: 16 }}>
                <span style={{ fontSize: 15 }}>📋</span>
                <p style={{ color: '#F97316', fontSize: 12, fontWeight: 700 }}>Retire sempre o lote mais antigo primeiro</p>
              </div>

              <p style={{ color: D.text2, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>Saída</p>
              <p style={{ color: D.text, fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{modalLote.produto.produtos?.nome}</p>
              <p style={{ color: D.text2, fontSize: 12, marginBottom: 16 }}>Distribua {modalLote.alvo} {unidade} entre os lotes abaixo:</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {modalLote.validades.map((v, idx) => {
                  const qtdSel = lotesSelecionados[v.id] ?? 0
                  const checked = qtdSel > 0
                  const dias = diasAteVencer(v.data_validade)
                  const isFifo = idx === 0
                  let dateColor: string = D.text
                  let urgBadge = ''
                  let urgColor = ''
                  if (dias < 0) { dateColor = '#EF4444'; urgBadge = 'Vencido'; urgColor = '#EF4444' }
                  else if (dias <= 7) { dateColor = '#F97316'; urgBadge = `${dias}d`; urgColor = '#F97316' }
                  else if (dias <= 30) { dateColor = '#F59E0B' }

                  return (
                    <div key={v.id} style={{ border: `2px solid ${checked ? '#6366F1' : D.border}`, background: checked ? 'rgba(99,102,241,0.06)' : D.input, borderRadius: 14, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button onClick={() => setLotesSelecionados((prev) => {
                          const next = { ...prev }
                          if (next[v.id]) {
                            delete next[v.id]
                          } else {
                            // Ao marcar o lote, preenche com o que ainda falta para o alvo,
                            // limitado pela quantidade registrada nesta validade.
                            const alocadoOutros = Object.values(next).reduce((s, q) => s + q, 0)
                            const faltam = Math.max(1, modalLote.alvo - alocadoOutros)
                            next[v.id] = Math.min(v.quantidade, faltam)
                          }
                          return next
                        })} style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${checked ? '#6366F1' : D.border}`, background: checked ? '#6366F1' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer', padding: 0 }}>
                          {checked && <span style={{ color: '#fff', fontSize: 12, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                        </button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: dateColor }}>
                              {new Date(v.data_validade + 'T00:00:00').toLocaleDateString('pt-BR')}
                            </span>
                            {isFifo && <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 5, background: '#6366F1', color: '#fff' }}>FIFO</span>}
                            {urgBadge && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 5, background: `${urgColor}22`, color: urgColor }}>{urgBadge}</span>}
                          </div>
                          <span style={{ fontSize: 11, color: D.text2 }}>{v.quantidade} disponível</span>
                        </div>
                        {checked && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            <button type="button" aria-label="Diminuir"
                              onClick={() => setLotesSelecionados((prev) => {
                                const next = { ...prev }
                                const novo = (next[v.id] ?? 0) - 1
                                if (novo <= 0) delete next[v.id]
                                else next[v.id] = novo
                                return next
                              })}
                              style={{ width: 30, height: 30, borderRadius: 8, border: '2px solid #6366F1', background: D.input, color: '#6366F1', fontSize: 18, fontWeight: 800, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: 0 }}>
                              −
                            </button>
                            <span style={{ minWidth: 22, textAlign: 'center', fontSize: 15, fontWeight: 800, color: D.text }}>{qtdSel}</span>
                            <button type="button" aria-label="Aumentar" disabled={qtdSel >= v.quantidade}
                              onClick={() => setLotesSelecionados((prev) => ({ ...prev, [v.id]: Math.min(v.quantidade, (prev[v.id] ?? 0) + 1) }))}
                              style={{ width: 30, height: 30, borderRadius: 8, border: '2px solid #6366F1', background: '#6366F1', color: '#fff', fontSize: 18, fontWeight: 800, cursor: qtdSel >= v.quantidade ? 'not-allowed' : 'pointer', opacity: qtdSel >= v.quantidade ? 0.4 : 1, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: 0 }}>
                              +
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}

                {modalLote.semValidadeDisp > 0 && (() => {
                  const qtdSel = lotesSelecionados['__sem__'] ?? 0
                  const checked = qtdSel > 0
                  return (
                    <div style={{ border: `2px solid ${checked ? '#6366F1' : D.border}`, background: checked ? 'rgba(99,102,241,0.06)' : D.input, borderRadius: 14, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button onClick={() => setLotesSelecionados((prev) => {
                          const next = { ...prev }
                          if (next['__sem__']) {
                            delete next['__sem__']
                          } else {
                            // Sem validade: preenche com o que falta para o alvo,
                            // limitado pelo disponível fora dos lotes (qtd_atual − soma dos lotes).
                            const alocadoOutros = Object.values(next).reduce((s, q) => s + q, 0)
                            const faltam = Math.max(1, modalLote.alvo - alocadoOutros)
                            next['__sem__'] = Math.min(modalLote.semValidadeDisp, faltam)
                          }
                          return next
                        })} style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${checked ? '#6366F1' : D.border}`, background: checked ? '#6366F1' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer', padding: 0 }}>
                          {checked && <span style={{ color: '#fff', fontSize: 12, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                        </button>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: D.text }}>Sem validade</span>
                          <span style={{ fontSize: 11, color: D.text2, display: 'block' }}>{modalLote.semValidadeDisp} disponível</span>
                        </div>
                        {checked && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            <button type="button" aria-label="Diminuir"
                              onClick={() => setLotesSelecionados((prev) => {
                                const next = { ...prev }
                                const novo = (next['__sem__'] ?? 0) - 1
                                if (novo <= 0) delete next['__sem__']
                                else next['__sem__'] = novo
                                return next
                              })}
                              style={{ width: 30, height: 30, borderRadius: 8, border: '2px solid #6366F1', background: D.input, color: '#6366F1', fontSize: 18, fontWeight: 800, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: 0 }}>
                              −
                            </button>
                            <span style={{ minWidth: 22, textAlign: 'center', fontSize: 15, fontWeight: 800, color: D.text }}>{qtdSel}</span>
                            <button type="button" aria-label="Aumentar" disabled={qtdSel >= modalLote.semValidadeDisp}
                              onClick={() => setLotesSelecionados((prev) => ({ ...prev, ['__sem__']: Math.min(modalLote.semValidadeDisp, (prev['__sem__'] ?? 0) + 1) }))}
                              style={{ width: 30, height: 30, borderRadius: 8, border: '2px solid #6366F1', background: '#6366F1', color: '#fff', fontSize: 18, fontWeight: 800, cursor: qtdSel >= modalLote.semValidadeDisp ? 'not-allowed' : 'pointer', opacity: qtdSel >= modalLote.semValidadeDisp ? 0.4 : 1, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: 0 }}>
                              +
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })()}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: okAlvo ? '#10B981' : D.text }}>
                  {totalSel} de {modalLote.alvo} {unidade} alocados
                </p>
                {!okAlvo && faltam > 0 && (
                  <span style={{ fontSize: 12, color: '#F97316', fontWeight: 600 }}>Faltam {faltam}</span>
                )}
                {faltam < 0 && (
                  <span style={{ fontSize: 12, color: '#EF4444', fontWeight: 600 }}>Excede por {-faltam}</span>
                )}
              </div>

              {feedbackLotes && (
                <p style={{ fontSize: 14, textAlign: 'center', fontWeight: 600, marginBottom: 12, color: feedbackLotes.ok ? '#10B981' : '#EF4444' }}>
                  {feedbackLotes.msg}
                </p>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={voltarParaQuantidade}
                  style={{ padding: '14px 20px', borderRadius: 16, background: D.input, color: D.text2, border: `1px solid ${D.border}`, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                  ←
                </button>
                <button onClick={confirmarMultiLote} disabled={salvandoLotes || !okAlvo}
                  style={{ flex: 1, padding: '14px', borderRadius: 16, background: okAlvo ? '#EF4444' : D.input, color: okAlvo ? '#fff' : D.text2, border: `1px solid ${okAlvo ? 'transparent' : D.border}`, fontWeight: 700, fontSize: 15, cursor: okAlvo && !salvandoLotes ? 'pointer' : 'not-allowed', opacity: salvandoLotes ? 0.6 : 1 }}>
                  {salvandoLotes ? 'Salvando...' : okAlvo ? `Confirmar saída de ${totalSel} ${unidade}` : faltam > 0 ? `Faltam ${faltam} ${unidade}` : `Excede por ${-faltam} ${unidade}`}
                </button>
              </div>
              <button onClick={() => setModalLote(null)}
                style={{ display: 'block', width: '100%', marginTop: 10, padding: '10px', border: 'none', background: 'none', color: D.muted, fontSize: 13, cursor: 'pointer' }}>
                Cancelar saída
              </button>
            </div>
          </div>
        )
      })()}

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

      {/* Modal validade de entrada */}
      {modalValidadeEntrada && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50, background: 'rgba(0,0,0,0.6)' }}>
          <div style={{ width: '100%', maxWidth: 480, background: D.card, borderRadius: '24px 24px 0 0', padding: '24px 24px 40px', boxShadow: '0 -4px 40px rgba(0,0,0,0.5)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: D.border, margin: '0 auto 20px' }} />

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 18 }}>+</div>
              <div>
                <p style={{ fontSize: 11, color: D.text2, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Validade</p>
                <p style={{ color: D.text, fontWeight: 600, fontSize: 14 }}>{modalValidadeEntrada.produto.produtos?.nome}</p>
              </div>
            </div>
            <p style={{ color: D.text2, fontSize: 12, marginLeft: 44, marginBottom: 24 }}>
              Entrada de {modalValidadeEntrada.quantidade} {modalValidadeEntrada.produto.produtos?.unidade}
            </p>

            {/* Passo 1: pergunta */}
            {validadeFluxo === 'pergunta' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ color: D.text, fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
                  Todos os {modalValidadeEntrada.quantidade} itens têm a mesma validade?
                </p>
                <button onClick={() => setValidadeFluxo('mesma')}
                  style={{ width: '100%', padding: '14px 16px', borderRadius: 14, background: 'rgba(16,185,129,0.1)', color: '#10B981', border: '1px solid rgba(16,185,129,0.3)', fontWeight: 700, fontSize: 14, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span>✅</span><span>Sim, mesma validade</span>
                </button>
                <button onClick={() => setValidadeFluxo('diferentes')}
                  style={{ width: '100%', padding: '14px 16px', borderRadius: 14, background: D.input, color: D.text, border: `1px solid ${D.border}`, fontWeight: 700, fontSize: 14, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span>📋</span><span>Não, validades diferentes</span>
                </button>
              </div>
            )}

            {/* Passo 2a: mesma validade */}
            {validadeFluxo === 'mesma' && (
              <>
                <button onClick={() => setSemValidade((v) => !v)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', marginBottom: 20, padding: 0 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${semValidade ? '#10B981' : D.border}`, background: semValidade ? '#10B981' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {semValidade && <span style={{ color: '#fff', fontSize: 11, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                  </div>
                  <span style={{ fontSize: 13, color: D.text, fontWeight: 600 }}>Este produto não tem validade</span>
                </button>

                {!semValidade && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: D.text2, marginBottom: 4 }}>Data de validade</label>
                      <input type="date" value={validadeData} onChange={(e) => setValidadeData(e.target.value)} autoFocus
                        style={{ width: '100%', background: D.input, border: `1px solid ${D.border}`, borderRadius: 12, padding: '10px 14px', fontSize: 14, color: D.text, outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                    {(() => {
                      const prodId = modalValidadeEntrada.produto.produto_id
                      const vals = validadesPorProduto[prodId] ?? []
                      const existingSum = vals.reduce((s, v) => s + v.quantidade, 0)
                      const newTotal = modalValidadeEntrada.produto.qtd_atual + modalValidadeEntrada.quantidade
                      const afterSum = existingSum + modalValidadeEntrada.quantidade
                      if (validadeData && afterSum > newTotal) {
                        return (
                          <p style={{ fontSize: 12, color: '#F97316', fontWeight: 600, background: 'rgba(249,115,22,0.1)', borderRadius: 10, padding: '8px 12px' }}>
                            ⚠️ Soma das validades ({afterSum}) excede o novo estoque ({newTotal})
                          </p>
                        )
                      }
                      return null
                    })()}
                  </div>
                )}

                {feedbackEntrada && (
                  <p style={{ fontSize: 14, textAlign: 'center', fontWeight: 600, marginBottom: 12, color: feedbackEntrada.ok ? '#10B981' : '#EF4444' }}>
                    {feedbackEntrada.msg}
                  </p>
                )}

                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setValidadeFluxo('pergunta')}
                    style={{ padding: '14px 20px', borderRadius: 16, background: D.input, color: D.text2, border: `1px solid ${D.border}`, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                    ←
                  </button>
                  <button onClick={finalizarEntradaComValidade} disabled={salvandoEntrada}
                    style={{ flex: 1, padding: '14px', borderRadius: 16, background: '#10B981', color: '#fff', border: 'none', fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: salvandoEntrada ? 0.6 : 1 }}>
                    {salvandoEntrada ? 'Registrando...' : 'Registrar entrada'}
                  </button>
                </div>
              </>
            )}

            {/* Passo 2b: validades diferentes */}
            {validadeFluxo === 'diferentes' && (() => {
              const somaLotes = lotesEntrada.reduce((s, l) => s + (Number(l.qtd) || 0), 0)
              const faltam = modalValidadeEntrada.quantidade - somaLotes
              const ok = faltam === 0
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: ok ? '#10B981' : D.text }}>
                      {somaLotes} de {modalValidadeEntrada.quantidade} alocados
                    </p>
                    {!ok && faltam > 0 && (
                      <span style={{ fontSize: 12, color: '#F97316', fontWeight: 600 }}>Faltam {faltam}</span>
                    )}
                    {faltam < 0 && (
                      <span style={{ fontSize: 12, color: '#EF4444', fontWeight: 600 }}>Excede por {-faltam}</span>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                    {lotesEntrada.map((lote, idx) => (
                      <div key={lote.id} style={{ background: D.input, border: `1px solid ${D.border}`, borderRadius: 14, padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <p style={{ fontSize: 11, color: D.text2, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            Lote {idx + 1}
                          </p>
                          {lotesEntrada.length > 1 && (
                            <button onClick={() => removerLote(lote.id)}
                              style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}>
                              ✕
                            </button>
                          )}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div>
                            <label style={{ display: 'block', fontSize: 11, color: D.text2, fontWeight: 600, marginBottom: 3 }}>Validade</label>
                            <input type="date" value={lote.data}
                              onChange={(e) => { const v = e.target.value; setLotesEntrada((prev) => prev.map((l) => l.id === lote.id ? { ...l, data: v } : l)) }}
                              style={{ width: '100%', background: D.card, border: `1px solid ${D.border}`, borderRadius: 10, padding: '8px 10px', fontSize: 13, color: D.text, outline: 'none', boxSizing: 'border-box' }} />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: 11, color: D.text2, fontWeight: 600, marginBottom: 3 }}>Quantidade</label>
                            <input type="number" min="1" placeholder="0" value={lote.qtd}
                              onChange={(e) => { const v = e.target.value; setLotesEntrada((prev) => prev.map((l) => l.id === lote.id ? { ...l, qtd: v } : l)) }}
                              style={{ width: '100%', background: D.card, border: `1px solid ${D.border}`, borderRadius: 10, padding: '8px 10px', fontSize: 13, color: D.text, outline: 'none', boxSizing: 'border-box' }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button onClick={adicionarLote}
                    style={{ width: '100%', padding: '11px', borderRadius: 14, background: 'none', color: '#6366F1', border: `2px dashed ${D.border}`, fontWeight: 600, fontSize: 13, cursor: 'pointer', marginBottom: 14 }}>
                    + Adicionar lote
                  </button>

                  {feedbackEntrada && (
                    <p style={{ fontSize: 14, textAlign: 'center', fontWeight: 600, marginBottom: 12, color: feedbackEntrada.ok ? '#10B981' : '#EF4444' }}>
                      {feedbackEntrada.msg}
                    </p>
                  )}

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => setValidadeFluxo('pergunta')}
                      style={{ padding: '14px 20px', borderRadius: 16, background: D.input, color: D.text2, border: `1px solid ${D.border}`, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                      ←
                    </button>
                    <button onClick={finalizarEntradaMultiplosLotes} disabled={salvandoEntrada || !ok}
                      style={{ flex: 1, padding: '14px', borderRadius: 16, background: ok ? '#10B981' : D.input, color: ok ? '#fff' : D.text2, border: `1px solid ${ok ? 'transparent' : D.border}`, fontWeight: 700, fontSize: 15, cursor: ok && !salvandoEntrada ? 'pointer' : 'not-allowed', opacity: salvandoEntrada ? 0.6 : 1 }}>
                      {salvandoEntrada ? 'Registrando...' : ok ? 'Confirmar entrada' : faltam > 0 ? `Faltam ${faltam} unidades` : `Excede por ${-faltam}`}
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
