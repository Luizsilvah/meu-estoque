'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowser } from '../lib/supabase-browser'

import { D } from '@/app/lib/theme'

type Tela = 'login' | 'reset_enviado' | 'primeiro_acesso' | 'nova_senha' | 'senha_atualizada'

const inputStyle: React.CSSProperties = {
  width: '100%', background: D.input, border: `1px solid ${D.border}`, borderRadius: 14,
  padding: '12px 16px', fontSize: 14, color: D.text, outline: 'none', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: D.text2, marginBottom: 6, marginLeft: 4 }

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [tela, setTela] = useState<Tela>('login')

  useEffect(() => {
    const supabase = createSupabaseBrowser()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setTela('nova_senha')
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setCarregando(true)
    try {
      const supabase = createSupabaseBrowser()
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
      if (error) { setErro(error.message === 'Invalid login credentials' ? 'Email ou senha incorretos.' : error.message); return }
      router.push('/')
      router.refresh()
    } finally { setCarregando(false) }
  }

  async function handleResetSenha() {
    if (!email) { setErro('Digite seu email acima antes de continuar.'); return }
    setErro('')
    setCarregando(true)
    try {
      const supabase = createSupabaseBrowser()
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-senha` })
      if (error) { setErro(error.message); return }
      setTela('reset_enviado')
    } finally { setCarregando(false) }
  }

  async function handleNovaSenha(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    if (novaSenha.length < 6) { setErro('A senha deve ter pelo menos 6 caracteres.'); return }
    if (novaSenha !== confirmarSenha) { setErro('As senhas não coincidem.'); return }
    setCarregando(true)
    try {
      const supabase = createSupabaseBrowser()
      const { error } = await supabase.auth.updateUser({ password: novaSenha })
      if (error) { setErro(error.message); return }
      setTela('senha_atualizada')
    } finally { setCarregando(false) }
  }

  const btnPrimary: React.CSSProperties = { width: '100%', padding: '14px', borderRadius: 14, background: '#6366F1', color: '#fff', fontWeight: 800, fontSize: 14, border: 'none', cursor: 'pointer' }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: D.bg }}>

      {/* Header */}
      <div style={{ background: 'var(--page-header)', padding: '64px 24px 48px', textAlign: 'center', borderBottom: `1px solid ${D.border}` }}>
        <p style={{ fontSize: 40, marginBottom: 12 }}>📦</p>
        <h1 style={{ color: D.text, fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>Fluxio</h1>
        <p style={{ color: D.muted, fontSize: 14, marginTop: 6 }}>Controle de estoque</p>
      </div>

      <div style={{ flex: 1, padding: '0 20px 32px', marginTop: -20 }}>
        <div style={{ background: D.card, borderRadius: 24, padding: 24, border: `1px solid ${D.border}`, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>

          {tela === 'nova_senha' && (
            <>
              <h2 style={{ color: D.text, fontWeight: 800, fontSize: 18, marginBottom: 4 }}>Nova senha</h2>
              <p style={{ color: D.text2, fontSize: 13, marginBottom: 20 }}>Digite e confirme sua nova senha.</p>
              <form onSubmit={handleNovaSenha} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div><label style={labelStyle}>Nova senha</label><input type="password" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} placeholder="Mínimo 6 caracteres" required autoFocus style={inputStyle} /></div>
                <div><label style={labelStyle}>Confirmar senha</label><input type="password" value={confirmarSenha} onChange={e => setConfirmarSenha(e.target.value)} placeholder="Repita a senha" required style={inputStyle} /></div>
                {erro && <p style={{ background: 'rgba(239,68,68,0.1)', color: '#F87171', fontSize: 13, padding: '8px 12px', borderRadius: 10, textAlign: 'center' }}>{erro}</p>}
                <button type="submit" disabled={carregando} style={{ ...btnPrimary, opacity: carregando ? 0.6 : 1 }}>{carregando ? 'Salvando...' : 'Salvar nova senha'}</button>
              </form>
            </>
          )}

          {tela === 'senha_atualizada' && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <p style={{ fontSize: 40, marginBottom: 12 }}>✅</p>
              <p style={{ color: D.text, fontWeight: 800, fontSize: 18, marginBottom: 8 }}>Senha atualizada!</p>
              <p style={{ color: D.text2, fontSize: 14, marginBottom: 20 }}>Sua senha foi alterada com sucesso.</p>
              <button onClick={() => { router.push('/'); router.refresh() }} style={btnPrimary}>Ir para o início</button>
            </div>
          )}

          {tela === 'reset_enviado' && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <p style={{ fontSize: 40, marginBottom: 12 }}>📧</p>
              <p style={{ color: D.text, fontWeight: 800, fontSize: 18, marginBottom: 8 }}>Email enviado!</p>
              <p style={{ color: D.text2, fontSize: 14, marginBottom: 20 }}>
                Verifique a caixa de entrada de <strong style={{ color: D.text }}>{email}</strong> e clique no link para criar uma nova senha.
              </p>
              <button onClick={() => setTela('login')} style={{ background: 'none', border: 'none', color: 'var(--accent-text)', fontSize: 14, cursor: 'pointer' }}>← Voltar ao login</button>
            </div>
          )}

          {tela === 'primeiro_acesso' && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <p style={{ fontSize: 40, marginBottom: 12 }}>👋</p>
              <p style={{ color: D.text, fontWeight: 800, fontSize: 18, marginBottom: 8 }}>Primeiro acesso</p>
              <p style={{ color: D.text2, fontSize: 14, marginBottom: 20 }}>
                Para ter acesso ao sistema, solicite ao administrador Luiz que cadastre seu email.
              </p>
              <button onClick={() => setTela('login')} style={{ background: 'none', border: 'none', color: 'var(--accent-text)', fontSize: 14, cursor: 'pointer' }}>← Voltar ao login</button>
            </div>
          )}

          {tela === 'login' && (
            <>
              <h2 style={{ color: D.text, fontWeight: 800, fontSize: 20, marginBottom: 20 }}>Entrar</h2>
              <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div><label style={labelStyle}>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" required autoComplete="email" style={inputStyle} /></div>
                <div><label style={labelStyle}>Senha</label><input type="password" value={senha} onChange={e => setSenha(e.target.value)} placeholder="••••••••" required autoComplete="current-password" style={inputStyle} /></div>
                {erro && <p style={{ background: 'rgba(239,68,68,0.1)', color: '#F87171', fontSize: 13, padding: '8px 12px', borderRadius: 10, textAlign: 'center' }}>{erro}</p>}
                <button type="submit" disabled={carregando} style={{ ...btnPrimary, opacity: carregando ? 0.6 : 1 }}>{carregando ? 'Entrando...' : 'Entrar'}</button>
              </form>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, padding: '0 4px' }}>
                <button type="button" onClick={handleResetSenha} disabled={carregando} style={{ background: 'none', border: 'none', color: D.muted, fontSize: 12, cursor: 'pointer' }}>Esqueceu a senha?</button>
                <button type="button" onClick={() => { setErro(''); setTela('primeiro_acesso') }} style={{ background: 'none', border: 'none', color: D.muted, fontSize: 12, cursor: 'pointer' }}>Primeiro acesso?</button>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
