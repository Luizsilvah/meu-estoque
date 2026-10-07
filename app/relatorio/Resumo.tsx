'use client'
import { useEffect, useState } from 'react'

import { D } from '@/app/lib/theme'
import Card from '@/app/components/ui/Card'
import Icon from '@/app/components/ui/Icon'

const botaoMes: React.CSSProperties = {
  width: 42, height: 42, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: D.text,
  background: D.input, border: `1px solid ${D.border}`, cursor: 'pointer', padding: 0,
}
const botaoAcao: React.CSSProperties = {
  height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
}

// Aba "Resumo" de /relatorio (conteúdo da antiga página Relatório).

type ItemPrevisao = {
  produto_id: string; nome: string; unidade: string; fornecedor: string
  qtd_atual: number; total_saidas_30d: number; media_dia: number; dias_ate_acabar: number
}

type ItemEstoque = {
  id: string; produto_id: string; qtd_atual: number; qtd_base: number; qtd_max: number
  produtos: { nome: string; unidade: string; preco_custo: number | null; fornecedores: { nome: string } | null } | null
}

type Movimentacao = {
  id: string; tipo: 'entrada' | 'saida'; quantidade: number; data_hora: string
  usuario_nome: string | null; produto_id: string; produtos: { nome: string } | null
}

type MovPorProduto = { nome: string; entradas: number; saidas: number; saldo: number }

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function nomeMes(mes: number, ano: number) { return `${MESES[mes - 1]} ${ano}` }

function agruparMovimentacoes(movs: Movimentacao[]): MovPorProduto[] {
  const mapa: Record<string, MovPorProduto> = {}
  for (const m of movs) {
    const nome = m.produtos?.nome ?? '—'
    if (!mapa[nome]) mapa[nome] = { nome, entradas: 0, saidas: 0, saldo: 0 }
    if (m.tipo === 'entrada') mapa[nome].entradas += m.quantidade
    else mapa[nome].saidas += m.quantidade
    mapa[nome].saldo = mapa[nome].entradas - mapa[nome].saidas
  }
  return Object.values(mapa).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

function badgePrevisao(dias: number) {
  if (dias <= 7)  return { texto: `Acaba em ${dias}d`, bg: 'rgba(239,68,68,0.15)',  cor: '#EF4444' }
  if (dias <= 14) return { texto: `Acaba em ${dias}d`, bg: 'rgba(249,115,22,0.15)', cor: '#F97316' }
  if (dias <= 30) return { texto: `Acaba em ${dias}d`, bg: 'rgba(234,179,8,0.15)',  cor: '#EAB308' }
  return           { texto: `~${dias}d`,               bg: 'rgba(107,114,128,0.1)', cor: '#8B8FA8' }
}

async function exportarExcel(estoque: ItemEstoque[], movPorProduto: MovPorProduto[], mes: number, ano: number) {
  const XLSX = await import('xlsx')
  const dadosEstoque = estoque.slice()
    .sort((a, b) => (a.produtos?.nome ?? '').localeCompare(b.produtos?.nome ?? '', 'pt-BR'))
    .map((item) => ({
      'Produto': item.produtos?.nome ?? '—', 'Fornecedor': item.produtos?.fornecedores?.nome ?? '—',
      'Unidade': item.produtos?.unidade ?? '—', 'Qtd Atual': item.qtd_atual,
      'Mínimo': item.qtd_base, 'Máximo': item.qtd_max,
      'Status': item.qtd_atual <= item.qtd_base ? 'Pedir' : 'OK',
      'Qtd a Pedir': item.qtd_atual <= item.qtd_base ? Math.max(0, item.qtd_max - item.qtd_atual) : 0,
    }))
  const dadosMov = movPorProduto.length > 0
    ? movPorProduto.map((m) => ({ 'Produto': m.nome, 'Entradas': m.entradas, 'Saídas': m.saidas, 'Saldo': m.saldo }))
    : [{ 'Produto': 'Sem movimentações no período', 'Entradas': '', 'Saídas': '', 'Saldo': '' }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dadosEstoque), 'Estoque Atual')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dadosMov), `Mov ${MESES[mes-1].slice(0,3)} ${ano}`)
  XLSX.writeFile(wb, `estoque-${MESES[mes-1].toLowerCase()}-${ano}.xlsx`)
}

// "Acabando em breve": produtos que, no ritmo de saída dos últimos 30 dias, acabam nesta janela.
const DIAS_ACABANDO = 7

export default function AbaResumo() {
  const hoje = new Date()
  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const [ano, setAno] = useState(hoje.getFullYear())
  const [estoque, setEstoque] = useState<ItemEstoque[]>([])
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([])
  const [previsao, setPrevisao] = useState<ItemPrevisao[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    setLoading(true); setErro('')
    Promise.all([
      fetch(`/api/relatorio?mes=${mes}&ano=${ano}`).then((r) => r.json()),
      fetch('/api/previsao').then((r) => r.json()),
    ])
      .then(([rel, prev]) => {
        if (rel.erro) { setErro(rel.erro); return }
        setEstoque(rel.estoque ?? [])
        setMovimentacoes(rel.movimentacoes ?? [])
        setPrevisao(Array.isArray(prev) ? prev : [])
      })
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false))
  }, [mes, ano])

  function navMes(delta: number) {
    let nm = mes + delta, na = ano
    if (nm < 1) { nm = 12; na-- }
    if (nm > 12) { nm = 1; na++ }
    setMes(nm); setAno(na)
  }

  const movPorProduto = agruparMovimentacoes(movimentacoes)
  const totalProdutos = estoque.length
  const precisamPedir = estoque.filter((i) => i.qtd_atual <= i.qtd_base).length
  const valorEstoque = estoque.reduce((soma, i) => {
    const p = i.produtos?.preco_custo ?? null
    return p != null ? soma + i.qtd_atual * p : soma
  }, 0)
  const totalEntradas = movimentacoes.filter((m) => m.tipo === 'entrada').reduce((s, m) => s + m.quantidade, 0)
  const totalSaidas = movimentacoes.filter((m) => m.tipo === 'saida').reduce((s, m) => s + m.quantidade, 0)
  const ehMesAtual = mes === hoje.getMonth() + 1 && ano === hoje.getFullYear()
  const acabando = previsao.filter((i) => i.dias_ate_acabar <= DIAS_ACABANDO)

  return (
    <>
      {/* Header impressão */}
      <div className="hidden print:block" style={{ padding: '24px 24px 8px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Relatório Mensal — {nomeMes(mes, ano)}</h1>
        <p style={{ fontSize: 13, color: '#555', marginTop: 4 }}>Gerado em {hoje.toLocaleDateString('pt-BR')}</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Ações */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }} className="print:hidden">
          <button onClick={() => window.print()}
            style={{ ...botaoAcao, color: D.text, background: D.card, border: `1px solid ${D.border}` }}>
            <Icon nome="printer" size={18} /> Imprimir
          </button>
          <button onClick={() => exportarExcel(estoque, movPorProduto, mes, ano)} disabled={loading || estoque.length === 0}
            style={{ ...botaoAcao, color: '#fff', background: '#10B981', border: 'none', opacity: (loading || estoque.length === 0) ? 0.4 : 1 }}>
            <Icon nome="download" size={18} /> Exportar Excel
          </button>
        </div>

        {/* Navegação mês */}
        <div className="print:hidden">
        <Card style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px' }}>
          <button onClick={() => navMes(-1)} aria-label="Mês anterior" style={botaoMes}>
            <Icon nome="back" size={20} />
          </button>
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: D.text, fontWeight: 800, fontSize: 15, margin: 0 }}>{nomeMes(mes, ano)}</p>
            {ehMesAtual && <p style={{ fontSize: 11, color: 'var(--accent-text)', fontWeight: 600, marginTop: 2 }}>Mês atual</p>}
          </div>
          <button onClick={() => navMes(+1)} disabled={ehMesAtual} aria-label="Próximo mês" style={{ ...botaoMes, opacity: ehMesAtual ? 0.3 : 1 }}>
            <Icon nome="chevron" size={20} />
          </button>
        </Card>
        </div>

        <p className="hidden print:block" style={{ fontSize: 13, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '1px' }}>{nomeMes(mes, ano)}</p>

        {loading && <div style={{ textAlign: 'center', padding: '48px 0' }}><p style={{ color: D.text2, fontSize: 14 }}>Carregando...</p></div>}

        {erro && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 14, padding: 16 }}>
            <p style={{ color: '#EF4444', fontSize: 14, fontWeight: 600 }}>Erro: {erro}</p>
          </div>
        )}

        {!loading && !erro && (
          <>
            {/* Destaques */}
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 16, padding: 16, minWidth: 0 }}>
                <p style={{ color: D.text2, fontSize: 12, marginBottom: 6 }}>Valor em estoque</p>
                <p style={{ color: D.text, fontSize: 24, fontWeight: 800, lineHeight: 1.1, overflowWrap: 'anywhere' }}>
                  {valorEstoque.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
                <p style={{ color: D.muted, fontSize: 11, marginTop: 6 }}>Qtd atual × preço de custo (produtos com preço cadastrado)</p>
              </div>
              <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 16, padding: 16, minWidth: 0 }}>
                <p style={{ color: D.text2, fontSize: 12, marginBottom: 6 }}>Acabando em breve</p>
                <p style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1, color: acabando.length > 0 ? '#F97316' : '#10B981' }}>
                  {acabando.length} {acabando.length === 1 ? 'produto' : 'produtos'}
                </p>
                <p style={{ color: D.muted, fontSize: 11, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {acabando.length > 0 ? acabando.slice(0, 3).map((i) => i.nome).join(', ') : `Nada acaba em até ${DIAS_ACABANDO} dias`}
                </p>
                <p style={{ color: D.muted, fontSize: 11, marginTop: 2 }}>Em até {DIAS_ACABANDO} dias, pelo consumo dos últimos 30</p>
              </div>
            </section>

            {/* Seção 1: Resumo Estoque */}
            <section>
              <p style={{ color: D.muted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 12 }}>Estoque Atual</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 16, padding: 16 }}>
                  <p style={{ color: D.text2, fontSize: 12, marginBottom: 6 }}>Total de produtos</p>
                  <p style={{ color: D.text, fontSize: 32, fontWeight: 800, lineHeight: 1 }}>{totalProdutos}</p>
                </div>
                <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 16, padding: 16 }}>
                  <p style={{ color: D.text2, fontSize: 12, marginBottom: 6 }}>Precisam pedir</p>
                  <p style={{ fontSize: 32, fontWeight: 800, lineHeight: 1, color: precisamPedir > 0 ? '#EF4444' : '#10B981' }}>{precisamPedir}</p>
                </div>
              </div>
            </section>

            {/* Seção 2: Movimentações */}
            <section>
              <p style={{ color: D.muted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 12 }}>
                Movimentações — {nomeMes(mes, ano)}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 16, padding: 16 }}>
                  <p style={{ color: D.text2, fontSize: 12, marginBottom: 6 }}>Total entradas</p>
                  <p style={{ color: '#10B981', fontSize: 32, fontWeight: 800, lineHeight: 1 }}>{totalEntradas}</p>
                </div>
                <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 16, padding: 16 }}>
                  <p style={{ color: D.text2, fontSize: 12, marginBottom: 6 }}>Total saídas</p>
                  <p style={{ color: '#EF4444', fontSize: 32, fontWeight: 800, lineHeight: 1 }}>{totalSaidas}</p>
                </div>
              </div>

              {movPorProduto.length === 0 ? (
                <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 16, padding: 16, textAlign: 'center' }}>
                  <p style={{ color: D.text2, fontSize: 14 }}>Sem movimentações em {nomeMes(mes, ano)}.</p>
                </div>
              ) : (
                <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 16, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '10px 16px', borderBottom: `1px solid ${D.border}` }}>
                    <p style={{ color: D.muted, fontSize: 11, fontWeight: 700 }}>Produto</p>
                    <p style={{ color: D.muted, fontSize: 11, fontWeight: 700, textAlign: 'center' }}>Entradas</p>
                    <p style={{ color: D.muted, fontSize: 11, fontWeight: 700, textAlign: 'center' }}>Saídas</p>
                  </div>
                  {movPorProduto.map((m, i) => (
                    <div key={m.nome} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '12px 16px', alignItems: 'center', borderBottom: i < movPorProduto.length - 1 ? `1px solid ${D.border}` : undefined }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: D.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>{m.nome}</p>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#10B981', textAlign: 'center' }}>{m.entradas > 0 ? `+${m.entradas}` : '—'}</p>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#EF4444', textAlign: 'center' }}>{m.saidas > 0 ? `-${m.saidas}` : '—'}</p>
                    </div>
                  ))}
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '10px 16px', background: D.input, borderTop: `1px solid ${D.border}` }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: D.text2, textTransform: 'uppercase' }}>Total</p>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#10B981', textAlign: 'center' }}>+{totalEntradas}</p>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#EF4444', textAlign: 'center' }}>-{totalSaidas}</p>
                  </div>
                </div>
              )}
            </section>

            {/* Seção 3: Estoque detalhado */}
            <section>
              <p style={{ color: D.muted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 12 }}>Detalhamento do Estoque</p>
              <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '5fr 3fr 2fr 2fr', padding: '10px 16px', borderBottom: `1px solid ${D.border}` }}>
                  <p style={{ color: D.muted, fontSize: 11, fontWeight: 700 }}>Produto</p>
                  <p style={{ color: D.muted, fontSize: 11, fontWeight: 700 }}>Fornecedor</p>
                  <p style={{ color: D.muted, fontSize: 11, fontWeight: 700, textAlign: 'center' }}>Atual</p>
                  <p style={{ color: D.muted, fontSize: 11, fontWeight: 700, textAlign: 'center' }}>Status</p>
                </div>
                {estoque.slice().sort((a, b) => (a.produtos?.nome ?? '').localeCompare(b.produtos?.nome ?? '', 'pt-BR')).map((item, i) => {
                  const precisaPedir = item.qtd_atual <= item.qtd_base
                  return (
                    <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '5fr 3fr 2fr 2fr', padding: '10px 16px', alignItems: 'center', borderBottom: i < estoque.length - 1 ? `1px solid ${D.border}` : undefined }}>
                      <p style={{ fontSize: 13, color: D.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 4 }}>{item.produtos?.nome ?? '—'}</p>
                      <p style={{ fontSize: 11, color: D.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.produtos?.fornecedores?.nome ?? '—'}</p>
                      <p style={{ fontSize: 13, fontWeight: 700, textAlign: 'center', color: precisaPedir ? '#EF4444' : '#10B981' }}>{item.qtd_atual}</p>
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        {precisaPedir ? (
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(239,68,68,0.15)', color: '#EF4444' }}>Pedir</span>
                        ) : (
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(16,185,129,0.15)', color: '#10B981' }}>OK</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            {/* Seção 4: Previsão */}
            {previsao.length > 0 && (
              <section>
                <p style={{ color: D.muted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>Previsão de Estoque</p>
                <p style={{ color: D.muted, fontSize: 12, marginBottom: 12 }}>Baseado na média de saídas dos últimos 30 dias</p>
                <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 16, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '5fr 2fr 2fr 3fr', padding: '10px 16px', borderBottom: `1px solid ${D.border}` }}>
                    <p style={{ color: D.muted, fontSize: 11, fontWeight: 700 }}>Produto</p>
                    <p style={{ color: D.muted, fontSize: 11, fontWeight: 700, textAlign: 'center' }}>Atual</p>
                    <p style={{ color: D.muted, fontSize: 11, fontWeight: 700, textAlign: 'center' }}>Méd/dia</p>
                    <p style={{ color: D.muted, fontSize: 11, fontWeight: 700, textAlign: 'center' }}>Previsão</p>
                  </div>
                  {previsao.map((item, i) => {
                    const b = badgePrevisao(item.dias_ate_acabar)
                    return (
                      <div key={item.produto_id} style={{ display: 'grid', gridTemplateColumns: '5fr 2fr 2fr 3fr', padding: '10px 16px', alignItems: 'center', borderBottom: i < previsao.length - 1 ? `1px solid ${D.border}` : undefined }}>
                        <p style={{ fontSize: 13, color: D.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 4 }}>{item.nome}</p>
                        <p style={{ fontSize: 13, fontWeight: 700, color: D.text, textAlign: 'center' }}>{item.qtd_atual}</p>
                        <p style={{ fontSize: 11, color: D.text2, textAlign: 'center' }}>{item.media_dia}</p>
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: b.bg, color: b.cor }}>{b.texto}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>

    </>
  )
}
