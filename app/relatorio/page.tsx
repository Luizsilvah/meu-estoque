'use client'
import { use, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Page from '@/app/components/ui/Page'
import PageHeader from '@/app/components/ui/PageHeader'
import Icon from '@/app/components/ui/Icon'

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
    <Page>
      <div className="print:hidden">
        <PageHeader titulo="Relatórios" subtitulo="Estoque, consumo e movimentações" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {liberadas && liberadas.length > 1 && (
          <div role="tablist" style={{ display: 'grid', gridTemplateColumns: `repeat(${liberadas.length}, minmax(0, 1fr))`, gap: 4, background: D.card, border: `1px solid ${D.border}`, borderRadius: 16, padding: 4 }} className="print:hidden">
            {ABAS.filter((a) => liberadas.includes(a.id)).map((a) => {
              const ativa = aba === a.id
              return (
                <button key={a.id} role="tab" aria-selected={ativa} onClick={() => trocarAba(a.id)}
                  style={{ padding: '10px 8px', borderRadius: 12, border: 'none', background: ativa ? '#6366F1' : 'transparent', color: ativa ? '#fff' : D.text2, fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit' }}>
                  <Icon nome={a.id === 'resumo' ? 'list' : 'barChart'} size={16} /> {a.label}
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
    </Page>
  )
}
