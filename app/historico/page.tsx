'use client'
import { useEffect, useState } from 'react'

import { D } from '@/app/lib/theme'
import Page from '@/app/components/ui/Page'
import PageHeader from '@/app/components/ui/PageHeader'
import Card from '@/app/components/ui/Card'
import Icon from '@/app/components/ui/Icon'

type Movimentacao = {
  id: string
  tipo: 'entrada' | 'saida'
  quantidade: number
  data_hora: string
  usuario_nome: string | null
  produtos: { nome: string } | null
}

export default function Historico() {
  const [lista, setLista] = useState<Movimentacao[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    fetch('/api/historico')
      .then((r) => r.json())
      .then((json) => { if (!json.erro) setLista(json) })
      .finally(() => setCarregando(false))
  }, [])

  function formatarData(iso: string) {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <Page>
      <PageHeader titulo="Histórico" subtitulo="Movimentações recentes" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {carregando && (
          <p style={{ color: D.text2, fontSize: 14, textAlign: 'center', marginTop: 32 }}>Carregando...</p>
        )}

        {!carregando && lista.length === 0 && (
          <Card style={{ padding: 16, textAlign: 'center' }}>
            <p style={{ color: D.text2, fontSize: 14, margin: 0 }}>Nenhuma movimentação registrada.</p>
          </Card>
        )}

        {!carregando && lista.map((mov) => {
          const entrada = mov.tipo === 'entrada'
          const cor = entrada ? '#10B981' : '#EF4444'
          return (
            <Card key={mov.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
              <span style={{
                width: 44, height: 44, borderRadius: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: entrada ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: cor,
              }}>
                <Icon nome={entrada ? 'arrowDown' : 'arrowUp'} size={20} traco={2.4} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: D.text, fontSize: 15, fontWeight: 800, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {mov.produtos?.nome ?? '—'}
                </p>
                <p style={{ color: D.text2, fontSize: 12, margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {formatarData(mov.data_hora)}{mov.usuario_nome ? ` · ${mov.usuario_nome}` : ''}
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                <span style={{ color: cor, fontSize: 26, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  {entrada ? '+' : '−'}{mov.quantidade}
                </span>
                <span style={{ color: cor, fontSize: 11, fontWeight: 700, marginTop: 3 }}>{entrada ? 'Entrada' : 'Saída'}</span>
              </div>
            </Card>
          )
        })}
      </div>
    </Page>
  )
}
