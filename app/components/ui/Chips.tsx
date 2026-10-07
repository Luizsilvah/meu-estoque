import { D } from '@/app/lib/theme'

export type Chip = { chave: string; label: React.ReactNode; ativo: boolean; onClick: () => void }

/** Filtros em linha única, rolando na horizontal; o ativo fica destacado. */
export default function Chips({ itens }: { itens: Chip[] }) {
  return (
    <div className="sem-scrollbar" style={{
      display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -16px', padding: '2px 16px', scrollbarWidth: 'none',
    }}>
      {itens.map((c) => (
        <button key={c.chave} onClick={c.onClick} aria-pressed={c.ativo} style={{
          flexShrink: 0, whiteSpace: 'nowrap', padding: '8px 16px', borderRadius: 999, fontSize: 14, fontWeight: 700,
          fontFamily: 'inherit', cursor: 'pointer',
          border: `1px solid ${c.ativo ? '#6366F1' : D.border}`,
          background: c.ativo ? 'var(--accent-bg)' : D.card,
          color: c.ativo ? 'var(--accent-text)' : D.text2,
        }}>
          {c.label}
        </button>
      ))}
    </div>
  )
}
