'use client'
import { useState } from 'react'
import Logo from '../Logo'
import s from './auth.module.css'

export { s as authStyles }

/** Fundo + hero (computador) / topo (celular) + cartão das telas de login e redefinição de senha. */
export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={s.page}>
      <div className={s.glows} aria-hidden>
        <div className={s.glowPurple} />
        <div className={s.glowCyan} />
      </div>

      <aside className={s.hero}>
        <Logo size={44} nameSize={24} />
        <div>
          <h1 className={s.heroTitle}>
            Seu estoque,<br />
            <span className={s.gradientText}>sempre no controle.</span>
          </h1>
          <p className={s.heroText}>
            Movimentação, validades e compra da semana num lugar só. Feito pra correria do balcão.
          </p>
          <div className={s.badges}>
            <span className={s.badge}>Compra de quinta</span>
            <span className={s.badge}>Validades em dia</span>
            <span className={s.badge}>Lançamento rápido</span>
          </div>
        </div>
      </aside>

      <header className={s.mobileHero}>
        <Logo size={76} showName={false} />
        <h1 className={s.mobileTitle}>Fluxio</h1>
        <p className={s.mobileTagline}>Seu estoque, sempre no controle.</p>
      </header>

      <main className={s.panel}>
        <div className={s.card}>{children}</div>
      </main>
    </div>
  )
}

const iconProps = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

export function MailIcon() {
  return <svg {...iconProps}><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7 8 6 8-6" /></svg>
}
export function LockIcon() {
  return <svg {...iconProps}><rect x="5" y="11" width="14" height="10" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
}
function EyeIcon({ open }: { open: boolean }) {
  return open
    ? <svg {...iconProps}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>
    : <svg {...iconProps}><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.2 3.2M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /><path d="m3 3 18 18" /></svg>
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'className'> & { label: string }

export function EmailField({ label, id, ...rest }: InputProps) {
  return (
    <div>
      <label className={s.label} htmlFor={id}>{label}</label>
      <div className={s.field}>
        <span className={s.fieldIcon}><MailIcon /></span>
        <input id={id} type="email" className={s.input} {...rest} />
      </div>
    </div>
  )
}

export function PasswordField({ label, id, ...rest }: InputProps) {
  const [visivel, setVisivel] = useState(false)
  return (
    <div>
      <label className={s.label} htmlFor={id}>{label}</label>
      <div className={s.field}>
        <span className={s.fieldIcon}><LockIcon /></span>
        <input id={id} type={visivel ? 'text' : 'password'} className={s.input} {...rest} />
        <button
          type="button"
          className={s.eye}
          onClick={() => setVisivel(v => !v)}
          aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
          aria-pressed={visivel}
        >
          <EyeIcon open={!visivel} />
        </button>
      </div>
    </div>
  )
}
