'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowser } from '../lib/supabase-browser'

import AuthShell, { authStyles as s, PasswordField } from '../components/auth/AuthShell'

type Estado = 'aguardando' | 'formulario' | 'sucesso' | 'erro_token'

export default function ResetSenha() {
  const router = useRouter()
  const [estado, setEstado] = useState<Estado>('aguardando')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    const supabase = createSupabaseBrowser()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setEstado('formulario')
    })
    const timeout = setTimeout(() => {
      setEstado((atual) => atual === 'aguardando' ? 'erro_token' : atual)
    }, 5000)
    return () => { subscription.unsubscribe(); clearTimeout(timeout) }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    if (novaSenha.length < 6) { setErro('A senha deve ter pelo menos 6 caracteres.'); return }
    if (novaSenha !== confirmarSenha) { setErro('As senhas não coincidem.'); return }
    setCarregando(true)
    try {
      const supabase = createSupabaseBrowser()
      const { error } = await supabase.auth.updateUser({ password: novaSenha })
      if (error) { setErro(error.message); return }
      setEstado('sucesso')
    } finally { setCarregando(false) }
  }

  return (
    <AuthShell>

      {estado === 'aguardando' && (
        <div className={s.state}>
          <h2 className={s.title}>Redefinir senha</h2>
          <p className={s.stateText}>Verificando link...</p>
        </div>
      )}

      {estado === 'erro_token' && (
        <div className={s.state}>
          <div className={s.stateIcon}>⚠️</div>
          <h2 className={s.title}>Link inválido ou expirado</h2>
          <p className={s.stateText}>Solicite um novo link de redefinição de senha.</p>
          <button onClick={() => router.push('/login')} className={s.btn}>Voltar ao login</button>
        </div>
      )}

      {estado === 'formulario' && (
        <>
          <h2 className={s.title}>Nova senha</h2>
          <p className={s.subtitle}>Digite e confirme sua nova senha.</p>
          <form onSubmit={handleSubmit} className={s.form}>
            <PasswordField id="nova-senha" label="Nova senha" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} placeholder="Mínimo 6 caracteres" required autoFocus autoComplete="new-password" />
            <PasswordField id="confirmar-senha" label="Confirmar senha" value={confirmarSenha} onChange={e => setConfirmarSenha(e.target.value)} placeholder="Repita a senha" required autoComplete="new-password" />
            {erro && <p className={s.error} role="alert">{erro}</p>}
            <button type="submit" disabled={carregando} className={s.btn}>{carregando ? 'Salvando...' : 'Salvar nova senha'}</button>
          </form>
        </>
      )}

      {estado === 'sucesso' && (
        <div className={s.state}>
          <div className={s.stateIcon}>✅</div>
          <h2 className={s.title}>Senha atualizada!</h2>
          <p className={s.stateText}>Sua senha foi alterada com sucesso.</p>
          <button onClick={() => { router.push('/'); router.refresh() }} className={s.btn}>Ir para o início</button>
        </div>
      )}

    </AuthShell>
  )
}
