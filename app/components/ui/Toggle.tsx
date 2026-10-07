import { D } from '@/app/lib/theme'

/** Linha com rótulo + descrição à esquerda e chave liga/desliga à direita. */
export default function Toggle({ label, descricao, ligado, onChange, disabled, icone }: {
  label: string
  descricao?: React.ReactNode
  ligado: boolean
  onChange: (ligado: boolean) => void
  disabled?: boolean
  /** Ícone opcional à esquerda do rótulo */
  icone?: React.ReactNode
}) {
  return (
    <button
      type="button" role="switch" aria-checked={ligado} disabled={disabled}
      onClick={() => onChange(!ligado)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 14px', borderRadius: 14,
        background: D.input, border: `1px solid ${D.border}`, cursor: disabled ? 'default' : 'pointer',
        textAlign: 'left', fontFamily: 'inherit', opacity: disabled ? 0.6 : 1, boxSizing: 'border-box',
      }}
    >
      {icone}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', color: D.text, fontSize: 14, fontWeight: 700 }}>{label}</span>
        {descricao && <span style={{ display: 'block', color: D.text2, fontSize: 12, marginTop: 2, lineHeight: 1.35 }}>{descricao}</span>}
      </span>
      <span aria-hidden style={{
        width: 44, height: 26, borderRadius: 13, flexShrink: 0, position: 'relative', transition: 'background 0.15s',
        background: ligado ? '#6366F1' : 'var(--border)',
      }}>
        <span style={{
          position: 'absolute', top: 3, left: ligado ? 21 : 3, width: 20, height: 20, borderRadius: '50%',
          background: '#fff', transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </span>
    </button>
  )
}
