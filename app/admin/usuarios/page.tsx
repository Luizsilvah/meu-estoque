'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { D } from '@/app/lib/theme'

type Permissoes = {
  dashboard: boolean; estoque: boolean; movimentacao: boolean; historico: boolean
  cadastrar: boolean; scanner: boolean; chat: boolean
  conferencia: boolean; transferencia: boolean; checklist: boolean
  relatorio: boolean; graficos: boolean; codigos: boolean; nota: boolean
}
type Usuario = { id: string; nome: string; perfil: 'admin' | 'funcionario'; permissoes: Permissoes; criado_em: string }

const PERMISSOES_LABELS: { key: keyof Permissoes; label: string }[] = [
  { key: 'dashboard',    label: 'Dashboard' },
  { key: 'estoque',      label: 'Estoque' },
  { key: 'movimentacao', label: 'Movimentação' },
  { key: 'historico',    label: 'Histórico' },
  { key: 'cadastrar',    label: 'Cadastrar' },
  { key: 'scanner',      label: 'Scanner' },
  { key: 'chat',         label: 'Chat' },
  { key: 'conferencia',  label: 'Conferência' },
  { key: 'transferencia',label: 'Transferência' },
  { key: 'checklist',    label: 'Checklist' },
  { key: 'relatorio',    label: 'Relatório' },
  { key: 'graficos',     label: 'Gráficos' },
  { key: 'codigos',      label: 'Códigos de barras' },
  { key: 'nota',         label: 'Lançar nota' },
]

const PERMISSOES_DEFAULT: Permissoes = {
  dashboard: true, estoque: true, movimentacao: true, historico: true,
  cadastrar: false, scanner: true, chat: true,
  conferencia: false, transferencia: true, checklist: true,
  relatorio: false, graficos: false, codigos: false, nota: false,
}

function Toggle({ ativo, onClick }: { ativo: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ width: 44, height: 24, borderRadius: 12, background: ativo ? '#6366F1' : D.border, position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 2, width: 20, height: 20, background: '#fff', borderRadius: '50%', boxShadow: '0 1px 4px rgba(0,0,0,0.4)', transition: 'transform 0.2s', transform: ativo ? 'translateX(22px)' : 'translateX(2px)' }} />
    </div>
  )
}

const inputStyle: React.CSSProperties = { width: '100%', background: D.input, border: `1px solid ${D.border}`, borderRadius: 12, padding: '10px 14px', fontSize: 14, color: D.text, outline: 'none', boxSizing: 'border-box' }
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: D.text2, marginBottom: 6 }

export default function AdminUsuarios() {
  const router = useRouter()
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loadingLista, setLoadingLista] = useState(true)
  const [confirmarApagar, setConfirmarApagar] = useState<string | null>(null)
  const [senhaApagar, setSenhaApagar] = useState('')
  const [apagando, setApagando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editandoNome, setEditandoNome] = useState('')
  const [editandoPermissoes, setEditandoPermissoes] = useState<Permissoes>(PERMISSOES_DEFAULT)
  const [salvandoPermissoes, setSalvandoPermissoes] = useState(false)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [perfil, setPerfil] = useState<'admin' | 'funcionario'>('funcionario')
  const [permissoes, setPermissoes] = useState<Permissoes>(PERMISSOES_DEFAULT)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')

  useEffect(() => {
    fetch('/api/admin/usuarios').then(async (res) => {
      if (res.status === 401) { router.push('/login'); return }
      if (res.status === 403) { router.push('/'); return }
      if (res.ok) { const json = await res.json(); setUsuarios(Array.isArray(json) ? json : []) }
      setLoadingLista(false)
    })
  }, [router])

  async function recarregarLista() {
    const res = await fetch('/api/admin/usuarios')
    if (res.ok) { const json = await res.json(); if (Array.isArray(json)) setUsuarios(json) }
  }

  async function abrirEdicao(u: Usuario) {
    const res = await fetch('/api/admin/usuarios')
    let permissoesFrescas: Permissoes = { ...PERMISSOES_DEFAULT, ...u.permissoes }
    let nomeFresco = u.nome
    if (res.ok) {
      const lista: Usuario[] = await res.json()
      const fresco = lista.find((x) => x.id === u.id)
      if (fresco) { permissoesFrescas = { ...PERMISSOES_DEFAULT, ...fresco.permissoes }; nomeFresco = fresco.nome; setUsuarios(lista) }
    }
    setEditandoId(u.id); setEditandoNome(nomeFresco); setEditandoPermissoes(permissoesFrescas)
    setConfirmarApagar(null); setSenhaApagar('')
  }

  async function salvarPermissoes(id: string) {
    setSalvandoPermissoes(true)
    try {
      const res = await fetch('/api/admin/usuarios', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, nome: editandoNome, permissoes: editandoPermissoes }) })
      const json = await res.json()
      if (!res.ok) { setErro(json.erro ?? 'Erro ao salvar'); return }
      setEditandoId(null); await recarregarLista()
    } finally { setSalvandoPermissoes(false) }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setErro(''); setSucesso(''); setSalvando(true)
    try {
      const res = await fetch('/api/admin/usuarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome, email, senha, perfil, permissoes }) })
      const json = await res.json()
      if (!res.ok) { setErro(json.erro ?? 'Erro ao criar usuário'); return }
      setSucesso(`Usuário "${nome}" criado com sucesso!`)
      setNome(''); setEmail(''); setSenha(''); setPerfil('funcionario'); setPermissoes(PERMISSOES_DEFAULT)
      const lista = await fetch('/api/admin/usuarios').then(r => r.json())
      if (Array.isArray(lista)) setUsuarios(lista)
    } finally { setSalvando(false) }
  }

  async function handleApagar(id: string) {
    setApagando(true)
    try {
      const res = await fetch(`/api/admin/usuarios?id=${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) { setErro(json.erro ?? 'Erro ao apagar'); return }
      setUsuarios((prev) => prev.filter((u) => u.id !== id))
    } finally { setApagando(false); setConfirmarApagar(null); setSenhaApagar('') }
  }

  const btnPrimary: React.CSSProperties = { background: '#6366F1', color: '#fff', border: 'none', borderRadius: 12, padding: '10px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', flex: 1 }
  const btnSecondary: React.CSSProperties = { background: 'none', color: D.text2, border: `1px solid ${D.border}`, borderRadius: 12, padding: '10px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer', flex: 1 }

  return (
    <div style={{ minHeight: '100vh', background: D.bg }}>
      <div style={{ background: 'var(--page-header)', borderBottom: `1px solid ${D.border}`, padding: '48px 20px 20px' }}>
        <Link href="/" style={{ color: D.text2, fontSize: 13, textDecoration: 'none', display: 'block', marginBottom: 12 }}>← Voltar</Link>
        <h1 style={{ color: D.text, fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>Usuários</h1>
        <p style={{ color: D.muted, fontSize: 13, marginTop: 4 }}>Gerencie o acesso da equipe</p>
      </div>

      <div style={{ padding: '16px', maxWidth: 540, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Formulário novo usuário */}
        <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 18, padding: 20 }}>
          <h2 style={{ color: D.text, fontWeight: 800, fontSize: 16, marginBottom: 16 }}>Novo funcionário</h2>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div><label style={labelStyle}>Nome</label><input type="text" value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome completo" required style={inputStyle} /></div>
            <div><label style={labelStyle}>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="funcionario@email.com" required style={inputStyle} /></div>
            <div><label style={labelStyle}>Senha</label><input type="password" value={senha} onChange={e => setSenha(e.target.value)} placeholder="Mínimo 6 caracteres" required minLength={6} style={inputStyle} /></div>

            <div>
              <label style={labelStyle}>Perfil</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['funcionario', 'admin'] as const).map((p) => (
                  <button key={p} type="button" onClick={() => setPerfil(p)}
                    style={{ flex: 1, padding: '10px', borderRadius: 12, fontSize: 13, fontWeight: 600, border: `1px solid ${perfil === p ? '#6366F1' : D.border}`, background: perfil === p ? 'rgba(99,102,241,0.15)' : D.input, color: perfil === p ? 'var(--accent-text)' : D.text2, cursor: 'pointer' }}>
                    {p === 'admin' ? 'Admin' : 'Funcionário'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={labelStyle}>Permissões</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {PERMISSOES_LABELS.map(({ key, label }) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: D.input, borderRadius: 10, padding: '10px 14px', cursor: 'pointer' }}>
                    <span style={{ fontSize: 14, color: D.text2 }}>{label}</span>
                    <Toggle ativo={permissoes[key]} onClick={() => setPermissoes(p => ({ ...p, [key]: !p[key] }))} />
                  </label>
                ))}
              </div>
            </div>

            {erro && <p style={{ background: 'rgba(239,68,68,0.1)', color: '#F87171', fontSize: 13, padding: '8px 12px', borderRadius: 10, textAlign: 'center' }}>{erro}</p>}
            {sucesso && <p style={{ background: 'rgba(16,185,129,0.1)', color: '#10B981', fontSize: 13, padding: '8px 12px', borderRadius: 10, textAlign: 'center' }}>{sucesso}</p>}
            <button type="submit" disabled={salvando} style={{ ...btnPrimary, flex: 'none', padding: '12px', opacity: salvando ? 0.6 : 1 }}>{salvando ? 'Criando...' : 'Criar funcionário'}</button>
          </form>
        </div>

        {/* Lista de usuários */}
        {!loadingLista && (
          <div>
            <p style={{ color: D.muted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10 }}>Equipe ({usuarios.length})</p>
            {usuarios.map((u) => (
              <div key={u.id} style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 16, padding: '14px 16px', marginBottom: 8 }}>

                {confirmarApagar === u.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <p style={{ color: D.text, fontSize: 14, fontWeight: 600 }}>Apagar <strong>{u.nome}</strong>?</p>
                    <input type="password" placeholder="Digite a senha para confirmar" value={senhaApagar} onChange={e => setSenhaApagar(e.target.value)}
                      style={{ ...inputStyle, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }} autoFocus />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => { setConfirmarApagar(null); setSenhaApagar('') }} style={btnSecondary}>Cancelar</button>
                      <button onClick={() => handleApagar(u.id)} disabled={apagando || senhaApagar !== '2010'}
                        style={{ ...btnPrimary, background: '#EF4444', opacity: (apagando || senhaApagar !== '2010') ? 0.4 : 1 }}>
                        {apagando ? '...' : 'Confirmar apagar'}
                      </button>
                    </div>
                  </div>

                ) : editandoId === u.id ? (
                  <div>
                    <div style={{ marginBottom: 10 }}>
                      <label style={labelStyle}>Nome</label>
                      <input style={inputStyle} value={editandoNome} onChange={e => setEditandoNome(e.target.value)} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                      {PERMISSOES_LABELS.map(({ key, label }) => (
                        <label key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: D.input, borderRadius: 10, padding: '10px 14px', cursor: 'pointer' }}>
                          <span style={{ fontSize: 14, color: D.text2 }}>{label}</span>
                          <Toggle ativo={editandoPermissoes[key]} onClick={() => setEditandoPermissoes(p => ({ ...p, [key]: !p[key] }))} />
                        </label>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setEditandoId(null)} style={btnSecondary}>Cancelar</button>
                      <button onClick={() => salvarPermissoes(u.id)} disabled={salvandoPermissoes} style={{ ...btnPrimary, opacity: salvandoPermissoes ? 0.6 : 1 }}>{salvandoPermissoes ? 'Salvando...' : 'Salvar'}</button>
                    </div>
                  </div>

                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ color: D.text, fontSize: 14, fontWeight: 700 }}>{u.nome}</p>
                      <p style={{ color: D.muted, fontSize: 12, marginTop: 2 }}>
                        {u.perfil === 'admin' ? '👑 Admin' : '👤 Funcionário'} · {Object.entries(u.permissoes ?? {}).filter(([, v]) => v).map(([k]) => k).join(', ')}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: u.perfil === 'admin' ? 'rgba(99,102,241,0.15)' : 'rgba(16,185,129,0.15)', color: u.perfil === 'admin' ? 'var(--accent-text)' : '#10B981' }}>
                        {u.perfil === 'admin' ? 'Admin' : 'Funcionário'}
                      </span>
                      <button onClick={() => abrirEdicao(u)} style={{ background: 'none', border: 'none', color: D.muted, cursor: 'pointer', fontSize: 16 }} title="Editar">✏️</button>
                      <button onClick={() => { setConfirmarApagar(u.id); setEditandoId(null) }} style={{ background: 'none', border: 'none', color: D.muted, cursor: 'pointer', fontSize: 18 }} title="Apagar">🗑</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
