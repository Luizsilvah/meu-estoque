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
//
// Aba "Histórico" (./Historico.tsx, ?aba=historico na URL): o resultado de
// cada "Lançar tudo"; item com erro volta para cá com "Tentar de novo".
import { useEffect, useMemo, useRef, useState } from 'react'
import Page from '@/app/components/ui/Page'
import PageHeader from '@/app/components/ui/PageHeader'
import Card from '@/app/components/ui/Card'
import Icon from '@/app/components/ui/Icon'
import Abas from '@/app/components/ui/Abas'
import Historico from './Historico'
import type { ItemLog } from '@/app/lib/lancamentoRapidoLog'

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
  /** Entrada: onde entra. Saída: de onde sai. */
  local: Local
  /** Transferência: para onde vai (a origem é o outro local). */
  destino: Local
  /**
   * Entrada: validades (data + quantidade). Produto que controla validade só
   * lança com a soma = quantidade. quantidade 0 = data ainda sem quantidade.
   */
  lotes_add: LoteAdd[]
  /** Saída com lotes escolhidos no ModalLotes; null = FEFO automático. */
  lotes_remover: LoteRemover[] | null
  /** Pergunta do tipo quando o texto deixou em aberto ("devolvi" sem lugar). */
  duvida_tipo: string | null
  /** Frase inteira enviada na caixa de texto (vai para o histórico). */
  texto_fonte?: string
  erro?: string
}

type AbaTela = 'lancar' | 'historico'

type Pendencia = 'tipo' | 'permissao' | 'produto' | 'validade' | 'quantidade'

type Analise = {
  produto: ItemEstoque | null
  pendencias: Pendencia[]
  /** Saída: de onde sai (FEFO ou escolhido). Entrada: o que entra. */
  lotes: { data: string; quantidade: number }[]
  /** Entrada que controla validade: quantidade − soma dos lotes (>0 faltam, <0 passam). */
  faltaValidade: number
  /** Saída: lotes escolhidos à mão não batem mais → vai pelo FEFO automático. */
  lotesManuaisDescartados: boolean
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
  { texto: 'usei 2 leite da cozinha', explica: 'Saída da cozinha' },
  { texto: 'peguei 3 casquinha', explica: 'Saída do principal (sem lugar = principal)' },
  { texto: 'chegou 10 casquinha 15/01', explica: 'Entrada no principal com validade (dd/mm ou dd/mm/aa)' },
  { texto: 'chegou 10 casquinha 5 15/01 5 20/02', explica: 'Entrada com 2 validades (número antes de cada data)' },
  { texto: 'coloquei 5 açaí na cozinha', explica: 'Entrada na cozinha' },
  { texto: 'passei 3 leite pra cozinha', explica: 'Transferência principal → cozinha' },
  { texto: 'voltei 2 leite pro estoque', explica: 'Transferência cozinha → principal' },
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
    local: 'principal', destino: 'cozinha', lotes_add: [], lotes_remover: null, duvida_tipo: null,
  }
}

/**
 * Troca de tipo (card e editor). Saindo da transferência, o lugar vira a
 * origem dela (de onde o produto ia sair); entrando, a direção sai do lugar
 * atual. Lotes escolhidos à mão da saída deixam de valer.
 */
function mudancaTipo(item: ItemLista, tipo: TipoLancamento): Partial<ItemLista> {
  const m: Partial<ItemLista> = { tipo, duvida_tipo: null, lotes_remover: null }
  if (item.tipo === 'transferencia' && tipo !== 'transferencia') m.local = item.destino === 'cozinha' ? 'principal' : 'cozinha'
  if (tipo === 'transferencia' && item.tipo !== 'transferencia') m.destino = item.local === 'cozinha' ? 'principal' : 'cozinha'
  return m
}

/** Confere o que veio do localStorage — formato antigo/quebrado vira lista vazia. */
function listaValida(v: unknown): ItemLista[] {
  if (!Array.isArray(v)) return []
  type Antigo = ItemLista & { data_validade?: string | null; lotes_add: LoteAdd[] | null }
  return v.filter((i): i is Antigo => !!i && typeof i === 'object' && typeof (i as ItemLista).key === 'string')
    .map(({ data_validade, ...i }) => {
      // Formato antigo: data_validade (1 data = a quantidade toda) e lotes_add null.
      let lotes = Array.isArray(i.lotes_add) ? i.lotes_add : []
      if (!lotes.length && data_validade) lotes = [{ data_validade, quantidade: i.quantidade }]
      return { ...itemVazio(), ...i, lotes_add: lotes, candidatos: Array.isArray(i.candidatos) ? i.candidatos : [] }
    })
}

/** Mudou a quantidade: com 1 lote só ele acompanha (os 10 em 15/01 viram 12 em 15/01). */
function lotesComQuantidade(lotes: LoteAdd[], antiga: number, nova: number): LoteAdd[] {
  return lotes.length === 1 && (lotes[0].quantidade === antiga || lotes[0].quantidade === 0)
    ? [{ ...lotes[0], quantidade: nova }]
    : lotes
}

/** Texto da pendência de validade (card e editor). */
function textoValidade(item: ItemLista, falta: number, un: string): string {
  if (!item.lotes_add.length) return 'Informe a validade'
  if (falta > 0) return `Faltam ${falta} ${un} sem validade`
  if (falta < 0) return `Os lotes passam ${-falta} ${un} da quantidade`
  return 'Tem validade sem quantidade'
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
    if (!produto) {
      return { produto, pendencias, lotes: [], faltaValidade: 0, lotesManuaisDescartados: false, validadesAntes: [], temLotes: false, controla: true, aviso: null }
    }

    const controla = controlaValidade(produto.produtos)
    const reais = controla ? validadesPorProduto[produto.produto_id] ?? [] : []
    const temLotes = reais.length > 0
    const vals = lotesDe(produto.produto_id)
    const validadesAntes = vals.filter((v) => v.quantidade > 0).map((v) => ({ ...v }))
    const q = qtdDe(produto)
    const un = produto.produtos?.unidade ?? 'un'
    const lotes: { data: string; quantidade: number }[] = []
    const avisos: string[] = []
    let faltaValidade = 0
    let lotesManuaisDescartados = false

    if (item.tipo === 'saida') {
      const disp = item.local === 'cozinha' ? q.cozinha : q.atual - q.cozinha
      if (item.quantidade > disp) avisos.push(`${nomeLocal(item.local)} só tem ${Math.max(0, disp)} ${un}`)
      if (controla) {
        // Mesma regra do movimentacao_registrar: os lotes somam min(quantidade, total dos lotes).
        const alvo = Math.min(item.quantidade, vals.reduce((s, v) => s + v.quantidade, 0))
        const manuaisOk = !!item.lotes_remover
          && item.lotes_remover.every((r) => r.quantidade > 0 && (vals.find((v) => v.id === r.validade_id)?.quantidade ?? 0) >= r.quantidade)
          && item.lotes_remover.reduce((s, r) => s + r.quantidade, 0) === alvo
        if (item.lotes_remover && !manuaisOk) {
          lotesManuaisDescartados = true
          avisos.push('Os lotes escolhidos não batem mais — voltou para o automático (vence primeiro sai primeiro)')
        }
        if (manuaisOk) {
          for (const r of item.lotes_remover!) {
            const v = vals.find((x) => x.id === r.validade_id)!
            lotes.push({ data: v.data_validade, quantidade: r.quantidade }); v.quantidade -= r.quantidade
          }
        } else {
          // FEFO: tira do que vence antes, espalhando por quantos lotes precisar.
          let restante = item.quantidade
          for (const v of vals) {
            if (restante <= 0) break
            const tira = Math.min(v.quantidade, restante)
            if (tira > 0) { lotes.push({ data: v.data_validade, quantidade: tira }); v.quantidade -= tira; restante -= tira }
          }
        }
      }
      q.atual -= item.quantidade
      if (item.local === 'cozinha') q.cozinha -= item.quantidade
    } else if (item.tipo === 'entrada') {
      if (controla) {
        // Validade obrigatória: os lotes têm que somar a quantidade (nem menos, nem mais).
        for (const l of item.lotes_add) if (l.quantidade > 0) lotes.push({ data: l.data_validade, quantidade: l.quantidade })
        faltaValidade = item.quantidade - item.lotes_add.reduce((s, l) => s + l.quantidade, 0)
        if (!item.lotes_add.length || faltaValidade !== 0 || item.lotes_add.some((l) => !l.data_validade || l.quantidade <= 0)) {
          pendencias.push('validade')
        }
      }
      if (lotes.some((l) => diasAteVencer(l.data) < 0)) avisos.push('Validade já vencida')
      q.atual += item.quantidade
      if (item.local === 'cozinha') q.cozinha += item.quantidade
    } else if (item.tipo === 'transferencia') {
      const disp = item.destino === 'cozinha' ? q.atual - q.cozinha : q.cozinha
      if (item.quantidade > disp) avisos.push(`${nomeLocal(item.destino === 'cozinha' ? 'principal' : 'cozinha')} só tem ${Math.max(0, disp)} ${un}`)
      q.cozinha += item.destino === 'cozinha' ? item.quantidade : -item.quantidade
    }
    const aviso = avisos.length ? avisos.join(' · ') : null
    return { produto, pendencias, lotes, faltaValidade, lotesManuaisDescartados, validadesAntes, temLotes, controla, aviso }
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
  const [aviso, setAviso] = useState<{ msg: string; ok: boolean; verHistorico?: boolean } | null>(null)
  const [aba, setAba] = useState<AbaTela>('lancar')
  const [ajudaAberta, setAjudaAberta] = useState(false)
  const [editor, setEditor] = useState<{ item: ItemLista; novo: boolean } | null>(null)
  /** ModalLotes aberto: do rascunho do editor ou de um item da lista (key). */
  const [lotesDe, setLotesDe] = useState<{ editor: true } | { key: string } | null>(null)
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
    // Abre direto no histórico com ?aba=historico (recarregar mantém a aba).
    if (new URLSearchParams(window.location.search).get('aba') === 'historico') setAba('historico')
    ;(async () => {
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
    atualizar(item.key, { produto_id: produtoId, candidatos: [], lotes_remover: null })
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
      // Guardadas mesmo fora da entrada: se o tipo for trocado para Entrada, as datas do texto voltam.
      // (Só a entrada usa/envia lotes_add.)
      lotes_add: r.lotes,
      duvida_tipo: r.duvida_tipo,
      texto_fonte: t,
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
    const itens = lista.map((i, idx) => {
      const controla = controlaValidade(estoquePorId.get(i.produto_id ?? '')?.produtos)
      return {
        key: i.key,
        tipo: i.tipo,
        produto_id: i.produto_id,
        quantidade: i.quantidade,
        local: i.local,
        destino: i.destino,
        // Formato do p_lotes_add (a soma já foi conferida — senão o item estaria pendente).
        lotes_add: i.tipo === 'entrada' ? (controla ? i.lotes_add.filter((l) => l.quantidade > 0) : []) : undefined,
        // undefined = o servidor escolhe por FEFO com os lotes de agora (também quando os escolhidos não batem mais).
        lotes_remover: i.tipo === 'saida' && controla && i.lotes_remover && !analises[idx].lotesManuaisDescartados ? i.lotes_remover : undefined,
      }
    })
    // O que foi digitado (cada frase uma vez, na ordem) — só para o histórico.
    const texto = [...new Set(lista.map((i) => i.texto_fonte?.trim()).filter((t): t is string => !!t))].join('\n')
    try {
      const res = await fetch('/api/lancamento-rapido/lancar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itens, texto }),
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
        msg: (okCount ? (erros ? `${okCount} ${okCount === 1 ? 'lançado' : 'lançados'}` : 'Lançado!') : 'Nada lançado')
          + (erros ? ` · ${erros} com erro (ficaram na lista)` : ''),
        ok: erros === 0,
        // O histórico é best-effort: sem registro gravado, não oferece o link.
        verHistorico: json.log_gravado === true,
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
  function fecharEditor() {
    setEditor(null)
    setLotesDe(null)
  }
  function abrirEditor(item?: ItemLista) {
    setEditor(item ? { item: { ...item }, novo: false } : { item: itemVazio(), novo: true })
  }
  function mudarRascunho(mudanca: Partial<ItemLista>) {
    setEditor((prev) => {
      if (!prev) return prev
      const atual = prev.item
      const novo = { ...atual, ...mudanca }
      // Validades da entrada ficam; com 1 lote só ele acompanha a quantidade.
      if (novo.quantidade !== atual.quantidade && !('lotes_add' in mudanca)) {
        novo.lotes_add = lotesComQuantidade(atual.lotes_add, atual.quantidade, novo.quantidade)
      }
      // Mudou o que define a saída → os lotes escolhidos à mão não valem mais.
      if (novo.tipo !== atual.tipo || novo.produto_id !== atual.produto_id || novo.quantidade !== atual.quantidade || novo.local !== atual.local) {
        if (!('lotes_remover' in mudanca)) novo.lotes_remover = null
      }
      return { ...prev, item: novo }
    })
  }
  function salvarEditor() {
    if (!editor) return
    const it = { ...editor.item, candidatos: editor.item.produto_id ? [] : editor.item.candidatos, erro: undefined }
    if (it.tipo !== 'entrada') it.lotes_add = []
    if (it.tipo !== 'saida') it.lotes_remover = null
    const original = lista.find((i) => i.key === it.key)
    if (original?.termo && it.produto_id && it.produto_id !== original.produto_id) lembrarEscolha(original.termo, it.produto_id)
    setLista((prev) => editor.novo ? [...prev, it] : prev.map((i) => i.key === it.key ? it : i))
    fecharEditor()
  }

  // Análise do rascunho do editor na posição dele na lista (lotes já descontados).
  const analiseEditor = useMemo(() => {
    if (!editor) return null
    const idx = lista.findIndex((i) => i.key === editor.item.key)
    const base = idx >= 0 ? lista.slice(0, idx) : lista
    return analisar([...base, editor.item], estoquePorId, validadesPorProduto, perm).at(-1) ?? null
  }, [editor, lista, estoquePorId, validadesPorProduto, perm])

  const pendentes = analises.filter((a) => a.pendencias.length > 0).length

  function trocarAba(nova: AbaTela) {
    setAba(nova)
    if (nova === 'historico') setAviso(null)
    // Mantém a aba na URL sem navegar (mesmo esquema de /validades).
    window.history.replaceState(null, '', nova === 'historico' ? '/lancamento-rapido?aba=historico' : '/lancamento-rapido')
    window.scrollTo({ top: 0 })
  }

  /** "Tentar de novo" no histórico: só esse item volta para a lista (saída sempre pelo FEFO de agora). */
  function tentarDeNovo(log: ItemLog) {
    const ainda = log.produto_id && estoquePorId.has(log.produto_id)
    const item: ItemLista = {
      ...itemVazio(),
      termo: log.nome ?? '',
      tipo: log.tipo,
      produto_id: ainda ? log.produto_id : null,
      candidatos: !ainda && log.nome ? resultadosBusca(log.nome, catalogo) : [],
      quantidade: log.quantidade ?? 1,
      local: log.tipo === 'transferencia' ? (log.destino === 'principal' ? 'cozinha' : 'principal') : log.local ?? 'principal',
      destino: log.destino ?? 'cozinha',
      lotes_add: log.tipo === 'entrada' ? log.lotes.map((l) => ({ ...l })) : [],
    }
    setLista((prev) => [...prev, item])
    trocarAba('lancar')
    setAviso({ msg: `${log.nome ?? 'Item'} voltou para a lista — confira e lance de novo.`, ok: true })
  }

  if (carregando) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: D.bg }}>
      <p style={{ color: D.text2, fontSize: 14 }}>Carregando...</p>
    </div>
  )

  return (
    <Page>
      <PageHeader titulo="Lançamento rápido" subtitulo="Anota durante o dia, lança tudo de uma vez" />

      <div style={{ marginBottom: 12 }}>
        <Abas<AbaTela> ativa={aba} onMudar={trocarAba} abas={[
          { id: 'lancar', label: 'Lançar', contador: lista.length ? `${lista.length} na lista` : undefined },
          { id: 'historico', label: 'Histórico' },
        ]} />
      </div>

      {aba === 'historico' ? <Historico onTentarDeNovo={tentarDeNovo} /> : (<>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {erroCarga && <p style={{ color: '#EF4444', fontSize: 13, fontWeight: 600, margin: 0 }}>{erroCarga}</p>}
        {!perm.mov && !perm.transf && !erroCarga && (
          <p style={{ color: '#EF4444', fontSize: 13, fontWeight: 600, margin: 0 }}>Você não tem permissão de Movimentação nem de Transferência.</p>
        )}

        {lista.length === 0 ? (
          <Card style={{ padding: 18 }}>
            <span style={{ width: 48, height: 48, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-bg)', color: 'var(--accent-text)', marginBottom: 12 }}>
              <Icon nome="zap" size={24} />
            </span>
            <p style={{ color: D.text, fontSize: 16, fontWeight: 800, margin: '0 0 6px' }}>Nada anotado ainda</p>
            <p style={{ color: D.text2, fontSize: 13, margin: '0 0 12px', lineHeight: 1.45 }}>
              Escreva embaixo do jeito que falaria (dá pra usar o microfone do teclado). Nada é salvo no estoque antes de você tocar em <b>Lançar tudo</b>.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {EXEMPLOS.slice(0, 3).map((e) => (
                <button key={e.texto} type="button" onClick={() => { setTexto(e.texto); textoRef.current?.focus() }}
                  style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 12, border: `1px solid ${D.border}`, background: D.input, color: D.text, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                  “{e.texto}”
                </button>
              ))}
            </div>
          </Card>
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
            onTipo={(tipo) => atualizar(item.key, mudancaTipo(item, tipo))}
            onTrocarLugar={() => atualizar(item.key, item.tipo === 'transferencia'
              ? { destino: item.destino === 'cozinha' ? 'principal' : 'cozinha', local: item.destino }
              : { local: item.local === 'cozinha' ? 'principal' : 'cozinha', lotes_remover: null })}
            onProduto={(pid) => escolherProduto(item, pid)}
            onValidade={(data) => atualizar(item.key, { lotes_add: data ? [{ data_validade: data, quantidade: item.quantidade }] : [] })}
            onLotes={() => setLotesDe({ key: item.key })}
          />
        ))}

        <button type="button" onClick={() => abrirEditor()}
          style={{ height: 46, borderRadius: 14, border: `1px dashed ${ACCENT}`, background: 'var(--accent-bg)', color: 'var(--accent-text)', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit' }}>
          <Icon nome="plus" size={18} /> Adicionar item
        </button>

        {aviso && (
          <p style={{ margin: 0, padding: '10px 14px', borderRadius: 12, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'flex-start', gap: 6,
            background: aviso.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: aviso.ok ? '#10B981' : '#EF4444' }}>
            <Icon nome={aviso.ok ? 'tick' : 'alert'} size={16} />
            <span style={{ flex: 1, minWidth: 0 }}>
              {aviso.msg}
              {aviso.verHistorico && (
                <> <button type="button" onClick={() => trocarAba('historico')}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', font: 'inherit', fontWeight: 800, textDecoration: 'underline', cursor: 'pointer' }}>
                  Ver no histórico
                </button></>
              )}
            </span>
          </p>
        )}

        {lista.length > 0 && (
          <>
            <button type="button" onClick={lancarTudo} disabled={!completos || lancando}
              style={{ height: 52, borderRadius: 16, border: 'none', background: 'linear-gradient(135deg, #10B981, #059669)', color: '#fff', fontSize: 16, fontWeight: 800, fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: completos && !lancando ? 'pointer' : 'not-allowed', opacity: completos && !lancando ? 1 : 0.5 }}>
              <Icon nome="tick" size={20} traco={2.6} /> {lancando ? 'Lançando...' : `Lançar tudo (${lista.length})`}
            </button>
            {!completos && (
              <p style={{ color: AMARELO, fontSize: 12, fontWeight: 600, textAlign: 'center', margin: 0 }}>
                Resolva os itens em amarelo para liberar o botão.
              </p>
            )}
          </>
        )}

        {/* Espaço da caixa de texto fixa logo abaixo (só a altura dela) */}
        <div aria-hidden style={{ height: 72 }} />
      </div>

      {/* ── Caixa de texto ── */}
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 'var(--bottomnav-topo, 0px)', zIndex: 40, background: D.card, borderTop: `1px solid ${D.border}`, padding: '10px 12px calc(10px + var(--bottomnav-safe, env(safe-area-inset-bottom)))' }}>
        <form onSubmit={(e) => { e.preventDefault(); enviarTexto() }}
          style={{ maxWidth: 456, margin: '0 auto', display: 'flex', alignItems: 'flex-end', gap: 8 }}>
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
            <Icon nome="send" size={20} traco={2.2} />
          </button>
        </form>
      </div>
      </>)}

      {/* ── Ajuda: como escrever ── */}
      {ajudaAberta && (
        <Folha onFechar={() => setAjudaAberta(false)}>
          <p style={tituloFolha}>Como escrever</p>
          <p style={{ color: D.text2, fontSize: 13, margin: '0 0 12px', lineHeight: 1.45 }}>
            Toque num exemplo para usar. A palavra diz o tipo: <b style={{ color: TIPO_VIS.saida.cor }}>usei, peguei, gastei, tirei, perdi</b> = saída;{' '}
            <b style={{ color: TIPO_VIS.entrada.cor }}>chegou, recebi, comprei, coloquei</b> = entrada;{' '}
            <b style={{ color: TIPO_VIS.transferencia.cor }}>passei, levei, mandei, voltei</b> = transferência.
            Com “cozinha” (ou “coz”) entra/sai da cozinha; sem lugar, ou com estoque/depósito/freezer/câmara, é o principal.
            Dá pra trocar o lugar tocando no chip do item.
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
        <Folha onFechar={fecharEditor}>
          <EditorItem item={editor.item} novo={editor.novo} analise={analiseEditor} perm={perm} catalogo={catalogo}
            onMudar={mudarRascunho} onSalvar={salvarEditor} onCancelar={fecharEditor}
            onEscolherLotes={() => setLotesDe({ editor: true })} />
        </Folha>
      )}

      {/* ── Lotes (ModalLotes da Movimentação): do editor ou direto do card ── */}
      {lotesDe && (() => {
        const doEditor = 'editor' in lotesDe
        const idx = doEditor ? -1 : lista.findIndex((i) => i.key === lotesDe.key)
        const item = doEditor ? editor?.item : lista[idx]
        const analise = doEditor ? analiseEditor : analises[idx]
        if (!item || !analise?.produto || !analise.controla || (item.tipo !== 'saida' && item.tipo !== 'entrada')) return null
        if (!Number.isInteger(item.quantidade) || item.quantidade < 1) return null
        const aplicar = (m: Partial<ItemLista>) => doEditor ? mudarRascunho(m) : atualizar(item.key, m)
        return (
          <ModalLotes
            key={`${item.key}-${item.tipo}-${item.quantidade}`}
            produtoNome={analise.produto.produtos?.nome ?? 'Produto'}
            unidade={analise.produto.produtos?.unidade ?? 'un'}
            delta={item.tipo === 'saida' ? -item.quantidade : item.quantidade}
            validades={analise.validadesAntes}
            exigirData
            lotesIniciaisAdd={item.tipo === 'entrada' ? item.lotes_add : undefined}
            lotesIniciaisRemover={item.tipo === 'saida' && item.lotes_remover && !analise.lotesManuaisDescartados ? item.lotes_remover : undefined}
            textoAdicionar="+ outra validade"
            textoConfirmar={item.tipo === 'saida' ? 'Usar estes lotes' : 'Usar estas validades'}
            salvando={false}
            feedback={null}
            onVoltar={() => setLotesDe(null)}
            onConfirmar={(lotesAdd, lotesRemover) => {
              aplicar(item.tipo === 'saida' ? { lotes_remover: lotesRemover } : { lotes_add: lotesAdd })
              setLotesDe(null)
            }}
          />
        )
      })()}
    </Page>
  )
}

// ── Card de um item da lista ──

function CardItem({ item, analise, perm, catalogo, onEditar, onRemover, onTipo, onTrocarLugar, onProduto, onValidade, onLotes }: {
  item: ItemLista
  analise: Analise
  perm: { mov: boolean; transf: boolean }
  catalogo: ProdutoCatalogo[]
  onEditar: () => void
  onRemover: () => void
  onTipo: (t: TipoLancamento) => void
  onTrocarLugar: () => void
  onProduto: (produtoId: string) => void
  onValidade: (data: string) => void
  /** Abre o ModalLotes deste item (validades da entrada / lotes da saída). */
  onLotes: () => void
}) {
  const pend = analise.pendencias
  // Tocar no selo do tipo (SAÍDA/ENTRADA/TRANSF.) abre a troca de tipo direto no card.
  const [trocandoTipo, setTrocandoTipo] = useState(false)
  const mostrarTipos = pend.includes('tipo') || (trocandoTipo && !!item.tipo)
  // Aviso (ex.: saída maior que o lugar tem) pinta de amarelo mas não bloqueia o "Lançar tudo".
  const amarelo = pend.length > 0 || !!analise.aviso
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
    <Card style={{ background: fundo, borderColor: borda, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      {/* Linha 1: selo, produto, quantidade */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        {item.tipo ? (
          <button type="button" onClick={() => setTrocandoTipo((v) => !v)} aria-expanded={trocandoTipo} aria-label={`${selo.texto} — tocar para trocar o tipo`}
            style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 800, letterSpacing: '0.5px', padding: '3px 5px 3px 7px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: selo.cor, background: `color-mix(in srgb, ${selo.cor} 16%, transparent)` }}>
            {selo.texto}<span aria-hidden style={{ fontSize: 9 }}>{trocandoTipo ? '▴' : '▾'}</span>
          </button>
        ) : (
          <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, letterSpacing: '0.5px', padding: '3px 7px', borderRadius: 7, color: selo.cor, background: `color-mix(in srgb, ${selo.cor} 16%, transparent)` }}>
            {selo.texto}
          </span>
        )}
        <span style={{ flex: 1, minWidth: 0, color: D.text, fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {nome ?? `“${item.termo || item.texto_original || 'produto'}”`}
        </span>
        <span style={{ flexShrink: 0, color: vis?.cor ?? D.text, fontSize: 24, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {vis?.sinal}{item.quantidade}{un && <span style={{ fontSize: 11, fontWeight: 700, color: D.text2 }}> {un}</span>}
        </span>
      </div>

      {/* Pendências */}
      {mostrarTipos && (
        <div>
          <p style={textoPend}>{pend.includes('tipo') ? item.duvida_tipo ?? 'É entrada, saída ou transferência?' : 'Trocar o tipo:'}</p>
          <SeletorTipo atual={item.tipo} perm={perm} onEscolher={(t) => { onTipo(t); setTrocandoTipo(false) }} />
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
          <p style={{ ...textoPend, color: AMARELO }}>{textoValidade(item, analise.faltaValidade, un || 'un')}</p>
          {item.lotes_add.length === 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <input type="date" value="" onChange={(e) => onValidade(e.target.value)} aria-label="Validade (a quantidade toda)" style={{ ...campo, width: 'auto', flex: '1 1 160px', maxWidth: 220 }} />
              <button type="button" onClick={onLotes} style={{ ...botaoLink, color: 'var(--accent-text)' }}>+ outra validade</button>
            </div>
          ) : (
            <button type="button" onClick={onLotes} style={{ ...botaoEscolha, color: 'var(--accent-text)' }}>Completar validades →</button>
          )}
        </div>
      )}
      {pend.includes('quantidade') && <p style={{ ...textoPend, color: '#EF4444' }}>Quantidade inválida — toque em editar.</p>}

      {/* Linha 2: local + lotes, editar, remover */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5, color: D.text2, fontSize: 12.5 }}>
          <Detalhes item={item} analise={analise} onTrocarLugar={onTrocarLugar} onLotes={onLotes} />
        </div>
        <button type="button" onClick={onEditar} style={{ ...botaoLink, color: 'var(--accent-text)' }}>editar</button>
        <button type="button" aria-label="Remover item" onClick={onRemover} style={{ ...botaoLink, color: D.text2, display: 'flex', padding: 6 }}><Icon nome="close" size={16} /></button>
      </div>

      {item.texto_original && (
        <p style={{ margin: 0, color: D.muted, fontSize: 11.5, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          “{item.texto_original}”
        </p>
      )}
      {analise.aviso && <p style={{ margin: 0, color: AMARELO, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'flex-start', gap: 6 }}><Icon nome="alert" size={15} /> {analise.aviso}</p>}
      {item.erro && <p style={{ margin: 0, color: '#EF4444', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'flex-start', gap: 6 }}><Icon nome="alert" size={15} /> {item.erro}</p>}
    </Card>
  )
}

/** Saída / Entrada / Transf. — o atual fica pintado. Sem permissão: desabilitado e com o motivo. */
function SeletorTipo({ atual, perm, onEscolher }: { atual: TipoLancamento | null; perm: { mov: boolean; transf: boolean }; onEscolher: (t: TipoLancamento) => void }) {
  const tipos: TipoLancamento[] = ['saida', 'entrada', 'transferencia']
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
        {tipos.map((t) => {
          const ativo = atual === t
          const permitido = t === 'transferencia' ? perm.transf : perm.mov
          const cor = TIPO_VIS[t].cor
          return (
            <button key={t} type="button" disabled={!permitido} aria-pressed={ativo} onClick={() => onEscolher(t)}
              style={{ ...botaoEscolha, color: ativo ? '#fff' : cor, background: ativo ? cor : 'transparent', borderColor: ativo ? cor : `color-mix(in srgb, ${cor} 45%, transparent)`, opacity: permitido ? 1 : 0.35, cursor: permitido ? 'pointer' : 'not-allowed' }}>
              {TIPO_VIS[t].nome}
            </button>
          )
        })}
      </div>
      {(!perm.mov || !perm.transf) && (
        <p style={{ ...textoPend, margin: '6px 0 0', color: D.muted }}>
          Sem permissão para {!perm.mov && !perm.transf ? 'nenhum tipo' : !perm.mov ? 'entrada/saída' : 'transferência'} — peça ao admin.
        </p>
      )}
    </>
  )
}

function Detalhes({ item, analise, onTrocarLugar, onLotes }: { item: ItemLista; analise: Analise; onTrocarLugar: () => void; onLotes: () => void }) {
  const lugar = <ChipLugar item={item} onTrocar={onTrocarLugar} />
  if (!item.tipo || item.tipo === 'transferencia' || !analise.produto) return lugar
  // Lotes/validades: tocar abre o ModalLotes (só produto que controla validade).
  const tocavel = analise.controla && (item.tipo === 'entrada' || analise.temLotes)
  const chips = item.tipo === 'entrada' && analise.lotes.length === 1
    ? <Chip>{formatarData(analise.lotes[0].data)}</Chip>
    : analise.lotes.map((l, i) => <Chip key={i}>{formatarData(l.data, false)} · {l.quantidade}</Chip>)
  const rotulo = item.tipo === 'saida'
    ? (analise.lotes.length ? (analise.lotes.length === 1 ? 'lote' : 'lotes') : analise.temLotes ? 'sem lote disponível' : 'sem lote')
    : (analise.lotes.length > 1 ? 'validades' : analise.lotes.length ? 'validade' : 'sem validade')
  return (
    <>
      {lugar}
      {tocavel ? (
        <button type="button" onClick={onLotes} aria-label={item.tipo === 'saida' ? 'Escolher lotes' : 'Editar validades'}
          style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 5, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: D.text2, fontSize: 12.5, fontFamily: 'inherit', textAlign: 'left' }}>
          <span>{rotulo}</span>{chips}<Icon nome="edit" size={13} />
        </button>
      ) : (
        <><span>{rotulo}</span>{chips}</>
      )}
    </>
  )
}

/** Onde entra/sai ("Cozinha") ou a direção ("Principal → Cozinha"); tocar troca. */
function ChipLugar({ item, onTrocar }: { item: ItemLista; onTrocar: () => void }) {
  const texto = item.tipo === 'transferencia'
    ? `${nomeLocal(item.destino === 'cozinha' ? 'principal' : 'cozinha')} → ${nomeLocal(item.destino)}`
    : nomeLocal(item.local)
  const cozinha = item.tipo === 'transferencia' ? item.destino === 'cozinha' : item.local === 'cozinha'
  return (
    <button type="button" onClick={onTrocar} aria-label={`${texto} — tocar para trocar`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
        fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
        border: `1px solid ${cozinha ? 'rgba(249,115,22,0.45)' : D.border}`,
        background: cozinha ? 'rgba(249,115,22,0.12)' : D.input, color: cozinha ? '#F97316' : D.text }}>
      {texto} <Icon nome="leftRight" size={12} traco={2.4} />
    </button>
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
        <SeletorTipo atual={item.tipo} perm={perm} onEscolher={(t) => onMudar(mudancaTipo(item, t))} />
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
          <button type="button" onClick={() => onMudar({ quantidade: Math.max(1, item.quantidade - 1) })} style={botaoQtd} aria-label="Diminuir"><Icon nome="minus" size={18} traco={2.6} /></button>
          <input type="number" min="1" step="1" inputMode="numeric" value={Number.isFinite(item.quantidade) && item.quantidade > 0 ? item.quantidade : ''}
            onChange={(e) => onMudar({ quantidade: Math.floor(Number(e.target.value)) })}
            style={{ ...campo, textAlign: 'center', fontWeight: 800, fontSize: 18 }} />
          <button type="button" onClick={() => onMudar({ quantidade: (item.quantidade || 0) + 1 })} style={botaoQtd} aria-label="Aumentar"><Icon nome="plus" size={18} traco={2.6} /></button>
        </div>
      </div>

      {item.tipo === 'entrada' && (
        <div>
          <label style={rotulo}>Entra onde?</label>
          <Segmento opcoes={[['principal', 'Principal'], ['cozinha', 'Cozinha']]} valor={item.local} onMudar={(v) => onMudar({ local: v as Local })} />
        </div>
      )}
      {item.tipo === 'saida' && (
        <div>
          <label style={rotulo}>Sai de onde?</label>
          <Segmento opcoes={[['principal', 'Principal'], ['cozinha', 'Cozinha']]} valor={item.local} onMudar={(v) => onMudar({ local: v as Local })} />
        </div>
      )}
      {item.tipo === 'transferencia' && (
        <div>
          <label style={rotulo}>Direção</label>
          <Segmento opcoes={[['cozinha', 'Principal → Cozinha'], ['principal', 'Cozinha → Principal']]} valor={item.destino} onMudar={(v) => onMudar({ destino: v as Local, local: v === 'cozinha' ? 'principal' : 'cozinha' })} />
        </div>
      )}

      {item.tipo === 'entrada' && produto && analise.controla && (
        <div>
          <label style={rotulo}>Validade</label>
          {item.lotes_add.length === 0 || (item.lotes_add.length === 1 && item.lotes_add[0].quantidade === item.quantidade) ? (
            // Uma data só = a quantidade toda nessa data.
            <input type="date" value={item.lotes_add[0]?.data_validade ?? ''}
              onChange={(e) => onMudar({ lotes_add: e.target.value ? [{ data_validade: e.target.value, quantidade: item.quantidade }] : [] })}
              style={{ ...campo, maxWidth: 220 }} />
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {item.lotes_add.map((l, i) => <Chip key={i}>{formatarData(l.data_validade, false)} · {l.quantidade || '?'}</Chip>)}
              <button type="button" onClick={() => onMudar({ lotes_add: [] })} style={{ ...botaoLink, color: D.text2 }}>limpar</button>
            </div>
          )}
          {analise.pendencias.includes('validade') && (
            <p style={{ margin: '6px 0 0 2px', color: AMARELO, fontSize: 12, fontWeight: 700 }}>{textoValidade(item, analise.faltaValidade, un)}</p>
          )}
          <button type="button" onClick={onEscolherLotes} disabled={!podeSalvar} style={{ ...botaoLink, color: 'var(--accent-text)', marginTop: 8, padding: 0 }}>
            + outra validade / somar num lote existente →
          </button>
        </div>
      )}

      {item.tipo === 'saida' && produto && analise.temLotes && (
        <div>
          <label style={rotulo}>Lotes {item.lotes_remover && !analise.lotesManuaisDescartados ? '(escolhidos)' : '(o que vence primeiro sai primeiro)'}</label>
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

      {analise.aviso && <p style={{ margin: 0, color: AMARELO, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'flex-start', gap: 6 }}><Icon nome="alert" size={15} /> {analise.aviso}</p>}

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
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
