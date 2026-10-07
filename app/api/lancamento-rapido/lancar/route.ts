// Endpoint POST /api/lancamento-rapido/lancar — lança a lista do Lançamento
// rápido (app/lancamento-rapido). Cada item é independente e roda na ordem,
// um por um, pelas mesmas funções do banco das outras telas:
//   entrada/saída  → movimentacao_registrar (quantidade + lotes numa transação)
//   transferência  → estoque_transferir
// Nada vem confiado do cliente: a permissão é conferida por item (entrada/saída
// → 'movimentacao'; transferência → 'transferencia') e produto, quantidade e
// lotes são validados aqui antes de chamar a função.
//
// Saída sem lotes escolhidos à mão ("lotes_remover" ausente) usa FEFO calculado
// aqui com os lotes atuais do banco — assim dois itens do mesmo produto na mesma
// lista não tentam tirar do mesmo lote já consumido.
import { createSupabaseServer } from '@/app/lib/supabase-server'
import { createSupabaseAdmin } from '@/app/lib/supabase-admin'
import { FUNCOES, podeAcessar } from '@/app/lib/permissoes'

type LoteAdd = { data_validade: string; quantidade: number }
type LoteRemover = { validade_id: string; quantidade: number }

type ItemBody = {
  key?: unknown
  tipo?: unknown
  produto_id?: unknown
  quantidade?: unknown
  local?: unknown
  destino?: unknown
  lotes_add?: unknown
  lotes_remover?: unknown
}

type Resultado = { key: string; ok: boolean; erro?: string }

const MAX_ITENS = 100
const MAX_QTD = 100000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function inteiroPositivo(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isInteger(n) && n > 0 && n <= MAX_QTD ? n : null
}

function dataValida(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(s + 'T00:00:00')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

function lerLotesAdd(v: unknown): LoteAdd[] | string {
  if (v == null) return []
  if (!Array.isArray(v)) return 'Lotes inválidos'
  const lotes: LoteAdd[] = []
  for (const l of v) {
    const quantidade = inteiroPositivo(l?.quantidade)
    if (!dataValida(l?.data_validade) || quantidade == null) return 'Lote com data ou quantidade inválida'
    lotes.push({ data_validade: l.data_validade, quantidade })
  }
  return lotes
}

function lerLotesRemover(v: unknown): LoteRemover[] | string {
  if (!Array.isArray(v)) return 'Lotes inválidos'
  const lotes: LoteRemover[] = []
  for (const l of v) {
    const quantidade = inteiroPositivo(l?.quantidade)
    if (typeof l?.validade_id !== 'string' || !UUID.test(l.validade_id) || quantidade == null) return 'Lote inválido'
    lotes.push({ validade_id: l.validade_id, quantidade })
  }
  return lotes
}

export async function POST(request: Request) {
  const server = await createSupabaseServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })

  let body: { itens?: unknown }
  try { body = await request.json() } catch {
    return Response.json({ erro: 'Body inválido' }, { status: 400 })
  }
  const itens = body.itens
  if (!Array.isArray(itens) || itens.length === 0) return Response.json({ erro: 'Nenhum item para lançar' }, { status: 400 })
  if (itens.length > MAX_ITENS) return Response.json({ erro: `No máximo ${MAX_ITENS} itens por vez` }, { status: 400 })

  const supabase = createSupabaseAdmin()

  const { data: perfil } = await supabase.from('perfis').select('nome, perfil, permissoes').eq('id', user.id).maybeSingle()
  const usuarioNome = perfil?.nome ?? user.email?.split('@')[0] ?? null
  const pode = (id: string) => {
    const f = FUNCOES.find((x) => x.id === id)
    return !!f && podeAcessar(f, perfil?.perfil, perfil?.permissoes)
  }
  const podeMov = pode('movimentacao')
  const podeTransf = pode('transferencia')

  const resultados: Resultado[] = []
  const atingiramMinimo: { produto_id: string; qtd: number; base: number }[] = []

  for (let i = 0; i < itens.length; i++) {
    const item = (itens[i] ?? {}) as ItemBody
    const key = typeof item.key === 'string' ? item.key : String(i)
    const falhar = (erro: string) => resultados.push({ key, ok: false, erro })

    const tipo = item.tipo
    if (tipo !== 'entrada' && tipo !== 'saida' && tipo !== 'transferencia') { falhar('Tipo inválido'); continue }
    if (tipo === 'transferencia' ? !podeTransf : !podeMov) {
      falhar(`Sem permissão para ${tipo === 'transferencia' ? 'transferência' : 'movimentação'}`); continue
    }
    const produtoId = item.produto_id
    if (typeof produtoId !== 'string' || !UUID.test(produtoId)) { falhar('Produto inválido'); continue }
    const quantidade = inteiroPositivo(item.quantidade)
    if (quantidade == null) { falhar('Quantidade inválida'); continue }

    try {
      if (tipo === 'transferencia') {
        const destino = item.destino === 'principal' ? 'principal' : item.destino === 'cozinha' ? 'cozinha' : null
        if (!destino) { falhar('Destino inválido'); continue }
        const { error } = await supabase
          .rpc('estoque_transferir', { p_produto_id: produtoId, p_quantidade: quantidade, p_direction: destino })
          .single()
        if (error) { falhar(error.code === 'ESTK1' ? 'Produto não encontrado' : error.message); continue }
        resultados.push({ key, ok: true })
        continue
      }

      const local = item.local === 'cozinha' ? 'cozinha' : 'principal'
      let lotesAdd: LoteAdd[] = []
      let lotesRemover: LoteRemover[] = []
      if (tipo === 'entrada') {
        const lidos = lerLotesAdd(item.lotes_add)
        if (typeof lidos === 'string') { falhar(lidos); continue }
        lotesAdd = lidos
      } else if (item.lotes_remover != null) {
        const lidos = lerLotesRemover(item.lotes_remover)
        if (typeof lidos === 'string') { falhar(lidos); continue }
        lotesRemover = lidos
      } else {
        // FEFO com os lotes de agora (mesma regra do ModalLotes).
        const { data: lotes, error } = await supabase
          .from('validades').select('id, quantidade').eq('produto_id', produtoId)
          .order('data_validade', { ascending: true }).order('id', { ascending: true })
        if (error) { falhar('Erro ao ler os lotes'); continue }
        let restante = quantidade
        for (const l of lotes ?? []) {
          if (restante <= 0) break
          const tira = Math.min(l.quantidade, restante)
          if (tira > 0) lotesRemover.push({ validade_id: l.id, quantidade: tira })
          restante -= tira
        }
      }

      const { data, error } = await supabase
        .rpc('movimentacao_registrar', {
          p_produto_id: produtoId,
          p_tipo: tipo,
          p_quantidade: quantidade,
          // Saída da cozinha também baixa qtd_cozinha; entrada vai sempre pro principal.
          p_delta_cozinha: tipo === 'saida' && local === 'cozinha' ? -quantidade : 0,
          p_lotes_add: lotesAdd,
          p_lotes_remover: lotesRemover,
          p_usuario_id: user.id,
          p_usuario_nome: usuarioNome,
        })
        .single<{ qtd_atual: number; qtd_cozinha: number; qtd_base: number | null }>()
      if (error || !data) { falhar(error?.code === 'ESTK1' ? 'Produto não encontrado' : error?.message ?? 'Erro ao lançar'); continue }
      if (tipo === 'saida' && data.qtd_atual <= (data.qtd_base ?? 0)) {
        atingiramMinimo.push({ produto_id: produtoId, qtd: data.qtd_atual, base: data.qtd_base ?? 0 })
      }
      resultados.push({ key, ok: true })
    } catch {
      falhar('Erro inesperado ao lançar')
    }
  }

  // Mesmo aviso de estoque baixo da Movimentação (best-effort, não segura a resposta).
  if (atingiramMinimo.length) void avisarEstoqueBaixo(supabase, atingiramMinimo)

  return Response.json({ resultados })
}

async function avisarEstoqueBaixo(supabase: ReturnType<typeof createSupabaseAdmin>, itens: { produto_id: string; qtd: number; base: number }[]) {
  try {
    const webpush = (await import('web-push')).default
    webpush.setVapidDetails(process.env.VAPID_CONTACT!, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!)
    const { data: subs } = await supabase.from('push_subscriptions').select('subscription')
    if (!subs?.length) return
    const { data: prods } = await supabase.from('produtos').select('id, nome').in('id', itens.map((i) => i.produto_id))
    const nomes = new Map((prods ?? []).map((p) => [p.id, p.nome]))
    // Um aviso por produto (o último estado dele na lista).
    const porProduto = new Map(itens.map((i) => [i.produto_id, i]))
    for (const i of porProduto.values()) {
      const payload = JSON.stringify({
        title: 'Estoque baixo',
        body: `${nomes.get(i.produto_id) ?? 'Produto'} atingiu ${i.qtd} unidades (mínimo: ${i.base})`,
        icon: '/icon-192.png',
        url: '/estoque',
      })
      await Promise.allSettled(subs.map((s) => webpush.sendNotification(s.subscription, payload)))
    }
  } catch { /* notificação é best-effort */ }
}
