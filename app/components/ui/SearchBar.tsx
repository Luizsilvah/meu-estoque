'use client'
import BarcodeCameraButton from '../BarcodeCameraButton'
import { D } from '@/app/lib/theme'
import Icon from './Icon'

type Props = {
  value: string
  onChange: (valor: string) => void
  /** Use para o leitor físico (sequência rápida de teclas + Enter) que a página já trata */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  placeholder?: string
  /** Scanner da câmera embutido (BarcodeCameraButton) … */
  scanner?: { instanceId: string; onScanned: (codigo: string) => void }
  /** … ou um scanner próprio da página, aberto por este clique */
  onScanClick?: () => void
}

/** Campo de busca com lupa e botão de scanner à direita. */
export default function SearchBar({ value, onChange, onKeyDown, placeholder = 'Buscar ou bipar código...', scanner, onScanClick }: Props) {
  const botaoScanner = (abrir: () => void) => (
    <button type="button" onClick={abrir} aria-label="Escanear código de barras" title="Escanear código de barras" style={{
      position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 40, height: 40, borderRadius: 12,
      background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <Icon nome="scan" size={22} />
    </button>
  )
  const temScanner = !!scanner || !!onScanClick

  return (
    <div style={{ position: 'relative' }}>
      <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: D.text2, display: 'flex', pointerEvents: 'none' }}>
        <Icon nome="search" size={18} />
      </span>
      <input
        type="text" enterKeyHint="search" value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown}
        style={{
          width: '100%', boxSizing: 'border-box', height: 50, padding: `0 ${temScanner ? 50 : 14}px 0 42px`, borderRadius: 14,
          background: D.card, border: `1px solid ${D.border}`, color: D.text, fontSize: 15, fontFamily: 'inherit', outline: 'none',
        }}
      />
      {scanner
        ? <BarcodeCameraButton instanceId={scanner.instanceId} onScanned={scanner.onScanned} renderTrigger={botaoScanner} />
        : onScanClick && botaoScanner(onScanClick)}
    </div>
  )
}
