'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowser } from '../lib/supabase-browser'

import AuthShell, { authStyles as s, EmailField, PasswordField } from '../components/auth/AuthShell'

type Tela = 'login' | 'reset_enviado' | 'primeiro_acesso' | 'nova_senha' | 'senha_atualizada'

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

  return (
    <AuthShell>

      {tela === 'nova_senha' && (
        <>
          <h2 className={s.title}>Nova senha</h2>
          <p className={s.subtitle}>Digite e confirme sua nova senha.</p>
          <form onSubmit={handleNovaSenha} className={s.form}>
            <PasswordField id="nova-senha" label="Nova senha" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} placeholder="Mínimo 6 caracteres" required autoFocus autoComplete="new-password" />
            <PasswordField id="confirmar-senha" label="Confirmar senha" value={confirmarSenha} onChange={e => setConfirmarSenha(e.target.value)} placeholder="Repita a senha" required autoComplete="new-password" />
            {erro && <p className={s.error} role="alert">{erro}</p>}
            <button type="submit" disabled={carregando} className={s.btn}>{carregando ? 'Salvando...' : 'Salvar nova senha'}</button>
          </form>
        </>
      )}

      {tela === 'senha_atualizada' && (
        <div className={s.state}>
          <div className={s.stateIcon}>✅</div>
          <h2 className={s.title}>Senha atualizada!</h2>
          <p className={s.stateText}>Sua senha foi alterada com sucesso.</p>
          <button onClick={() => { router.push('/'); router.refresh() }} className={s.btn}>Ir para o início</button>
        </div>
      )}

      {tela === 'reset_enviado' && (
        <div className={s.state}>
          <div className={s.stateIcon}>📧</div>
          <h2 className={s.title}>Email enviado!</h2>
          <p className={s.stateText}>
            Verifique a caixa de entrada de <strong>{email}</strong> e clique no link para criar uma nova senha.
          </p>
          <button onClick={() => setTela('login')} className={s.link}>← Voltar ao login</button>
        </div>
      )}

      {tela === 'primeiro_acesso' && (
        <div className={s.state}>
          <div className={s.stateIcon}>👋</div>
          <h2 className={s.title}>Primeiro acesso</h2>
          <p className={s.stateText}>
            Para ter acesso ao sistema, solicite ao administrador Luiz que cadastre seu email.
          </p>
          <button onClick={() => setTela('login')} className={s.link}>← Voltar ao login</button>
        </div>
      )}

      {tela === 'login' && (
        <>
          <h2 className={s.title}>
            <span className={s.onlyMobile}>Entrar</span>
            <span className={s.onlyDesktop}>Bem-vindo de volta</span>
          </h2>
          <p className={s.subtitle}>
            <span className={s.onlyMobile}>Bem-vindo de volta</span>
            <span className={s.onlyDesktop}>Entre com sua conta para continuar</span>
          </p>
          <form onSubmit={handleLogin} className={s.form}>
            <EmailField id="email" label="Email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" required autoComplete="email" />
            <PasswordField id="senha" label="Senha" value={senha} onChange={e => setSenha(e.target.value)} placeholder="••••••••" required autoComplete="current-password" />
            <div className={s.rowEnd}>
              <button type="button" onClick={handleResetSenha} disabled={carregando} className={s.link}>
                <span className={s.onlyMobile}>Esqueceu?</span>
                <span className={s.onlyDesktop}>Esqueceu a senha?</span>
              </button>
            </div>
            {erro && <p className={s.error} role="alert">{erro}</p>}
            <button type="submit" disabled={carregando} className={s.btn}>{carregando ? 'Entrando...' : 'Entrar'}</button>
          </form>
          <p className={s.footer}>
            Primeiro acesso?{' '}
            <button type="button" onClick={() => { setErro(''); setTela('primeiro_acesso') }} className={s.link}>Pedir acesso</button>
          </p>
        </>
      )}

    </AuthShell>
  )
}
