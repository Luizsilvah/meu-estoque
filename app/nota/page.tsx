'use client'
import { useRef, useState, useEffect, ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { buscarEstoque, invalidarEstoqueCache } from '@/app/lib/estoqueCache'
import { controlaValidade } from '@/app/lib/validades'
import { D } from '@/app/lib/theme'
import Page from '@/app/components/ui/Page'
import PageHeader from '@/app/components/ui/PageHeader'
import Card from '@/app/components/ui/Card'
import Icon from '@/app/components/ui/Icon'

type ProdutoEstoque = {
  produto_id: string
  produtos: { nome: string; unidade: string; controla_validade?: boolean } | null
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

  // Produto do sistema que não controla validade: entra sem lote (produto novo
  // criado pela nota sempre controla — padrão da coluna).
  function semValidade(it: ItemEditavel): boolean {
    return it.decisao === 'existente' && !!it.produto_id_sel &&
      !controlaValidade(estoque.find((e) => e.produto_id === it.produto_id_sel)?.produtos)
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

    if (semValidade(it)) return { ok: true }
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
        lotes: semValidade(i) ? [] : [...porData.entries()].map(([data_validade, quantidade]) => ({ data_validade, quantidade })),
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

  // ── Estilos da tela (tokens do tema: claro e escuro) ─────────────────────────
  const campo: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: D.input, border: `1px solid ${D.border}`, borderRadius: 12,
    padding: '10px 12px', fontSize: 15, color: D.text, outline: 'none', fontFamily: 'inherit', minWidth: 0,
  }
  const rotulo: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: D.text2, margin: '0 0 6px 2px' }
  const botao = (cor: string): React.CSSProperties => ({
    width: '100%', height: 50, borderRadius: 14, border: 'none', background: cor, color: '#fff', fontSize: 15, fontWeight: 800,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit',
  })
  const botaoSecundario: React.CSSProperties = {
    ...botao('transparent'), background: D.card, border: `1px solid ${D.border}`, color: D.text,
  }
  const linkPequeno: React.CSSProperties = { background: 'none', border: 'none', padding: '4px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }
  const botaoQtd: React.CSSProperties = {
    width: 44, height: 44, borderRadius: 12, border: `1px solid ${D.border}`, background: D.input, color: D.text,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
  }

  // Tela de espera (analisando / lançando)
  const espera = (icone: string, titulo: string) => (
    <Page>
      <PageHeader titulo="Nota fiscal" subtitulo="Lançar entrada pela foto da nota" />
      <Card style={{ padding: '40px 20px', textAlign: 'center' }}>
        <span className="animate-pulse" style={{ display: 'inline-flex', color: 'var(--accent-text)' }}><Icon nome={icone} size={44} /></span>
        <p style={{ color: D.text, fontWeight: 800, fontSize: 16, margin: '14px 0 0' }}>{titulo}</p>
        <p style={{ color: D.text2, fontSize: 13, margin: '4px 0 0' }}>Isso pode levar alguns segundos</p>
      </Card>
    </Page>
  )

  // ── Upload ──────────────────────────────────────────────────────────────────
  if (etapa === 'upload') {
    return (
      <Page>
        <PageHeader titulo="Nota fiscal" subtitulo="Lançar entrada pela foto da nota" />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button type="button" onClick={() => inputRef.current?.click()}
            style={{ width: '100%', minHeight: 200, borderRadius: 18, border: `2px dashed ${D.border}`, background: D.card, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, fontFamily: 'inherit' }}>
            {imagemPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imagemPreview} alt="Nota" style={{ maxHeight: 260, maxWidth: '100%', borderRadius: 12, objectFit: 'contain' }} />
            ) : (
              <>
                <span style={{ width: 64, height: 64, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-bg)', color: 'var(--accent-text)' }}>
                  <Icon nome="file" size={30} />
                </span>
                <span style={{ color: D.text, fontSize: 15, fontWeight: 700 }}>Foto da nota fiscal</span>
                <span style={{ color: D.text2, fontSize: 13, textAlign: 'center' }}>Toque para escolher uma imagem da galeria</span>
              </>
            )}
          </button>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button onClick={() => cameraRef.current?.click()} style={botao('#6366F1')}>
              <Icon nome="camera" size={20} /> Câmera
            </button>
            <button onClick={() => inputRef.current?.click()} style={botaoSecundario}>
              <Icon nome="file" size={20} /> Galeria
            </button>
          </div>

          <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onFileChange} />
          <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFileChange} />

          {erroMsg && <p style={{ color: '#EF4444', fontSize: 14, fontWeight: 600, textAlign: 'center', margin: 0 }}>{erroMsg}</p>}

          {imagemPreview && (
            <button onClick={analisarNota} style={botao('#10B981')}>
              <Icon nome="search" size={20} /> Analisar nota
            </button>
          )}
        </div>
      </Page>
    )
  }

  // ── Analisando ──────────────────────────────────────────────────────────────
  if (etapa === 'analisando') return espera('search', 'Analisando nota fiscal...')

  // ── Lançando ────────────────────────────────────────────────────────────────
  if (etapa === 'lancando') return espera('box', 'Lançando entradas...')

  // ── Concluído ───────────────────────────────────────────────────────────────
  if (etapa === 'concluido') {
    const { lancados, falhas } = resultadoLanc
    const ok = falhas.length === 0
    return (
      <Page>
        <PageHeader titulo="Nota fiscal" subtitulo="Lançamento concluído" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card style={{ padding: '28px 20px', textAlign: 'center' }}>
            <span style={{ width: 64, height: 64, borderRadius: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: ok ? 'rgba(16,185,129,0.14)' : 'rgba(249,115,22,0.14)', color: ok ? '#10B981' : '#F97316' }}>
              <Icon nome={ok ? 'tick' : 'alert'} size={32} traco={2.6} />
            </span>
            <p style={{ color: D.text, fontWeight: 800, fontSize: 18, margin: '14px 0 0' }}>
              {lancados} entrada{lancados !== 1 ? 's' : ''} registrada{lancados !== 1 ? 's' : ''}!
            </p>
            {falhas.length > 0 && (
              <div style={{ textAlign: 'left', background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 12, padding: 12, marginTop: 14 }}>
                <p style={{ color: '#F97316', fontSize: 13, fontWeight: 700, margin: '0 0 4px' }}>
                  {falhas.length} item{falhas.length !== 1 ? 's' : ''} não lançado{falhas.length !== 1 ? 's' : ''}:
                </p>
                <ul style={{ color: D.text2, fontSize: 13, margin: 0, paddingLeft: 18 }}>
                  {falhas.map((f, i) => <li key={i}>{f.nome}: {f.erro}</li>)}
                </ul>
              </div>
            )}
          </Card>
          <button onClick={reiniciar} style={botao('#6366F1')}><Icon nome="camera" size={20} /> Lançar outra nota</button>
          <button onClick={() => router.push('/')} style={botaoSecundario}><Icon nome="home" size={20} /> Voltar ao início</button>
        </div>
      </Page>
    )
  }

  // ── Revisão ─────────────────────────────────────────────────────────────────
  const validacoes = itens.map(itemValido)
  const naoIgnorados = itens.filter((i) => i.decisao !== 'ignorar')
  const pendentes = itens.filter((i) => i.decisao === null).length
  const podeConfirmar = naoIgnorados.length > 0 && validacoes.every((v) => v.ok)
  const hoje = hojeISO()

  return (
    <Page>
      <PageHeader
        titulo="Revisar nota"
        subtitulo={`${itens.length} produto${itens.length !== 1 ? 's' : ''} encontrado${itens.length !== 1 ? 's' : ''}`}
        onVoltar={() => setEtapa('upload')}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {imagemPreview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imagemPreview} alt="Nota" style={{ width: '100%', maxHeight: 160, objectFit: 'contain', borderRadius: 14, background: D.card, border: `1px solid ${D.border}` }} />
        )}

        {/* Fornecedor — editável */}
        <Card style={{ padding: 14 }}>
          <label style={rotulo}>Fornecedor</label>
          <select value={fornecedorSel} onChange={(e) => setFornecedorSel(e.target.value)} style={campo}>
            <option value="">— Sem fornecedor —</option>
            {fornecedorDetectado !== '' && !detectadoNoBanco && (
              <option value="__detectado__">{`Detectado na nota: "${fornecedorDetectado}"`}</option>
            )}
            {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </Card>

        {itens.map((item, idx) => {
          const v = validacoes[idx]
          const ignorado = item.decisao === 'ignorar'
          const produtoSel = estoque.find((e) => e.produto_id === item.produto_id_sel)
          const unidade = produtoSel?.produtos?.unidade ?? item.novoProduto?.unidade ?? item.unidade_detectada ?? ''
          const somaLotes = item.lotes.reduce((s, l) => s + (Number(l.qtd) || 0), 0)
          const diff = item.quantidade - somaLotes
          const temProduto = item.decisao === 'existente' || item.decisao === 'criar'

          return (
            <Card key={idx} style={{ padding: 14, opacity: ignorado ? 0.55 : 1, ...(!ignorado && !v.ok ? { borderColor: 'rgba(249,115,22,0.55)' } : {}) }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: ignorado ? 4 : 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: D.text, fontSize: 15, fontWeight: 800, margin: 0, overflowWrap: 'anywhere' }}>{item.nome_nota}</p>
                  {temProduto && <p style={{ color: D.text2, fontSize: 12, margin: '2px 0 0' }}>{item.decisao === 'criar' ? 'Produto novo' : produtoSel?.produtos?.nome}</p>}
                </div>
                {temProduto && (
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                    <span style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, color: '#10B981', fontVariantNumeric: 'tabular-nums' }}>+{item.quantidade}</span>
                    {unidade && <span style={{ fontSize: 11, fontWeight: 700, color: D.text2, marginTop: 3 }}>{unidade}</span>}
                  </span>
                )}
                {ignorado ? (
                  <button onClick={() => atualizarItem(idx, { decisao: item.produto_id_sel ? 'existente' : null })} style={{ ...linkPequeno, color: 'var(--accent-text)' }}>
                    retomar
                  </button>
                ) : !temProduto && (
                  <button onClick={() => atualizarItem(idx, { decisao: 'ignorar' })} style={{ ...linkPequeno, color: D.text2 }}>
                    ignorar
                  </button>
                )}
              </div>

              {ignorado ? (
                <p style={{ color: D.text2, fontSize: 13, margin: 0 }}>Item ignorado — não será lançado.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Produto no sistema */}
                  <div>
                    <label style={rotulo}>Produto no sistema</label>
                    <select
                      value={item.decisao === 'existente' && item.produto_id_sel ? item.produto_id_sel : ''}
                      onChange={(e) => {
                        const val = e.target.value
                        if (val) atualizarItem(idx, { decisao: 'existente', produto_id_sel: val, novoProduto: null })
                        else atualizarItem(idx, { decisao: null, produto_id_sel: null })
                      }}
                      style={campo}
                    >
                      <option value="">— não está no sistema —</option>
                      {estoque.map((e) => (
                        <option key={e.produto_id} value={e.produto_id}>{e.produtos?.nome ?? e.produto_id}</option>
                      ))}
                    </select>
                  </div>

                  {/* Decisão quando não está no sistema */}
                  {item.decisao === null && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <button onClick={() => abrirCriarProduto(idx)} style={{ ...botao('#10B981'), height: 44, fontSize: 14 }}>
                        <Icon nome="plus" size={18} /> Criar produto
                      </button>
                      <button onClick={() => atualizarItem(idx, { decisao: 'ignorar' })} style={{ ...botaoSecundario, height: 44, fontSize: 14 }}>
                        Ignorar item
                      </button>
                    </div>
                  )}

                  {/* Mini-form de novo produto */}
                  {item.decisao === 'criar' && item.novoProduto && (
                    <div style={{ border: '1px solid rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.06)', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <p style={{ color: '#10B981', fontSize: 13, fontWeight: 800, margin: 0, minWidth: 0, overflowWrap: 'anywhere' }}>Novo produto: {item.nome_nota}</p>
                        <button onClick={() => atualizarItem(idx, { decisao: null, novoProduto: null })} style={{ ...linkPequeno, color: D.text2 }}>
                          cancelar
                        </button>
                      </div>

                      <div>
                        <label style={rotulo}>Fornecedor</label>
                        <select value={item.novoProduto.fornecedor_id} onChange={(e) => atualizarNovoProduto(idx, { fornecedor_id: e.target.value })} style={campo}>
                          <option value="">— selecione —</option>
                          {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                        </select>
                        {fornecedorDetectado !== '' && !detectadoNoBanco && (
                          <button onClick={() => criarFornecedorInline(idx)} disabled={criandoForn}
                            style={{ ...linkPequeno, color: 'var(--accent-text)', marginTop: 4, opacity: criandoForn ? 0.5 : 1 }}>
                            + criar fornecedor “{fornecedorDetectado}”
                          </button>
                        )}
                      </div>

                      <div>
                        <label style={rotulo}>Unidade</label>
                        <input value={item.novoProduto.unidade} onChange={(e) => atualizarNovoProduto(idx, { unidade: e.target.value })} placeholder="un, kg, cx, L" style={campo} />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div>
                          <label style={rotulo}>Qtd mínima</label>
                          <input type="number" min={0} value={item.novoProduto.qtd_base} onChange={(e) => atualizarNovoProduto(idx, { qtd_base: e.target.value })} style={campo} />
                        </div>
                        <div>
                          <label style={rotulo}>Qtd máxima</label>
                          <input type="number" min={0} value={item.novoProduto.qtd_max} onChange={(e) => atualizarNovoProduto(idx, { qtd_max: e.target.value })} style={campo} />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div>
                          <label style={rotulo}>Cód. barras</label>
                          <input value={item.novoProduto.codigo_barras} onChange={(e) => atualizarNovoProduto(idx, { codigo_barras: e.target.value })} style={campo} />
                        </div>
                        <div>
                          <label style={rotulo}>Preço custo</label>
                          <input type="number" min={0} step="0.01" value={item.novoProduto.preco_custo} onChange={(e) => atualizarNovoProduto(idx, { preco_custo: e.target.value })} style={campo} />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Quantidade + lotes — só quando o produto está definido */}
                  {temProduto && (
                    <>
                      <div>
                        <label style={rotulo}>Quantidade total</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button onClick={() => mudarQuantidade(idx, item.quantidade - 1)} aria-label="Diminuir" style={botaoQtd}>
                            <Icon nome="minus" size={18} traco={2.6} />
                          </button>
                          <input type="number" min={1} value={item.quantidade}
                            onChange={(e) => { const n = parseInt(e.target.value); if (n > 0) mudarQuantidade(idx, n) }}
                            style={{ ...campo, flex: 1, textAlign: 'center', fontSize: 18, fontWeight: 800, height: 44 }} />
                          <button onClick={() => mudarQuantidade(idx, item.quantidade + 1)} aria-label="Aumentar" style={botaoQtd}>
                            <Icon nome="plus" size={18} traco={2.6} />
                          </button>
                          {unidade && <span style={{ color: D.text2, fontSize: 12, fontWeight: 600, minWidth: 28, textAlign: 'center', flexShrink: 0 }}>{unidade}</span>}
                        </div>
                      </div>

                      {semValidade(item) ? (
                        <p style={{ color: D.text2, fontSize: 13, margin: 0 }}>Este produto não controla validade — entra sem data.</p>
                      ) : (
                        <div>
                          <label style={rotulo}>Validade{item.lotes.length > 1 ? ' (lotes)' : ''}</label>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {item.lotes.map((lote) => {
                              const dataPassado = lote.data !== '' && lote.data < hoje
                              return (
                                <div key={lote.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <input type="date" value={lote.data} min={hoje}
                                    onChange={(e) => atualizarLote(idx, lote.id, { data: e.target.value })}
                                    style={{ ...campo, flex: 1, ...(dataPassado ? { borderColor: '#EF4444', color: '#EF4444' } : {}) }} />
                                  <input type="number" min={1} value={lote.qtd}
                                    onChange={(e) => atualizarLote(idx, lote.id, { qtd: e.target.value })}
                                    disabled={item.lotes.length === 1}
                                    aria-label="Quantidade do lote"
                                    style={{ ...campo, width: 72, flex: 'none', textAlign: 'center', fontWeight: 700, opacity: item.lotes.length === 1 ? 0.6 : 1 }} />
                                  {item.lotes.length > 1 && (
                                    <button onClick={() => removerLote(idx, lote.id)} aria-label="Remover lote"
                                      style={{ ...botaoQtd, width: 40, color: '#EF4444' }}>
                                      <Icon nome="close" size={16} />
                                    </button>
                                  )}
                                </div>
                              )
                            })}
                          </div>

                          {item.lotes.some((l) => l.data !== '' && l.data < hoje) && (
                            <p style={{ color: '#EF4444', fontSize: 12, fontWeight: 600, margin: '6px 0 0' }}>Validade no passado — verifique o ano digitado.</p>
                          )}
                          {item.lotes.length > 1 && diff !== 0 && (
                            <p style={{ color: '#F97316', fontSize: 12, fontWeight: 600, margin: '6px 0 0' }}>
                              Lotes somam {somaLotes} de {item.quantidade} · {diff > 0 ? `faltam ${diff}` : `excede por ${-diff}`}
                            </p>
                          )}

                          <button onClick={() => adicionarLote(idx)}
                            style={{ width: '100%', marginTop: 8, padding: '10px', borderRadius: 12, border: '1px dashed #6366F1', background: 'var(--accent-bg)', color: 'var(--accent-text)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                            + adicionar lote
                          </button>
                        </div>
                      )}

                      <button onClick={() => atualizarItem(idx, { decisao: 'ignorar' })} style={{ ...linkPequeno, color: D.text2, alignSelf: 'flex-start' }}>
                        ignorar este item
                      </button>
                    </>
                  )}

                  {!v.ok && v.msg && (
                    <p style={{ color: '#F97316', fontSize: 12, fontWeight: 600, margin: 0, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                      <Icon nome="alert" size={16} /> {v.msg}
                    </p>
                  )}
                </div>
              )}
            </Card>
          )
        })}

        {erroMsg && <p style={{ color: '#EF4444', fontSize: 14, fontWeight: 600, textAlign: 'center', margin: 0 }}>{erroMsg}</p>}

        {/* Rodapé: gruda acima do BottomNav enquanto a lista rola (sticky — sem espaço extra) */}
        <div style={{ position: 'sticky', bottom: 'var(--bottomnav-topo, 0px)', zIndex: 30, margin: '0 -16px', padding: '12px 16px', background: D.bg, borderTop: `1px solid ${D.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pendentes > 0 && (
            <p style={{ color: '#F97316', fontSize: 12, fontWeight: 600, textAlign: 'center', margin: 0 }}>
              {pendentes} item{pendentes !== 1 ? 's' : ''} aguardando decisão (criar ou ignorar)
            </p>
          )}
          {pendentes === 0 && !podeConfirmar && naoIgnorados.length > 0 && (
            <p style={{ color: '#F97316', fontSize: 12, fontWeight: 600, textAlign: 'center', margin: 0 }}>Revise os itens destacados antes de confirmar</p>
          )}
          {naoIgnorados.length === 0 && (
            <p style={{ color: D.text2, fontSize: 12, textAlign: 'center', margin: 0 }}>Nenhum item para lançar</p>
          )}
          <button onClick={lancarTudo} disabled={!podeConfirmar} style={{ ...botao('#10B981'), opacity: podeConfirmar ? 1 : 0.45, cursor: podeConfirmar ? 'pointer' : 'not-allowed' }}>
            <Icon nome="tick" size={20} traco={2.6} /> Confirmar tudo{naoIgnorados.length > 0 ? ` (${naoIgnorados.length})` : ''}
          </button>
        </div>
      </div>
    </Page>
  )
}
