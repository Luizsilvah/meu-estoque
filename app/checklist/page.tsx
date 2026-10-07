'use client'
import { useEffect, useState } from 'react'
import Page from '@/app/components/ui/Page'
import PageHeader from '@/app/components/ui/PageHeader'
import Card from '@/app/components/ui/Card'
import Icon from '@/app/components/ui/Icon'

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
    <Page>

      <PageHeader
        titulo="Checklist"
        subtitulo={totalItens === 0 ? 'Estoque em dia!' : `${totalItens - totalMarcados} de ${totalItens} itens pendentes`}
        acao={totalItens > 0 ? (
          <button onClick={() => compartilharWhatsApp(gerarMensagem(grupos, true))} aria-label="Compartilhar no WhatsApp"
            style={{ flexShrink: 0, height: 44, padding: '0 14px', borderRadius: 14, background: '#25D366', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
            {WA_ICON} Compartilhar
          </button>
        ) : undefined}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {totalItens === 0 && (
          <Card style={{ background: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.25)', padding: 24, textAlign: 'center' }}>
            <span style={{ display: 'inline-flex', color: '#10B981' }}><Icon nome="check" size={32} /></span>
            <p style={{ color: '#10B981', fontWeight: 800, fontSize: 15, margin: '8px 0 0' }}>Estoque em dia!</p>
            <p style={{ color: D.text2, fontSize: 13, margin: '4px 0 0' }}>Nenhum produto precisa ser pedido agora.</p>
          </Card>
        )}

        {grupos.map((grupo) => {
          const todosMarcados = grupo.itens.every((i) => i.marcado)
          const algumMarcado = grupo.itens.some((i) => i.marcado)
          const mensagemGrupo = gerarMensagem([grupo], false)

          return (
            <Card key={grupo.fornecedor}>
              {/* Cabeçalho do fornecedor */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px 10px 16px', background: D.input, borderBottom: `1px solid ${D.border}` }}>
                <button onClick={() => toggleGrupo(grupo.fornecedor, !todosMarcados)} aria-label={todosMarcados ? 'Desmarcar todos' : 'Marcar todos'}
                  style={{
                    flexShrink: 0, width: 24, height: 24, borderRadius: 7, padding: 0, cursor: 'pointer',
                    border: `2px solid ${todosMarcados || algumMarcado ? '#6366F1' : D.border}`,
                    background: todosMarcados ? '#6366F1' : algumMarcado ? 'var(--accent-bg)' : 'transparent',
                    color: todosMarcados ? '#fff' : 'var(--accent-text)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                  {todosMarcados && <Icon nome="tick" size={15} traco={3} />}
                  {algumMarcado && !todosMarcados && <Icon nome="minus" size={15} traco={3} />}
                </button>
                <p style={{ flex: 1, minWidth: 0, color: D.text, fontWeight: 800, fontSize: 14, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{grupo.fornecedor}</p>
                <span style={{ color: D.text2, fontSize: 12, fontWeight: 600, flexShrink: 0 }}>{grupo.itens.filter((i) => i.marcado).length}/{grupo.itens.length}</span>
                <button onClick={() => compartilharWhatsApp(mensagemGrupo)} aria-label={`Compartilhar pedido de ${grupo.fornecedor} no WhatsApp`}
                  style={{ flexShrink: 0, height: 32, padding: '0 10px', borderRadius: 10, background: '#25D366', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
                  {WA_ICON} WA
                </button>
              </div>

              {/* Itens */}
              {grupo.itens.map((item, idx) => (
                <button key={item.produto_id} onClick={() => toggleItem(grupo.fornecedor, item.produto_id)} role="checkbox" aria-checked={item.marcado}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'none', border: 'none',
                    borderTop: idx > 0 ? `1px solid ${D.border}` : 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                  }}>
                  <span style={{
                    flexShrink: 0, width: 24, height: 24, borderRadius: 7, border: `2px solid ${item.marcado ? '#10B981' : D.border}`,
                    background: item.marcado ? '#10B981' : 'transparent', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {item.marcado && <Icon nome="tick" size={15} traco={3} />}
                  </span>
                  <FotoThumb src={item.foto_url} size={44} radius={12} style={{ opacity: item.marcado ? 0.4 : 1 }} />
                  <p style={{ flex: 1, minWidth: 0, margin: 0, fontSize: 15, fontWeight: 700, color: item.marcado ? D.muted : D.text, textDecoration: item.marcado ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.nome}
                  </p>
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                    <span style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, color: item.marcado ? D.muted : '#EF4444', fontVariantNumeric: 'tabular-nums' }}>{item.pedir}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: D.text2, marginTop: 3 }}>pedir · {item.unidade}</span>
                  </span>
                </button>
              ))}
            </Card>
          )
        })}

        {/* Progresso */}
        {totalItens > 0 && (
          <Card style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, color: D.text2, marginBottom: 8 }}>
              <span>Progresso</span><span>{totalMarcados}/{totalItens}</span>
            </div>
            <div style={{ width: '100%', height: 6, background: D.border, borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 4, transition: 'width 0.3s', width: `${totalItens > 0 ? (totalMarcados / totalItens) * 100 : 0}%`, background: totalMarcados === totalItens ? '#10B981' : '#6366F1' }} />
            </div>
            {totalMarcados === totalItens && totalItens > 0 && (
              <p style={{ color: '#10B981', fontSize: 13, fontWeight: 700, textAlign: 'center', margin: '8px 0 0' }}>Todos os itens pedidos!</p>
            )}
            {temNaoMarcados && (
              <button onClick={() => compartilharWhatsApp(gerarMensagem(grupos, true))}
                style={{ marginTop: 12, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', borderRadius: 14, background: '#25D366', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                {WA_ICON} Compartilhar pendentes ({totalItens - totalMarcados})
              </button>
            )}
          </Card>
        )}
      </div>
    </Page>
  )
}
