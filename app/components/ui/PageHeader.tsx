import Link from 'next/link'
import { D } from '@/app/lib/theme'
import Icon from './Icon'

type Props = {
  titulo: string
  subtitulo?: React.ReactNode
  /** Para onde a seta volta (padrão: tela inicial) */
  voltarPara?: string
  /** Em vez de navegar, a seta chama esta função (ex.: voltar um passo dentro da página) */
  onVoltar?: () => void
  /** Botão/elemento à direita, ex.: <BotaoAcao icone="plus" ... /> */
  acao?: React.ReactNode
}

/** Cabeçalho compacto: seta de voltar num quadrado, título, subtítulo e ação opcional à direita. */
export default function PageHeader({ titulo, subtitulo, voltarPara = '/', onVoltar, acao }: Props) {
  const estiloVoltar: React.CSSProperties = {
    width: 42, height: 42, borderRadius: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: D.card, border: `1px solid ${D.border}`, color: D.text, cursor: 'pointer', padding: 0,
  }
  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 'max(16px, env(safe-area-inset-top)) 0 16px' }}>
      {onVoltar ? (
        <button type="button" onClick={onVoltar} aria-label="Voltar" style={estiloVoltar}><Icon nome="back" size={20} /></button>
      ) : (
        <Link href={voltarPara} aria-label="Voltar" style={estiloVoltar}><Icon nome="back" size={20} /></Link>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 style={{ color: D.text, fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', margin: 0, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {titulo}
        </h1>
        {subtitulo != null && (
          <p style={{ color: D.text2, fontSize: 13, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitulo}</p>
        )}
      </div>
      {acao}
    </header>
  )
}

/** Botão quadrado roxo para a ação do cabeçalho (ex.: "+"). */
export function BotaoAcao({ icone, onClick, label }: { icone: string; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} style={{
      width: 44, height: 44, borderRadius: 14, flexShrink: 0, border: 'none', cursor: 'pointer',
      background: '#6366F1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 6px 18px rgba(99,102,241,0.35)',
    }}>
      <Icon nome={icone} size={22} traco={2.4} />
    </button>
  )
}
