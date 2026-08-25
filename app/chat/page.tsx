'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'

import { D } from '@/app/lib/theme'
const sidebar = 'var(--sidebar-bg)'

type Mensagem = {
  id: string
  usuario_id: string
  usuario_nome: string
  texto: string | null
  criado_em: string
  grupo_id: string | null
  imagem_url: string | null
}

type Grupo = {
  id: string
  nome: string
  criado_por: string
  grupo_membros: { usuario_id: string }[]
}

type Membro = {
  usuario_id: string
  perfis: { id: string; nome: string } | null
}

type UsuarioLista = { id: string; nome: string }

function formatarHora(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatarDia(iso: string) {
  const d = new Date(iso)
  const hoje = new Date()
  const ontem = new Date(hoje)
  ontem.setDate(hoje.getDate() - 1)
  if (d.toDateString() === hoje.toDateString()) return 'Hoje'
  if (d.toDateString() === ontem.toDateString()) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

const inputStyle: React.CSSProperties = { background: D.input, border: `1px solid ${D.border}`, borderRadius: 14, padding: '10px 16px', fontSize: 14, color: D.text, outline: 'none', width: '100%', boxSizing: 'border-box' }

export default function Chat() {
  const [meuId, setMeuId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  const [canalAtivo, setCanalAtivo] = useState<string | null>(null)
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [loadingGrupos, setLoadingGrupos] = useState(true)
  const [sidebarAberta, setSidebarAberta] = useState(false)

  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const ultimoIdRef = useRef<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadando, setUploadando] = useState(false)

  const [msgSelecionada, setMsgSelecionada] = useState<string | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [modalCriarGrupo, setModalCriarGrupo] = useState(false)
  const [novoGrupoNome, setNovoGrupoNome] = useState('')
  const [criandoGrupo, setCriandoGrupo] = useState(false)

  const [confirmarApagarGrupo, setConfirmarApagarGrupo] = useState<string | null>(null)
  const [apagandoGrupo, setApagandoGrupo] = useState(false)
  const [modalMembros, setModalMembros] = useState(false)
  const [membros, setMembros] = useState<Membro[]>([])
  const [todosUsuarios, setTodosUsuarios] = useState<UsuarioLista[]>([])
  const [loadingMembros, setLoadingMembros] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((json) => { if (json.id) setMeuId(json.id); setIsAdmin(json.perfil === 'admin') })

    fetch('/api/grupos')
      .then((r) => r.json())
      .then((json) => { if (Array.isArray(json)) setGrupos(json) })
      .finally(() => setLoadingGrupos(false))
  }, [])

  const carregarMensagens = useCallback(async (scroll = false) => {
    try {
      const url = canalAtivo ? `/api/chat?grupo_id=${canalAtivo}` : '/api/chat'
      const res = await fetch(url)
      if (!res.ok) return
      const json: Mensagem[] = await res.json()
      if (!Array.isArray(json)) return
      setMensagens((prev) => {
        const ultimoNovo = json.at(-1)?.id ?? null
        if (ultimoNovo === ultimoIdRef.current && prev.length === json.length) return prev
        ultimoIdRef.current = ultimoNovo
        return json
      })
      if (scroll) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    } catch { /* silencioso */ }
  }, [canalAtivo])

  useEffect(() => {
    ultimoIdRef.current = null
    setMensagens([])
    carregarMensagens(true)
    const interval = setInterval(() => carregarMensagens(false), 5000)
    return () => clearInterval(interval)
  }, [carregarMensagens])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens])

  async function enviar() {
    const msg = texto.trim()
    if (!msg || enviando) return
    setEnviando(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: msg, grupo_id: canalAtivo }),
      })
      if (!res.ok) return
      setTexto('')
      await carregarMensagens(true)
      inputRef.current?.focus()
    } catch { /* silencioso */ }
    finally { setEnviando(false) }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() }
  }

  async function handleArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadando(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/chat/upload', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok || !json.url) return
      const resMsg = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: '', imagem_url: json.url, grupo_id: canalAtivo }),
      })
      if (!resMsg.ok) return
      await carregarMensagens(true)
    } catch { /* silencioso */ }
    finally {
      setUploadando(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function iniciarLongPress(id: string) {
    if (!isAdmin) return
    longPressTimer.current = setTimeout(() => setMsgSelecionada(id), 600)
  }

  function cancelarLongPress() {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
  }

  async function apagarMensagem(id: string) {
    setMsgSelecionada(null)
    await fetch(`/api/chat?id=${id}`, { method: 'DELETE' })
    setMensagens((prev) => prev.filter((m) => m.id !== id))
  }

  async function criarGrupo(e: React.FormEvent) {
    e.preventDefault()
    if (!novoGrupoNome.trim()) return
    setCriandoGrupo(true)
    try {
      const res = await fetch('/api/grupos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: novoGrupoNome.trim() }),
      })
      const json = await res.json()
      if (!res.ok || json.erro) return
      setGrupos((prev) => [...prev, { ...json, grupo_membros: [] }].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')))
      setNovoGrupoNome('')
      setModalCriarGrupo(false)
    } catch { /* silencioso */ }
    finally { setCriandoGrupo(false) }
  }

  async function apagarGrupo(id: string) {
    setApagandoGrupo(true)
    try {
      const res = await fetch(`/api/grupos?id=${id}`, { method: 'DELETE' })
      if (!res.ok) return
      setGrupos((prev) => prev.filter((g) => g.id !== id))
      if (canalAtivo === id) setCanalAtivo(null)
      setConfirmarApagarGrupo(null)
    } catch { /* silencioso */ }
    finally { setApagandoGrupo(false) }
  }

  async function abrirMembros(grupoId: string) {
    setLoadingMembros(true)
    setModalMembros(true)
    try {
      const [resMembros, resUsuarios] = await Promise.all([
        fetch(`/api/grupos/${grupoId}/membros`),
        fetch('/api/admin/usuarios'),
      ])
      const jMembros = await resMembros.json()
      const jUsuarios = await resUsuarios.json()
      if (Array.isArray(jMembros)) setMembros(jMembros)
      if (Array.isArray(jUsuarios)) setTodosUsuarios(jUsuarios.map((u: any) => ({ id: u.id, nome: u.nome })))
    } catch { /* silencioso */ }
    finally { setLoadingMembros(false) }
  }

  async function adicionarMembro(grupoId: string, usuario_id: string) {
    await fetch(`/api/grupos/${grupoId}/membros`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario_id }),
    })
    await abrirMembros(grupoId)
    setGrupos((prev) => prev.map((g) =>
      g.id === grupoId ? { ...g, grupo_membros: [...g.grupo_membros.filter(m => m.usuario_id !== usuario_id), { usuario_id }] } : g
    ))
  }

  async function removerMembro(grupoId: string, usuario_id: string) {
    await fetch(`/api/grupos/${grupoId}/membros?usuario_id=${usuario_id}`, { method: 'DELETE' })
    await abrirMembros(grupoId)
    setGrupos((prev) => prev.map((g) =>
      g.id === grupoId ? { ...g, grupo_membros: g.grupo_membros.filter(m => m.usuario_id !== usuario_id) } : g
    ))
  }

  const grupoAtivo = canalAtivo ? (grupos.find((g) => g.id === canalAtivo) ?? null) : null
  const nomeCanal = grupoAtivo ? grupoAtivo.nome : 'Geral'

  const msgPorDia: { dia: string; msgs: Mensagem[] }[] = []
  for (const m of mensagens) {
    const dia = formatarDia(m.criado_em)
    const ultimo = msgPorDia.at(-1)
    if (ultimo?.dia === dia) ultimo.msgs.push(m)
    else msgPorDia.push({ dia, msgs: [m] })
  }

  const membroIds = new Set(membros.map((m) => m.usuario_id))

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: D.bg }}>

      {/* Sidebar */}
      <div style={{
        display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden',
        width: sidebarAberta ? 224 : 0, transition: 'width 0.2s',
        background: sidebar, borderRight: `1px solid ${D.border}`,
      }}>
        <div style={{ padding: '48px 12px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', color: 'var(--accent-text)' }}>Canais</span>
          {isAdmin && (
            <button onClick={() => setModalCriarGrupo(true)}
              style={{ background: 'none', border: 'none', color: 'var(--accent-text)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>＋</button>
          )}
        </div>

        <button onClick={() => { setCanalAtivo(null); setSidebarAberta(false) }}
          style={{ textAlign: 'left', padding: '10px 16px', fontSize: 14, fontWeight: 500, border: 'none', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            background: canalAtivo === null ? 'rgba(99,102,241,0.2)' : 'transparent',
            color: canalAtivo === null ? 'var(--accent-text)' : D.text2 }}>
          # Geral
        </button>

        {loadingGrupos ? (
          <p style={{ padding: '8px 16px', fontSize: 12, color: D.text2, opacity: 0.6 }}>Carregando...</p>
        ) : (
          grupos.map((g) => (
            <div key={g.id}>
              {confirmarApagarGrupo === g.id ? (
                <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <p style={{ fontSize: 12, color: D.text2 }}>Apagar <strong style={{ color: D.text }}>{g.nome}</strong>?</p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setConfirmarApagarGrupo(null)}
                      style={{ flex: 1, padding: '4px', borderRadius: 8, fontSize: 11, fontWeight: 600, border: `1px solid ${D.border}`, background: 'none', color: D.text2, cursor: 'pointer' }}>
                      Cancelar
                    </button>
                    <button onClick={() => apagarGrupo(g.id)} disabled={apagandoGrupo}
                      style={{ flex: 1, padding: '4px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: '#EF4444', color: '#fff', border: 'none', cursor: 'pointer', opacity: apagandoGrupo ? 0.5 : 1 }}>
                      {apagandoGrupo ? '...' : 'Apagar'}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <button onClick={() => { setCanalAtivo(g.id); setSidebarAberta(false) }}
                    style={{ flex: 1, textAlign: 'left', padding: '10px 16px', fontSize: 14, fontWeight: 500, border: 'none', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      background: canalAtivo === g.id ? 'rgba(99,102,241,0.2)' : 'transparent',
                      color: canalAtivo === g.id ? 'var(--accent-text)' : D.text2 }}>
                    # {g.nome}
                  </button>
                  {isAdmin && (
                    <button onClick={() => setConfirmarApagarGrupo(g.id)}
                      style={{ paddingRight: 12, fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', color: D.muted }}>🗑</button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Área principal */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>

        {/* Header */}
        <div style={{ background: 'var(--page-header)', borderBottom: `1px solid ${D.border}`, padding: '40px 16px 16px', flexShrink: 0 }}>
          <Link href="/" style={{ color: D.text2, fontSize: 13, textDecoration: 'none', display: 'block', marginBottom: 10 }}>← Voltar</Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setSidebarAberta((v) => !v)}
              style={{ background: 'none', border: 'none', color: D.text, fontSize: 20, cursor: 'pointer', flexShrink: 0 }}>☰</button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: D.text2, fontSize: 12, fontWeight: 500 }}>{canalAtivo ? 'Grupo' : 'Canal geral'}</p>
              <h1 style={{ color: D.text, fontSize: 18, fontWeight: 800, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}># {nomeCanal}</h1>
            </div>
            {isAdmin && grupoAtivo && (
              <button onClick={() => abrirMembros(grupoAtivo.id)}
                style={{ background: 'none', border: 'none', color: D.text2, fontSize: 12, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span>👥</span><span>{grupoAtivo.grupo_membros.length}</span>
              </button>
            )}
          </div>
        </div>

        {/* Mensagens */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {mensagens.length === 0 && (
            <p style={{ textAlign: 'center', color: D.text2, fontSize: 14, marginTop: 40 }}>Nenhuma mensagem ainda. Diga olá! 👋</p>
          )}

          {msgPorDia.map(({ dia, msgs }) => (
            <div key={dia}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0' }}>
                <div style={{ flex: 1, height: 1, background: D.border }} />
                <span style={{ fontSize: 11, color: D.muted, fontWeight: 600 }}>{dia}</span>
                <div style={{ flex: 1, height: 1, background: D.border }} />
              </div>

              {msgs.map((m, idx) => {
                const minha = m.usuario_id === meuId
                const anterior = idx > 0 ? msgs[idx - 1] : null
                const mesmoPessoa = anterior?.usuario_id === m.usuario_id
                const selecionada = msgSelecionada === m.id

                return (
                  <div key={m.id} style={{ display: 'flex', justifyContent: minha ? 'flex-end' : 'flex-start', marginTop: mesmoPessoa ? 2 : 12 }}>
                    <div style={{ maxWidth: '78%' }}>
                      {!minha && !mesmoPessoa && (
                        <p style={{ fontSize: 11, fontWeight: 600, color: D.text2, marginBottom: 4, marginLeft: 4 }}>{m.usuario_nome}</p>
                      )}

                      <div
                        style={{
                          borderTopLeftRadius: 18, borderTopRightRadius: 18,
                          borderBottomRightRadius: minha ? 4 : 18, borderBottomLeftRadius: minha ? 18 : 4,
                          overflow: 'hidden', fontSize: 14, lineHeight: '1.5', userSelect: 'none',
                          ...(minha
                            ? { background: selecionada ? '#EF4444' : '#4F46E5', color: '#fff', cursor: isAdmin ? 'pointer' : 'default' }
                            : { background: selecionada ? 'rgba(239,68,68,0.2)' : D.card, color: D.text, border: `1px solid ${D.border}`, cursor: isAdmin ? 'pointer' : 'default' }
                          ),
                        }}
                        onMouseDown={() => iniciarLongPress(m.id)}
                        onMouseUp={cancelarLongPress}
                        onMouseLeave={cancelarLongPress}
                        onTouchStart={() => iniciarLongPress(m.id)}
                        onTouchEnd={cancelarLongPress}
                        onTouchMove={cancelarLongPress}
                      >
                        {m.imagem_url && (
                          <img src={m.imagem_url} alt="imagem" style={{ maxWidth: '100%', display: 'block', maxHeight: 260, objectFit: 'cover' }} />
                        )}
                        {m.texto && (
                          <div style={{ padding: '10px 14px' }}>
                            <p style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>{m.texto}</p>
                          </div>
                        )}
                        <div style={{ padding: '0 14px 8px', fontSize: 11, textAlign: 'right', opacity: 0.55 }}>
                          {formatarHora(m.criado_em)}
                        </div>
                      </div>

                      {selecionada && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 4, justifyContent: minha ? 'flex-end' : 'flex-start' }}>
                          <button onClick={() => setMsgSelecionada(null)}
                            style={{ padding: '4px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600, border: `1px solid ${D.border}`, background: D.card, color: D.text2, cursor: 'pointer' }}>
                            Cancelar
                          </button>
                          <button onClick={() => apagarMensagem(m.id)}
                            style={{ padding: '4px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600, background: '#EF4444', color: '#fff', border: 'none', cursor: 'pointer' }}>
                            Apagar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ flexShrink: 0, padding: '12px 16px', display: 'flex', gap: 8, alignItems: 'flex-end', background: D.card, borderTop: `1px solid ${D.border}` }}>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleArquivo} />
          <button onClick={() => fileInputRef.current?.click()} disabled={uploadando}
            style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, background: D.input, border: `1px solid ${D.border}`, cursor: 'pointer', opacity: uploadando ? 0.4 : 1 }}>
            {uploadando ? '⏳' : '📎'}
          </button>

          <textarea ref={inputRef} rows={1} value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Mensagem em #${nomeCanal}…`}
            style={{ flex: 1, resize: 'none', borderRadius: 14, padding: '12px 16px', fontSize: 14, color: D.text, background: D.input, border: `1px solid ${D.border}`, outline: 'none', maxHeight: 120, overflowY: 'auto' }}
          />
          <button onClick={enviar} disabled={enviando || !texto.trim()}
            style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, background: '#6366F1', border: 'none', color: '#fff', cursor: 'pointer', opacity: (enviando || !texto.trim()) ? 0.4 : 1 }}>
            ➤
          </button>
        </div>
      </div>

      {/* Modal criar grupo */}
      {modalCriarGrupo && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px', background: 'rgba(0,0,0,0.7)' }}>
          <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 24, padding: 24, width: '100%', maxWidth: 360, boxShadow: '0 4px 40px rgba(0,0,0,0.5)' }}>
            <h2 style={{ color: D.text, fontWeight: 800, fontSize: 16, marginBottom: 16 }}>Novo grupo</h2>
            <form onSubmit={criarGrupo} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input autoFocus style={inputStyle} placeholder="Nome do grupo"
                value={novoGrupoNome} onChange={(e) => setNovoGrupoNome(e.target.value)} required />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => { setModalCriarGrupo(false); setNovoGrupoNome('') }}
                  style={{ flex: 1, padding: '10px', borderRadius: 12, fontSize: 13, fontWeight: 600, border: `1px solid ${D.border}`, background: 'none', color: D.text2, cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button type="submit" disabled={criandoGrupo || !novoGrupoNome.trim()}
                  style={{ flex: 1, padding: '10px', borderRadius: 12, fontSize: 13, fontWeight: 700, background: '#6366F1', color: '#fff', border: 'none', cursor: 'pointer', opacity: (criandoGrupo || !novoGrupoNome.trim()) ? 0.5 : 1 }}>
                  {criandoGrupo ? 'Criando...' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal membros */}
      {modalMembros && grupoAtivo && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.7)' }}>
          <div style={{ background: D.card, borderRadius: '24px 24px 0 0', width: '100%', maxWidth: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 -4px 40px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 20px 12px', borderBottom: `1px solid ${D.border}` }}>
              <h2 style={{ color: D.text, fontWeight: 800, fontSize: 15 }}>Membros — {grupoAtivo.nome}</h2>
              <button onClick={() => setModalMembros(false)} style={{ background: 'none', border: 'none', color: D.text2, fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>
            {loadingMembros ? (
              <p style={{ textAlign: 'center', color: D.text2, fontSize: 14, padding: '32px 0' }}>Carregando...</p>
            ) : (
              <div style={{ overflowY: 'auto', flex: 1, padding: '12px 16px' }}>
                <p style={{ color: D.muted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>Membros ({membros.length})</p>
                {membros.map((m) => (
                  <div key={m.usuario_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${D.border}` }}>
                    <span style={{ fontSize: 14, color: D.text }}>{m.perfis?.nome ?? '—'}</span>
                    <button onClick={() => removerMembro(grupoAtivo.id, m.usuario_id)}
                      style={{ fontSize: 12, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}>Remover</button>
                  </div>
                ))}
                <p style={{ color: D.muted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', margin: '16px 0 8px' }}>Adicionar</p>
                {todosUsuarios.filter((u) => !membroIds.has(u.id)).map((u) => (
                  <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${D.border}` }}>
                    <span style={{ fontSize: 14, color: D.text }}>{u.nome}</span>
                    <button onClick={() => adicionarMembro(grupoAtivo.id, u.id)}
                      style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-text)', background: 'none', border: 'none', cursor: 'pointer' }}>+ Adicionar</button>
                  </div>
                ))}
                {todosUsuarios.filter((u) => !membroIds.has(u.id)).length === 0 && (
                  <p style={{ fontSize: 12, color: D.muted, padding: '8px 0' }}>Todos já são membros.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
