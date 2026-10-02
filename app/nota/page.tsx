'use client'
import { useRef, useState, useEffect, ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { buscarEstoque, invalidarEstoqueCache } from '@/app/lib/estoqueCache'

type ProdutoEstoque = {
  produto_id: string
  produtos: { nome: string; unidade: string } | null
}

type Fornecedor = { id: string; nome: string }

type ItemNota = {
  nome_nota: string
  quantidade: number
  produto_id: string | null
  nome_sistema: string | null
  unidade: string | null
}

type Lote = { id: string; data: string; qtd: string }

type NovoProduto = {
  fornecedor_id: string
  unidade: string
  qtd_base: string
  qtd_max: string
  codigo_barras: string
  preco_custo: string
}

type Decisao = 'existente' | 'criar' | 'ignorar' | null

type ItemEditavel = {
  nome_nota: string
  quantidade: number
  produto_id_sel: string | null
  unidade_detectada: string | null
  decisao: Decisao
  novoProduto: NovoProduto | null
  lotes: Lote[]
}

type Etapa = 'upload' | 'analisando' | 'revisao' | 'lancando' | 'concluido'

const normalizar = (s: string) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

// Data de hoje no fuso local do usuário, em YYYY-MM-DD (para comparar com <input type="date">)
const hojeISO = () => {
  const agora = new Date()
  return new Date(agora.getTime() - agora.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

const novoLote = (qtd: number | string = ''): Lote => ({
  id: Math.random().toString(36).slice(2),
  data: '',
  qtd: String(qtd),
})

export default function NotaPage() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const [etapa, setEtapa] = useState<Etapa>('upload')
  const [imagemPreview, setImagemPreview] = useState<string | null>(null)
  const [imagemBase64, setImagemBase64] = useState('')
  const [mediaType, setMediaType] = useState('image/jpeg')
  const [fornecedor, setFornecedor] = useState<string | null>(null)
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [fornecedorSel, setFornecedorSel] = useState<string>('')
  const [criandoForn, setCriandoForn] = useState(false)
  const [itens, setItens] = useState<ItemEditavel[]>([])
  const [estoque, setEstoque] = useState<ProdutoEstoque[]>([])
  const [erroMsg, setErroMsg] = useState('')
  const [resultadoLanc, setResultadoLanc] = useState<{ lancados: number; falhas: { nome: string; erro: string }[] }>({ lancados: 0, falhas: [] })

  useEffect(() => {
    Promise.all([
      buscarEstoque(),
      fetch('/api/cadastro/fornecedor').then((r) => r.json()),
    ]).then(([est, forn]) => {
      setEstoque(est as unknown as ProdutoEstoque[])
      if (Array.isArray(forn)) setFornecedores(forn)
    }).catch(() => {})
  }, [])

  const fornecedorDetectado = fornecedor?.trim() ?? ''
  const detectadoNoBanco = fornecedorDetectado !== '' &&
    fornecedores.some((f) => normalizar(f.nome) === normalizar(fornecedorDetectado))

  function lerArquivo(file: File) {
    if (!file.type.startsWith('image/')) {
      setErroMsg('Selecione um arquivo de imagem.')
      return
    }
    setErroMsg('')
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      setImagemPreview(dataUrl)
      const [meta, b64] = dataUrl.split(',')
      const mt = meta.match(/:(.*?);/)?.[1] ?? 'image/jpeg'
      setMediaType(mt)
      setImagemBase64(b64)
      setEtapa('upload')
    }
    reader.readAsDataURL(file)
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) lerArquivo(file)
    e.target.value = ''
  }

  async function analisarNota() {
    if (!imagemBase64) return
    setEtapa('analisando')
    setErroMsg('')

    try {
      const res = await fetch('/api/nota', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagemBase64, mediaType }),
      })
      const json = await res.json()

      if (!res.ok || json.erro) {
        setErroMsg(json.erro ?? 'Erro ao analisar a nota.')
        setEtapa('upload')
        return
      }

      const resultado = json as { fornecedor: string | null; produtos: ItemNota[] }
      setFornecedor(resultado.fornecedor)
      const nomeDetectado = resultado.fornecedor?.trim() ?? ''
      const match = nomeDetectado
        ? fornecedores.find((f) => normalizar(f.nome) === normalizar(nomeDetectado))
        : undefined
      setFornecedorSel(match ? match.id : nomeDetectado ? '__detectado__' : '')

      setItens(
        (resultado.produtos ?? []).map((item): ItemEditavel => {
          const quantidade = item.quantidade > 0 ? item.quantidade : 1
          return {
            nome_nota: item.nome_nota,
            quantidade,
            produto_id_sel: item.produto_id ?? null,
            unidade_detectada: item.unidade,
            decisao: item.produto_id ? 'existente' : null,
            novoProduto: null,
            lotes: [novoLote(quantidade)],
          }
        })
      )
      setEtapa('revisao')
    } catch {
      setErroMsg('Erro de conexão ao analisar a nota.')
      setEtapa('upload')
    }
  }

  // ── Helpers de edição de item ───────────────────────────────────────────────
  function atualizarItem(idx: number, campo: Partial<ItemEditavel>) {
    setItens((prev) => prev.map((it, i) => i === idx ? { ...it, ...campo } : it))
  }

  function mudarQuantidade(idx: number, q: number) {
    setItens((prev) => prev.map((it, i) => {
      if (i !== idx) return it
      const quantidade = Math.max(1, Math.floor(q || 1))
      // Com um único lote, a quantidade do lote acompanha o total automaticamente
      const lotes = it.lotes.length === 1 ? [{ ...it.lotes[0], qtd: String(quantidade) }] : it.lotes
      return { ...it, quantidade, lotes }
    }))
  }

  function atualizarLote(idx: number, loteId: string, campo: Partial<Lote>) {
    setItens((prev) => prev.map((it, i) => i === idx
      ? { ...it, lotes: it.lotes.map((l) => l.id === loteId ? { ...l, ...campo } : l) }
      : it))
  }

  function adicionarLote(idx: number) {
    setItens((prev) => prev.map((it, i) => i === idx ? { ...it, lotes: [...it.lotes, novoLote('')] } : it))
  }

  function removerLote(idx: number, loteId: string) {
    setItens((prev) => prev.map((it, i) => {
      if (i !== idx || it.lotes.length <= 1) return it
      const lotes = it.lotes.filter((l) => l.id !== loteId)
      if (lotes.length === 1) lotes[0] = { ...lotes[0], qtd: String(it.quantidade) }
      return { ...it, lotes }
    }))
  }

  function abrirCriarProduto(idx: number) {
    const fornPreset = fornecedorSel && fornecedorSel !== '__detectado__' ? fornecedorSel : ''
    setItens((prev) => prev.map((it, i) => i === idx ? {
      ...it,
      decisao: 'criar',
      produto_id_sel: null,
      novoProduto: it.novoProduto ?? {
        fornecedor_id: fornPreset,
        unidade: it.unidade_detectada ?? '',
        qtd_base: '', qtd_max: '', codigo_barras: '', preco_custo: '',
      },
    } : it))
  }

  function atualizarNovoProduto(idx: number, campo: Partial<NovoProduto>) {
    setItens((prev) => prev.map((it, i) => i === idx && it.novoProduto
      ? { ...it, novoProduto: { ...it.novoProduto, ...campo } }
      : it))
  }

  async function criarFornecedorInline(idx: number) {
    if (!fornecedorDetectado || criandoForn) return
    setCriandoForn(true)
    try {
      const res = await fetch('/api/cadastro/fornecedor', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: fornecedorDetectado }),
      })
      const json = await res.json()
      if (res.ok && json?.id) {
        setFornecedores((prev) => [...prev, json].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')))
        setFornecedorSel(json.id)
        atualizarNovoProduto(idx, { fornecedor_id: json.id })
      }
    } catch { /* silencioso */ } finally {
      setCriandoForn(false)
    }
  }

  // ── Validação por item ──────────────────────────────────────────────────────
  function itemValido(it: ItemEditavel): { ok: boolean; msg?: string } {
    if (it.decisao === 'ignorar') return { ok: true }
    if (it.decisao === null) return { ok: false, msg: 'Decida: usar produto do sistema, criar ou ignorar' }
    if (it.quantidade <= 0) return { ok: false, msg: 'Quantidade inválida' }

    if (it.decisao === 'existente' && !it.produto_id_sel) return { ok: false, msg: 'Escolha o produto' }
    if (it.decisao === 'criar') {
      const np = it.novoProduto
      if (!np || !np.fornecedor_id || !np.unidade.trim()) {
        return { ok: false, msg: 'Preencha fornecedor e unidade do novo produto' }
      }
    }

    if (it.lotes.length === 0) return { ok: false, msg: 'Adicione ao menos um lote de validade' }
    const hoje = hojeISO()
    for (const l of it.lotes) {
      if (!l.data) return { ok: false, msg: 'Preencha a data de validade de todos os lotes' }
      if (l.data < hoje) return { ok: false, msg: `Validade ${l.data} está no passado — verifique o ano` }
      if (!(Number(l.qtd) > 0)) return { ok: false, msg: 'Quantidade do lote inválida' }
    }
    const soma = it.lotes.reduce((s, l) => s + Number(l.qtd), 0)
    if (soma !== it.quantidade) return { ok: false, msg: `Lotes somam ${soma}, mas a quantidade é ${it.quantidade}` }
    return { ok: true }
  }

  async function lancarTudo() {
    const naoIgnorados = itens.filter((i) => i.decisao !== 'ignorar')
    if (naoIgnorados.length === 0 || !itens.every((i) => itemValido(i).ok)) return

    setEtapa('lancando')
    setErroMsg('')

    const fornecedor_id = fornecedorSel && fornecedorSel !== '__detectado__' ? fornecedorSel : null

    const payloadItens = naoIgnorados.map((i) => {
      // Mescla lotes de mesma data antes de enviar
      const porData = new Map<string, number>()
      for (const l of i.lotes) porData.set(l.data, (porData.get(l.data) ?? 0) + Number(l.qtd))
      return {
        nome_nota: i.nome_nota,
        produto_id: i.decisao === 'existente' ? i.produto_id_sel : null,
        novoProduto: i.decisao === 'criar' && i.novoProduto ? {
          nome: i.nome_nota,
          fornecedor_id: i.novoProduto.fornecedor_id,
          unidade: i.novoProduto.unidade.trim(),
          qtd_base: Number(i.novoProduto.qtd_base) || 0,
          qtd_max: Number(i.novoProduto.qtd_max) || 0,
          codigo_barras: i.novoProduto.codigo_barras.trim() || null,
          preco_custo: i.novoProduto.preco_custo !== '' ? Number(i.novoProduto.preco_custo) : null,
        } : null,
        quantidade: i.quantidade,
        lotes: [...porData.entries()].map(([data_validade, quantidade]) => ({ data_validade, quantidade })),
      }
    })

    try {
      const res = await fetch('/api/nota/lancar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fornecedor_id, itens: payloadItens }),
      })
      const json = await res.json()
      if (!res.ok || json.erro) {
        setErroMsg(json.erro ?? 'Erro ao lançar as entradas.')
        setEtapa('revisao')
        return
      }
      invalidarEstoqueCache()
      setResultadoLanc({ lancados: (json.lancados ?? []).length, falhas: json.falhas ?? [] })
      setEtapa('concluido')
    } catch {
      setErroMsg('Erro de conexão ao lançar as entradas.')
      setEtapa('revisao')
    }
  }

  function reiniciar() {
    setEtapa('upload'); setImagemPreview(null); setImagemBase64('')
    setItens([]); setFornecedor(null); setFornecedorSel('')
    setResultadoLanc({ lancados: 0, falhas: [] }); setErroMsg('')
  }

  const btnBase = 'w-full py-3 rounded-xl font-semibold text-white text-sm transition-opacity active:opacity-80'
  const inputCls = 'w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white'

  // ── Upload ──────────────────────────────────────────────────────────────────
  if (etapa === 'upload') {
    return (
      <main className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-3 mb-5">
            <button onClick={() => router.back()} className="text-gray-500 text-sm">← Voltar</button>
            <h1 className="text-lg font-semibold text-gray-800">Lançar Nota Fiscal</h1>
          </div>

          <div
            className="border-2 border-dashed border-gray-300 rounded-2xl p-8 flex flex-col items-center gap-3 bg-white mb-4 cursor-pointer"
            onClick={() => inputRef.current?.click()}
          >
            {imagemPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imagemPreview} alt="Nota" className="max-h-60 rounded-xl object-contain" />
            ) : (
              <>
                <span className="text-5xl">🧾</span>
                <p className="text-gray-500 text-sm text-center">Toque para escolher uma imagem da galeria</p>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <button onClick={() => cameraRef.current?.click()} className={btnBase} style={{ background: '#1A3C5E' }}>
              📷 Câmera
            </button>
            <button onClick={() => inputRef.current?.click()} className={btnBase} style={{ background: '#374151' }}>
              🖼️ Galeria
            </button>
          </div>

          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFileChange} />
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />

          {erroMsg && <p className="text-red-600 text-sm text-center mt-2">{erroMsg}</p>}

          {imagemPreview && (
            <button onClick={analisarNota} className={btnBase} style={{ background: '#16A34A' }}>
              🔍 Analisar nota
            </button>
          )}
        </div>
      </main>
    )
  }

  // ── Analisando ──────────────────────────────────────────────────────────────
  if (etapa === 'analisando') {
    return (
      <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="text-center">
          <div className="text-5xl mb-4 animate-pulse">🔍</div>
          <p className="text-gray-700 font-semibold">Analisando nota fiscal...</p>
          <p className="text-gray-400 text-sm mt-1">Isso pode levar alguns segundos</p>
        </div>
      </main>
    )
  }

  // ── Lançando ────────────────────────────────────────────────────────────────
  if (etapa === 'lancando') {
    return (
      <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="text-center">
          <div className="text-5xl mb-4 animate-bounce">📦</div>
          <p className="text-gray-700 font-semibold">Lançando entradas...</p>
          <p className="text-gray-400 text-sm mt-1">Isso pode levar alguns segundos</p>
        </div>
      </main>
    )
  }

  // ── Concluído ───────────────────────────────────────────────────────────────
  if (etapa === 'concluido') {
    const { lancados, falhas } = resultadoLanc
    return (
      <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="text-center max-w-xs w-full">
          <div className="text-6xl mb-4">{falhas.length === 0 ? '✅' : '⚠️'}</div>
          <p className="text-gray-800 font-semibold text-lg mb-1">
            {lancados} entrada{lancados !== 1 ? 's' : ''} registrada{lancados !== 1 ? 's' : ''}!
          </p>
          {falhas.length > 0 && (
            <div className="text-left bg-orange-50 border border-orange-200 rounded-xl p-3 mt-3 mb-1">
              <p className="text-orange-700 text-xs font-semibold mb-1">
                {falhas.length} item{falhas.length !== 1 ? 's' : ''} não lançado{falhas.length !== 1 ? 's' : ''}:
              </p>
              <ul className="text-orange-600 text-xs space-y-0.5">
                {falhas.map((f, i) => <li key={i}>• {f.nome}: {f.erro}</li>)}
              </ul>
            </div>
          )}
          <div className="flex flex-col gap-3 mt-6">
            <button onClick={reiniciar} className={btnBase} style={{ background: '#1A3C5E' }}>📷 Lançar outra nota</button>
            <button onClick={() => router.push('/')} className={btnBase} style={{ background: '#374151' }}>← Voltar ao início</button>
          </div>
        </div>
      </main>
    )
  }

  // ── Revisão ─────────────────────────────────────────────────────────────────
  const validacoes = itens.map(itemValido)
  const naoIgnorados = itens.filter((i) => i.decisao !== 'ignorar')
  const pendentes = itens.filter((i) => i.decisao === null).length
  const podeConfirmar = naoIgnorados.length > 0 && validacoes.every((v) => v.ok)
  const hoje = hojeISO()

  return (
    <main className="min-h-screen bg-gray-50 p-4 pb-28">
      <div className="max-w-md mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => setEtapa('upload')} className="text-gray-500 text-sm">← Voltar</button>
          <h1 className="text-lg font-semibold text-gray-800">Revisar Nota</h1>
        </div>

        {imagemPreview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imagemPreview} alt="Nota" className="w-full max-h-40 object-contain rounded-xl mb-4 bg-white border border-gray-100" />
        )}

        {/* Fornecedor — editável */}
        <div className="bg-white rounded-xl p-4 border border-gray-100 mb-4">
          <label className="text-xs text-gray-500 mb-1 block">Fornecedor</label>
          <select value={fornecedorSel} onChange={(e) => setFornecedorSel(e.target.value)} className={inputCls}>
            <option value="">— Sem fornecedor —</option>
            {fornecedorDetectado !== '' && !detectadoNoBanco && (
              <option value="__detectado__">{`Detectado na nota: "${fornecedorDetectado}"`}</option>
            )}
            {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </div>

        <p className="text-xs text-gray-500 mb-3 uppercase tracking-wide font-semibold">
          {itens.length} produto{itens.length !== 1 ? 's' : ''} encontrado{itens.length !== 1 ? 's' : ''}
        </p>

        <div className="space-y-3 mb-4">
          {itens.map((item, idx) => {
            const v = validacoes[idx]
            const ignorado = item.decisao === 'ignorar'
            const produtoSel = estoque.find((e) => e.produto_id === item.produto_id_sel)
            const unidade = produtoSel?.produtos?.unidade ?? item.novoProduto?.unidade ?? item.unidade_detectada ?? ''
            const somaLotes = item.lotes.reduce((s, l) => s + (Number(l.qtd) || 0), 0)
            const diff = item.quantidade - somaLotes
            const temProduto = item.decisao === 'existente' || item.decisao === 'criar'

            return (
              <div
                key={idx}
                className="bg-white rounded-xl p-4 border"
                style={{ opacity: ignorado ? 0.55 : 1, borderColor: !ignorado && !v.ok ? '#fdba74' : '#e5e7eb' }}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <p className="text-sm font-medium text-gray-800 min-w-0 break-words">{item.nome_nota}</p>
                  {ignorado ? (
                    <button
                      onClick={() => atualizarItem(idx, { decisao: item.produto_id_sel ? 'existente' : null })}
                      className="text-xs text-blue-600 shrink-0"
                    >
                      retomar
                    </button>
                  ) : (
                    <button
                      onClick={() => atualizarItem(idx, { decisao: 'ignorar' })}
                      className="text-xs text-gray-400 shrink-0"
                    >
                      ignorar
                    </button>
                  )}
                </div>

                {ignorado ? (
                  <p className="text-xs text-gray-500">Item ignorado — não será lançado.</p>
                ) : (
                  <>
                    {/* Produto no sistema */}
                    <div className="mb-3">
                      <label className="text-xs text-gray-500 mb-1 block">Produto no sistema</label>
                      <select
                        value={item.decisao === 'existente' && item.produto_id_sel ? item.produto_id_sel : ''}
                        onChange={(e) => {
                          const val = e.target.value
                          if (val) atualizarItem(idx, { decisao: 'existente', produto_id_sel: val, novoProduto: null })
                          else atualizarItem(idx, { decisao: null, produto_id_sel: null })
                        }}
                        className={inputCls}
                      >
                        <option value="">— não está no sistema —</option>
                        {estoque.map((e) => (
                          <option key={e.produto_id} value={e.produto_id}>{e.produtos?.nome ?? e.produto_id}</option>
                        ))}
                      </select>
                    </div>

                    {/* Decisão quando não está no sistema */}
                    {item.decisao === null && (
                      <div className="flex gap-2 mb-3">
                        <button
                          onClick={() => abrirCriarProduto(idx)}
                          className="flex-1 py-2 rounded-lg text-xs font-semibold text-white"
                          style={{ background: '#16A34A' }}
                        >
                          + Criar produto
                        </button>
                        <button
                          onClick={() => atualizarItem(idx, { decisao: 'ignorar' })}
                          className="flex-1 py-2 rounded-lg text-xs font-semibold text-gray-600 border border-gray-200"
                        >
                          Ignorar este item
                        </button>
                      </div>
                    )}

                    {/* Mini-form de novo produto */}
                    {item.decisao === 'criar' && item.novoProduto && (
                      <div className="border border-green-200 bg-green-50 rounded-lg p-3 space-y-2 mb-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-green-700">Novo produto: {item.nome_nota}</p>
                          <button
                            onClick={() => atualizarItem(idx, { decisao: null, novoProduto: null })}
                            className="text-xs text-gray-400"
                          >
                            cancelar
                          </button>
                        </div>

                        <div>
                          <label className="text-[11px] text-gray-500 mb-0.5 block">Fornecedor</label>
                          <select
                            value={item.novoProduto.fornecedor_id}
                            onChange={(e) => atualizarNovoProduto(idx, { fornecedor_id: e.target.value })}
                            className={inputCls}
                          >
                            <option value="">— selecione —</option>
                            {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                          </select>
                          {fornecedorDetectado !== '' && !detectadoNoBanco && (
                            <button
                              onClick={() => criarFornecedorInline(idx)}
                              disabled={criandoForn}
                              className="text-[11px] text-blue-600 mt-1 disabled:opacity-50"
                            >
                              + criar fornecedor “{fornecedorDetectado}”
                            </button>
                          )}
                        </div>

                        <div>
                          <label className="text-[11px] text-gray-500 mb-0.5 block">Unidade</label>
                          <input
                            value={item.novoProduto.unidade}
                            onChange={(e) => atualizarNovoProduto(idx, { unidade: e.target.value })}
                            placeholder="un, kg, cx, L"
                            className={inputCls}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[11px] text-gray-500 mb-0.5 block">Qtd mínima</label>
                            <input type="number" min={0} value={item.novoProduto.qtd_base}
                              onChange={(e) => atualizarNovoProduto(idx, { qtd_base: e.target.value })} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-[11px] text-gray-500 mb-0.5 block">Qtd máxima</label>
                            <input type="number" min={0} value={item.novoProduto.qtd_max}
                              onChange={(e) => atualizarNovoProduto(idx, { qtd_max: e.target.value })} className={inputCls} />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[11px] text-gray-500 mb-0.5 block">Cód. barras</label>
                            <input value={item.novoProduto.codigo_barras}
                              onChange={(e) => atualizarNovoProduto(idx, { codigo_barras: e.target.value })} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-[11px] text-gray-500 mb-0.5 block">Preço custo</label>
                            <input type="number" min={0} step="0.01" value={item.novoProduto.preco_custo}
                              onChange={(e) => atualizarNovoProduto(idx, { preco_custo: e.target.value })} className={inputCls} />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Quantidade + lotes — só quando o produto está definido */}
                    {temProduto && (
                      <>
                        <div className="mb-3">
                          <label className="text-xs text-gray-500 mb-1 block">Quantidade total</label>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => mudarQuantidade(idx, item.quantidade - 1)}
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
                              style={{ background: '#1A3C5E' }}
                            >
                              <span style={{ display: 'block', width: 12, height: 2, background: '#fff', borderRadius: 2 }} />
                            </button>
                            <input
                              type="number" min={1} value={item.quantidade}
                              onChange={(e) => { const n = parseInt(e.target.value); if (n > 0) mudarQuantidade(idx, n) }}
                              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-center text-sm font-semibold"
                            />
                            <button
                              onClick={() => mudarQuantidade(idx, item.quantidade + 1)}
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-lg"
                              style={{ background: '#1A3C5E' }}
                            >
                              +
                            </button>
                            {unidade && <span className="text-xs text-gray-400 w-8 text-center shrink-0">{unidade}</span>}
                          </div>
                        </div>

                        <div>
                          <label className="text-xs text-gray-500 mb-1 block">
                            Validade{item.lotes.length > 1 ? ' (lotes)' : ''}
                          </label>
                          <div className="space-y-2">
                            {item.lotes.map((lote) => {
                              const dataPassado = lote.data !== '' && lote.data < hoje
                              return (
                                <div key={lote.id} className="flex items-center gap-2">
                                  <input
                                    type="date" value={lote.data} min={hoje}
                                    onChange={(e) => atualizarLote(idx, lote.id, { data: e.target.value })}
                                    className="flex-1 border rounded-lg px-2 py-1.5 text-sm bg-white"
                                    style={{ borderColor: dataPassado ? '#ef4444' : '#e5e7eb' }}
                                  />
                                  <input
                                    type="number" min={1} value={lote.qtd}
                                    onChange={(e) => atualizarLote(idx, lote.id, { qtd: e.target.value })}
                                    disabled={item.lotes.length === 1}
                                    className={`w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-center text-sm ${item.lotes.length === 1 ? 'bg-gray-50 text-gray-400' : 'bg-white'}`}
                                  />
                                  {item.lotes.length > 1 && (
                                    <button onClick={() => removerLote(idx, lote.id)} className="text-red-500 text-sm shrink-0 w-5">✕</button>
                                  )}
                                </div>
                              )
                            })}
                          </div>

                          {item.lotes.some((l) => l.data !== '' && l.data < hoje) && (
                            <p className="text-red-600 text-xs mt-1">Validade no passado — verifique o ano digitado.</p>
                          )}
                          {item.lotes.length > 1 && diff !== 0 && (
                            <p className="text-orange-600 text-xs mt-1">
                              Lotes somam {somaLotes} de {item.quantidade} · {diff > 0 ? `faltam ${diff}` : `excede por ${-diff}`}
                            </p>
                          )}

                          <button
                            onClick={() => adicionarLote(idx)}
                            className="text-xs text-blue-600 mt-2 border-2 border-dashed border-gray-200 rounded-lg w-full py-1.5"
                          >
                            + adicionar lote
                          </button>
                        </div>
                      </>
                    )}

                    {!v.ok && v.msg && <p className="text-orange-600 text-xs mt-3">⚠ {v.msg}</p>}
                  </>
                )}
              </div>
            )
          })}
        </div>

        {erroMsg && <p className="text-red-600 text-sm text-center mb-3">{erroMsg}</p>}
      </div>

      {/* Rodapé fixo */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gray-50 border-t border-gray-200">
        <div className="max-w-md mx-auto space-y-2">
          {pendentes > 0 && (
            <p className="text-orange-600 text-xs text-center">
              {pendentes} item{pendentes !== 1 ? 's' : ''} aguardando decisão (criar ou ignorar)
            </p>
          )}
          {pendentes === 0 && !podeConfirmar && naoIgnorados.length > 0 && (
            <p className="text-orange-600 text-xs text-center">Revise os itens destacados antes de confirmar</p>
          )}
          {naoIgnorados.length === 0 && (
            <p className="text-gray-500 text-xs text-center">Nenhum item para lançar</p>
          )}
          <button
            onClick={lancarTudo}
            disabled={!podeConfirmar}
            className={btnBase}
            style={{ background: podeConfirmar ? '#16A34A' : '#9CA3AF' }}
          >
            📦 Confirmar tudo{naoIgnorados.length > 0 ? ` (${naoIgnorados.length})` : ''}
          </button>
        </div>
      </div>
    </main>
  )
}
