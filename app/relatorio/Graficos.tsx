'use client'
import { useEffect, useState } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line,
} from 'recharts'

import { D } from '@/app/lib/theme'

// Aba "Gráficos" de /relatorio (antes a página /graficos). Carregada com
// next/dynamic pela página, para o recharts só baixar quando a aba abre.

type ItemPrevisao = {
  produto_id: string; nome: string; unidade: string
  qtd_atual: number; media_dia: number; dias_ate_acabar: number
}

type Movimentacao = {
  id: string; tipo: 'entrada' | 'saida'; quantidade: number; data_hora: string
  produto_id: string; produtos: { nome: string } | null
}

type DadosBarra = { nome: string; saidas: number; entradas: number }
type DadosLinha = { dia: string; entradas: number; saidas: number }

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function calcularBarras(movs: Movimentacao[]): DadosBarra[] {
  const mapa: Record<string, DadosBarra> = {}
  for (const m of movs) {
    const nome = m.produtos?.nome ?? '—'
    if (!mapa[nome]) mapa[nome] = { nome, saidas: 0, entradas: 0 }
    if (m.tipo === 'saida') mapa[nome].saidas += m.quantidade
    else mapa[nome].entradas += m.quantidade
  }
  return Object.values(mapa).sort((a, b) => b.saidas - a.saidas).slice(0, 10)
}

function calcularLinha(movs: Movimentacao[], mes: number, ano: number): DadosLinha[] {
  const diasNoMes = new Date(ano, mes, 0).getDate()
  const mapa: Record<number, DadosLinha> = {}
  for (let d = 1; d <= diasNoMes; d++) mapa[d] = { dia: String(d).padStart(2, '0'), entradas: 0, saidas: 0 }
  for (const m of movs) {
    const d = new Date(m.data_hora).getDate()
    if (mapa[d]) {
      if (m.tipo === 'entrada') mapa[d].entradas += m.quantidade
      else mapa[d].saidas += m.quantidade
    }
  }
  const hoje = new Date()
  const limite = mes === hoje.getMonth() + 1 && ano === hoje.getFullYear() ? hoje.getDate() : diasNoMes
  return Object.values(mapa).slice(0, limite)
}

function badgePrevisao(dias: number) {
  if (dias <= 7)  return { texto: `Acaba em ${dias}d`, bg: 'rgba(239,68,68,0.15)',  cor: '#EF4444' }
  if (dias <= 14) return { texto: `Acaba em ${dias}d`, bg: 'rgba(249,115,22,0.15)', cor: '#F97316' }
  if (dias <= 30) return { texto: `Acaba em ${dias}d`, bg: 'rgba(234,179,8,0.15)',  cor: '#EAB308' }
  return           { texto: `~${dias}d`,               bg: 'rgba(107,114,128,0.1)', cor: '#8B8FA8' }
}

function TooltipBarra({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 10, padding: '8px 12px', fontSize: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
      <p style={{ fontWeight: 700, color: D.text, marginBottom: 4, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name === 'saidas' ? 'Saídas' : 'Entradas'}: {p.value}
        </p>
      ))}
    </div>
  )
}

function TooltipLinha({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 10, padding: '8px 12px', fontSize: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
      <p style={{ fontWeight: 700, color: D.text, marginBottom: 4 }}>Dia {label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name === 'saidas' ? 'Saídas' : 'Entradas'}: {p.value}
        </p>
      ))}
    </div>
  )
}

export default function AbaGraficos() {
  const { theme } = useTheme()
  const gridColor = theme === 'dark' ? '#2A2D3E' : '#E2E4EF'
  const tickColor = theme === 'dark' ? '#8B8FA8' : '#6B7280'
  const hoje = new Date()
  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const [ano, setAno] = useState(hoje.getFullYear())
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

  const ehMesAtual = mes === hoje.getMonth() + 1 && ano === hoje.getFullYear()
  const dadosBarra = calcularBarras(movimentacoes)
  const dadosLinha = calcularLinha(movimentacoes, mes, ano)
  const temDados = movimentacoes.length > 0

  function nomesCurto(nome: string) { return nome.length > 13 ? nome.slice(0, 12) + '…' : nome }

  return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Seletor de mês */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: D.card, border: `1px solid ${D.border}`, borderRadius: 16, padding: '12px 16px' }}>
          <button onClick={() => navMes(-1)}
            style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: D.text2, fontWeight: 700, fontSize: 20, background: 'none', border: 'none', cursor: 'pointer' }}>‹</button>
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: D.text, fontWeight: 600 }}>{MESES[mes - 1]} {ano}</p>
            {ehMesAtual && <p style={{ fontSize: 11, color: 'var(--accent-text)', fontWeight: 600, marginTop: 2 }}>Mês atual</p>}
          </div>
          <button onClick={() => navMes(+1)} disabled={ehMesAtual}
            style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: D.text2, fontWeight: 700, fontSize: 20, background: 'none', border: 'none', cursor: 'pointer', opacity: ehMesAtual ? 0.3 : 1 }}>›</button>
        </div>

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
            <p style={{ color: D.text2, fontSize: 14 }}>Carregando...</p>
          </div>
        )}

        {erro && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 14, padding: 16 }}>
            <p style={{ color: '#EF4444', fontSize: 14 }}>Erro: {erro}</p>
          </div>
        )}

        {!loading && !erro && !temDados && (
          <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 16, padding: 32, textAlign: 'center' }}>
            <p style={{ color: D.text2, fontSize: 14 }}>Sem movimentações em {MESES[mes - 1]} {ano}.</p>
          </div>
        )}

        {!loading && !erro && temDados && (
          <>
            {/* Gráfico 1: Top 10 por saídas */}
            <section style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 16, padding: 16 }}>
              <p style={{ color: D.text, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
                Top {dadosBarra.length} produtos — saídas do mês
              </p>
              <p style={{ color: D.text2, fontSize: 12, marginBottom: 16 }}>Ordenado por volume de saída</p>

              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={dadosBarra.map((d) => ({ ...d, nome: nomesCurto(d.nome) }))} margin={{ top: 4, right: 4, left: -20, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                  <XAxis dataKey="nome" tick={{ fontSize: 10, fill: tickColor }} angle={-40} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 10, fill: tickColor }} allowDecimals={false} />
                  <Tooltip content={<TooltipBarra />} />
                  <Legend formatter={(v) => v === 'saidas' ? 'Saídas' : 'Entradas'} wrapperStyle={{ fontSize: 11, paddingTop: 8, color: D.text2 }} />
                  <Bar dataKey="saidas" fill="#EF4444" radius={[4, 4, 0, 0]} maxBarSize={36} />
                  <Bar dataKey="entradas" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </section>

            {/* Gráfico 2: Entradas vs Saídas por dia */}
            <section style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 16, padding: 16 }}>
              <p style={{ color: D.text, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Entradas vs Saídas por dia</p>
              <p style={{ color: D.text2, fontSize: 12, marginBottom: 16 }}>{MESES[mes - 1]} {ano}</p>

              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={dadosLinha} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                  <XAxis dataKey="dia" tick={{ fontSize: 10, fill: tickColor }} interval={Math.floor(dadosLinha.length / 8)} />
                  <YAxis tick={{ fontSize: 10, fill: tickColor }} allowDecimals={false} />
                  <Tooltip content={<TooltipLinha />} />
                  <Legend formatter={(v) => v === 'saidas' ? 'Saídas' : 'Entradas'} wrapperStyle={{ fontSize: 11, paddingTop: 8, color: D.text2 }} />
                  <Line type="monotone" dataKey="entradas" stroke="#10B981" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="saidas" stroke="#EF4444" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </section>

            {/* Cards de resumo */}
            <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                {
                  label: 'Produto mais vendido',
                  valor: dadosBarra[0]?.nome ?? '—',
                  sub: dadosBarra[0] ? `${dadosBarra[0].saidas} saídas` : '',
                  cor: '#EF4444', bg: 'rgba(239,68,68,0.08)',
                },
                {
                  label: 'Total de movimentações',
                  valor: String(movimentacoes.length),
                  sub: `${movimentacoes.filter(m => m.tipo === 'entrada').length} ent · ${movimentacoes.filter(m => m.tipo === 'saida').length} saí`,
                  cor: 'var(--accent-text)', bg: 'rgba(99,102,241,0.08)',
                },
              ].map((card) => (
                <div key={card.label} style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 16, padding: 16 }}>
                  <p style={{ color: D.text2, fontSize: 12, marginBottom: 6 }}>{card.label}</p>
                  <p style={{ fontWeight: 800, fontSize: 15, color: card.cor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.valor}</p>
                  {card.sub && <p style={{ color: D.muted, fontSize: 11, marginTop: 4 }}>{card.sub}</p>}
                </div>
              ))}
            </section>

            {/* Previsão de Estoque */}
            {previsao.length > 0 && (
              <section style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ padding: '16px 16px 8px' }}>
                  <p style={{ color: D.text, fontSize: 14, fontWeight: 700 }}>Previsão de Estoque</p>
                  <p style={{ color: D.text2, fontSize: 12, marginTop: 2 }}>Média de saídas dos últimos 30 dias</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '5fr 2fr 2fr 3fr', padding: '10px 16px', borderBottom: `1px solid ${D.border}` }}>
                  <p style={{ color: D.muted, fontSize: 11, fontWeight: 700 }}>Produto</p>
                  <p style={{ color: D.muted, fontSize: 11, fontWeight: 700, textAlign: 'center' }}>Atual</p>
                  <p style={{ color: D.muted, fontSize: 11, fontWeight: 700, textAlign: 'center' }}>Méd/dia</p>
                  <p style={{ color: D.muted, fontSize: 11, fontWeight: 700, textAlign: 'center' }}>Acaba em</p>
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
              </section>
            )}
          </>
        )}
      </div>
  )
}
