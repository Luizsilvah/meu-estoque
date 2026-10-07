type Props = {
  /** Lado do ícone em px */
  size?: number
  /** Mostra o nome "Fluxio" ao lado (ou abaixo, com stacked) */
  showName?: boolean
  stacked?: boolean
  /** Tamanho da fonte do nome; por padrão acompanha o ícone */
  nameSize?: number
  nameColor?: string
}

export function LogoIcon({ size = 40 }: { size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        width: size, height: size, borderRadius: size * 0.26, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 55%, #22D3EE 130%)',
        boxShadow: `0 ${size * 0.15}px ${size * 0.5}px rgba(99,102,241,0.45)`,
      }}
    >
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 6.5h11" />
        <path d="M4 12h8" />
        <path d="M4 17.5h5" />
        <path d="M13 17.5h7" />
        <path d="M17 14l3.5 3.5L17 21" />
      </svg>
    </span>
  )
}

export default function Logo({ size = 40, showName = true, stacked = false, nameSize, nameColor = '#F1F2F6' }: Props) {
  const fs = nameSize ?? Math.round(size * (stacked ? 0.5 : 0.55))
  return (
    <span style={{ display: 'inline-flex', flexDirection: stacked ? 'column' : 'row', alignItems: 'center', gap: size * 0.3 }}>
      <LogoIcon size={size} />
      {showName && (
        <span style={{ fontSize: fs, fontWeight: 800, color: nameColor, letterSpacing: '-0.02em', lineHeight: 1 }}>Fluxio</span>
      )}
    </span>
  )
}
