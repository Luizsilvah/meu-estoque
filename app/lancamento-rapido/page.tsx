'use client'
// Lançamento rápido: o funcionário anota o movimento do dia em texto livre
// ("usei 10 leite cozinha, chegou 5 casquinha 15/01"), confere a lista e lança
// tudo de uma vez. SEM IA — quem entende o texto é app/lib/interpretarLancamento.ts
// (regras + busca aproximada). Nada é gravado antes do "Lançar tudo"; quem grava
// é POST /api/lancamento-rapido/lancar, item por item, pelas mesmas funções do
// banco da Movimentação e da Transferência.
//
// A lista pendente fica salva no aparelho (localStorage por usuário) para não
// se perder se o app fechar no meio do dia. As escolhas feitas em "QUAL?"
// também ficam salvas ("leite" → Leite líquido) e valem nas próximas vezes.
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'

import { D } from '@/app/lib/theme'
import { buscarEstoque, invalidarEstoqueCache } from '@/app/lib/estoqueCache'
import { FUNCOES, podeAcessar, type Permissoes } from '@/app/lib/permissoes'
import { Validade, diasAteVencer, controlaValidade } from '@/app/lib/validades'
import ModalLotes, { type LoteAdd, type LoteRemover } from '@/app/components/ModalLotes'
import {
  interpretarLancamento, buscarProdutos, chaveApelido, normalizar,
  type Candidato, type Local, type ProdutoCatalogo, type TipoLancamento,
} from '@/app/lib/interpretarLancamento'

type ItemEstoque = {
  produto_id: string
  qtd_atual: number
  qtd_cozinha: number
  produtos: { nome: string; unidade: string; controla_validade?: boolean } | null
}

type ItemLista = {
  key: string
  /** Texto que gerou o item ('' quando foi adicionado pelo formulário). */
  texto_original: string
  termo: string
  tipo: TipoLancamento | null
  produto_id: string | null
  candidatos: Candidato[]
  quantidade: number
  /** Saída: de onde sai. */
  local: Local
  /** Transferência: para onde vai (a origem é o outro local). */
  destino: Local
  /** Entrada com um lote só. */
  data_validade: string | null
  /** Entrada com lotes escolhidos no ModalLotes (substitui data_validade). */
  lotes_add: LoteAdd[] | null
  /** Saída com lotes escolhidos no ModalLotes; null = FEFO automático. */
  lotes_remover: LoteRemover[] | null
  erro?: string
}

type Pendencia = 'tipo' | 'permissao' | 'produto' | 'validade' | 'quantidade'

type Analise = {
  produto: ItemEstoque | null
  pendencias: Pendencia[]
  /** Saída: de onde sai (FEFO ou escolhido). Entrada: o que entra. */
  lotes: { data: string; quantidade: number }[]
  /** Lotes do produto antes deste item (já descontadas as saídas anteriores da lista). */
  validadesAntes: Validade[]
  temLotes: boolean
  /** produtos.controla_validade — false: sem campo de validade e sem lotes. */
  controla: boolean
  aviso: string | null
}

const TIPO_VIS: Record<TipoLancamento, { rotulo: string; cor: string; sinal: string; nome: string }> = {
  saida:         { rotulo: 'SAÍDA',   cor: '#EF4444', sinal: '−', nome: 'Saída' },
  entrada:       { rotulo: 'ENTRADA', cor: '#10B981', sinal: '+', nome: 'Entrada' },
  transferencia: { rotulo: 'TRANSF.', cor: '#06B6D4', sinal: '',  nome: 'Transf.' },
}
const AMARELO = '#F59E0B'
const ACCENT = '#6366F1'

const EXEMPLOS = [
  { texto: 'usei 10 leite cozinha', explica: 'Saída de 10 da cozinha' },
  { texto: 'peguei 3 casquinha', explica: 'Saída do principal' },
  { texto: 'chegou 10 casquinha 15/01', explica: 'Entrada com validade (dd/mm ou dd/mm/aa)' },
  { texto: 'passei 2 creme de ninho pra cozinha', explica: 'Transferência principal → cozinha' },
  { texto: 'levei 1 leite da cozinha pro principal', explica: 'Transferência cozinha → principal' },
  { texto: 'usei 5 leite, 2 granola e 3 bis', explica: 'Vários itens: vírgula, ";", " e " ou uma linha por item' },
]

const chaveLista = (uid: string) => `lancamento-rapido:lista:${uid}`
const chaveApelidos = (uid: string) => `lancamento-rapido:apelidos:${uid}`

function lerStorage<T>(chave: string): T | null {
  try {
    const bruto = localStorage.getItem(chave)
    return bruto ? JSON.parse(bruto) as T : null
  } catch { return null }
}
function gravarStorage(chave: string, valor: unknown) {
  try { localStorage.setItem(chave, JSON.stringify(valor)) } catch { /* sem storage: segue só em memória */ }
}

function novaKey() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function itemVazio(): ItemLista {
  return {
    key: novaKey(), texto_original: '', termo: '', tipo: null, produto_id: null, candidatos: [], quantidade: 1,
    local: 'principal', destino: 'cozinha', data_validade: null, lotes_add: null, lotes_remover: null,
  }
}

/** Confere o que veio do localStorage — formato antigo/quebrado vira lista vazia. */
function listaValida(v: unknown): ItemLista[] {
  if (!Array.isArray(v)) return []
  return v.filter((i): i is ItemLista => !!i && typeof i === 'object' && typeof (i as ItemLista).key === 'string')
    .map((i) => ({ ...itemVazio(), ...i, candidatos: Array.isArray(i.candidatos) ? i.candidatos : [] }))
}

function formatarData(iso: string, ano = true) {
  const [a, m, d] = iso.split('-')
  return ano ? `${d}/${m}/${a}` : `${d}/${m}`
}

function nomeLocal(l: Local) { return l === 'cozinha' ? 'Cozinha' : 'Principal' }

/** Busca da caixa de produto: primeiro quem contém o texto, depois a aproximada. */
function resultadosBusca(texto: string, catalogo: ProdutoCatalogo[]): Candidato[] {
  const n = normalizar(texto.trim())
  if (!n) return []
  const contem = catalogo.filter((p) => normalizar(p.nome).includes(n))
    .sort((a, b) => a.nome.length - b.nome.length)
    .slice(0, 6).map((p) => ({ produto_id: p.produto_id, nome: p.nome, score: 1 }))
  const aprox = buscarProdutos(texto, catalogo, { limite: 6, minimo: 0.3 }).filter((c) => !contem.some((x) => x.produto_id === c.produto_id))
  return [...contem, ...aprox].slice(0, 6)
}

/**
 * Analisa a lista na ordem, simulando o efeito de cada item no estoque e nos
 * lotes — assim duas saídas do mesmo produto não sugerem o mesmo lote e o
 * aviso de "estoque insuficiente" considera o que já saiu antes na lista.
 */
function analisar(
  lista: ItemLista[],
  estoquePorId: Map<string, ItemEstoque>,
  validadesPorProduto: Record<string, Validade[]>,
  perm: { mov: boolean; transf: boolean },
): Analise[] {
  const simLotes = new Map<string, Validade[]>()
  const simQtd = new Map<string, { atual: number; cozinha: number }>()
  const lotesDe = (pid: string) => {
    if (!simLotes.has(pid)) {
      simLotes.set(pid, [...(validadesPorProduto[pid] ?? [])].map((v) => ({ ...v }))
        .sort((a, b) => a.data_validade.localeCompare(b.data_validade)))
    }
    return simLotes.get(pid)!
  }
  const qtdDe = (p: ItemEstoque) => {
    if (!simQtd.has(p.produto_id)) simQtd.set(p.produto_id, { atual: p.qtd_atual ?? 0, cozinha: p.qtd_cozinha ?? 0 })
    return simQtd.get(p.produto_id)!
  }

  return lista.map((item) => {
    const pendencias: Pendencia[] = []
    const produto = item.produto_id ? estoquePorId.get(item.produto_id) ?? null : null
    if (!item.tipo) pendencias.push('tipo')
    else if (item.tipo === 'transferencia' ? !perm.transf : !perm.mov) pendencias.push('permissao')
    if (!produto) pendencias.push('produto')
    if (!Number.isInteger(item.quantidade) || item.quantidade < 1) pendencias.push('quantidade')
    if (!produto) return { produto, pendencias, lotes: [], validadesAntes: [], temLotes: false, controla: true, aviso: null }

    const controla = controlaValidade(produto.produtos)
    const reais = controla ? validadesPorProduto[produto.produto_id] ?? [] : []
    const temLotes = reais.length > 0
    const vals = lotesDe(produto.produto_id)
    const validadesAntes = vals.filter((v) => v.quantidade > 0).map((v) => ({ ...v }))
    const q = qtdDe(produto)
    const un = produto.produtos?.unidade ?? 'un'
    let lotes: { data: string; quantidade: number }[] = []
    let aviso: string | null = null

    if (item.tipo === 'saida') {
      const disp = item.local === 'cozinha' ? q.cozinha : q.atual - q.cozinha
      if (item.quantidade > disp) aviso = `${nomeLocal(item.local)} só tem ${Math.max(0, disp)} ${un}`
      if (!controla) {
        // sem lotes
      } else if (item.lotes_remover) {
        for (const r of item.lotes_remover) {
          const v = vals.find((x) => x.id === r.validade_id)
          if (v) { lotes.push({ data: v.data_validade, quantidade: r.quantidade }); v.quantidade -= r.quantidade }
        }
      } else {
        let restante = item.quantidade
        for (const v of vals) {
          if (restante <= 0) break
          const tira = Math.min(v.quantidade, restante)
          if (tira > 0) { lotes.push({ data: v.data_validade, quantidade: tira }); v.quantidade -= tira; restante -= tira }
        }
      }
      q.atual -= item.quantidade
      if (item.local === 'cozinha') q.cozinha -= item.quantidade
    } else if (item.tipo === 'entrada') {
      if (!controla) lotes = []
      else if (item.lotes_add?.length) lotes = item.lotes_add.map((l) => ({ data: l.data_validade, quantidade: l.quantidade }))
      else if (item.data_validade) lotes = [{ data: item.data_validade, quantidade: item.quantidade }]
      else if (temLotes) pendencias.push('validade')
      if (lotes.some((l) => diasAteVencer(l.data) < 0)) aviso = 'Validade já vencida'
      q.atual += item.quantidade
    } else if (item.tipo === 'transferencia') {
      const disp = item.destino === 'cozinha' ? q.atual - q.cozinha : q.cozinha
      if (item.quantidade > disp) aviso = `${nomeLocal(item.destino === 'cozinha' ? 'principal' : 'cozinha')} só tem ${Math.max(0, disp)} ${un}`
      q.cozinha += item.destino === 'cozinha' ? item.quantidade : -item.quantidade
    }
    return { produto, pendencias, lotes, validadesAntes, temLotes, controla, aviso }
  })
}

export default function LancamentoRapido() {
  const [usuarioId, setUsuarioId] = useState<string | null>(null)
  const [perm, setPerm] = useState({ mov: false, transf: false })
  const [estoque, setEstoque] = useState<ItemEstoque[]>([])
  const [validadesPorProduto, setValidadesPorProduto] = useState<Record<string, Validade[]>>({})
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState('')

  const [lista, setLista] = useState<ItemLista[]>([])
  const [apelidos, setApelidos] = useState<Record<string, string>>({})
  const [rascunhoLido, setRascunhoLido] = useState(false)

  const [texto, setTexto] = useState('')
  const [aviso, setAviso] = useState<{ msg: string; ok: boolean } | null>(null)
  const [ajudaAberta, setAjudaAberta] = useState(false)
  const [editor, setEditor] = useState<{ item: ItemLista; novo: boolean } | null>(null)
  const [modalLotesAberto, setModalLotesAberto] = useState(false)
  const [lancando, setLancando] = useState(false)
  const [confirmarLimpar, setConfirmarLimpar] = useState(false)
  const textoRef = useRef<HTMLTextAreaElement>(null)

  async function carregarEstoque(forcar = false) {
    const [jsonE, resV] = await Promise.all([buscarEstoque(forcar), fetch('/api/validades/todos')])
    setEstoque(jsonE as unknown as ItemEstoque[])
    if (resV.ok) {
      const vals: Validade[] = await resV.json()
      const mapa: Record<string, Validade[]> = {}
      if (Array.isArray(vals)) for (const v of vals) (mapa[v.produto_id] ??= []).push(v)
      setValidadesPorProduto(mapa)
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const [me] = await Promise.all([fetch('/api/auth/me').then((r) => r.json()), carregarEstoque()])
        const permissoes = (me?.permissoes ?? {}) as Permissoes
        const pode = (id: string) => {
          const f = FUNCOES.find((x) => x.id === id)
          return !!f && podeAcessar(f, me?.perfil, permissoes)
        }
        setPerm({ mov: pode('movimentacao'), transf: pode('transferencia') })
        if (typeof me?.id === 'string') {
          setUsuarioId(me.id)
          setLista(listaValida(lerStorage(chaveLista(me.id))))
          const ap = lerStorage<Record<string, string>>(chaveApelidos(me.id))
          if (ap && typeof ap === 'object') setApelidos(ap)
        }
        setRascunhoLido(true)
      } catch (e) {
        setErroCarga(e instanceof Error ? e.message : 'Erro ao carregar')
      } finally {
        setCarregando(false)
      }
    })()
  }, [])

  // Rascunho: grava a lista no aparelho a cada mudança.
  useEffect(() => {
    if (rascunhoLido && usuarioId) gravarStorage(chaveLista(usuarioId), lista)
  }, [lista, rascunhoLido, usuarioId])

  const catalogo = useMemo<ProdutoCatalogo[]>(() =>
    estoque.filter((e) => e.produtos?.nome).map((e) => ({ produto_id: e.produto_id, nome: e.produtos!.nome })), [estoque])
  const estoquePorId = useMemo(() => new Map(estoque.map((e) => [e.produto_id, e])), [estoque])
  const analises = useMemo(() => analisar(lista, estoquePorId, validadesPorProduto, perm), [lista, estoquePorId, validadesPorProduto, perm])
  const completos = analises.every((a) => a.pendencias.length === 0)

  function lembrarEscolha(termo: string, produtoId: string) {
    const chave = chaveApelido(termo)
    if (!chave || !usuarioId) return
    setApelidos((prev) => {
      const novo = { ...prev, [chave]: produtoId }
      gravarStorage(chaveApelidos(usuarioId), novo)
      return novo
    })
  }

  function atualizar(key: string, mudanca: Partial<ItemLista>) {
    setLista((prev) => prev.map((i) => i.key === key ? { ...i, ...mudanca, erro: undefined } : i))
  }

  function escolherProduto(item: ItemLista, produtoId: string) {
    if (item.termo) lembrarEscolha(item.termo, produtoId)
    atualizar(item.key, { produto_id: produtoId, candidatos: [], lotes_add: null, lotes_remover: null })
  }

  function remover(key: string) {
    setLista((prev) => prev.filter((i) => i.key !== key))
  }

  function enviarTexto() {
    const t = texto.trim()
    if (!t) return
    const novos: ItemLista[] = interpretarLancamento(t, catalogo, { apelidos }).map((r) => ({
      ...itemVazio(),
      texto_original: r.texto_original,
      termo: r.termo,
      tipo: r.tipo,
      produto_id: r.produto_id,
      candidatos: r.candidatos,
      quantidade: r.quantidade,
      local: r.local,
      destino: r.destino ?? 'cozinha',
      data_validade: r.tipo === 'saida' || r.tipo === 'transferencia' ? null : r.data_validade,
    }))
    if (!novos.length) return
    setLista((prev) => [...prev, ...novos])
    setTexto('')
    const duvidas = novos.filter((n) => !n.tipo || !n.produto_id).length
    setAviso({
      msg: `Entendi ${novos.length} ${novos.length === 1 ? 'lançamento' : 'lançamentos'}.` + (duvidas ? ` ${duvidas} com dúvida — confira em amarelo.` : ' Confere e toque em lançar.'),
      ok: true,
    })
    setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 50)
  }

  async function lancarTudo() {
    if (!lista.length || !completos || lancando) return
    setLancando(true); setAviso(null)
    const itens = lista.map((i) => {
      const controla = controlaValidade(estoquePorId.get(i.produto_id ?? '')?.produtos)
      return {
      key: i.key,
      tipo: i.tipo,
      produto_id: i.produto_id,
      quantidade: i.quantidade,
      local: i.local,
      destino: i.destino,
      lotes_add: i.tipo === 'entrada'
        ? (!controla ? [] : i.lotes_add?.length ? i.lotes_add : i.data_validade ? [{ data_validade: i.data_validade, quantidade: i.quantidade }] : [])
        : undefined,
      // null = o servidor escolhe por FEFO com os lotes de agora.
      lotes_remover: i.tipo === 'saida' && i.lotes_remover && controla ? i.lotes_remover : undefined,
      }
    })
    try {
      const res = await fetch('/api/lancamento-rapido/lancar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itens }),
      })
      const json = await res.json()
      if (!res.ok || !Array.isArray(json.resultados)) { setAviso({ msg: json.erro ?? 'Erro ao lançar', ok: false }); return }
      const resultados = json.resultados as { key: string; ok: boolean; erro?: string }[]
      const porKey = new Map(resultados.map((r) => [r.key, r]))
      const okCount = resultados.filter((r) => r.ok).length
      const erros = resultados.length - okCount
      // Os que deram certo saem da lista; os com erro ficam com a mensagem.
      setLista((prev) => prev.filter((i) => !porKey.get(i.key)?.ok).map((i) => {
        const r = porKey.get(i.key)
        return r && !r.ok ? { ...i, erro: r.erro ?? 'Erro' } : i
      }))
      setAviso({
        msg: (okCount ? `✓ ${okCount} ${okCount === 1 ? 'lançado' : 'lançados'}` : 'Nada lançado') + (erros ? ` · ${erros} com erro (ficaram na lista)` : ''),
        ok: erros === 0,
      })
      if (okCount) {
        invalidarEstoqueCache()
        await carregarEstoque(true).catch(() => {})
      }
    } catch {
      setAviso({ msg: 'Erro de conexão — nada foi perdido, tente de novo', ok: false })
    } finally {
      setLancando(false)
    }
  }

  // ── Editor (editar item / + adicionar item) ──
  function abrirEditor(item?: ItemLista) {
    setEditor(item ? { item: { ...item }, novo: false } : { item: itemVazio(), novo: true })
  }
  function mudarRascunho(mudanca: Partial<ItemLista>) {
    setEditor((prev) => {
      if (!prev) return prev
      const atual = prev.item
      const novo = { ...atual, ...mudanca }
      // Mudou o que define os lotes → os lotes escolhidos à mão não valem mais.
      if (novo.tipo !== atual.tipo || novo.produto_id !== atual.produto_id || novo.quantidade !== atual.quantidade || novo.local !== atual.local) {
        if (!('lotes_add' in mudanca)) novo.lotes_add = null
        if (!('lotes_remover' in mudanca)) novo.lotes_remover = null
      }
      return { ...prev, item: novo }
    })
  }
  function salvarEditor() {
    if (!editor) return
    const it = { ...editor.item, candidatos: editor.item.produto_id ? [] : editor.item.candidatos, erro: undefined }
    if (it.tipo !== 'entrada') { it.data_validade = null; it.lotes_add = null }
    if (it.tipo !== 'saida') it.lotes_remover = null
    const original = lista.find((i) => i.key === it.key)
    if (original?.termo && it.produto_id && it.produto_id !== original.produto_id) lembrarEscolha(original.termo, it.produto_id)
    setLista((prev) => editor.novo ? [...prev, it] : prev.map((i) => i.key === it.key ? it : i))
    setEditor(null)
  }

  // Análise do rascunho do editor na posição dele na lista (lotes já descontados).
  const analiseEditor = useMemo(() => {
    if (!editor) return null
    const idx = lista.findIndex((i) => i.key === editor.item.key)
    const base = idx >= 0 ? lista.slice(0, idx) : lista
    return analisar([...base, editor.item], estoquePorId, validadesPorProduto, perm).at(-1) ?? null
  }, [editor, lista, estoquePorId, validadesPorProduto, perm])

  const pendentes = analises.filter((a) => a.pendencias.length > 0).length

  if (carregando) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: D.bg }}>
      <p style={{ color: D.text2, fontSize: 14 }}>Carregando...</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: D.bg, overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{ background: 'var(--page-header)', borderBottom: `1px solid ${D.border}`, padding: '48px 20px 18px' }}>
        <Link href="/" style={{ color: D.text2, fontSize: 13, textDecoration: 'none', display: 'block', marginBottom: 12 }}>← Voltar</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: `linear-gradient(135deg, ${ACCENT}, #8B5CF6)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />
            </svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ color: D.text, fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>Lançamento rápido</h1>
            <p style={{ color: D.muted, fontSize: 13, margin: '2px 0 0' }}>Anota durante o dia, lança tudo de uma vez</p>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '16px 16px calc(120px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {erroCarga && <p style={{ color: '#EF4444', fontSize: 13, fontWeight: 600 }}>{erroCarga}</p>}
        {!perm.mov && !perm.transf && !erroCarga && (
          <p style={{ color: '#EF4444', fontSize: 13, fontWeight: 600 }}>Você não tem permissão de Movimentação nem de Transferência.</p>
        )}

        {lista.length === 0 ? (
          <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 18, padding: 18 }}>
            <p style={{ color: D.text, fontSize: 15, fontWeight: 700, margin: '0 0 6px' }}>Nada anotado ainda</p>
            <p style={{ color: D.text2, fontSize: 13, margin: '0 0 12px', lineHeight: 1.45 }}>
              Escreva embaixo do jeito que falaria (dá pra usar o microfone do teclado). Nada é salvo no estoque antes de você tocar em <b>Lançar tudo</b>.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {EXEMPLOS.slice(0, 3).map((e) => (
                <button key={e.texto} type="button" onClick={() => { setTexto(e.texto); textoRef.current?.focus() }}
                  style={{ textAlign: 'left', padding: '8px 12px', borderRadius: 12, border: `1px solid ${D.border}`, background: D.input, color: D.text, fontSize: 13, cursor: 'pointer' }}>
                  “{e.texto}”
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <p style={{ color: D.text2, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', margin: 0 }}>
              {lista.length} {lista.length === 1 ? 'item' : 'itens'}{pendentes ? ` · ${pendentes} pra conferir` : ''}
            </p>
            {confirmarLimpar ? (
              <span style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={() => { setLista([]); setConfirmarLimpar(false); setAviso(null) }}
                  style={{ ...botaoMini, color: '#EF4444', borderColor: 'rgba(239,68,68,0.4)' }}>Apagar tudo</button>
                <button type="button" onClick={() => setConfirmarLimpar(false)} style={botaoMini}>Não</button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmarLimpar(true)} style={botaoMini}>Limpar lista</button>
            )}
          </div>
        )}

        {lista.map((item, idx) => (
          <CardItem key={item.key} item={item} analise={analises[idx]} perm={perm} catalogo={catalogo}
            onEditar={() => abrirEditor(item)}
            onRemover={() => remover(item.key)}
            onTipo={(tipo) => atualizar(item.key, { tipo, lotes_add: null, lotes_remover: null, ...(tipo === 'entrada' ? { local: 'principal' as Local } : {}) })}
            onProduto={(pid) => escolherProduto(item, pid)}
            onValidade={(data) => atualizar(item.key, { data_validade: data || null, lotes_add: null })}
          />
        ))}

        <button type="button" onClick={() => abrirEditor()}
          style={{ padding: '12px 16px', borderRadius: 16, border: `1px dashed ${ACCENT}`, background: 'rgba(99,102,241,0.08)', color: ACCENT, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          + adicionar item
        </button>

        {aviso && (
          <p style={{ margin: 0, padding: '10px 14px', borderRadius: 12, fontSize: 13, fontWeight: 600,
            background: aviso.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: aviso.ok ? '#10B981' : '#EF4444' }}>
            {aviso.msg}
          </p>
        )}

        {lista.length > 0 && (
          <>
            <button type="button" onClick={lancarTudo} disabled={!completos || lancando}
              style={{ padding: '15px', borderRadius: 16, border: 'none', background: 'linear-gradient(135deg, #10B981, #059669)', color: '#fff', fontSize: 16, fontWeight: 800,
                cursor: completos && !lancando ? 'pointer' : 'not-allowed', opacity: completos && !lancando ? 1 : 0.5 }}>
              {lancando ? 'Lançando...' : `Lançar tudo (${lista.length})`}
            </button>
            {!completos && (
              <p style={{ color: AMARELO, fontSize: 12, fontWeight: 600, textAlign: 'center', margin: 0 }}>
                Resolva os itens em amarelo para liberar o botão.
              </p>
            )}
          </>
        )}
      </div>

      {/* ── Caixa de texto ── */}
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 'var(--bottomnav-topo, 0px)', zIndex: 40, background: D.card, borderTop: `1px solid ${D.border}`, padding: '10px 12px calc(10px + var(--bottomnav-safe, env(safe-area-inset-bottom)))' }}>
        <form onSubmit={(e) => { e.preventDefault(); enviarTexto() }}
          style={{ maxWidth: 560, margin: '0 auto', display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <button type="button" aria-label="Como escrever" onClick={() => setAjudaAberta(true)}
            style={{ ...botaoRedondo, background: D.input, color: D.text2, border: `1px solid ${D.border}`, fontSize: 18, fontWeight: 800 }}>
            ?
          </button>
          <textarea ref={textoRef} value={texto} onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarTexto() } }}
            placeholder="Ex.: usei 10 leite cozinha" rows={Math.min(4, Math.max(1, texto.split('\n').length))}
            style={{ flex: 1, minWidth: 0, resize: 'none', background: D.input, border: `1px solid ${D.border}`, borderRadius: 22, padding: '11px 16px', fontSize: 16, color: D.text, outline: 'none', fontFamily: 'inherit', lineHeight: 1.35 }} />
          <button type="submit" aria-label="Enviar" disabled={!texto.trim()}
            style={{ ...botaoRedondo, background: ACCENT, color: '#fff', border: 'none', opacity: texto.trim() ? 1 : 0.5 }}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </form>
      </div>

      {/* ── Ajuda: como escrever ── */}
      {ajudaAberta && (
        <Folha onFechar={() => setAjudaAberta(false)}>
          <p style={tituloFolha}>Como escrever</p>
          <p style={{ color: D.text2, fontSize: 13, margin: '0 0 12px', lineHeight: 1.45 }}>
            Toque num exemplo para usar. A palavra diz o tipo: <b style={{ color: TIPO_VIS.saida.cor }}>usei, peguei, gastei, tirei, perdi</b> = saída;{' '}
            <b style={{ color: TIPO_VIS.entrada.cor }}>chegou, recebi, comprei</b> = entrada;{' '}
            <b style={{ color: TIPO_VIS.transferencia.cor }}>passei, levei, mandei, transferi</b> = transferência.
            Com “cozinha” sai da cozinha; sem, do principal.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {EXEMPLOS.map((e) => (
              <button key={e.texto} type="button" onClick={() => { setTexto((t) => t.trim() ? `${t.trim()}, ${e.texto}` : e.texto); setAjudaAberta(false); textoRef.current?.focus() }}
                style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 14, border: `1px solid ${D.border}`, background: D.input, cursor: 'pointer' }}>
                <span style={{ display: 'block', color: D.text, fontSize: 14, fontWeight: 600 }}>“{e.texto}”</span>
                <span style={{ display: 'block', color: D.text2, fontSize: 12, marginTop: 2 }}>{e.explica}</span>
              </button>
            ))}
          </div>
        </Folha>
      )}

      {/* ── Editor do item ── */}
      {editor && analiseEditor && (
        <Folha onFechar={() => setEditor(null)}>
          <EditorItem item={editor.item} novo={editor.novo} analise={analiseEditor} perm={perm} catalogo={catalogo}
            onMudar={mudarRascunho} onSalvar={salvarEditor} onCancelar={() => setEditor(null)}
            onEscolherLotes={() => setModalLotesAberto(true)} />
        </Folha>
      )}

      {editor && modalLotesAberto && analiseEditor?.produto && (editor.item.tipo === 'saida' || editor.item.tipo === 'entrada') && (
        <ModalLotes
          key={`${editor.item.key}-${editor.item.tipo}-${editor.item.quantidade}`}
          produtoNome={analiseEditor.produto.produtos?.nome ?? 'Produto'}
          unidade={analiseEditor.produto.produtos?.unidade ?? 'un'}
          delta={editor.item.tipo === 'saida' ? -editor.item.quantidade : editor.item.quantidade}
          validades={analiseEditor.validadesAntes}
          textoConfirmar="Usar estes lotes"
          salvando={false}
          feedback={null}
          onVoltar={() => setModalLotesAberto(false)}
          onConfirmar={(lotesAdd, lotesRemover) => {
            if (editor.item.tipo === 'saida') mudarRascunho({ lotes_remover: lotesRemover })
            else mudarRascunho({ lotes_add: lotesAdd.length ? lotesAdd : null, data_validade: lotesAdd.length === 1 ? lotesAdd[0].data_validade : null })
            setModalLotesAberto(false)
          }}
        />
      )}
    </div>
  )
}

// ── Card de um item da lista ──

function CardItem({ item, analise, perm, catalogo, onEditar, onRemover, onTipo, onProduto, onValidade }: {
  item: ItemLista
  analise: Analise
  perm: { mov: boolean; transf: boolean }
  catalogo: ProdutoCatalogo[]
  onEditar: () => void
  onRemover: () => void
  onTipo: (t: TipoLancamento) => void
  onProduto: (produtoId: string) => void
  onValidade: (data: string) => void
}) {
  const pend = analise.pendencias
  const amarelo = pend.length > 0
  const vis = item.tipo ? TIPO_VIS[item.tipo] : null
  const nome = analise.produto?.produtos?.nome ?? null
  const un = analise.produto?.produtos?.unidade ?? ''

  const borda = item.erro ? 'rgba(239,68,68,0.6)' : amarelo ? 'rgba(245,158,11,0.55)' : D.border
  const fundo = item.erro ? 'rgba(239,68,68,0.06)' : amarelo ? 'rgba(245,158,11,0.07)' : D.card

  let selo: { texto: string; cor: string }
  if (pend.includes('produto') && item.candidatos.length) selo = { texto: 'QUAL?', cor: AMARELO }
  else if (pend.includes('produto')) selo = { texto: 'NÃO RECONHECIDO', cor: AMARELO }
  else if (pend.includes('tipo')) selo = { texto: 'TIPO?', cor: AMARELO }
  else if (pend.includes('validade')) selo = { texto: 'VALIDADE?', cor: AMARELO }
  else if (vis) selo = { texto: vis.rotulo, cor: vis.cor }
  else selo = { texto: '?', cor: AMARELO }

  return (
    <div style={{ background: fundo, border: `1px solid ${borda}`, borderRadius: 18, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      {/* Linha 1: selo, produto, quantidade */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, letterSpacing: '0.5px', padding: '3px 7px', borderRadius: 7, color: selo.cor, background: `color-mix(in srgb, ${selo.cor} 16%, transparent)` }}>
          {selo.texto}
        </span>
        <span style={{ flex: 1, minWidth: 0, color: D.text, fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {nome ?? `“${item.termo || item.texto_original || 'produto'}”`}
        </span>
        <span style={{ flexShrink: 0, color: vis?.cor ?? D.text, fontSize: 16, fontWeight: 800 }}>
          {vis?.sinal}{item.quantidade}{un && <span style={{ fontSize: 11, fontWeight: 600, color: D.text2 }}> {un}</span>}
        </span>
      </div>

      {/* Pendências */}
      {pend.includes('tipo') && (
        <div>
          <p style={textoPend}>É entrada, saída ou transferência?</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
            {(['saida', 'entrada', 'transferencia'] as TipoLancamento[]).map((t) => {
              const permitido = t === 'transferencia' ? perm.transf : perm.mov
              return (
                <button key={t} type="button" disabled={!permitido} onClick={() => onTipo(t)}
                  style={{ ...botaoEscolha, color: TIPO_VIS[t].cor, borderColor: `color-mix(in srgb, ${TIPO_VIS[t].cor} 45%, transparent)`, opacity: permitido ? 1 : 0.35 }}>
                  {TIPO_VIS[t].nome}
                </button>
              )
            })}
          </div>
        </div>
      )}
      {pend.includes('permissao') && (
        <p style={{ ...textoPend, color: '#EF4444' }}>Você não tem permissão para {item.tipo === 'transferencia' ? 'transferência' : 'entrada/saída'} — troque o tipo ou remova.</p>
      )}
      {pend.includes('produto') && item.candidatos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {item.candidatos.map((c) => (
            <button key={c.produto_id} type="button" onClick={() => onProduto(c.produto_id)} style={{ ...botaoEscolha, textAlign: 'left', color: D.text }}>
              {c.nome}
            </button>
          ))}
          <BuscaProduto catalogo={catalogo} onEscolher={onProduto} placeholder="Outro produto..." />
        </div>
      )}
      {pend.includes('produto') && item.candidatos.length === 0 && (
        <div>
          <p style={textoPend}>Não achei esse produto. Busque:</p>
          <BuscaProduto catalogo={catalogo} onEscolher={onProduto} inicial={item.termo} />
        </div>
      )}
      {pend.includes('validade') && (
        <div>
          <p style={textoPend}>Esse produto controla validade. Qual a data?</p>
          <input type="date" value={item.data_validade ?? ''} onChange={(e) => onValidade(e.target.value)} style={{ ...campo, maxWidth: 220 }} />
        </div>
      )}
      {pend.includes('quantidade') && <p style={{ ...textoPend, color: '#EF4444' }}>Quantidade inválida — toque em editar.</p>}

      {/* Linha 2: local + lotes, editar, remover */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5, color: D.text2, fontSize: 12.5 }}>
          <Detalhes item={item} analise={analise} />
        </div>
        <button type="button" onClick={onEditar} style={{ ...botaoLink, color: 'var(--accent-text)' }}>editar</button>
        <button type="button" aria-label="Remover item" onClick={onRemover} style={{ ...botaoLink, color: D.text2, fontSize: 15 }}>✕</button>
      </div>

      {item.texto_original && (
        <p style={{ margin: 0, color: D.muted, fontSize: 11.5, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          “{item.texto_original}”
        </p>
      )}
      {analise.aviso && <p style={{ margin: 0, color: '#F97316', fontSize: 12, fontWeight: 600 }}>⚠️ {analise.aviso}</p>}
      {item.erro && <p style={{ margin: 0, color: '#EF4444', fontSize: 12, fontWeight: 700 }}>✕ {item.erro}</p>}
    </div>
  )
}

function Detalhes({ item, analise }: { item: ItemLista; analise: Analise }) {
  if (!item.tipo) return <span>{nomeLocal(item.local)}</span>
  if (item.tipo === 'transferencia') {
    const origem: Local = item.destino === 'cozinha' ? 'principal' : 'cozinha'
    return <span>{nomeLocal(origem)} → {nomeLocal(item.destino)}</span>
  }
  const local = item.tipo === 'entrada' ? 'principal' : item.local
  if (!analise.produto) return <span>{nomeLocal(local)}</span>
  if (item.tipo === 'saida') {
    return (
      <>
        <span>{nomeLocal(local)} · {analise.lotes.length ? (analise.lotes.length === 1 ? 'lote' : 'lotes') : analise.temLotes ? 'sem lote disponível' : 'sem lote'}</span>
        {analise.lotes.map((l, i) => <Chip key={i}>{formatarData(l.data, false)} · {l.quantidade}</Chip>)}
      </>
    )
  }
  return (
    <>
      <span>{nomeLocal(local)} · {analise.lotes.length > 1 ? 'lotes' : analise.lotes.length ? 'validade' : 'sem validade'}</span>
      {analise.lotes.length === 1 && <Chip>{formatarData(analise.lotes[0].data)}</Chip>}
      {analise.lotes.length > 1 && analise.lotes.map((l, i) => <Chip key={i}>{formatarData(l.data, false)} · {l.quantidade}</Chip>)}
    </>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ padding: '2px 7px', borderRadius: 7, background: D.input, border: `1px solid ${D.border}`, color: D.text, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

// ── Busca de produto (cards "não reconhecido"/"QUAL?" e editor) ──

function BuscaProduto({ catalogo, onEscolher, inicial = '', placeholder = 'Buscar produto...', autoFocus = false }: {
  catalogo: ProdutoCatalogo[]
  onEscolher: (produtoId: string) => void
  inicial?: string
  placeholder?: string
  autoFocus?: boolean
}) {
  const [q, setQ] = useState(inicial)
  const resultados = useMemo(() => resultadosBusca(q, catalogo), [q, catalogo])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} style={campo} />
      {q.trim() && resultados.length === 0 && <p style={{ ...textoPend, margin: 0 }}>Nenhum produto com esse nome.</p>}
      {q.trim() && resultados.map((r) => (
        <button key={r.produto_id} type="button" onClick={() => { onEscolher(r.produto_id); setQ('') }}
          style={{ ...botaoEscolha, textAlign: 'left', color: D.text, fontWeight: 600 }}>
          {r.nome}
        </button>
      ))}
    </div>
  )
}

// ── Editor de um item (editar / + adicionar item) ──

function EditorItem({ item, novo, analise, perm, catalogo, onMudar, onSalvar, onCancelar, onEscolherLotes }: {
  item: ItemLista
  novo: boolean
  analise: Analise
  perm: { mov: boolean; transf: boolean }
  catalogo: ProdutoCatalogo[]
  onMudar: (m: Partial<ItemLista>) => void
  onSalvar: () => void
  onCancelar: () => void
  onEscolherLotes: () => void
}) {
  const [trocandoProduto, setTrocandoProduto] = useState(!item.produto_id)
  const produto = analise.produto
  const un = produto?.produtos?.unidade ?? 'un'
  const principal = produto ? Math.max(0, (produto.qtd_atual ?? 0) - (produto.qtd_cozinha ?? 0)) : 0
  const cozinha = produto?.qtd_cozinha ?? 0
  const podeSalvar = !!item.tipo && !!produto && Number.isInteger(item.quantidade) && item.quantidade >= 1
    && (item.tipo === 'transferencia' ? perm.transf : perm.mov)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={tituloFolha}>{novo ? 'Adicionar item' : 'Editar item'}</p>
      {item.texto_original && <p style={{ margin: '-8px 0 0', color: D.muted, fontSize: 12, fontStyle: 'italic' }}>“{item.texto_original}”</p>}

      <div>
        <label style={rotulo}>Tipo</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
          {(['saida', 'entrada', 'transferencia'] as TipoLancamento[]).map((t) => {
            const ativo = item.tipo === t
            const permitido = t === 'transferencia' ? perm.transf : perm.mov
            const cor = TIPO_VIS[t].cor
            return (
              <button key={t} type="button" disabled={!permitido}
                onClick={() => onMudar({ tipo: t, ...(t === 'entrada' ? { local: 'principal' as Local } : {}) })}
                style={{ ...botaoEscolha, color: ativo ? '#fff' : cor, background: ativo ? cor : 'transparent', borderColor: ativo ? cor : `color-mix(in srgb, ${cor} 45%, transparent)`, opacity: permitido ? 1 : 0.35 }}>
                {TIPO_VIS[t].nome}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <label style={rotulo}>Produto</label>
        {produto && !trocandoProduto ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 12, background: D.input, border: `1px solid ${D.border}` }}>
            <span style={{ flex: 1, minWidth: 0, color: D.text, fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {produto.produtos?.nome}
            </span>
            <button type="button" onClick={() => setTrocandoProduto(true)} style={{ ...botaoLink, color: 'var(--accent-text)' }}>trocar</button>
          </div>
        ) : (
          <BuscaProduto catalogo={catalogo} inicial={item.produto_id ? '' : item.termo} autoFocus={novo}
            onEscolher={(pid) => { onMudar({ produto_id: pid }); setTrocandoProduto(false) }} />
        )}
        {produto && (
          <p style={{ margin: '6px 0 0 2px', color: D.text2, fontSize: 12 }}>Principal: {principal} {un} · Cozinha: {cozinha} {un}</p>
        )}
      </div>

      <div>
        <label style={rotulo}>Quantidade</label>
        <div style={{ display: 'grid', gridTemplateColumns: '48px minmax(0, 1fr) 48px', gap: 8 }}>
          <button type="button" onClick={() => onMudar({ quantidade: Math.max(1, item.quantidade - 1) })} style={botaoQtd}>−</button>
          <input type="number" min="1" step="1" inputMode="numeric" value={Number.isFinite(item.quantidade) && item.quantidade > 0 ? item.quantidade : ''}
            onChange={(e) => onMudar({ quantidade: Math.floor(Number(e.target.value)) })}
            style={{ ...campo, textAlign: 'center', fontWeight: 800, fontSize: 18 }} />
          <button type="button" onClick={() => onMudar({ quantidade: (item.quantidade || 0) + 1 })} style={botaoQtd}>+</button>
        </div>
      </div>

      {item.tipo === 'saida' && (
        <div>
          <label style={rotulo}>Sai de onde?</label>
          <Segmento opcoes={[['principal', 'Principal'], ['cozinha', 'Cozinha']]} valor={item.local} onMudar={(v) => onMudar({ local: v as Local })} />
        </div>
      )}
      {item.tipo === 'transferencia' && (
        <div>
          <label style={rotulo}>Direção</label>
          <Segmento opcoes={[['cozinha', 'Principal → Cozinha'], ['principal', 'Cozinha → Principal']]} valor={item.destino} onMudar={(v) => onMudar({ destino: v as Local })} />
        </div>
      )}

      {item.tipo === 'entrada' && produto && analise.controla && (
        <div>
          <label style={rotulo}>Validade{analise.temLotes ? '' : ' (opcional)'}</label>
          {item.lotes_add && item.lotes_add.length > 1 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {item.lotes_add.map((l, i) => <Chip key={i}>{formatarData(l.data_validade, false)} · {l.quantidade}</Chip>)}
              <button type="button" onClick={() => onMudar({ lotes_add: null, data_validade: null })} style={{ ...botaoLink, color: D.text2 }}>limpar</button>
            </div>
          ) : (
            <input type="date" value={item.data_validade ?? ''} onChange={(e) => onMudar({ data_validade: e.target.value || null, lotes_add: null })} style={{ ...campo, maxWidth: 220 }} />
          )}
          <button type="button" onClick={onEscolherLotes} disabled={!podeSalvar} style={{ ...botaoLink, color: 'var(--accent-text)', marginTop: 8, padding: 0 }}>
            Vários lotes / somar num lote existente →
          </button>
        </div>
      )}

      {item.tipo === 'saida' && produto && analise.temLotes && (
        <div>
          <label style={rotulo}>Lotes {item.lotes_remover ? '(escolhidos)' : '(o que vence primeiro sai primeiro)'}</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {analise.lotes.length ? analise.lotes.map((l, i) => <Chip key={i}>{formatarData(l.data, false)} · {l.quantidade}</Chip>)
              : <span style={{ color: D.text2, fontSize: 12 }}>sem lote disponível</span>}
            {item.lotes_remover && <button type="button" onClick={() => onMudar({ lotes_remover: null })} style={{ ...botaoLink, color: D.text2 }}>voltar ao automático</button>}
          </div>
          <button type="button" onClick={onEscolherLotes} disabled={!podeSalvar} style={{ ...botaoLink, color: 'var(--accent-text)', marginTop: 8, padding: 0 }}>
            Escolher lotes →
          </button>
        </div>
      )}

      {analise.aviso && <p style={{ margin: 0, color: '#F97316', fontSize: 12, fontWeight: 600 }}>⚠️ {analise.aviso}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8, marginTop: 4 }}>
        <button type="button" onClick={onCancelar}
          style={{ padding: 14, borderRadius: 16, border: `1px solid ${D.border}`, background: 'none', color: D.text2, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          Cancelar
        </button>
        <button type="button" onClick={onSalvar} disabled={!podeSalvar}
          style={{ padding: 14, borderRadius: 16, border: 'none', background: ACCENT, color: '#fff', fontSize: 15, fontWeight: 700, cursor: podeSalvar ? 'pointer' : 'not-allowed', opacity: podeSalvar ? 1 : 0.5 }}>
          {novo ? 'Adicionar à lista' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}

function Segmento({ opcoes, valor, onMudar }: { opcoes: [string, string][]; valor: string; onMudar: (v: string) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${opcoes.length}, minmax(0, 1fr))`, gap: 6 }}>
      {opcoes.map(([v, rotuloOpcao]) => (
        <button key={v} type="button" onClick={() => onMudar(v)}
          style={{ ...botaoEscolha, color: valor === v ? '#fff' : D.text, background: valor === v ? ACCENT : 'transparent', borderColor: valor === v ? ACCENT : D.border }}>
          {rotuloOpcao}
        </button>
      ))}
    </div>
  )
}

function Folha({ children, onFechar }: { children: React.ReactNode; onFechar: () => void }) {
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onFechar() }}
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 480, maxHeight: '92vh', overflowY: 'auto', overflowX: 'hidden', background: D.card, borderRadius: '24px 24px 0 0', padding: '20px 18px calc(28px + env(safe-area-inset-bottom))', boxSizing: 'border-box', boxShadow: '0 -4px 40px rgba(0,0,0,0.5)' }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: D.border, margin: '0 auto 16px' }} />
        {children}
      </div>
    </div>
  )
}

// ── Estilos ──

const campo: React.CSSProperties = {
  width: '100%', background: D.input, border: `1px solid ${D.border}`, borderRadius: 12,
  padding: '10px 12px', fontSize: 16, color: D.text, outline: 'none', boxSizing: 'border-box', minWidth: 0,
}
const rotulo: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: D.text2, marginBottom: 6, marginLeft: 2 }
const tituloFolha: React.CSSProperties = { color: D.text, fontSize: 17, fontWeight: 800, margin: '0 0 8px' }
const textoPend: React.CSSProperties = { color: D.text2, fontSize: 12.5, fontWeight: 600, margin: '0 0 6px' }
const botaoEscolha: React.CSSProperties = {
  padding: '9px 12px', borderRadius: 12, border: `1px solid ${D.border}`, background: D.input,
  fontSize: 13.5, fontWeight: 700, cursor: 'pointer', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
}
const botaoLink: React.CSSProperties = { background: 'none', border: 'none', padding: '4px 2px', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }
const botaoMini: React.CSSProperties = {
  padding: '5px 10px', borderRadius: 10, border: `1px solid ${D.border}`, background: 'none', color: D.text2, fontSize: 12, fontWeight: 700, cursor: 'pointer',
}
const botaoRedondo: React.CSSProperties = {
  width: 44, height: 44, borderRadius: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
}
const botaoQtd: React.CSSProperties = {
  height: 46, borderRadius: 12, border: `1px solid ${D.border}`, background: D.input, color: D.text, fontSize: 20, fontWeight: 700, cursor: 'pointer',
}
