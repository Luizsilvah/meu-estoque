'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

import { D } from '@/app/lib/theme'
import type { ItemPrevisaoCompra } from '@/app/api/previsao-compras/route'

type Grupo = { fornecedor: string; itens: ItemPrevisaoCompra[] }

const STATUS_INFO = {
  CRITICO:        { emoji: '🔴', texto: 'Crítico',        cor: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
  COMPRAR_QUINTA: { emoji: '🟡', texto: 'Comprar na quinta', cor: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  OK:             { emoji: '🟢', texto: 'OK',              cor: '#10B981', bg: 'rgba(16,185,129,0.12)' },
} as const

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const reais = (v: number) => BRL.format(v)

// Valor do item = qtd_sugerida × preco_custo; null quando não há preço cadastrado
function valorItem(item: ItemPrevisaoCompra): number | null {
  return item.preco_custo != null ? Number(item.qtd_sugerida) * Number(item.preco_custo) : null
}

// Soma só os itens com preço; os sem preço ficam de fora
function somar(itens: ItemPrevisaoCompra[]): number {
  return itens.reduce((s, i) => s + (valorItem(i) ?? 0), 0)
}

function gerarMensagem(grupos: Grupo[]): string {
  const linhas: string[] = ['🗓️ *Lista de compras — quinta-feira*', '']
  for (const g of grupos) {
    if (g.itens.length === 0) continue
    linhas.push(`*${g.fornecedor.toUpperCase()}* — ${reais(somar(g.itens))}`)
    for (const item of g.itens) {
      const info = STATUS_INFO[item.status]
      const valor = valorItem(item)
      linhas.push(`${info.emoji} ${item.nome} — comprar ${item.qtd_sugerida} ${item.unidade} · ${valor != null ? reais(valor) : 'sem preço'} (atual ${item.qtd_atual}, previsto ${item.estoque_previsto}, mínimo ${item.estoque_minimo})`)
    }
    linhas.push('')
  }
  const todos = grupos.flatMap((g) => g.itens)
  const semPreco = todos.filter((i) => i.preco_custo == null).length
  linhas.push(`💰 *Total estimado: ${reais(somar(todos))}*`)
  if (semPreco > 0) linhas.push(`(${semPreco} ${semPreco === 1 ? 'item sem preço cadastrado' : 'itens sem preço cadastrado'})`)
  return linhas.join('\n').trim()
}

function compartilharWhatsApp(texto: string) {
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank')
}

async function copiar(texto: string, onOk: () => void) {
  try {
    await navigator.clipboard.writeText(texto)
    onOk()
  } catch { /* clipboard pode ser bloqueado — ignora silenciosamente */ }
}

const WA_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
)

export default function ComprasQuinta() {
  const [itens, setItens] = useState<ItemPrevisaoCompra[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    fetch('/api/previsao-compras')
      .then((r) => r.json())
      .then((json) => {
        if (!Array.isArray(json)) { setErro(json?.erro ?? 'Erro ao carregar'); return }
        setItens(json)
      })
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false))
  }, [])

  const relevantes = useMemo(
    () => itens.filter((i) => i.status === 'CRITICO' || i.status === 'COMPRAR_QUINTA'),
    [itens]
  )

  const grupos = useMemo<Grupo[]>(() => {
    const mapa: Record<string, ItemPrevisaoCompra[]> = {}
    for (const item of relevantes) {
      const fornecedor = item.fornecedor ?? 'Sem fornecedor'
      if (!mapa[fornecedor]) mapa[fornecedor] = []
      mapa[fornecedor].push(item)
    }
    return Object.entries(mapa)
      .map(([fornecedor, lista]) => ({
        fornecedor,
        itens: lista.sort((a, b) => (a.status === b.status ? a.nome.localeCompare(b.nome, 'pt-BR') : a.status === 'CRITICO' ? -1 : 1)),
      }))
      .sort((a, b) => a.fornecedor.localeCompare(b.fornecedor, 'pt-BR'))
  }, [relevantes])

  const totalCriticos = relevantes.filter((i) => i.status === 'CRITICO').length
  const totalComprarQuinta = relevantes.filter((i) => i.status === 'COMPRAR_QUINTA').length
  const totalEstimado = somar(relevantes)
  const semPreco = relevantes.filter((i) => i.preco_custo == null).length

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: D.bg }}><p style={{ color: D.text2, fontSize: 14 }}>Carregando...</p></div>
  if (erro) return <div style={{ minHeight: '100vh', padding: 24, background: D.bg }}><p style={{ color: '#EF4444', fontWeight: 700 }}>Erro: {erro}</p></div>

  return (
    <div style={{ minHeight: '100vh', background: D.bg }}>
      <div style={{ background: 'var(--page-header)', borderBottom: `1px solid ${D.border}`, padding: '48px 20px 20px' }}>
        <Link href="/" style={{ color: D.text2, fontSize: 13, textDecoration: 'none', display: 'block', marginBottom: 12 }}>← Voltar</Link>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h1 style={{ color: D.text, fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>Lista de Compras da Quinta</h1>
            <p style={{ color: D.muted, fontSize: 13, marginTop: 4 }}>
              {relevantes.length === 0
                ? 'Nada precisa entrar na compra desta semana'
                : `${totalCriticos} crítico${totalCriticos !== 1 ? 's' : ''} · ${totalComprarQuinta} para comprar na quinta`}
            </p>
          </div>
          {relevantes.length > 0 && (
            <button onClick={() => compartilharWhatsApp(gerarMensagem(grupos))}
              style={{ background: '#25D366', border: 'none', borderRadius: 12, padding: '8px 12px', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {WA_ICON} Compartilhar
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: '16px', maxWidth: 640, margin: '0 auto' }}>

        {relevantes.length === 0 && (
          <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 16, padding: 24, textAlign: 'center' }}>
            <p style={{ color: '#10B981', fontWeight: 700, fontSize: 15 }}>Estoque em dia até a próxima quinta!</p>
          </div>
        )}

        {relevantes.length > 0 && (
          <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 16, padding: '14px 16px', marginBottom: 12 }}>
            <p style={{ color: D.text2, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>Total estimado</p>
            <p style={{ color: D.text, fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', margin: '2px 0 0', overflowWrap: 'anywhere' }}>{reais(totalEstimado)}</p>
            {semPreco > 0 && (
              <p style={{ color: '#F59E0B', fontSize: 12, fontWeight: 600, margin: '4px 0 0' }}>
                {semPreco} {semPreco === 1 ? 'item sem preço cadastrado' : 'itens sem preço cadastrado'}
              </p>
            )}
          </div>
        )}

        {relevantes.length > 0 && (
          <button onClick={() => copiar(gerarMensagem(grupos), () => { setCopiado(true); setTimeout(() => setCopiado(false), 2000) })}
            style={{ width: '100%', marginBottom: 16, padding: '10px', borderRadius: 12, background: D.card, border: `1px solid ${D.border}`, color: D.text2, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {copiado ? '✓ Copiado!' : '📋 Copiar lista'}
          </button>
        )}

        {grupos.map((grupo) => (
          <div key={grupo.fornecedor} style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 16, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: `color-mix(in srgb, ${D.text} 5%, ${D.card})`, borderBottom: `1px solid ${D.border}` }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ color: D.text, fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{grupo.fornecedor}</p>
                <p style={{ color: D.text2, fontWeight: 600, fontSize: 12, marginTop: 2 }}>Subtotal {reais(somar(grupo.itens))}</p>
              </div>
              <button onClick={() => compartilharWhatsApp(gerarMensagem([grupo]))}
                style={{ background: '#25D366', border: 'none', borderRadius: 8, padding: '4px 8px', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 8 }}>
                {WA_ICON} WA
              </button>
            </div>

            {grupo.itens.map((item, idx) => {
              const info = STATUS_INFO[item.status]
              const valor = valorItem(item)
              return (
                <div key={item.produto_id} style={{ padding: '12px 16px', borderTop: idx > 0 ? `1px solid ${D.border}` : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: D.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.nome}</p>
                    <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: info.bg, color: info.cor, whiteSpace: 'nowrap' }}>
                      {info.emoji} {info.texto}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: D.muted, marginTop: 4 }}>
                    Atual {item.qtd_atual} {item.unidade} · Previsto p/ quinta {item.estoque_previsto} · Mínimo {item.estoque_minimo} · Consumo {item.consumo_medio_diario}/dia
                  </p>
                  <p style={{ fontSize: 13, fontWeight: 700, color: info.cor, marginTop: 4 }}>
                    Comprar {item.qtd_sugerida} {item.unidade} ·{' '}
                    {valor != null ? reais(valor) : <span style={{ color: D.muted, fontWeight: 600 }}>sem preço</span>}
                  </p>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
