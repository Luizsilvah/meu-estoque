'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

import { D } from '@/app/lib/theme'
import FotoThumb from '@/app/components/FotoThumb'
import { buscarEstoque } from '@/app/lib/estoqueCache'

type ItemEstoque = {
  produto_id: string
  qtd_atual: number
  qtd_base: number
  qtd_max: number
  localizacao: string
  produtos: { nome: string; unidade: string; foto_url: string | null; fornecedores: { nome: string } | null } | null
}

type ItemChecklist = { produto_id: string; nome: string; unidade: string; foto_url: string | null; pedir: number; marcado: boolean }
type Grupo = { fornecedor: string; itens: ItemChecklist[] }

function gerarMensagem(grupos: Grupo[], apenasNaoMarcados = true): string {
  const linhas: string[] = ['📋 *Pedido de compras*', '']
  for (const g of grupos) {
    const itens = apenasNaoMarcados ? g.itens.filter((i) => !i.marcado) : g.itens
    if (itens.length === 0) continue
    linhas.push(`*${g.fornecedor.toUpperCase()}*`)
    for (const item of itens) linhas.push(`• ${item.nome} — pedir ${item.pedir} ${item.unidade}`)
    linhas.push('')
  }
  return linhas.join('\n').trim()
}

function compartilharWhatsApp(texto: string) {
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank')
}

const WA_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
)

export default function Checklist() {
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    buscarEstoque()
      .then((json) => {
        const lista = json as unknown as ItemEstoque[]
        // Soma quantidades de todas as localizações por produto
        const porProduto: Record<string, { item: ItemEstoque; qtd_total: number }> = {}
        for (const item of lista) {
          const pid = item.produto_id
          if (!porProduto[pid]) porProduto[pid] = { item, qtd_total: 0 }
          porProduto[pid].qtd_total += item.qtd_atual
        }
        const precisamPedir = Object.values(porProduto).filter(({ item, qtd_total }) => qtd_total <= item.qtd_base)
        const mapa: Record<string, ItemChecklist[]> = {}
        for (const { item, qtd_total } of precisamPedir) {
          const fornecedor = item.produtos?.fornecedores?.nome ?? 'Sem fornecedor'
          if (!mapa[fornecedor]) mapa[fornecedor] = []
          mapa[fornecedor].push({
            produto_id: item.produto_id, nome: item.produtos?.nome ?? '—',
            unidade: item.produtos?.unidade ?? 'un', foto_url: item.produtos?.foto_url ?? null, pedir: Math.max(0, item.qtd_max - qtd_total), marcado: false,
          })
        }
        setGrupos(Object.entries(mapa)
          .map(([fornecedor, itens]) => ({ fornecedor, itens: itens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')) }))
          .sort((a, b) => a.fornecedor.localeCompare(b.fornecedor, 'pt-BR')))
      })
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false))
  }, [])

  function toggleItem(fornecedor: string, produto_id: string) {
    setGrupos((prev) => prev.map((g) => g.fornecedor !== fornecedor ? g : {
      ...g, itens: g.itens.map((i) => i.produto_id === produto_id ? { ...i, marcado: !i.marcado } : i),
    }))
  }

  function toggleGrupo(fornecedor: string, marcar: boolean) {
    setGrupos((prev) => prev.map((g) => g.fornecedor !== fornecedor ? g : { ...g, itens: g.itens.map((i) => ({ ...i, marcado: marcar })) }))
  }

  const totalItens = grupos.reduce((s, g) => s + g.itens.length, 0)
  const totalMarcados = grupos.reduce((s, g) => s + g.itens.filter((i) => i.marcado).length, 0)
  const temNaoMarcados = totalMarcados < totalItens

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: D.bg }}><p style={{ color: D.text2, fontSize: 14 }}>Carregando...</p></div>
  if (erro) return <div style={{ minHeight: '100vh', padding: 24, background: D.bg }}><p style={{ color: '#EF4444', fontWeight: 700 }}>Erro: {erro}</p></div>

  return (
    <div style={{ minHeight: '100vh', background: D.bg }}>

      {/* Header */}
      <div style={{ background: 'var(--page-header)', borderBottom: `1px solid ${D.border}`, padding: '48px 20px 20px' }}>
        <Link href="/" style={{ color: D.text2, fontSize: 13, textDecoration: 'none', display: 'block', marginBottom: 12 }}>← Voltar</Link>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h1 style={{ color: D.text, fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>Checklist</h1>
            <p style={{ color: D.muted, fontSize: 13, marginTop: 4 }}>
              {totalItens === 0 ? 'Estoque em dia!' : `${totalItens - totalMarcados} de ${totalItens} itens pendentes`}
            </p>
          </div>
          {totalItens > 0 && (
            <button onClick={() => compartilharWhatsApp(gerarMensagem(grupos, true))}
              style={{ background: '#25D366', border: 'none', borderRadius: 12, padding: '8px 12px', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              {WA_ICON} Compartilhar
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: '16px', maxWidth: 540, margin: '0 auto' }}>

        {totalItens === 0 && (
          <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 16, padding: 24, textAlign: 'center' }}>
            <p style={{ color: '#10B981', fontWeight: 700, fontSize: 15 }}>Estoque em dia!</p>
            <p style={{ color: '#10B981', fontSize: 13, opacity: 0.7, marginTop: 4 }}>Nenhum produto precisa ser pedido agora.</p>
          </div>
        )}

        {grupos.map((grupo) => {
          const todosMarcados = grupo.itens.every((i) => i.marcado)
          const algumMarcado = grupo.itens.some((i) => i.marcado)
          const mensagemGrupo = gerarMensagem([grupo], false)

          return (
            <div key={grupo.fornecedor} style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 16, overflow: 'hidden', marginBottom: 12 }}>
              {/* Header fornecedor */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#1E2235', borderBottom: `1px solid ${D.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <button onClick={() => toggleGrupo(grupo.fornecedor, !todosMarcados)}
                    style={{
                      flexShrink: 0, width: 20, height: 20, borderRadius: 6, border: `2px solid ${todosMarcados ? '#6366F1' : algumMarcado ? '#8B8FA8' : D.border}`,
                      background: todosMarcados ? '#6366F1' : algumMarcado ? 'rgba(99,102,241,0.2)' : 'transparent', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                    {todosMarcados && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    {algumMarcado && !todosMarcados && <span style={{ display: 'block', width: 8, height: 2, background: '#8B8FA8', borderRadius: 1 }} />}
                  </button>
                  <p style={{ color: D.text, fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{grupo.fornecedor}</p>
                  <span style={{ color: D.muted, fontSize: 12, flexShrink: 0 }}>{grupo.itens.filter((i) => i.marcado).length}/{grupo.itens.length}</span>
                </div>
                <button onClick={() => compartilharWhatsApp(mensagemGrupo)}
                  style={{ background: '#25D366', border: 'none', borderRadius: 8, padding: '4px 8px', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 8 }}>
                  {WA_ICON} WA
                </button>
              </div>

              {/* Itens */}
              {grupo.itens.map((item, idx) => (
                <button key={item.produto_id} onClick={() => toggleItem(grupo.fornecedor, item.produto_id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'none', border: 'none',
                    borderTop: idx > 0 ? `1px solid ${D.border}` : 'none', cursor: 'pointer', textAlign: 'left',
                  }}>
                  <div style={{
                    flexShrink: 0, width: 20, height: 20, borderRadius: 6, border: `2px solid ${item.marcado ? '#10B981' : D.border}`,
                    background: item.marcado ? '#10B981' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {item.marcado && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                  <FotoThumb src={item.foto_url} style={{ opacity: item.marcado ? 0.4 : 1 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: item.marcado ? D.muted : D.text, textDecoration: item.marcado ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.nome}
                    </p>
                  </div>
                  <span style={{
                    flexShrink: 0, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
                    background: item.marcado ? D.border : 'rgba(239,68,68,0.15)',
                    color: item.marcado ? D.muted : '#EF4444',
                  }}>
                    Pedir {item.pedir} {item.unidade}
                  </span>
                </button>
              ))}
            </div>
          )
        })}

        {/* Progresso */}
        {totalItens > 0 && (
          <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 16, padding: '14px 16px', marginTop: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: D.text2, marginBottom: 8 }}>
              <span>Progresso</span><span>{totalMarcados}/{totalItens}</span>
            </div>
            <div style={{ width: '100%', height: 6, background: D.border, borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 4, transition: 'width 0.3s', width: `${totalItens > 0 ? (totalMarcados / totalItens) * 100 : 0}%`, background: totalMarcados === totalItens ? '#10B981' : '#6366F1' }} />
            </div>
            {totalMarcados === totalItens && totalItens > 0 && (
              <p style={{ color: '#10B981', fontSize: 12, fontWeight: 700, textAlign: 'center', marginTop: 8 }}>Todos os itens pedidos!</p>
            )}
            {temNaoMarcados && (
              <button onClick={() => compartilharWhatsApp(gerarMensagem(grupos, true))}
                style={{ marginTop: 12, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px', borderRadius: 12, background: '#25D366', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                {WA_ICON} Compartilhar pendentes ({totalItens - totalMarcados})
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
