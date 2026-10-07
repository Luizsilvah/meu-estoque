'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { D } from '@/app/lib/theme'
import { FUNCOES, FUNCOES_CONFIGURAVEIS, GRUPOS, Permissoes, permissoesEfetivas, permissoesPadrao, type Funcao } from '@/app/lib/permissoes'
import Page from '@/app/components/ui/Page'
import PageHeader from '@/app/components/ui/PageHeader'
import Card from '@/app/components/ui/Card'
import Icon from '@/app/components/ui/Icon'
import Toggle from '@/app/components/ui/Toggle'
import { COR, gradiente, visual } from '@/app/components/ui/visualFuncoes'

type Usuario = { id: string; nome: string; perfil: 'admin' | 'funcionario'; permissoes: Permissoes | null; criado_em: string }

// Interruptores por função, agrupados, com Marcar/Desmarcar todas. A linha
// inteira é o botão (área de toque grande no celular).
function PainelPermissoes({ valor, onChange, disabled }: { valor: Permissoes; onChange: (p: Permissoes) => void; disabled?: boolean }) {
  function todas(ligar: boolean) {
    onChange({ ...valor, ...Object.fromEntries(FUNCOES_CONFIGURAVEIS.map((f) => [f.id, ligar])) })
  }
  const ligadas = FUNCOES_CONFIGURAVEIS.filter((f) => valor[f.id]).length
  const btnMini: React.CSSProperties = { flex: 1, height: 38, borderRadius: 12, border: `1px solid ${D.border}`, background: D.input, color: D.text2, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }
  const iconeFuncao = (f: Funcao) => {
    const v = visual(f)
    return (
      <span style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${v.cor} 16%, transparent)`, color: v.cor }}>
        <Icon nome={v.icone} size={18} />
      </span>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: D.text2, flexShrink: 0 }}>{ligadas}/{FUNCOES_CONFIGURAVEIS.length}</span>
        <button type="button" disabled={disabled} onClick={() => todas(true)} style={btnMini}>Marcar todas</button>
        <button type="button" disabled={disabled} onClick={() => todas(false)} style={btnMini}>Desmarcar todas</button>
      </div>
      {GRUPOS.map((grupo) => (
        <div key={grupo}>
          <p style={{ color: D.text2, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 8px 2px' }}>{grupo}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {FUNCOES.filter((f) => f.grupo === grupo).map((f) => f.somenteAdmin ? (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: D.input, border: `1px solid ${D.border}`, opacity: 0.6 }}>
                {iconeFuncao(f)}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', color: D.text, fontSize: 14, fontWeight: 700 }}>{f.nome}</span>
                  <span style={{ display: 'block', color: D.text2, fontSize: 12, marginTop: 2 }}>{f.descricao}</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: D.text2, flexShrink: 0 }}><Icon nome="lock" size={14} /> Só admin</span>
              </div>
            ) : (
              <Toggle key={f.id} label={f.nome} descricao={f.descricao} icone={iconeFuncao(f)}
                ligado={!!valor[f.id]} disabled={disabled}
                onChange={(ligar) => onChange({ ...valor, [f.id]: ligar })} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function resumoPermissoes(u: Usuario): string {
  if (u.perfil === 'admin') return 'acesso a tudo'
  const efetivas = permissoesEfetivas(u.permissoes)
  const nomes = FUNCOES_CONFIGURAVEIS.filter((f) => efetivas[f.id]).map((f) => f.nome)
  return nomes.length ? nomes.join(', ') : 'nenhuma função'
}

const AVISO_ADMIN = (
  <p style={{ fontSize: 13, color: D.text2, background: D.input, borderRadius: 12, padding: '12px 14px', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
    <Icon nome="lock" size={16} /> Admin vê todas as funções.
  </p>
)

const inputStyle: React.CSSProperties = { width: '100%', background: D.input, border: `1px solid ${D.border}`, borderRadius: 12, padding: '11px 14px', fontSize: 15, color: D.text, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: D.text2, marginBottom: 6 }

export default function AdminUsuarios() {
  const router = useRouter()
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loadingLista, setLoadingLista] = useState(true)
  const [confirmarApagar, setConfirmarApagar] = useState<string | null>(null)
  const [senhaApagar, setSenhaApagar] = useState('')
  const [apagando, setApagando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editandoPerfil, setEditandoPerfil] = useState<'admin' | 'funcionario'>('funcionario')
  const [editandoNome, setEditandoNome] = useState('')
  const [editandoPermissoes, setEditandoPermissoes] = useState<Permissoes>({})
  const [salvandoPermissoes, setSalvandoPermissoes] = useState(false)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [perfil, setPerfil] = useState<'admin' | 'funcionario'>('funcionario')
  const [permissoes, setPermissoes] = useState<Permissoes>(permissoesPadrao)
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
    // Valores efetivos (com a herança das chaves novas) = o que o usuário vê hoje no menu.
    // Chaves que não são funções (dashboard, cadastrar) vêm junto e são regravadas como estão.
    let permissoesFrescas: Permissoes = permissoesEfetivas(u.permissoes)
    let perfilFresco = u.perfil
    let nomeFresco = u.nome
    if (res.ok) {
      const lista: Usuario[] = await res.json()
      const fresco = lista.find((x) => x.id === u.id)
      if (fresco) { permissoesFrescas = permissoesEfetivas(fresco.permissoes); perfilFresco = fresco.perfil; nomeFresco = fresco.nome; setUsuarios(lista) }
    }
    setEditandoId(u.id); setEditandoNome(nomeFresco); setEditandoPerfil(perfilFresco); setEditandoPermissoes(permissoesFrescas)
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
      setNome(''); setEmail(''); setSenha(''); setPerfil('funcionario'); setPermissoes(permissoesPadrao())
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

  const btnPrimary: React.CSSProperties = { background: '#6366F1', color: '#fff', border: 'none', borderRadius: 14, height: 46, fontSize: 14, fontWeight: 700, cursor: 'pointer', flex: 1, fontFamily: 'inherit' }
  const btnSecondary: React.CSSProperties = { background: 'none', color: D.text2, border: `1px solid ${D.border}`, borderRadius: 14, height: 46, fontSize: 14, fontWeight: 600, cursor: 'pointer', flex: 1, fontFamily: 'inherit' }
  const botaoIcone: React.CSSProperties = { width: 40, height: 40, borderRadius: 12, background: D.input, border: `1px solid ${D.border}`, color: D.text2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 }

  return (
    <Page>
      <PageHeader titulo="Usuários" subtitulo="Acesso da equipe e permissões" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Formulário novo usuário */}
        <Card style={{ padding: 16 }}>
          <h2 style={{ color: D.text, fontWeight: 800, fontSize: 16, margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon nome="plus" size={18} /> Novo funcionário
          </h2>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div><label style={labelStyle}>Nome</label><input type="text" value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome completo" required style={inputStyle} /></div>
            <div><label style={labelStyle}>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="funcionario@email.com" required style={inputStyle} /></div>
            <div><label style={labelStyle}>Senha</label><input type="password" value={senha} onChange={e => setSenha(e.target.value)} placeholder="Mínimo 6 caracteres" required minLength={6} style={inputStyle} /></div>

            <div>
              <label style={labelStyle}>Perfil</label>
              <div role="radiogroup" style={{ display: 'flex', background: D.input, borderRadius: 14, padding: 4, gap: 4 }}>
                {(['funcionario', 'admin'] as const).map((p) => (
                  <button key={p} type="button" role="radio" aria-checked={perfil === p} onClick={() => setPerfil(p)}
                    style={{ flex: 1, height: 40, borderRadius: 10, fontSize: 14, fontWeight: 700, border: 'none', background: perfil === p ? '#6366F1' : 'transparent', color: perfil === p ? '#fff' : D.text2, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {p === 'admin' ? 'Admin' : 'Funcionário'}
                  </button>
                ))}
              </div>
            </div>

            {perfil === 'admin' ? AVISO_ADMIN : (
              <div>
                <label style={labelStyle}>Funções que pode ver</label>
                <PainelPermissoes valor={permissoes} onChange={setPermissoes} disabled={salvando} />
              </div>
            )}

            {erro && <p style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444', fontSize: 13, fontWeight: 600, padding: '10px 12px', borderRadius: 12, textAlign: 'center', margin: 0 }}>{erro}</p>}
            {sucesso && <p style={{ background: 'rgba(16,185,129,0.1)', color: '#10B981', fontSize: 13, fontWeight: 600, padding: '10px 12px', borderRadius: 12, textAlign: 'center', margin: 0 }}>{sucesso}</p>}
            <button type="submit" disabled={salvando} style={{ ...btnPrimary, flex: 'none', opacity: salvando ? 0.6 : 1 }}>{salvando ? 'Criando...' : 'Criar funcionário'}</button>
          </form>
        </Card>

        {/* Lista de usuários */}
        {!loadingLista && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ color: D.text2, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 0 2px' }}>Equipe ({usuarios.length})</p>
            {usuarios.map((u) => {
              const admin = u.perfil === 'admin'
              const inicial = (u.nome.trim()[0] ?? '·').toUpperCase()
              return (
                <Card key={u.id} style={{ padding: '14px 16px' }}>
                  {confirmarApagar === u.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <p style={{ color: D.text, fontSize: 14, fontWeight: 600, margin: 0 }}>Apagar <strong>{u.nome}</strong>?</p>
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div>
                        <label style={labelStyle}>Nome</label>
                        <input style={inputStyle} value={editandoNome} onChange={e => setEditandoNome(e.target.value)} />
                      </div>
                      {editandoPerfil === 'admin' ? AVISO_ADMIN : (
                        <PainelPermissoes valor={editandoPermissoes} onChange={setEditandoPermissoes} disabled={salvandoPermissoes} />
                      )}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => setEditandoId(null)} style={btnSecondary}>Cancelar</button>
                        <button onClick={() => salvarPermissoes(u.id)} disabled={salvandoPermissoes} style={{ ...btnPrimary, opacity: salvandoPermissoes ? 0.6 : 1 }}>{salvandoPermissoes ? 'Salvando...' : 'Salvar'}</button>
                      </div>
                    </div>

                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 17, fontWeight: 800, background: gradiente(admin ? COR.roxo : COR.azul) }}>
                        {inicial}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ color: D.text, fontSize: 15, fontWeight: 800, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.nome}</p>
                        <span style={{ display: 'inline-block', marginTop: 3, fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 6, background: admin ? 'var(--accent-bg)' : 'rgba(16,185,129,0.15)', color: admin ? 'var(--accent-text)' : '#10B981' }}>
                          {admin ? 'ADMIN' : 'FUNCIONÁRIO'}
                        </span>
                        <p style={{ color: D.text2, fontSize: 12, margin: '4px 0 0', lineHeight: 1.35 }}>{resumoPermissoes(u)}</p>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button onClick={() => abrirEdicao(u)} style={botaoIcone} aria-label={`Editar ${u.nome}`} title="Editar"><Icon nome="edit" size={18} /></button>
                        <button onClick={() => { setConfirmarApagar(u.id); setEditandoId(null) }} style={{ ...botaoIcone, color: '#EF4444' }} aria-label={`Apagar ${u.nome}`} title="Apagar"><Icon nome="trash" size={18} /></button>
                      </div>
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </Page>
  )
}
