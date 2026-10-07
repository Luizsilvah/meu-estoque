import { D } from '@/app/lib/theme'

/** Fundo da página + coluna central de até 480px (no computador fica no meio, como celular). */
export default function Page({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: D.bg, overflowX: 'clip' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px 24px', boxSizing: 'border-box' }}>
        {children}
      </div>
    </div>
  )
}
