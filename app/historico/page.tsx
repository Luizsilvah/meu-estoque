'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { D } from '@/app/lib/theme'

type Movimentacao = {
  id: string
  tipo: 'entrada' | 'saida'
  quantidade: number
  data_hora: string
  usuario_nome: string | null
  produtos: { nome: string } | null
}

export default function Historico() {
  const router = useRouter()
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
    <main style={{ minHeight: '100vh', background: D.bg, padding: '0 0 32px' }}>

      {/* Header */}
      <div style={{ background: 'var(--page-header)', borderBottom: `1px solid ${D.border}`, padding: '48px 20px 20px' }}>
        <button onClick={() => router.back()} style={{ color: D.text2, fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', marginBottom: 12, display: 'block' }}>
          ← Voltar
        </button>
        <h1 style={{ color: D.text, fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>Histórico</h1>
        <p style={{ color: D.muted, fontSize: 13, marginTop: 4 }}>Movimentações recentes</p>
      </div>

      <div style={{ padding: '16px' }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>

          {carregando && (
            <p style={{ color: D.text2, fontSize: 14, textAlign: 'center', marginTop: 32 }}>Carregando...</p>
          )}

          {!carregando && lista.length === 0 && (
            <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 14, padding: '16px', textAlign: 'center' }}>
              <p style={{ color: D.text2, fontSize: 14 }}>Nenhuma movimentação registrada.</p>
            </div>
          )}

          {!carregando && lista.map((mov) => (
            <div key={mov.id} style={{
              background: D.card,
              border: `1px solid ${D.border}`,
              borderRadius: 14,
              padding: '12px 14px',
              marginBottom: 8,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: D.text, fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {mov.produtos?.nome ?? '—'}
                </p>
                <p style={{ color: D.muted, fontSize: 12, marginTop: 2 }}>{formatarData(mov.data_hora)}</p>
                {mov.usuario_nome && (
                  <p style={{ color: D.muted, fontSize: 12 }}>{mov.usuario_nome}</p>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, marginLeft: 12, flexShrink: 0 }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
                  background: mov.tipo === 'entrada' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                  color: mov.tipo === 'entrada' ? '#10B981' : '#EF4444',
                }}>
                  {mov.tipo === 'entrada' ? 'Entrada' : 'Saída'}
                </span>
                <span style={{ color: D.text, fontSize: 14, fontWeight: 700 }}>{mov.quantidade}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
