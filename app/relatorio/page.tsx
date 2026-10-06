'use client'
import { use, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'

import { D } from '@/app/lib/theme'
import { FUNCOES, podeAcessar, type Permissoes } from '@/app/lib/permissoes'
import AbaResumo from './Resumo'

// recharts só é baixado quando a aba Gráficos abre.
const AbaGraficos = dynamic(() => import('./Graficos'), {
  loading: () => <p style={{ color: D.text2, fontSize: 14, textAlign: 'center', padding: '80px 0' }}>Carregando...</p>,
})

// Relatório + Gráficos numa página só. Aba pela URL: /relatorio?aba=resumo|graficos
// (/graficos redireciona para ?aba=graficos). Cada aba aparece só para quem tem a
// permissão dela ('relatorio' / 'graficos'); o proxy libera a página com qualquer uma.
type Aba = 'resumo' | 'graficos'
const ABAS: { id: Aba; label: string; funcao: string }[] = [
  { id: 'resumo', label: 'Resumo', funcao: 'relatorio' },
  { id: 'graficos', label: 'Gráficos', funcao: 'graficos' },
]

export default function Relatorio({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { aba: abaUrl } = use(searchParams)
  const [liberadas, setLiberadas] = useState<Aba[] | null>(null)
  const [abaEscolhida, setAbaEscolhida] = useState<Aba | null>(() => ABAS.find((a) => a.id === abaUrl)?.id ?? null)

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((json: { perfil?: string; permissoes?: Permissoes }) => {
        setLiberadas(ABAS.filter((a) => {
          const funcao = FUNCOES.find((f) => f.id === a.funcao)
          return !!funcao && podeAcessar(funcao, json.perfil, json.permissoes)
        }).map((a) => a.id))
      })
      .catch(() => setLiberadas([]))
  }, [])

  // Aba pedida na URL se o usuário tiver acesso; senão a primeira que ele tiver.
  const aba = liberadas && (abaEscolhida && liberadas.includes(abaEscolhida) ? abaEscolhida : liberadas[0])

  function trocarAba(nova: Aba) {
    setAbaEscolhida(nova)
    window.history.replaceState(null, '', `/relatorio?aba=${nova}`)
  }

  return (
    <div style={{ minHeight: '100vh', background: D.bg, overflowX: 'hidden' }}>
      <div style={{ background: 'var(--page-header)', borderBottom: `1px solid ${D.border}`, padding: '48px 20px 20px' }} className="print:hidden">
        <Link href="/" style={{ color: D.text2, fontSize: 13, textDecoration: 'none', display: 'block', marginBottom: 12 }}>← Voltar</Link>
        <h1 style={{ color: D.text, fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>Relatórios</h1>
        <p style={{ color: D.muted, fontSize: 13, marginTop: 4 }}>Resumo do estoque, consumo e movimentações</p>
      </div>

      <div style={{ padding: '16px', maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {liberadas && liberadas.length > 1 && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${liberadas.length}, minmax(0, 1fr))`, gap: 4, background: D.card, border: `1px solid ${D.border}`, borderRadius: 14, padding: 4 }} className="print:hidden">
            {ABAS.filter((a) => liberadas.includes(a.id)).map((a) => {
              const ativa = aba === a.id
              return (
                <button key={a.id} onClick={() => trocarAba(a.id)}
                  style={{ padding: '10px 8px', borderRadius: 10, border: 'none', background: ativa ? '#6366F1' : 'transparent', color: ativa ? '#fff' : D.text2, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  {a.label}
                </button>
              )
            })}
          </div>
        )}

        {liberadas === null ? (
          <p style={{ color: D.text2, fontSize: 14, textAlign: 'center', padding: '48px 0' }}>Carregando...</p>
        ) : aba === 'resumo' ? (
          <AbaResumo />
        ) : aba === 'graficos' ? (
          <AbaGraficos />
        ) : (
          <p style={{ color: D.text2, fontSize: 14, textAlign: 'center', padding: '48px 0' }}>Sem acesso aos relatórios.</p>
        )}
      </div>
    </div>
  )
}
