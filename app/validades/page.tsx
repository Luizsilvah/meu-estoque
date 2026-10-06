'use client'
import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

import { D } from '@/app/lib/theme'
import type { Validade } from '@/app/lib/validades'
import type { ItemValidadeDivergente } from '@/app/api/validades-divergentes/route'
import ListaDivergentes, { type AbaDivergentes } from './Divergentes'
import ListaVencendo, { lotesVencendo, type ItemEstoqueValidade, type Janela } from './Vencendo'

// Página única de validades. Aba pela URL: /validades?aba=vencendo|divergentes|sem_validade
// (/validades-divergentes redireciona para ?aba=divergentes). Trava no proxy com a
// chave 'validades-divergentes' (ver app/lib/permissoes.ts).
type Aba = 'vencendo' | AbaDivergentes
const ABAS: { id: Aba; label: string }[] = [
  { id: 'vencendo', label: 'Vencendo' },
  { id: 'divergentes', label: 'Divergentes' },
  { id: 'sem_validade', label: 'Sem validade' },
]

function abaDaUrl(valor: string | string[] | undefined): Aba {
  return ABAS.find((a) => a.id === valor)?.id ?? 'vencendo'
}

type Resultado<T> = { dados: T } | { erro: string }

async function buscarDivergentes(): Promise<Resultado<ItemValidadeDivergente[]>> {
  try {
    const res = await fetch('/api/validades-divergentes')
    const json = await res.json()
    return Array.isArray(json) ? { dados: json } : { erro: json?.erro ?? 'Erro ao carregar' }
  } catch (e) {
    return { erro: e instanceof Error ? e.message : 'Erro de conexão' }
  }
}

async function buscarVencendo(): Promise<Resultado<{ estoque: ItemEstoqueValidade[]; validades: Validade[] }>> {
  try {
    const [resEstoque, resValidades] = await Promise.all([fetch('/api/estoque'), fetch('/api/validades/todos')])
    const [estoque, validades] = await Promise.all([resEstoque.json(), resValidades.json()])
    if (!Array.isArray(estoque) || !Array.isArray(validades)) return { erro: estoque?.erro ?? validades?.erro ?? 'Erro ao carregar' }
    return { dados: { estoque, validades } }
  } catch (e) {
    return { erro: e instanceof Error ? e.message : 'Erro de conexão' }
  }
}

export default function Validades({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { aba: abaUrl } = use(searchParams)
  const [aba, setAba] = useState<Aba>(() => abaDaUrl(abaUrl))
  const [loading, setLoading] = useState(true)

  const [divergentes, setDivergentes] = useState<ItemValidadeDivergente[]>([])
  const [erroDiv, setErroDiv] = useState('')

  const [estoque, setEstoque] = useState<ItemEstoqueValidade[]>([])
  const [validades, setValidades] = useState<Validade[]>([])
  const [erroVenc, setErroVenc] = useState('')
  const [janela, setJanela] = useState<Janela>(7)

  function aplicarDivergentes(r: Resultado<ItemValidadeDivergente[]>) {
    if ('erro' in r) { setErroDiv(r.erro); return }
    setErroDiv('')
    setDivergentes(r.dados)
  }

  function recarregarDivergentes() {
    buscarDivergentes().then(aplicarDivergentes)
  }

  useEffect(() => {
    Promise.all([buscarDivergentes(), buscarVencendo()]).then(([div, venc]) => {
      aplicarDivergentes(div)
      if ('erro' in venc) setErroVenc(venc.erro)
      else { setEstoque(venc.dados.estoque); setValidades(venc.dados.validades) }
      setLoading(false)
    })
  }, [])

  const lotes = useMemo(() => lotesVencendo(estoque, validades, janela), [estoque, validades, janela])
  const totais: Record<Aba, number> = {
    vencendo: lotes.length,
    divergentes: divergentes.filter((i) => i.tipo !== 'SEM_VALIDADE').length,
    sem_validade: divergentes.filter((i) => i.tipo === 'SEM_VALIDADE').length,
  }

  function trocarAba(nova: Aba) {
    setAba(nova)
    // Mantém a aba na URL (recarregar/compartilhar abre na mesma aba) sem navegar.
    window.history.replaceState(null, '', `/validades?aba=${nova}`)
  }

  const erro = aba === 'vencendo' ? (lotes.length === 0 && erroVenc) : (divergentes.length === 0 && erroDiv)

  return (
    <div style={{ minHeight: '100vh', background: D.bg, overflowX: 'hidden' }}>
      <div style={{ background: 'var(--page-header)', borderBottom: `1px solid ${D.border}`, padding: '48px 20px 20px' }}>
        <Link href="/" style={{ color: D.text2, fontSize: 13, textDecoration: 'none', display: 'block', marginBottom: 12 }}>← Voltar</Link>
        <h1 style={{ color: D.text, fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>Validades</h1>
        <p style={{ color: D.muted, fontSize: 13, marginTop: 4 }}>Lotes vencendo, divergentes e sem validade</p>
      </div>

      <div style={{ padding: '16px', maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Abas */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 4, background: D.card, border: `1px solid ${D.border}`, borderRadius: 14, padding: 4 }}>
          {ABAS.map((a) => {
            const ativa = aba === a.id
            return (
              <button key={a.id} onClick={() => trocarAba(a.id)}
                style={{ padding: '8px 4px', borderRadius: 10, border: 'none', background: ativa ? '#6366F1' : 'transparent', color: ativa ? '#fff' : D.text2, cursor: 'pointer', lineHeight: 1.25, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{a.label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.85 }}>{loading ? '…' : totais[a.id]}</span>
              </button>
            )
          })}
        </div>

        {loading ? (
          <p style={{ color: D.text2, fontSize: 14, textAlign: 'center', paddingTop: 40 }}>Carregando...</p>
        ) : erro ? (
          <p style={{ color: '#EF4444', fontWeight: 700, background: 'rgba(239,68,68,0.1)', borderRadius: 12, padding: '12px 14px' }}>Erro: {erro}</p>
        ) : aba === 'vencendo' ? (
          <ListaVencendo lotes={lotes} janela={janela} setJanela={setJanela} />
        ) : (
          <ListaDivergentes aba={aba} itens={divergentes} setItens={setDivergentes} recarregar={recarregarDivergentes} />
        )}
      </div>
    </div>
  )
}
