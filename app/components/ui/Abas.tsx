import { D } from '@/app/lib/theme'

export type Aba<T extends string> = { id: T; label: React.ReactNode; contador?: React.ReactNode }

/** Abas em bloco (mesmo visual das abas de /validades); a ativa fica preenchida. */
export default function Abas<T extends string>({ abas, ativa, onMudar }: {
  abas: Aba<T>[]
  ativa: T
  onMudar: (id: T) => void
}) {
  return (
    <div role="tablist" style={{
      display: 'grid', gridTemplateColumns: `repeat(${abas.length}, minmax(0, 1fr))`, gap: 4,
      background: D.card, border: `1px solid ${D.border}`, borderRadius: 16, padding: 4,
    }}>
      {abas.map((a) => {
        const sel = a.id === ativa
        return (
          <button key={a.id} type="button" role="tab" aria-selected={sel} onClick={() => onMudar(a.id)}
            style={{
              padding: '8px 4px', borderRadius: 12, border: 'none', background: sel ? '#6366F1' : 'transparent',
              color: sel ? '#fff' : D.text2, cursor: 'pointer', lineHeight: 1.25, display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 2, minWidth: 0, fontFamily: 'inherit',
            }}>
            <span style={{ fontSize: 13, fontWeight: 800, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.label}</span>
            {a.contador != null && <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.85 }}>{a.contador}</span>}
          </button>
        )
      })}
    </div>
  )
}
