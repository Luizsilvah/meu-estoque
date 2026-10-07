import { D } from '@/app/lib/theme'

/** Card padrão de lista. */
export default function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 18, overflow: 'hidden', ...style }}>
      {children}
    </div>
  )
}

/** Quadrado de ícone/foto à esquerda do card (mesma medida do FotoThumb). */
export const CARD_THUMB = 52
