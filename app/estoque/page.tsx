'use client'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import BarcodeCameraButton from '../components/BarcodeCameraButton'

import { D } from '@/app/lib/theme'
import FotoThumb from '@/app/components/FotoThumb'
import type { ItemPrevisaoCompra } from '@/app/api/previsao-compras/route'
import { comprimirImagem } from '@/app/lib/comprimirImagem'
import { buscarEstoque, invalidarEstoqueCache } from '@/app/lib/estoqueCache'

type ItemEstoque = {
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
    fornecedor_id: string | null
    foto_url: string | null
    codigo_barras: string | null
    preco_custo: number | null
    fornecedores: { nome: string } | null
  } | null
}

type Fornecedor = { id: string; nome: string }

import { Validade, diasAteVencer, badgeValidade } from '@/app/lib/validades'

type AbaModal = 'produto' | 'validades'

const inputStyle: React.CSSProperties = {
  width: '100%', background: D.input, border: `1px solid ${D.border}`, borderRadius: 12,
  padding: '10px 14px', fontSize: 14, color: D.text, outline: 'none', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: D.text2, marginBottom: 4, marginLeft: 2 }

export default function Estoque() {
  return <Suspense><EstoqueContent /></Suspense>
}

function EstoqueContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  // filtro vindo da URL: 'pedir' | 'ok' | 'vencendo' | null
  const filtroUrl = searchParams.get('filtro') as 'pedir' | 'ok' | 'vencendo' | null
  const [dados, setDados] = useState<ItemEstoque[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [filtroFornecedor, setFiltroFornecedor] = useState('Todos')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(true)

  const [validadesPorProduto, setValidadesPorProduto] = useState<Record<string, Validade[]>>({})
  const [busca, setBusca] = useState('')

  const [editando, setEditando] = useState<ItemEstoque | null>(null)
  const [abaModal, setAbaModal] = useState<AbaModal>('produto')
  const [form, setForm] = useState({ nome: '', fornecedor_id: '', unidade: '', qtd_base: '', qtd_max: '', codigo_barras: '', preco_custo: '', qtd_atual: '' })
  const [salvando, setSalvando] = useState(false)
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null)
  const [uploadandoFoto, setUploadandoFoto] = useState(false)
  const fotoInputRef = useRef<HTMLInputElement>(null)
  const [confirmarApagar, setConfirmarApagar] = useState(false)
  const [senhaApagar, setSenhaApagar] = useState('')
  const [apagando, setApagando] = useState(false)
  const qtdBaseRef = useRef<HTMLInputElement>(null)
  const scannerFisicoBuffer = useRef('')
  const scannerFisicoInicio = useRef(0)
  const SCANNER_FISICO_TIMEOUT_MS = 300

  const [validades, setValidades] = useState<Validade[]>([])
  const [loadingVal, setLoadingVal] = useState(false)
  const [novaData, setNovaData] = useState('')
  const [novaQtd, setNovaQtd] = useState('1')
  const [salvandoVal, setSalvandoVal] = useState(false)
  const [editandoValidade, setEditandoValidade] = useState<string | null>(null)
  const [qtdEditValidade, setQtdEditValidade] = useState('')
  const [erroValidade, setErroValidade] = useState<string | null>(null)

  const [modalTransferir, setModalTransferir] = useState<ItemEstoque | null>(null)
  const [qtdTransferir, setQtdTransferir] = useState('')
  const [transferindo, setTransferindo] = useState(false)
  const [feedbackTransferir, setFeedbackTransferir] = useState<{ msg: string; ok: boolean } | null>(null)

  const [qtdTransferirModal, setQtdTransferirModal] = useState('')
  const [direcaoTransferir, setDirecaoTransferir] = useState<'cozinha' | 'principal'>('cozinha')
  const [transferindoModal, setTransferindoModal] = useState(false)
  const [feedbackTransferirModal, setFeedbackTransferirModal] = useState<{ msg: string; ok: boolean } | null>(null)

  const [modalNovoProduto, setModalNovoProduto] = useState(false)
  const [formNovo, setFormNovo] = useState({ nome: '', fornecedor_id: '', unidade: '', codigo_barras: '', qtd_base: '0', qtd_max: '0', qtd_atual: '0' })
  const [salvandoNovo, setSalvandoNovo] = useState(false)
  const [feedbackNovo, setFeedbackNovo] = useState<{ msg: string; ok: boolean } | null>(null)
  const [mostrarNovoFornecedor, setMostrarNovoFornecedor] = useState(false)
  const [novoFornecedorNome, setNovoFornecedorNome] = useState('')
  const [salvandoFornecedor, setSalvandoFornecedor] = useState(false)

  // Status "comprar na quinta" por produto (ver vw_previsao_compras) — alimenta
  // o badge amarelo abaixo, complementando o "Pedir N" (crítico) que já existia
  const [statusCompra, setStatusCompra] = useState<Record<string, ItemPrevisaoCompra['status']>>({})

  // Carrega estoque, fornecedores e validades ao montar a página
  useEffect(() => {
    async function buscar() {
      try {
        const [jsonEstoque, resForn, resPrevisao] = await Promise.all([
          buscarEstoque(), fetch('/api/cadastro/fornecedor'), fetch('/api/previsao-compras'),
        ])
        const jsonForn = await resForn.json()
        setDados(jsonEstoque as unknown as ItemEstoque[])
        if (Array.isArray(jsonForn)) setFornecedores(jsonForn)

        const jsonPrevisao = await resPrevisao.json()
        if (Array.isArray(jsonPrevisao)) {
          const mapa: Record<string, ItemPrevisaoCompra['status']> = {}
          for (const p of jsonPrevisao as ItemPrevisaoCompra[]) mapa[p.produto_id] = p.status
          setStatusCompra(mapa)
        }

        const produtoIds: string[] = (jsonEstoque as ItemEstoque[]).map((i) => i.produtos?.id).filter(Boolean) as string[]
        const resValAll = await fetch('/api/validades/todos')
        if (resValAll.ok) {
          const all: Validade[] = await resValAll.json()
          const mapa: Record<string, Validade[]> = {}
          for (const v of all) {
            if (!mapa[v.produto_id]) mapa[v.produto_id] = []
            mapa[v.produto_id].push(v)
          }
          setValidadesPorProduto(mapa)
        } else {
          const mapFallback: Record<string, Validade[]> = {}
          await Promise.all(produtoIds.map(async (pid) => {
            const r = await fetch(`/api/validades?produto_id=${pid}`)
            if (r.ok) mapFallback[pid] = await r.json()
          }))
          setValidadesPorProduto(mapFallback)
        }
      } catch (err) {
        setErro(err instanceof Error ? err.message : 'Erro desconhecido')
      } finally {
        setLoading(false)
      }
    }
    buscar()
  }, [])

  // Lista de fornecedores únicos presentes no estoque, usada nos filtros de chip
  const fornecedoresFiltro = useMemo(() => {
    const nomes = dados.map((item) => item.produtos?.fornecedores?.nome).filter((n): n is string => !!n)
    return ['Todos', ...Array.from(new Set(nomes)).sort()]
  }, [dados])

  // Aplica filtro de fornecedor + busca textual + filtro de URL e ordena alfabeticamente
  const dadosFiltrados = useMemo(() => {
    let filtrados = filtroFornecedor === 'Todos' ? dados : dados.filter((item) => item.produtos?.fornecedores?.nome === filtroFornecedor)
    if (busca) filtrados = filtrados.filter((item) => item.produtos?.nome.toLowerCase().includes(busca.toLowerCase()))
    if (filtroUrl === 'pedir') {
      filtrados = filtrados.filter((item) => item.qtd_atual <= item.qtd_base)
    } else if (filtroUrl === 'ok') {
      filtrados = filtrados.filter((item) => item.qtd_atual > item.qtd_base)
    } else if (filtroUrl === 'vencendo') {
      const em7d = new Date(); em7d.setDate(em7d.getDate() + 7)
      const em7dStr = em7d.toISOString().slice(0, 10)
      filtrados = filtrados.filter((item) => {
        const vals = validadesPorProduto[item.produtos?.id ?? ''] ?? []
        return vals.some((v) => v.data_validade <= em7dStr)
      })
    }
    return [...filtrados].sort((a, b) => (a.produtos?.nome ?? '').localeCompare(b.produtos?.nome ?? '', 'pt-BR'))
  }, [dados, filtroFornecedor, busca, filtroUrl, validadesPorProduto])

  // Abre o modal de edição preenchendo o formulário com os dados do item e carregando suas validades
  async function abrirModal(item: ItemEstoque) {
    setEditando(item)
    setAbaModal('produto')
    setForm({
      nome: item.produtos?.nome ?? '', fornecedor_id: item.produtos?.fornecedor_id ?? '',
      unidade: item.produtos?.unidade ?? '', qtd_base: String(item.qtd_base), qtd_max: String(item.qtd_max),
      codigo_barras: item.produtos?.codigo_barras ?? '',
      preco_custo: item.produtos?.preco_custo != null ? String(item.produtos.preco_custo) : '',
      qtd_atual: String(item.qtd_atual),
    })
    setFeedback(null); setConfirmarApagar(false); setSenhaApagar('')
    setQtdTransferirModal(''); setFeedbackTransferirModal(null)
    if (item.produtos?.id) {
      setLoadingVal(true); setValidades([]); setNovaData(''); setNovaQtd('1'); setEditandoValidade(null)
      try {
        const res = await fetch(`/api/validades?produto_id=${item.produtos.id}`)
        if (res.ok) {
          const json: Validade[] = await res.json()
          setValidades(json)
          setValidadesPorProduto((prev) => ({ ...prev, [item.produtos!.id]: json }))
        }
      } finally { setLoadingVal(false) }
    }
  }

  // Fecha o modal e limpa todos os estados de edição
  function fecharModal() {
    setEditando(null); setFeedback(null); setConfirmarApagar(false); setSenhaApagar(''); setAbaModal('produto')
    setQtdTransferirModal(''); setDirecaoTransferir('cozinha'); setFeedbackTransferirModal(null); setEditandoValidade(null)
  }

  // Remove produto do estoque e da tabela de produtos (requer senha '2010')
  async function apagarProduto() {
    if (!editando) return
    setApagando(true)
    try {
      const res = await fetch(`/api/produto?produto_id=${editando.produtos?.id}&estoque_id=${editando.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) { setFeedback({ msg: json.erro ?? 'Erro ao apagar', ok: false }); return }
      invalidarEstoqueCache()
      setDados((prev) => prev.filter((i) => i.id !== editando.id))
      fecharModal()
    } catch {
      setFeedback({ msg: 'Erro de conexão', ok: false })
    } finally { setApagando(false) }
  }

  // Faz upload da foto para o Supabase Storage e atualiza o estado local
  async function handleFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !editando?.produtos?.id) return
    setUploadandoFoto(true)
    setFeedback(null)
    try {
      const comprimido = await comprimirImagem(file)
      const fd = new FormData()
      fd.append('foto', comprimido)
      fd.append('produto_id', editando.produtos.id)
      const res = await fetch('/api/produto/foto', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok || json.erro) { setFeedback({ msg: json.erro ?? 'Erro ao enviar foto', ok: false }); return }
      const novaUrl: string = json.foto_url
      setEditando((prev) => prev?.produtos ? { ...prev, produtos: { ...prev.produtos, foto_url: novaUrl } } : prev)
      setDados((prev) => prev.map((item) =>
        item.id === editando.id && item.produtos ? { ...item, produtos: { ...item.produtos, foto_url: novaUrl } } : item
      ))
      setFeedback({ msg: 'Foto atualizada!', ok: true })
    } catch {
      setFeedback({ msg: 'Erro de conexão ao enviar foto', ok: false })
    } finally {
      setUploadandoFoto(false)
      if (fotoInputRef.current) fotoInputRef.current.value = ''
    }
  }

  // Salva as alterações do produto (nome, fornecedor, unidade, preço, quantidades)
  async function salvar() {
    if (!editando) return
    setSalvando(true); setFeedback(null)
    try {
      const res = await fetch('/api/produto', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estoque_id: editando.id, produto_id: editando.produtos?.id,
          nome: form.nome, fornecedor_id: form.fornecedor_id, unidade: form.unidade,
          qtd_base: Number(form.qtd_base), qtd_max: Number(form.qtd_max),
          codigo_barras: form.codigo_barras.trim() || null,
          preco_custo: form.preco_custo !== '' ? Number(form.preco_custo) : null,
          qtd_atual: Number(form.qtd_atual),
        }),
      })
      const json = await res.json()
      if (!res.ok || json.erro) { setFeedback({ msg: json.erro ?? 'Erro ao salvar', ok: false }); return }
      invalidarEstoqueCache()
      const fornNome = fornecedores.find((f) => f.id === form.fornecedor_id)?.nome ?? null
      const novaQtdAtual = Number(form.qtd_atual)
      const novaQtdBase = Number(form.qtd_base)
      const novaQtdMax = Number(form.qtd_max)
      const novoProduto = {
        nome: form.nome,
        fornecedor_id: form.fornecedor_id,
        unidade: form.unidade,
        codigo_barras: form.codigo_barras.trim() || null,
        preco_custo: form.preco_custo !== '' ? Number(form.preco_custo) : null,
        fornecedores: fornNome ? { nome: fornNome } : null,
      }
      setDados((prev) => prev.map((item) =>
        item.id === editando.id ? {
          ...item,
          qtd_base: novaQtdBase,
          qtd_max: novaQtdMax,
          qtd_atual: novaQtdAtual,
          produtos: item.produtos ? { ...item.produtos, ...novoProduto } : null,
        } : item
      ))
      setEditando((prev) => prev ? {
        ...prev,
        qtd_base: novaQtdBase,
        qtd_max: novaQtdMax,
        qtd_atual: novaQtdAtual,
        produtos: prev.produtos ? { ...prev.produtos, ...novoProduto } : null,
      } : null)
      setFeedback({ msg: 'Salvo!', ok: true })
      setTimeout(fecharModal, 800)
    } catch {
      setFeedback({ msg: 'Erro de conexão', ok: false })
    } finally { setSalvando(false) }
  }

  // Adiciona nova validade; se já existir a mesma data, soma a quantidade (merge)
  async function adicionarValidade() {
    if (!editando?.produtos?.id || !novaData) return
    setErroValidade(null)
    const qtdNova = Number(novaQtd) || 1
    const estoqueAtual = editando.qtd_atual
    const existente = validades.find((v) => v.data_validade === novaData)
    const totalSemExistente = validades.reduce((s, v) => s + (v.id === existente?.id ? 0 : v.quantidade), 0)
    const novoTotal = existente ? totalSemExistente + existente.quantidade + qtdNova : totalSemExistente + qtdNova
    if (novoTotal > estoqueAtual) {
      setErroValidade(`Total de validades (${novoTotal}) não pode ultrapassar o estoque atual (${estoqueAtual})`)
      return
    }
    setSalvandoVal(true)
    try {
      if (existente) {
        const novaQtdMerge = existente.quantidade + qtdNova
        const res = await fetch('/api/validades', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: existente.id, quantidade: novaQtdMerge }),
        })
        const json = await res.json()
        if (!res.ok || json.erro) return
        const atualizada: Validade = json
        setValidades((prev) => prev.map((v) => v.id === existente.id ? atualizada : v))
        setValidadesPorProduto((prev) => ({
          ...prev,
          [editando.produtos!.id]: (prev[editando.produtos!.id] ?? []).map((v) => v.id === existente.id ? atualizada : v),
        }))
      } else {
        const res = await fetch('/api/validades', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ produto_id: editando.produtos.id, data_validade: novaData, quantidade: qtdNova }),
        })
        const json = await res.json()
        if (!res.ok || json.erro) return
        const nova: Validade = json
        setValidades((prev) => [...prev, nova].sort((a, b) => a.data_validade.localeCompare(b.data_validade)))
        setValidadesPorProduto((prev) => ({
          ...prev,
          [editando.produtos!.id]: [...(prev[editando.produtos!.id] ?? []), nova].sort((a, b) => a.data_validade.localeCompare(b.data_validade)),
        }))
      }
      setNovaData(''); setNovaQtd('1')
    } finally { setSalvandoVal(false) }
  }

  // Confirma a edição inline da quantidade de um lote de validade
  async function salvarQtdValidade(id: string) {
    const qtd = Number(qtdEditValidade)
    if (!qtd || qtd <= 0) { setEditandoValidade(null); return }
    const totalSemEste = validades.reduce((s, v) => s + (v.id === id ? 0 : v.quantidade), 0)
    if (totalSemEste + qtd > (editando?.qtd_atual ?? 0)) {
      setErroValidade(`Total de validades (${totalSemEste + qtd}) não pode ultrapassar o estoque atual (${editando?.qtd_atual})`)
      setEditandoValidade(null)
      return
    }
    setErroValidade(null)
    const res = await fetch('/api/validades', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, quantidade: qtd }),
    })
    const json = await res.json()
    if (!res.ok || json.erro) { setEditandoValidade(null); return }
    const atualizada: Validade = json
    setValidades((prev) => prev.map((v) => v.id === id ? atualizada : v))
    if (editando?.produtos?.id) {
      setValidadesPorProduto((prev) => ({
        ...prev,
        [editando.produtos!.id]: (prev[editando.produtos!.id] ?? []).map((v) => v.id === id ? atualizada : v),
      }))
    }
    setEditandoValidade(null)
  }

  // Abre o modal do produto cujo código de barras foi escaneado
  async function abrirPorCodigo(codigo: string) {
    const item = dados.find((i) => i.produtos?.codigo_barras === codigo)
    if (item) { abrirModal(item); return }
    try {
      const res = await fetch(`/api/produto/barcode?codigo=${encodeURIComponent(codigo)}`)
      const json = await res.json()
      if (!res.ok || json.erro) return
      const found = dados.find((i) => i.produto_id === json.produto_id)
      if (found) abrirModal(found)
    } catch { /* ignorar */ }
  }

  // Detecta leitura do scanner físico (sequência de teclas rápida terminando em Enter) e aciona busca por código
  function handleBuscaKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      const elapsed = Date.now() - scannerFisicoInicio.current
      const codigo = scannerFisicoBuffer.current
      scannerFisicoBuffer.current = ''; scannerFisicoInicio.current = 0
      if (codigo.length >= 3 && elapsed < SCANNER_FISICO_TIMEOUT_MS) { e.preventDefault(); setBusca(''); abrirPorCodigo(codigo) }
      return
    }
    if (e.key.length === 1) {
      if (scannerFisicoBuffer.current === '') scannerFisicoInicio.current = Date.now()
      scannerFisicoBuffer.current += e.key
    } else if (e.key === 'Backspace') {
      scannerFisicoBuffer.current = scannerFisicoBuffer.current.slice(0, -1)
    }
  }

  // Executa transferência para a cozinha a partir do modal standalone (botão no card da lista)
  async function confirmarTransferir() {
    if (!modalTransferir || !qtdTransferir || Number(qtdTransferir) <= 0) return
    setTransferindo(true); setFeedbackTransferir(null)
    try {
      const res = await fetch('/api/estoque/transferir', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produto_id: modalTransferir.produto_id, quantidade: Number(qtdTransferir) }),
      })
      const json = await res.json()
      if (!res.ok || json.erro) { setFeedbackTransferir({ msg: json.erro ?? 'Erro', ok: false }); return }
      invalidarEstoqueCache()
      setDados((prev) => prev.map((item) =>
        item.id === modalTransferir.id ? { ...item, qtd_cozinha: json.qtd_cozinha } : item
      ))
      setFeedbackTransferir({ msg: 'Transferido!', ok: true })
      setTimeout(() => { setModalTransferir(null); setFeedbackTransferir(null) }, 800)
    } catch {
      setFeedbackTransferir({ msg: 'Erro de conexão', ok: false })
    } finally { setTransferindo(false) }
  }

  // Executa transferência bidirecional (cozinha ↔ principal) dentro do modal de edição
  async function transferirDentroModal() {
    if (!editando || !qtdTransferirModal || Number(qtdTransferirModal) <= 0) return
    setTransferindoModal(true); setFeedbackTransferirModal(null)
    try {
      const res = await fetch('/api/estoque/transferir', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produto_id: editando.produto_id, quantidade: Number(qtdTransferirModal), direction: direcaoTransferir }),
      })
      const json = await res.json()
      if (!res.ok || json.erro) { setFeedbackTransferirModal({ msg: json.erro ?? 'Erro', ok: false }); return }
      invalidarEstoqueCache()
      setDados((prev) => prev.map((item) =>
        item.id === editando.id ? { ...item, qtd_cozinha: json.qtd_cozinha } : item
      ))
      setEditando((prev) => prev ? { ...prev, qtd_cozinha: json.qtd_cozinha } : null)
      setFeedbackTransferirModal({ msg: 'Transferido!', ok: true })
      setQtdTransferirModal('')
      setTimeout(() => setFeedbackTransferirModal(null), 1500)
    } catch {
      setFeedbackTransferirModal({ msg: 'Erro de conexão', ok: false })
    } finally { setTransferindoModal(false) }
  }

  // Remove um lote de validade pelo id
  async function apagarValidade(id: string) {
    const res = await fetch(`/api/validades?id=${id}`, { method: 'DELETE' })
    if (!res.ok) return
    setValidades((prev) => prev.filter((v) => v.id !== id))
    if (editando?.produtos?.id) {
      setValidadesPorProduto((prev) => ({
        ...prev,
        [editando.produtos!.id]: (prev[editando.produtos!.id] ?? []).filter((v) => v.id !== id),
      }))
    }
  }

  // Cria um novo fornecedor inline e o seleciona automaticamente no formulário
  async function salvarNovoFornecedor() {
    if (!novoFornecedorNome.trim()) return
    setSalvandoFornecedor(true)
    try {
      const res = await fetch('/api/cadastro/fornecedor', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: novoFornecedorNome.trim() }),
      })
      const json = await res.json()
      if (!res.ok || json.erro) return
      setFornecedores((prev) => [...prev, json].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')))
      setFormNovo((f) => ({ ...f, fornecedor_id: json.id }))
      setNovoFornecedorNome('')
      setMostrarNovoFornecedor(false)
    } finally { setSalvandoFornecedor(false) }
  }

  // Cadastra novo produto no banco e recarrega a lista do estoque
  async function criarNovoProduto() {
    if (!formNovo.nome.trim() || !formNovo.fornecedor_id || !formNovo.unidade.trim()) return
    setSalvandoNovo(true); setFeedbackNovo(null)
    try {
      const res = await fetch('/api/cadastro/produto', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: formNovo.nome.trim(), fornecedor_id: formNovo.fornecedor_id,
          unidade: formNovo.unidade.trim(), codigo_barras: formNovo.codigo_barras.trim() || null,
          qtd_base: Number(formNovo.qtd_base) || 0, qtd_max: Number(formNovo.qtd_max) || 0,
          qtd_atual: Number(formNovo.qtd_atual) || 0,
        }),
      })
      const json = await res.json()
      if (!res.ok || json.erro) { setFeedbackNovo({ msg: json.erro ?? 'Erro ao cadastrar', ok: false }); return }
      invalidarEstoqueCache()
      // forcar=true: o produto acabou de ser criado, precisa da linha nova agora,
      // não do cache de até 30s (que ainda nem sabe que ela existe)
      const jsonEstoque = await buscarEstoque(true)
      setDados(jsonEstoque as unknown as ItemEstoque[])
      setFeedbackNovo({ msg: 'Produto cadastrado!', ok: true })
      setTimeout(() => { setModalNovoProduto(false); setFeedbackNovo(null) }, 800)
    } catch {
      setFeedbackNovo({ msg: 'Erro de conexão', ok: false })
    } finally { setSalvandoNovo(false) }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: D.bg }}>
      <p style={{ color: D.text2, fontSize: 14 }}>Carregando...</p>
    </div>
  )

  if (erro) return (
    <div style={{ minHeight: '100vh', padding: 24, background: D.bg }}>
      <p style={{ color: '#EF4444', fontWeight: 700 }}>Erro ao carregar estoque</p>
      <pre style={{ color: '#EF4444', fontSize: 12, marginTop: 8, background: 'rgba(239,68,68,0.1)', borderRadius: 12, padding: 16, whiteSpace: 'pre-wrap', border: '1px solid rgba(239,68,68,0.2)' }}>{erro}</pre>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: D.bg }}>

      <div style={{ background: 'var(--page-header)', borderBottom: `1px solid ${D.border}`, padding: '48px 20px 20px' }}>
        <Link href="/" style={{ color: D.text2, fontSize: 13, textDecoration: 'none', display: 'block', marginBottom: 12 }}>← Voltar</Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ color: D.text, fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>Estoque</h1>
            <p style={{ color: D.muted, fontSize: 13, marginTop: 4 }}>{dadosFiltrados.length} itens</p>
          </div>
          <button
            onClick={() => { setModalNovoProduto(true); setFormNovo({ nome: '', fornecedor_id: '', unidade: '', codigo_barras: '', qtd_base: '0', qtd_max: '0', qtd_atual: '0' }); setFeedbackNovo(null) }}
            style={{ background: '#6366F1', border: 'none', borderRadius: 14, width: 42, height: 42, fontSize: 24, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>
            +
          </button>
        </div>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Chip de filtro ativo vindo do dashboard */}
        {filtroUrl && (() => {
          const labels: Record<string, string> = { pedir: '🔴 Precisa pedir', ok: '✅ Estoque OK', vencendo: '🟠 Vencendo em 7d' }
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 20, background: 'rgba(99,102,241,0.12)', color: 'var(--accent-text)', border: '1px solid rgba(99,102,241,0.25)' }}>
                {labels[filtroUrl] ?? filtroUrl}
              </span>
              <button onClick={() => router.push('/estoque')}
                style={{ background: 'none', border: 'none', color: D.muted, fontSize: 13, cursor: 'pointer', padding: '4px 6px', borderRadius: 8 }}>
                ✕ Limpar
              </button>
            </div>
          )
        })()}

        {/* Busca + scanner */}
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--muted)' }}>🔍</span>
          <input type="text" placeholder="Buscar produto ou bipe o código..."
            value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={handleBuscaKeyDown}
            style={{ width: '100%', background: D.card, border: `1px solid ${D.border}`, borderRadius: 14, padding: '12px 48px 12px 36px', fontSize: 14, color: D.text, outline: 'none', boxSizing: 'border-box' }}
          />
          <BarcodeCameraButton instanceId="estoque-busca-scanner"
            onScanned={(codigo) => { setBusca(''); abrirPorCodigo(codigo) }} />
        </div>

        {/* Filtros por fornecedor */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {fornecedoresFiltro.map((f) => (
            <button key={f} onClick={() => setFiltroFornecedor(f)}
              style={{ padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, border: `1px solid ${filtroFornecedor === f ? '#6366F1' : D.border}`, cursor: 'pointer',
                background: filtroFornecedor === f ? 'rgba(99,102,241,0.2)' : D.card,
                color: filtroFornecedor === f ? 'var(--accent-text)' : D.text2 }}>
              {f}
            </button>
          ))}
        </div>

        {/* Cards */}
        {dadosFiltrados.length === 0 ? (
          <p style={{ color: D.text2, fontSize: 14, textAlign: 'center', paddingTop: 40 }}>Nenhum produto encontrado.</p>
        ) : dadosFiltrados.map((item) => {
          const precisaPedir = item.qtd_atual <= item.qtd_base
          const qtdPedir = precisaPedir ? item.qtd_max - item.qtd_atual : 0
          const prodId = item.produtos?.id ?? ''
          const vals = validadesPorProduto[prodId] ?? []
          const badge = badgeValidade(vals)
          const qtdPrincipal = item.qtd_atual - (item.qtd_cozinha ?? 0)
          // Crítico já é coberto pelo badge "Pedir N" acima (mesma condição qtd_atual
          // <= qtd_base). O amarelo avisa quem ainda não está no mínimo, mas vai ficar
          // abaixo dele antes da próxima quinta — ver vw_previsao_compras.
          const comprarNaQuinta = !precisaPedir && statusCompra[prodId] === 'COMPRAR_QUINTA'

          return (
            <div key={item.id} style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 16, overflow: 'hidden' }}>
              <button onClick={() => abrirModal(item)}
                style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', padding: '12px 14px', width: '100%', textAlign: 'left', cursor: 'pointer' }}>
                <FotoThumb src={item.produtos?.foto_url ?? null} radius={12} style={{ marginRight: 12 }} />

                <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
                  <p style={{ color: D.text, fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.produtos?.nome ?? '—'}
                  </p>
                  <p style={{ color: D.text2, fontSize: 12, marginTop: 2 }}>
                    {item.produtos?.fornecedores?.nome ?? 'Fornecedor desconhecido'} · {item.produtos?.unidade}
                  </p>
                  <p style={{ color: D.muted, fontSize: 12, marginTop: 2 }}>Base {item.qtd_base} · Máx {item.qtd_max}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {precisaPedir && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(239,68,68,0.15)', color: '#EF4444' }}>
                        Pedir {qtdPedir}
                      </span>
                    )}
                    {comprarNaQuinta && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>
                        🟡 Comprar na quinta
                      </span>
                    )}
                    {badge && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: badge.bg, color: badge.cor }}>
                        {badge.texto}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: 32, fontWeight: 800, lineHeight: 1, color: precisaPedir ? '#EF4444' : '#10B981' }}>
                    {item.qtd_atual}
                  </p>
                  <p style={{ color: D.muted, fontSize: 12, marginTop: 2 }}>{item.produtos?.unidade}</p>
                </div>
              </button>

              {/* Breakdown Principal / Cozinha */}
              <div style={{ padding: '6px 14px 8px', borderTop: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ fontSize: 12, color: D.text2 }}>🏪 Principal: <strong style={{ color: D.text }}>{qtdPrincipal}</strong></span>
                <span style={{ fontSize: 12, color: D.text2 }}>🍳 Cozinha: <strong style={{ color: D.text }}>{item.qtd_cozinha ?? 0}</strong></span>
              </div>

              {/* Transfer button */}
              <button
                onClick={() => { setModalTransferir(item); setQtdTransferir(''); setFeedbackTransferir(null) }}
                style={{ width: '100%', border: 'none', borderTop: `1px solid ${D.border}`, background: 'transparent', padding: '8px 14px', fontSize: 12, color: 'var(--accent-text)', fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>
                🍳 Transferir para cozinha
              </button>
            </div>
          )
        })}
      </div>

      {/* Modal de transferência rápida acessado pelo botão no card da lista */}
      {modalTransferir && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50, background: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) { setModalTransferir(null); setFeedbackTransferir(null) } }}>
          <div style={{ width: '100%', maxWidth: 480, background: D.card, borderRadius: '24px 24px 0 0', padding: '24px 24px 40px', boxShadow: '0 -4px 40px rgba(0,0,0,0.5)' }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: D.border, margin: '0 auto 20px' }} />
            <p style={{ color: D.text2, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>Transferir para cozinha</p>
            <p style={{ color: D.text, fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{modalTransferir.produtos?.nome}</p>
            <p style={{ color: D.text2, fontSize: 12, marginBottom: 20 }}>
              Disponível no principal: <strong style={{ color: D.text }}>{modalTransferir.qtd_atual - (modalTransferir.qtd_cozinha ?? 0)} {modalTransferir.produtos?.unidade}</strong>
            </p>

            <label style={{ display: 'block', fontSize: 12, color: D.text2, fontWeight: 600, marginBottom: 8, marginLeft: 2 }}>Quantidade a transferir</label>
            <input
              type="number" min="1" placeholder="0" value={qtdTransferir}
              onChange={(e) => setQtdTransferir(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmarTransferir() }}
              autoFocus
              style={{ width: '100%', border: `2px solid #6366F1`, borderRadius: 16, padding: '12px', fontSize: 28, fontWeight: 800, textAlign: 'center', color: D.text, background: D.input, outline: 'none', marginBottom: 16, boxSizing: 'border-box' }}
            />

            {feedbackTransferir && (
              <p style={{ fontSize: 14, textAlign: 'center', fontWeight: 600, marginBottom: 12, color: feedbackTransferir.ok ? '#10B981' : '#EF4444' }}>
                {feedbackTransferir.msg}
              </p>
            )}

            <button onClick={confirmarTransferir} disabled={transferindo || !qtdTransferir || Number(qtdTransferir) <= 0}
              style={{ width: '100%', padding: '14px', borderRadius: 16, background: '#6366F1', color: '#fff', border: 'none', fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: (transferindo || !qtdTransferir || Number(qtdTransferir) <= 0) ? 0.4 : 1 }}>
              {transferindo ? 'Transferindo...' : 'Confirmar transferência'}
            </button>
          </div>
        </div>
      )}

      {/* Modal de edição: abas Produto (dados + transferência) e Validades */}
      {editando && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50, background: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) fecharModal() }}>
          <div style={{ width: '100%', maxWidth: 480, background: D.card, borderRadius: '24px 24px 0 0', padding: '24px 24px 40px', overflowY: 'auto', maxHeight: '92vh', boxShadow: '0 -4px 40px rgba(0,0,0,0.5)' }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: D.border, margin: '0 auto 20px' }} />

            {/* Abas */}
            <div style={{ display: 'flex', background: D.input, borderRadius: 14, padding: 4, marginBottom: 20 }}>
              {(['produto', 'validades'] as AbaModal[]).map((a) => (
                <button key={a} onClick={() => setAbaModal(a)}
                  style={{ flex: 1, padding: '9px', borderRadius: 10, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
                    background: abaModal === a ? '#6366F1' : 'transparent',
                    color: abaModal === a ? '#fff' : D.text2 }}>
                  {a === 'produto' ? '📦 Produto' : '📅 Validades'}
                </button>
              ))}
            </div>

            {/* ABA PRODUTO */}
            {abaModal === 'produto' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* Foto do produto */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  {editando.produtos?.foto_url ? (
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <Image
                        src={editando.produtos.foto_url}
                        alt="Foto"
                        width={72}
                        height={72}
                        loading="lazy"
                        style={{ borderRadius: 14, objectFit: 'cover', border: `1px solid ${D.border}`, display: 'block' }}
                      />
                      <button
                        type="button"
                        onClick={() => fotoInputRef.current?.click()}
                        disabled={uploadandoFoto}
                        style={{ position: 'absolute', bottom: -6, right: -6, width: 26, height: 26, borderRadius: 8, background: '#6366F1', border: 'none', color: '#fff', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        ✏️
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fotoInputRef.current?.click()}
                      disabled={uploadandoFoto}
                      style={{ width: 72, height: 72, borderRadius: 14, background: D.input, border: `2px dashed ${D.border}`, color: D.text2, fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, flexShrink: 0 }}
                    >
                      <span style={{ fontSize: 22 }}>📷</span>
                      <span>{uploadandoFoto ? '...' : 'Foto'}</span>
                    </button>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: D.text, fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{form.nome || editando.produtos?.nome}</p>
                    <p style={{ color: D.text2, fontSize: 12, marginTop: 2 }}>{uploadandoFoto ? 'Enviando foto...' : 'Toque para trocar a foto'}</p>
                  </div>
                  <input ref={fotoInputRef} type="file" accept="image/*" capture="environment" onChange={handleFotoChange} style={{ display: 'none' }} />
                </div>

                <div><label style={labelStyle}>Nome</label>
                  <input style={inputStyle} value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
                </div>

                <div><label style={labelStyle}>Fornecedor</label>
                  <select style={inputStyle} value={form.fornecedor_id}
                    onChange={(e) => setForm((f) => ({ ...f, fornecedor_id: e.target.value }))}>
                    <option value="" style={{ background: D.input }}>Selecione</option>
                    {fornecedores.map((f) => <option key={f.id} value={f.id} style={{ background: D.input }}>{f.nome}</option>)}
                  </select>
                </div>

                <div><label style={labelStyle}>Unidade</label>
                  <input style={inputStyle} value={form.unidade} onChange={(e) => setForm((f) => ({ ...f, unidade: e.target.value }))} />
                </div>

                <div><label style={labelStyle}>Código de barras</label>
                  <div style={{ position: 'relative' }}>
                    <input type="text" style={{ ...inputStyle, paddingRight: '2.5rem' }}
                      placeholder="Ex: 7891234567890"
                      value={form.codigo_barras}
                      onChange={(e) => setForm((f) => ({ ...f, codigo_barras: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); qtdBaseRef.current?.focus() } }}
                    />
                    <BarcodeCameraButton instanceId="estoque-barcode-scanner"
                      onScanned={(codigo) => { setForm((f) => ({ ...f, codigo_barras: codigo })); qtdBaseRef.current?.focus() }} />
                  </div>
                </div>

                <div><label style={labelStyle}>Preço de custo (R$)</label>
                  <input type="number" min="0" step="0.01" style={inputStyle} placeholder="0,00"
                    value={form.preco_custo} onChange={(e) => setForm((f) => ({ ...f, preco_custo: e.target.value }))} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div><label style={labelStyle}>Qtd atual</label>
                    <input type="number" min="0" style={inputStyle}
                      value={form.qtd_atual} onChange={(e) => setForm((f) => ({ ...f, qtd_atual: e.target.value }))} />
                  </div>
                  <div><label style={labelStyle}>Qtd mínima</label>
                    <input ref={qtdBaseRef} type="number" min="0" style={inputStyle}
                      value={form.qtd_base} onChange={(e) => setForm((f) => ({ ...f, qtd_base: e.target.value }))} />
                  </div>
                  <div><label style={labelStyle}>Qtd máxima</label>
                    <input type="number" min="0" style={inputStyle}
                      value={form.qtd_max} onChange={(e) => setForm((f) => ({ ...f, qtd_max: e.target.value }))} />
                  </div>
                </div>

                {/* Transferências inline */}
                <div style={{ background: D.input, borderRadius: 14, padding: '12px 14px' }}>
                  <p style={{ color: D.text2, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>Transferências</p>
                  <div style={{ display: 'flex', background: D.card, borderRadius: 10, padding: 3, gap: 3, marginBottom: 10 }}>
                    {([
                      { dir: 'cozinha' as const, label: '🏪 → 🍳 Para cozinha' },
                      { dir: 'principal' as const, label: '🍳 → 🏪 Para principal' },
                    ]).map(({ dir, label }) => (
                      <button key={dir} onClick={() => { setDirecaoTransferir(dir); setQtdTransferirModal(''); setFeedbackTransferirModal(null) }}
                        style={{ flex: 1, padding: '7px 4px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                          background: direcaoTransferir === dir ? '#6366F1' : 'transparent',
                          color: direcaoTransferir === dir ? '#fff' : D.text2 }}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <p style={{ color: D.muted, fontSize: 12, marginBottom: 10 }}>
                    🏪 Principal: <strong style={{ color: D.text }}>{editando.qtd_atual - (editando.qtd_cozinha ?? 0)}</strong>
                    {' · '}
                    🍳 Cozinha: <strong style={{ color: D.text }}>{editando.qtd_cozinha ?? 0}</strong>
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="number" min="1" placeholder="Qtd" value={qtdTransferirModal}
                      onChange={(e) => setQtdTransferirModal(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') transferirDentroModal() }}
                      style={{ ...inputStyle, flex: 1 }} />
                    <button onClick={transferirDentroModal}
                      disabled={transferindoModal || !qtdTransferirModal || Number(qtdTransferirModal) <= 0}
                      style={{ padding: '10px 16px', borderRadius: 12, background: '#6366F1', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', opacity: (transferindoModal || !qtdTransferirModal || Number(qtdTransferirModal) <= 0) ? 0.4 : 1 }}>
                      {transferindoModal ? '...' : 'Transferir'}
                    </button>
                  </div>
                  {feedbackTransferirModal && (
                    <p style={{ fontSize: 12, fontWeight: 600, marginTop: 8, color: feedbackTransferirModal.ok ? '#10B981' : '#EF4444' }}>
                      {feedbackTransferirModal.msg}
                    </p>
                  )}
                </div>

                {feedback && (
                  <p style={{ fontSize: 13, textAlign: 'center', fontWeight: 600, color: feedback.ok ? '#10B981' : '#EF4444' }}>
                    {feedback.msg}
                  </p>
                )}

                <button onClick={salvar} disabled={salvando || !form.nome || !form.fornecedor_id || !form.unidade}
                  style={{ background: '#6366F1', color: '#fff', border: 'none', borderRadius: 14, padding: '14px', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: (salvando || !form.nome || !form.fornecedor_id || !form.unidade) ? 0.5 : 1 }}>
                  {salvando ? 'Salvando...' : 'Salvar alterações'}
                </button>

                {!confirmarApagar ? (
                  <button type="button" onClick={() => { setConfirmarApagar(true); setSenhaApagar('') }}
                    style={{ background: 'none', border: 'none', color: '#EF4444', fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: '12px 0' }}>
                    Apagar produto
                  </button>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input type="password" placeholder="Digite a senha para confirmar"
                      value={senhaApagar} onChange={(e) => setSenhaApagar(e.target.value)}
                      style={{ ...inputStyle, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }}
                      autoFocus />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" onClick={() => { setConfirmarApagar(false); setSenhaApagar('') }}
                        style={{ flex: 1, padding: '12px', borderRadius: 14, fontSize: 13, fontWeight: 600, border: `1px solid ${D.border}`, background: 'none', color: D.text2, cursor: 'pointer' }}>
                        Cancelar
                      </button>
                      <button type="button" onClick={apagarProduto} disabled={apagando || senhaApagar !== '2010'}
                        style={{ flex: 1, padding: '12px', borderRadius: 14, fontSize: 13, fontWeight: 700, background: '#EF4444', color: '#fff', border: 'none', cursor: 'pointer', opacity: (apagando || senhaApagar !== '2010') ? 0.4 : 1 }}>
                        {apagando ? 'Apagando...' : 'Confirmar apagar'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ABA VALIDADES */}
            {abaModal === 'validades' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ background: D.input, borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={{ color: D.text2, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Nova validade</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div><label style={labelStyle}>Data</label>
                      <input type="date" style={inputStyle} value={novaData} onChange={(e) => setNovaData(e.target.value)} />
                    </div>
                    <div><label style={labelStyle}>Quantidade</label>
                      <input type="number" min="1" style={inputStyle} value={novaQtd} onChange={(e) => setNovaQtd(e.target.value)} />
                    </div>
                  </div>
                  <button onClick={adicionarValidade} disabled={salvandoVal || !novaData}
                    style={{ background: '#6366F1', color: '#fff', border: 'none', borderRadius: 12, padding: '12px', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: (salvandoVal || !novaData) ? 0.5 : 1 }}>
                    {salvandoVal ? 'Salvando...' : '+ Adicionar'}
                  </button>
                  {erroValidade && (
                    <p style={{ color: '#EF4444', fontSize: 13, marginTop: 6 }}>{erroValidade}</p>
                  )}
                </div>

                {!loadingVal && (() => {
                  const totalVal = validades.reduce((s, v) => s + v.quantidade, 0)
                  const estoque = editando?.qtd_atual ?? 0
                  const diff = estoque - totalVal
                  if (diff === 0 && validades.length === 0) return null
                  return (
                    <div style={{ background: diff > 0 ? 'rgba(234,179,8,0.1)' : diff < 0 ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.08)', border: `1px solid ${diff > 0 ? 'rgba(234,179,8,0.3)' : diff < 0 ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.2)'}`, borderRadius: 12, padding: '10px 14px' }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: diff > 0 ? '#CA8A04' : diff < 0 ? '#EF4444' : '#10B981' }}>
                        {diff > 0 ? `⚠️ ${diff} unidade${diff !== 1 ? 's' : ''} sem validade cadastrada` : diff < 0 ? `🔴 Excesso de ${Math.abs(diff)} nas validades` : '✓ Validades conferem com o estoque'}
                      </p>
                      <p style={{ fontSize: 11, color: D.text2, marginTop: 2 }}>Total validades: {totalVal} · Estoque: {estoque}</p>
                    </div>
                  )
                })()}

                {loadingVal ? (
                  <p style={{ color: D.text2, fontSize: 14, textAlign: 'center', padding: '16px 0' }}>Carregando...</p>
                ) : validades.length === 0 ? (
                  <p style={{ color: D.muted, fontSize: 14, textAlign: 'center', padding: '16px 0' }}>Nenhuma validade cadastrada.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {validades.map((v) => {
                      const dias = diasAteVencer(v.data_validade)
                      const vencido = dias < 0
                      const proximo = dias >= 0 && dias <= 7
                      const isEditingQtd = editandoValidade === v.id
                      return (
                        <div key={v.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: D.input, borderRadius: 14, padding: '12px 14px' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 14, fontWeight: 600, color: D.text }}>
                              {new Date(v.data_validade + 'T00:00:00').toLocaleDateString('pt-BR')}
                            </p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                              {isEditingQtd ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <input type="number" min="1" value={qtdEditValidade}
                                    onChange={(e) => setQtdEditValidade(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') salvarQtdValidade(v.id); if (e.key === 'Escape') setEditandoValidade(null) }}
                                    autoFocus
                                    style={{ width: 64, background: D.card, border: `1px solid #6366F1`, borderRadius: 8, padding: '4px 8px', fontSize: 13, color: D.text, outline: 'none' }} />
                                  <button onClick={() => salvarQtdValidade(v.id)}
                                    style={{ background: '#10B981', color: '#fff', border: 'none', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>✓</button>
                                  <button onClick={() => setEditandoValidade(null)}
                                    style={{ background: 'none', border: 'none', color: D.muted, fontSize: 14, cursor: 'pointer', padding: '4px' }}>✕</button>
                                </div>
                              ) : (
                                <button onClick={() => { setEditandoValidade(v.id); setQtdEditValidade(String(v.quantidade)) }}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <span style={{ fontSize: 12, color: D.text2 }}>Qtd: {v.quantidade}</span>
                                  <span style={{ fontSize: 10, color: D.muted }}>✏️</span>
                                </button>
                              )}
                              {vencido && (
                                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(239,68,68,0.15)', color: '#EF4444' }}>Vencido</span>
                              )}
                              {proximo && !vencido && (
                                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(249,115,22,0.15)', color: '#F97316' }}>
                                  {dias === 0 ? 'Vence hoje' : `Vence em ${dias}d`}
                                </span>
                              )}
                            </div>
                          </div>
                          <button onClick={() => apagarValidade(v.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: D.muted, marginLeft: 12 }}>🗑</button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de cadastro de novo produto com opção de criar fornecedor inline */}
      {modalNovoProduto && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50, background: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) { setModalNovoProduto(false); setFeedbackNovo(null) } }}>
          <div style={{ width: '100%', maxWidth: 480, background: D.card, borderRadius: '24px 24px 0 0', padding: '24px 24px 40px', overflowY: 'auto', maxHeight: '92vh', boxShadow: '0 -4px 40px rgba(0,0,0,0.5)' }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: D.border, margin: '0 auto 20px' }} />
            <p style={{ color: D.text2, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 16 }}>Novo produto</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div><label style={labelStyle}>Nome *</label>
                <input style={inputStyle} placeholder="Nome do produto" value={formNovo.nome}
                  onChange={(e) => setFormNovo((f) => ({ ...f, nome: e.target.value }))} autoFocus />
              </div>

              <div>
                <label style={labelStyle}>Fornecedor *</label>
                <select style={inputStyle} value={formNovo.fornecedor_id}
                  onChange={(e) => setFormNovo((f) => ({ ...f, fornecedor_id: e.target.value }))}>
                  <option value="" style={{ background: D.input }}>Selecione</option>
                  {fornecedores.map((f) => <option key={f.id} value={f.id} style={{ background: D.input }}>{f.nome}</option>)}
                </select>
                {!mostrarNovoFornecedor ? (
                  <button type="button" onClick={() => { setMostrarNovoFornecedor(true); setNovoFornecedorNome('') }}
                    style={{ background: 'none', border: 'none', color: 'var(--accent-text)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '6px 0 0', display: 'block' }}>
                    + Novo fornecedor
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input type="text" placeholder="Nome do fornecedor" value={novoFornecedorNome}
                      onChange={(e) => setNovoFornecedorNome(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') salvarNovoFornecedor(); if (e.key === 'Escape') setMostrarNovoFornecedor(false) }}
                      autoFocus
                      style={{ ...inputStyle, flex: 1 }} />
                    <button onClick={salvarNovoFornecedor} disabled={salvandoFornecedor || !novoFornecedorNome.trim()}
                      style={{ padding: '10px 14px', borderRadius: 12, background: '#6366F1', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', opacity: (salvandoFornecedor || !novoFornecedorNome.trim()) ? 0.4 : 1 }}>
                      {salvandoFornecedor ? '...' : 'Salvar'}
                    </button>
                    <button onClick={() => setMostrarNovoFornecedor(false)}
                      style={{ padding: '10px', borderRadius: 12, background: 'none', border: `1px solid ${D.border}`, color: D.text2, fontSize: 13, cursor: 'pointer' }}>
                      ✕
                    </button>
                  </div>
                )}
              </div>

              <div><label style={labelStyle}>Unidade *</label>
                <input style={inputStyle} placeholder="kg, un, cx..." value={formNovo.unidade}
                  onChange={(e) => setFormNovo((f) => ({ ...f, unidade: e.target.value }))} />
              </div>

              <div><label style={labelStyle}>Código de barras</label>
                <div style={{ position: 'relative' }}>
                  <input type="text" style={{ ...inputStyle, paddingRight: '2.5rem' }}
                    placeholder="Ex: 7891234567890" value={formNovo.codigo_barras}
                    onChange={(e) => setFormNovo((f) => ({ ...f, codigo_barras: e.target.value }))} />
                  <BarcodeCameraButton instanceId="novo-produto-barcode-scanner"
                    onScanned={(codigo) => setFormNovo((f) => ({ ...f, codigo_barras: codigo }))} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div><label style={labelStyle}>Qtd atual</label>
                  <input type="number" min="0" style={inputStyle} value={formNovo.qtd_atual}
                    onChange={(e) => setFormNovo((f) => ({ ...f, qtd_atual: e.target.value }))} />
                </div>
                <div><label style={labelStyle}>Qtd mínima</label>
                  <input type="number" min="0" style={inputStyle} value={formNovo.qtd_base}
                    onChange={(e) => setFormNovo((f) => ({ ...f, qtd_base: e.target.value }))} />
                </div>
                <div><label style={labelStyle}>Qtd máxima</label>
                  <input type="number" min="0" style={inputStyle} value={formNovo.qtd_max}
                    onChange={(e) => setFormNovo((f) => ({ ...f, qtd_max: e.target.value }))} />
                </div>
              </div>

              {feedbackNovo && (
                <p style={{ fontSize: 13, textAlign: 'center', fontWeight: 600, color: feedbackNovo.ok ? '#10B981' : '#EF4444' }}>
                  {feedbackNovo.msg}
                </p>
              )}

              <button onClick={criarNovoProduto}
                disabled={salvandoNovo || !formNovo.nome.trim() || !formNovo.fornecedor_id || !formNovo.unidade.trim()}
                style={{ background: '#6366F1', color: '#fff', border: 'none', borderRadius: 14, padding: '14px', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: (salvandoNovo || !formNovo.nome.trim() || !formNovo.fornecedor_id || !formNovo.unidade.trim()) ? 0.5 : 1 }}>
                {salvandoNovo ? 'Cadastrando...' : 'Cadastrar produto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
