'use client'
import { D } from '@/app/lib/theme'
import Icon from './Icon'

type Props = {
  /** Texto do campo (só dígitos; '' enquanto a pessoa apaga para digitar outro número). */
  valor: string
  onMudar: (valor: string) => void
  /** Máximo dos botões e do ajuste ao sair do campo (ex.: o disponível na origem). */
  max?: number
  tamanho?: 'grande' | 'pequeno'
  autoFocus?: boolean
  onEnter?: () => void
  rotulo?: string
}

/**
 * Quantidade com − / + e campo digitável. Enquanto digita, o campo mostra
 * exatamente o que foi digitado (pode ficar vazio ou passar do máximo — quem
 * usa mostra o aviso e trava o botão); só ao sair do campo é que ajusta para
 * 1..max. Os botões nunca passam de 1..max.
 */
export default function CampoQuantidade({ valor, onMudar, max, tamanho = 'grande', autoFocus, onEnter, rotulo = 'Quantidade' }: Props) {
  const n = Number(valor) || 0
  const teto = max != null ? Math.max(1, max) : Infinity
  const ajustar = (v: number) => String(Math.min(teto, Math.max(1, v)))
  const grande = tamanho === 'grande'
  const lado = grande ? 48 : 34
  const botao: React.CSSProperties = {
    width: lado, height: lado, borderRadius: grande ? 14 : 10, border: `1px solid ${D.border}`, background: D.input, color: D.text,
    cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, fontFamily: 'inherit',
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: grande ? 10 : 6, minWidth: 0 }}>
      <button type="button" onClick={() => onMudar(ajustar(n - 1))} disabled={n <= 1} aria-label={`Diminuir ${rotulo.toLowerCase()}`}
        style={{ ...botao, opacity: n <= 1 ? 0.4 : 1 }}>
        <Icon nome="minus" size={grande ? 18 : 15} traco={2.6} />
      </button>
      <input type="text" inputMode="numeric" pattern="[0-9]*" autoFocus={autoFocus} aria-label={rotulo}
        value={valor}
        onChange={(e) => onMudar(e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 6))}
        onBlur={() => { if (!valor || n < 1 || n > teto) onMudar(ajustar(n || 1)) }}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) onEnter() }}
        style={{
          flex: grande ? 1 : '0 0 46px', minWidth: 0, height: lado, boxSizing: 'border-box', textAlign: 'center',
          background: D.input, border: `1px solid ${max != null && n > max ? '#EF4444' : D.border}`, borderRadius: grande ? 12 : 8,
          color: D.text, fontSize: grande ? 22 : 15, fontWeight: 800, outline: 'none', padding: '0 4px', fontVariantNumeric: 'tabular-nums',
        }} />
      <button type="button" onClick={() => onMudar(ajustar(n + 1))} disabled={n >= teto} aria-label={`Aumentar ${rotulo.toLowerCase()}`}
        style={{ ...botao, opacity: n >= teto ? 0.4 : 1 }}>
        <Icon nome="plus" size={grande ? 18 : 15} traco={2.6} />
      </button>
    </div>
  )
}
