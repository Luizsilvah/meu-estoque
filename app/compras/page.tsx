'use client'
// Tela Compras — junta o antigo Checklist e o Compras da quinta. Fonte única:
// /api/previsao-compras (vw_previsao_compras). /checklist e /compras-quinta
// redirecionam para cá.
import { useCallback, useEffect, useMemo, useState } from 'react'
import Page from '@/app/components/ui/Page'
import PageHeader from '@/app/components/ui/PageHeader'
import Card from '@/app/components/ui/Card'
import Chips from '@/app/components/ui/Chips'
import Icon from '@/app/components/ui/Icon'

import { D } from '@/app/lib/theme'
import { useRecarregarAoVoltar } from '@/app/lib/useRecarregarAoVoltar'
import type { ItemPrevisaoCompra } from '@/app/api/previsao-compras/route'

type Situacao = 'CRITICO' | 'ACABA_ANTES' | 'QUINTA'
type Filtro = 'todos' | 'critico' | 'quinta'
type Item = ItemPrevisaoCompra & { situacao: Situacao; comprar: number }
type Grupo = { fornecedor: string; itens: Item[] }

const SITUACAO: Record<Situacao, { texto: string; cor: string; ordem: number }> = {
  CRITICO:     { texto: 'Crítico',               cor: '#EF4444', ordem: 0 },
  ACABA_ANTES: { texto: 'Acaba antes da quinta', cor: '#F97316', ordem: 1 },
  QUINTA:      { texto: 'Comprar na quinta',     cor: '#F59E0B', ordem: 2 },
}

// Crítico = já está no mínimo ou abaixo. Acaba antes = o consumo zera o
// estoque antes da próxima quinta. O resto que a view manda comprar = quinta.
function situacaoDe(i: ItemPrevisaoCompra): Situacao {
  if (i.status === 'CRITICO') return 'CRITICO'
  return Number(i.estoque_previsto) <= 0 ? 'ACABA_ANTES' : 'QUINTA'
}

// qtd_sugerida da view = ceil(consumo × (dias até a quinta + 7) + mínimo − atual),
// nunca negativa. Item crítico com máximo cadastrado completa até o máximo,
// se isso for mais que a sugestão (evita "comprar 0" em item parado no mínimo).
function quantoComprar(i: ItemPrevisaoCompra): number {
  const sugerida = Math.max(0, Number(i.qtd_sugerida))
  if (i.status === 'CRITICO' && Number(i.qtd_max) > 0) {
    return Math.max(sugerida, Math.ceil(Number(i.qtd_max) - Number(i.qtd_atual)))
  }
  return sugerida
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const NUM = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

const valorItem = (i: Item) => (i.preco_custo != null ? i.comprar * Number(i.preco_custo) : null)

// "Tem 3 kg · gasta ~2 por semana · mínimo 5 → comprar 6"
function motivo(i: Item): string {
  const porSemana = Number(i.consumo_medio_diario) * 7
  const gasto = porSemana > 0 ? `gasta ~${NUM.format(porSemana)} por semana` : 'sem saída no último mês'
  return `Tem ${NUM.format(Number(i.qtd_atual))} ${i.unidade} · ${gasto} · mínimo ${NUM.format(Number(i.estoque_minimo))} → comprar ${i.comprar}`
}

// Mesma mensagem que o Checklist mandava
function gerarMensagem(grupos: Grupo[], pedidos: Set<string>, apenasNaoMarcados: boolean): string {
  const linhas: string[] = ['📋 *Pedido de compras*', '']
  for (const g of grupos) {
    const itens = apenasNaoMarcados ? g.itens.filter((i) => !pedidos.has(i.produto_id)) : g.itens
    if (itens.length === 0) continue
    linhas.push(`*${g.fornecedor.toUpperCase()}*`)
    for (const item of itens) linhas.push(`• ${item.nome} — pedir ${item.comprar} ${item.unidade}`)
    linhas.push('')
  }
  return linhas.join('\n').trim()
}

function compartilharWhatsApp(texto: string) {
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank')
}

// ── "Já pedi": guardado no aparelho, por semana de compra ───────────────────
// A chave é a data da próxima quinta (mesma conta da view: na quinta já conta a
// seguinte), então as marcações zeram sozinhas quando a quinta chega.
const PREFIXO = 'compras:pedidos:'

function chaveDaSemana(diasAteQuinta: number): string {
  // "Hoje" no fuso da view (America/Bahia), em YYYY-MM-DD
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bahia' }).format(new Date())
  const d = new Date(`${hoje}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + diasAteQuinta)
  return PREFIXO + d.toISOString().slice(0, 10)
}

function lerPedidos(chave: string): Set<string> {
  try {
    // Limpa semanas antigas
    for (let n = localStorage.length - 1; n >= 0; n--) {
      const k = localStorage.key(n)
      if (k?.startsWith(PREFIXO) && k !== chave) localStorage.removeItem(k)
    }
    const salvo = JSON.parse(localStorage.getItem(chave) ?? '[]')
    return new Set(Array.isArray(salvo) ? salvo : [])
  } catch { return new Set() }
}

function gravarPedidos(chave: string, pedidos: Set<string>) {
  try { localStorage.setItem(chave, JSON.stringify([...pedidos])) } catch { /* sem storage: fica só na tela */ }
}

const WA_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
)

const estiloBotaoTopo: React.CSSProperties = {
  flexShrink: 0, height: 44, borderRadius: 14, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit',
}

export default function Compras() {
  const [itens, setItens] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [chave, setChave] = useState<string | null>(null)
  const [pedidos, setPedidos] = useState<Set<string>>(new Set())
  const [copiado, setCopiado] = useState(false)

  // Recarrega ao abrir e sempre que a tela volta a ficar visível
  const carregar = useCallback(() => {
    fetch('/api/previsao-compras', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        if (!Array.isArray(json)) { setErro(json?.erro ?? 'Erro ao carregar'); return }
        const lista = (json as ItemPrevisaoCompra[])
          .filter((i) => i.status === 'CRITICO' || i.status === 'COMPRAR_QUINTA')
          .map((i) => ({ ...i, situacao: situacaoDe(i), comprar: quantoComprar(i) }))
        setErro('')
        setItens(lista)
        const dias = (json as ItemPrevisaoCompra[])[0]?.dias_ate_quinta
        if (dias != null) setChave(chaveDaSemana(Number(dias)))
      })
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false))
  }, [])
  useRecarregarAoVoltar(carregar)

  // Troca de semana (ou primeira carga) → lê as marcações daquela quinta
  useEffect(() => { if (chave) setPedidos(lerPedidos(chave)) }, [chave])

  function atualizarPedidos(fn: (atual: Set<string>) => void) {
    setPedidos((prev) => {
      const novo = new Set(prev)
      fn(novo)
      if (chave) gravarPedidos(chave, novo)
      return novo
    })
  }

  const toggleItem = (id: string) => atualizarPedidos((s) => { if (s.has(id)) s.delete(id); else s.add(id) })
  const toggleGrupo = (g: Grupo, marcar: boolean) =>
    atualizarPedidos((s) => { for (const i of g.itens) { if (marcar) s.add(i.produto_id); else s.delete(i.produto_id) } })

  const visiveis = useMemo(() => itens.filter((i) =>
    filtro === 'todos' ? true : filtro === 'critico' ? i.situacao !== 'QUINTA' : i.situacao === 'QUINTA'
  ), [itens, filtro])

  const grupos = useMemo<Grupo[]>(() => {
    const mapa: Record<string, Item[]> = {}
    for (const item of visiveis) (mapa[item.fornecedor ?? 'Sem fornecedor'] ??= []).push(item)
    return Object.entries(mapa)
      .map(([fornecedor, lista]) => ({
        fornecedor,
        itens: lista.sort((a, b) => SITUACAO[a.situacao].ordem - SITUACAO[b.situacao].ordem || a.nome.localeCompare(b.nome, 'pt-BR')),
      }))
      .sort((a, b) => a.fornecedor.localeCompare(b.fornecedor, 'pt-BR'))
  }, [visiveis])

  const qtdCritico = itens.filter((i) => i.situacao !== 'QUINTA').length
  const qtdQuinta = itens.length - qtdCritico
  const pendentes = visiveis.filter((i) => !pedidos.has(i.produto_id)).length

  // Total só aparece se algum item tiver preço — nunca "R$ 0,00" por falta de cadastro
  const comPreco = visiveis.filter((i) => i.preco_custo != null)
  const totalEstimado = comPreco.reduce((s, i) => s + (valorItem(i) ?? 0), 0)
  const semPreco = visiveis.length - comPreco.length

  async function copiarLista() {
    try {
      await navigator.clipboard.writeText(gerarMensagem(grupos, pedidos, true))
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch { /* clipboard pode ser bloqueado — ignora silenciosamente */ }
  }

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: D.bg }}><p style={{ color: D.text2, fontSize: 14 }}>Carregando...</p></div>
  if (erro && itens.length === 0) return <div style={{ minHeight: '100vh', padding: 24, background: D.bg }}><p style={{ color: '#EF4444', fontWeight: 700 }}>Erro: {erro}</p></div>

  return (
    <Page>
      <PageHeader
        titulo="Compras"
        subtitulo={itens.length === 0 ? 'Tudo certo até a próxima quinta' : `${pendentes} de ${visiveis.length} ${visiveis.length === 1 ? 'item pendente' : 'itens pendentes'}`}
        acao={pendentes > 0 ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={copiarLista} aria-label="Copiar lista"
              style={{ ...estiloBotaoTopo, width: 44, background: D.card, border: `1px solid ${D.border}`, color: copiado ? '#10B981' : D.text2 }}>
              <Icon nome={copiado ? 'tick' : 'list'} size={18} />
            </button>
            <button onClick={() => compartilharWhatsApp(gerarMensagem(grupos, pedidos, true))} aria-label="Compartilhar no WhatsApp"
              style={{ ...estiloBotaoTopo, padding: '0 14px', background: '#25D366', color: '#fff' }}>
              {WA_ICON} WhatsApp
            </button>
          </div>
        ) : undefined}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {itens.length === 0 && (
          <Card style={{ background: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.25)', padding: 24, textAlign: 'center' }}>
            <span style={{ display: 'inline-flex', color: '#10B981' }}><Icon nome="check" size={32} /></span>
            <p style={{ color: '#10B981', fontWeight: 800, fontSize: 15, margin: '8px 0 0' }}>Tudo certo</p>
            <p style={{ color: D.text2, fontSize: 13, margin: '4px 0 0' }}>Nada precisa ser comprado até a próxima quinta.</p>
          </Card>
        )}

        {itens.length > 0 && (
          <Chips itens={[
            { chave: 'todos', label: `Todos · ${itens.length}`, ativo: filtro === 'todos', onClick: () => setFiltro('todos') },
            { chave: 'critico', label: `Crítico · ${qtdCritico}`, ativo: filtro === 'critico', onClick: () => setFiltro('critico') },
            { chave: 'quinta', label: `Quinta · ${qtdQuinta}`, ativo: filtro === 'quinta', onClick: () => setFiltro('quinta') },
          ]} />
        )}

        {comPreco.length > 0 && (
          <Card style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px' }}>
            <span style={{ width: 48, height: 48, borderRadius: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239,68,68,0.14)', color: '#EF4444' }}>
              <Icon nome="cart" size={24} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: D.text2, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>Total estimado</p>
              <p style={{ color: D.text, fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', margin: '2px 0 0', overflowWrap: 'anywhere', lineHeight: 1.1 }}>{BRL.format(totalEstimado)}</p>
              {semPreco > 0 && (
                <p style={{ color: '#F59E0B', fontSize: 12, fontWeight: 600, margin: '4px 0 0' }}>
                  {semPreco} {semPreco === 1 ? 'item sem preço cadastrado' : 'itens sem preço cadastrado'}
                </p>
              )}
            </div>
          </Card>
        )}

        {itens.length > 0 && visiveis.length === 0 && (
          <Card style={{ padding: 20, textAlign: 'center' }}>
            <p style={{ color: D.text2, fontSize: 14, fontWeight: 600, margin: 0 }}>Nenhum item neste filtro.</p>
          </Card>
        )}

        {grupos.map((grupo) => {
          const marcados = grupo.itens.filter((i) => pedidos.has(i.produto_id)).length
          const todosMarcados = marcados === grupo.itens.length
          const algumMarcado = marcados > 0
          const precos = grupo.itens.filter((i) => i.preco_custo != null)
          const subtotal = precos.reduce((s, i) => s + (valorItem(i) ?? 0), 0)

          return (
            <Card key={grupo.fornecedor}>
              {/* Cabeçalho do fornecedor */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px 10px 16px', background: D.input, borderBottom: `1px solid ${D.border}` }}>
                <button onClick={() => toggleGrupo(grupo, !todosMarcados)} aria-label={todosMarcados ? 'Desmarcar todos' : 'Marcar todos'}
                  style={{
                    flexShrink: 0, width: 24, height: 24, borderRadius: 7, padding: 0, cursor: 'pointer',
                    border: `2px solid ${algumMarcado ? '#6366F1' : D.border}`,
                    background: todosMarcados ? '#6366F1' : algumMarcado ? 'var(--accent-bg)' : 'transparent',
                    color: todosMarcados ? '#fff' : 'var(--accent-text)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                  {todosMarcados && <Icon nome="tick" size={15} traco={3} />}
                  {algumMarcado && !todosMarcados && <Icon nome="minus" size={15} traco={3} />}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: D.text, fontWeight: 800, fontSize: 14, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{grupo.fornecedor}</p>
                  <p style={{ color: D.text2, fontWeight: 600, fontSize: 12, margin: '2px 0 0' }}>
                    {marcados}/{grupo.itens.length} pedidos{precos.length > 0 ? ` · ${BRL.format(subtotal)}` : ''}
                  </p>
                </div>
                <button onClick={() => compartilharWhatsApp(gerarMensagem([grupo], pedidos, false))} aria-label={`Compartilhar pedido de ${grupo.fornecedor} no WhatsApp`}
                  style={{ flexShrink: 0, height: 32, padding: '0 10px', borderRadius: 10, background: '#25D366', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
                  {WA_ICON} WA
                </button>
              </div>

              {/* Itens */}
              {grupo.itens.map((item, idx) => {
                const info = SITUACAO[item.situacao]
                const marcado = pedidos.has(item.produto_id)
                return (
                  <button key={item.produto_id} onClick={() => toggleItem(item.produto_id)} role="checkbox" aria-checked={marcado}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'none', border: 'none',
                      borderTop: idx > 0 ? `1px solid ${D.border}` : 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                    }}>
                    <span style={{
                      flexShrink: 0, width: 24, height: 24, borderRadius: 7, border: `2px solid ${marcado ? '#10B981' : D.border}`,
                      background: marcado ? '#10B981' : 'transparent', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {marcado && <Icon nome="tick" size={15} traco={3} />}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, opacity: marcado ? 0.5 : 1 }}>
                      <span style={{ display: 'block', fontSize: 15, fontWeight: 800, color: D.text, textDecoration: marcado ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.nome}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: info.cor, fontSize: 12, fontWeight: 700, marginTop: 3 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
                        {info.texto}
                      </span>
                      <span style={{ display: 'block', fontSize: 12, color: D.text2, marginTop: 4, lineHeight: 1.4 }}>{motivo(item)}</span>
                    </span>
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, opacity: marcado ? 0.5 : 1 }}>
                      <span style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, color: info.cor, fontVariantNumeric: 'tabular-nums' }}>{item.comprar}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: D.text2, marginTop: 3 }}>comprar · {item.unidade}</span>
                      {item.preco_custo != null && (
                        <span style={{ fontSize: 12, fontWeight: 700, color: D.text, marginTop: 2 }}>{BRL.format(valorItem(item) ?? 0)}</span>
                      )}
                    </span>
                  </button>
                )
              })}
            </Card>
          )
        })}
      </div>
    </Page>
  )
}
