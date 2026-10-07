'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import BarcodeCameraButton from '../components/BarcodeCameraButton'
import Toggle from '../components/ui/Toggle'
import Page from '../components/ui/Page'
import PageHeader from '../components/ui/PageHeader'
import Card from '../components/ui/Card'
import Icon from '../components/ui/Icon'

import { D } from '@/app/lib/theme'
import { invalidarEstoqueCache } from '@/app/lib/estoqueCache'

type Fornecedor = { id: string; nome: string }
type Aba = 'produto' | 'fornecedor'

const inputStyle: React.CSSProperties = {
  width: '100%', background: D.input, border: `1px solid ${D.border}`, borderRadius: 14,
  padding: '12px 14px', fontSize: 15, color: D.text, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
}
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: D.text2, marginBottom: 4, marginLeft: 2 }
const btnSecondary: React.CSSProperties = { background: 'none', color: D.text2, border: `1px solid ${D.border}`, borderRadius: 14, height: 44, fontSize: 14, fontWeight: 600, cursor: 'pointer', flex: 1, fontFamily: 'inherit' }

export default function Cadastro() {
  const router = useRouter()
  const qtdBaseRef = useRef<HTMLInputElement>(null)
  const [aba, setAba] = useState<Aba>('produto')

  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [loadingForn, setLoadingForn] = useState(true)

  const [novoNome, setNovoNome] = useState('')
  const [salvandoForn, setSalvandoForn] = useState(false)
  const [feedbackForn, setFeedbackForn] = useState<{ msg: string; ok: boolean } | null>(null)

  const [editandoFornId, setEditandoFornId] = useState<string | null>(null)
  const [editandoFornNome, setEditandoFornNome] = useState('')
  const [salvandoEdicaoForn, setSalvandoEdicaoForn] = useState(false)

  const [confirmarApagarFornId, setConfirmarApagarFornId] = useState<string | null>(null)
  const [senhaApagarForn, setSenhaApagarForn] = useState('')
  const [apagandoForn, setApagandoForn] = useState(false)

  const [nomeProduto, setNomeProduto] = useState('')
  const [fornecedorId, setFornecedorId] = useState('')
  const [unidade, setUnidade] = useState('')
  const [qtdAtual, setQtdAtual] = useState('')
  const [qtdBase, setQtdBase] = useState('')
  const [qtdMax, setQtdMax] = useState('')
  const [codigoBarras, setCodigoBarras] = useState('')
  const [precoCusto, setPrecoCusto] = useState('')
  const [controlaValidade, setControlaValidade] = useState(true)
  const [salvandoProduto, setSalvandoProduto] = useState(false)
  const [feedbackProduto, setFeedbackProduto] = useState<{ msg: string; ok: boolean } | null>(null)

  useEffect(() => {
    fetch('/api/cadastro/fornecedor')
      .then((r) => r.json())
      .then((json) => { if (Array.isArray(json)) setFornecedores(json) })
      .finally(() => setLoadingForn(false))
  }, [])

  async function salvarProduto(e: React.FormEvent) {
    e.preventDefault()
    setSalvandoProduto(true)
    setFeedbackProduto(null)
    try {
      const res = await fetch('/api/cadastro/produto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: nomeProduto, fornecedor_id: fornecedorId, unidade,
          qtd_atual: Number(qtdAtual) || 0, qtd_base: Number(qtdBase) || 0, qtd_max: Number(qtdMax) || 0,
          codigo_barras: codigoBarras.trim() || null,
          preco_custo: precoCusto !== '' ? Number(precoCusto) : null,
          controla_validade: controlaValidade,
        }),
      })
      const json = await res.json()
      if (!res.ok || json.erro) { setFeedbackProduto({ msg: json.erro ?? 'Erro ao salvar', ok: false }); return }
      invalidarEstoqueCache()
      setFeedbackProduto({ msg: `Produto "${json.nome}" cadastrado!`, ok: true })
      setNomeProduto(''); setFornecedorId(''); setUnidade('')
      setQtdAtual(''); setQtdBase(''); setQtdMax(''); setCodigoBarras(''); setPrecoCusto(''); setControlaValidade(true)
    } catch {
      setFeedbackProduto({ msg: 'Erro de conexão', ok: false })
    } finally {
      setSalvandoProduto(false)
    }
  }

  async function cadastrarFornecedor(e: React.FormEvent) {
    e.preventDefault()
    if (!novoNome.trim()) return
    setSalvandoForn(true)
    setFeedbackForn(null)
    try {
      const res = await fetch('/api/cadastro/fornecedor', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: novoNome.trim() }),
      })
      const json = await res.json()
      if (!res.ok || json.erro) { setFeedbackForn({ msg: json.erro ?? 'Erro ao salvar', ok: false }); return }
      setFornecedores((prev) => [...prev, json].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')))
      setNovoNome('')
      setFeedbackForn({ msg: `"${json.nome}" adicionado!`, ok: true })
    } catch {
      setFeedbackForn({ msg: 'Erro de conexão', ok: false })
    } finally {
      setSalvandoForn(false)
    }
  }

  function abrirEdicaoForn(f: Fornecedor) {
    setEditandoFornId(f.id); setEditandoFornNome(f.nome)
    setConfirmarApagarFornId(null); setSenhaApagarForn('')
  }

  async function salvarEdicaoForn(id: string) {
    if (!editandoFornNome.trim()) return
    setSalvandoEdicaoForn(true)
    try {
      const res = await fetch('/api/cadastro/fornecedor', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, nome: editandoFornNome.trim() }),
      })
      const json = await res.json()
      if (!res.ok || json.erro) { setFeedbackForn({ msg: json.erro ?? 'Erro ao salvar', ok: false }); return }
      setFornecedores((prev) =>
        prev.map((f) => f.id === id ? { ...f, nome: editandoFornNome.trim() } : f)
          .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      )
      setEditandoFornId(null)
    } catch {
      setFeedbackForn({ msg: 'Erro de conexão', ok: false })
    } finally {
      setSalvandoEdicaoForn(false)
    }
  }

  async function apagarFornecedor(id: string) {
    setApagandoForn(true)
    try {
      const res = await fetch(`/api/cadastro/fornecedor?id=${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) { setFeedbackForn({ msg: json.erro ?? 'Erro ao apagar', ok: false }); return }
      setFornecedores((prev) => prev.filter((f) => f.id !== id))
      if (fornecedorId === id) setFornecedorId('')
      setConfirmarApagarFornId(null); setSenhaApagarForn('')
    } catch {
      setFeedbackForn({ msg: 'Erro de conexão', ok: false })
    } finally {
      setApagandoForn(false)
    }
  }

  const botaoIcone: React.CSSProperties = { width: 40, height: 40, borderRadius: 12, background: D.input, border: `1px solid ${D.border}`, color: D.text2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 }

  return (
    <Page>
      <PageHeader titulo="Cadastro" subtitulo="Produtos e fornecedores" onVoltar={() => router.back()} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Abas */}
        <div role="tablist" style={{ display: 'flex', background: D.card, borderRadius: 16, padding: 4, gap: 4, border: `1px solid ${D.border}` }}>
          {(['produto', 'fornecedor'] as Aba[]).map((a) => (
            <button key={a} role="tab" aria-selected={aba === a} onClick={() => setAba(a)}
              style={{ flex: 1, height: 42, borderRadius: 12, fontSize: 14, fontWeight: 800, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                background: aba === a ? '#6366F1' : 'transparent', color: aba === a ? '#fff' : D.text2 }}>
              <Icon nome={a === 'produto' ? 'box' : 'users'} size={17} />
              {a === 'produto' ? 'Produto' : 'Fornecedores'}
            </button>
          ))}
        </div>

        {/* ABA PRODUTO */}
        {aba === 'produto' && (
          <>
            {feedbackProduto && (
              <div style={{ borderRadius: 12, padding: '10px 14px', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
                background: feedbackProduto.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                color: feedbackProduto.ok ? '#10B981' : '#EF4444',
                border: `1px solid ${feedbackProduto.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
                <Icon nome={feedbackProduto.ok ? 'tick' : 'alert'} size={16} /> {feedbackProduto.msg}
              </div>
            )}

            <Card style={{ padding: 16 }}>
              <form onSubmit={salvarProduto} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Nome do produto</label>
                  <input style={inputStyle} placeholder="Ex: Farinha de trigo" value={nomeProduto}
                    onChange={(e) => setNomeProduto(e.target.value)} required />
                </div>

                <div>
                  <label style={labelStyle}>Fornecedor</label>
                  <select style={inputStyle} value={fornecedorId}
                    onChange={(e) => setFornecedorId(e.target.value)} required>
                    <option value="" style={{ background: D.input }}>Selecione um fornecedor</option>
                    {fornecedores.map((f) => (
                      <option key={f.id} value={f.id} style={{ background: D.input }}>{f.nome}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Unidade</label>
                  <input style={inputStyle} placeholder="Ex: kg, un, cx, L" value={unidade}
                    onChange={(e) => setUnidade(e.target.value)} required />
                </div>

                <Toggle
                  label="Controla validade"
                  descricao={controlaValidade ? 'Pede a data de validade nas entradas e saídas.' : 'Embalagem, copo, colher... entra e sai sem data de validade.'}
                  ligado={controlaValidade}
                  onChange={setControlaValidade}
                />

                <div>
                  <label style={labelStyle}>Código de barras (opcional)</label>
                  <div style={{ position: 'relative' }}>
                    <input style={{ ...inputStyle, paddingRight: 52 }}
                      placeholder="Ex: 7891234567890" value={codigoBarras}
                      onChange={(e) => setCodigoBarras(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); qtdBaseRef.current?.focus() } }}
                    />
                    <BarcodeCameraButton instanceId="cadastro-barcode-scanner"
                      onScanned={(codigo) => { setCodigoBarras(codigo); qtdBaseRef.current?.focus() }}
                      renderTrigger={(abrir) => (
                        <button type="button" onClick={abrir} aria-label="Escanear código de barras" title="Escanear código de barras"
                          style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 40, height: 40, borderRadius: 12, background: 'none', border: 'none', color: 'var(--accent-text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon nome="scan" size={22} />
                        </button>
                      )} />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Preço de custo (R$)</label>
                  <input type="number" min="0" step="0.01" style={inputStyle}
                    placeholder="0,00" value={precoCusto} onChange={(e) => setPrecoCusto(e.target.value)} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                  <div>
                    <label style={labelStyle}>Qtd atual</label>
                    <input ref={qtdBaseRef} type="number" min="0" style={{ ...inputStyle, textAlign: 'center' }}
                      placeholder="0" value={qtdAtual} onChange={(e) => setQtdAtual(e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Qtd mínima</label>
                    <input type="number" min="0" style={{ ...inputStyle, textAlign: 'center' }} placeholder="0"
                      value={qtdBase} onChange={(e) => setQtdBase(e.target.value)} required />
                  </div>
                  <div>
                    <label style={labelStyle}>Qtd máxima</label>
                    <input type="number" min="0" style={{ ...inputStyle, textAlign: 'center' }} placeholder="0"
                      value={qtdMax} onChange={(e) => setQtdMax(e.target.value)} required />
                  </div>
                </div>

                <button type="submit" disabled={salvandoProduto}
                  style={{ background: '#6366F1', color: '#fff', border: 'none', borderRadius: 14, height: 50, fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: salvandoProduto ? 0.6 : 1 }}>
                  <Icon nome="plus" size={18} traco={2.4} /> {salvandoProduto ? 'Salvando...' : 'Cadastrar produto'}
                </button>
              </form>
            </Card>
          </>
        )}

        {/* ABA FORNECEDORES */}
        {aba === 'fornecedor' && (
          <>
            <Card style={{ padding: 16 }}>
              <p style={{ color: D.text2, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 10px' }}>Novo fornecedor</p>
              <form onSubmit={cadastrarFornecedor} style={{ display: 'flex', gap: 8 }}>
                <input style={{ ...inputStyle, flex: 1, minWidth: 0 }} placeholder="Nome do fornecedor"
                  value={novoNome} onChange={(e) => setNovoNome(e.target.value)} required />
                <button type="submit" disabled={salvandoForn || !novoNome.trim()}
                  style={{ background: '#6366F1', color: '#fff', border: 'none', borderRadius: 12, padding: '0 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: (salvandoForn || !novoNome.trim()) ? 0.5 : 1, flexShrink: 0 }}>
                  {salvandoForn ? '...' : 'Salvar'}
                </button>
              </form>
              {feedbackForn && (
                <p style={{ fontSize: 13, fontWeight: 600, margin: '8px 0 0', color: feedbackForn.ok ? '#10B981' : '#EF4444' }}>
                  {feedbackForn.msg}
                </p>
              )}
            </Card>

            {loadingForn ? (
              <p style={{ color: D.text2, fontSize: 14, textAlign: 'center', padding: '16px 0' }}>Carregando...</p>
            ) : fornecedores.length === 0 ? (
              <p style={{ color: D.text2, fontSize: 14, textAlign: 'center', padding: '16px 0' }}>Nenhum fornecedor cadastrado.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ color: D.text2, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 2px 2px' }}>Lista ({fornecedores.length})</p>
                {fornecedores.map((f) => (
                  <Card key={f.id} style={{ padding: '12px 14px' }}>

                    {confirmarApagarFornId === f.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <p style={{ color: D.text, fontSize: 14, fontWeight: 600, margin: 0 }}>Apagar <strong>{f.nome}</strong>?</p>
                        <input type="password" placeholder="Digite a senha para confirmar"
                          value={senhaApagarForn} onChange={(e) => setSenhaApagarForn(e.target.value)}
                          style={{ ...inputStyle, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }}
                          autoFocus />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => { setConfirmarApagarFornId(null); setSenhaApagarForn('') }} style={btnSecondary}>Cancelar</button>
                          <button onClick={() => apagarFornecedor(f.id)}
                            disabled={apagandoForn || senhaApagarForn !== '2010'}
                            style={{ background: '#EF4444', color: '#fff', border: 'none', borderRadius: 14, height: 44, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flex: 1, opacity: (apagandoForn || senhaApagarForn !== '2010') ? 0.4 : 1 }}>
                            {apagandoForn ? 'Apagando...' : 'Confirmar'}
                          </button>
                        </div>
                      </div>

                    ) : editandoFornId === f.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <input style={inputStyle} value={editandoFornNome}
                          onChange={(e) => setEditandoFornNome(e.target.value)} autoFocus
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); salvarEdicaoForn(f.id) } }} />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => setEditandoFornId(null)} style={btnSecondary}>Cancelar</button>
                          <button onClick={() => salvarEdicaoForn(f.id)}
                            disabled={salvandoEdicaoForn || !editandoFornNome.trim()}
                            style={{ background: '#6366F1', color: '#fff', border: 'none', borderRadius: 14, height: 44, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flex: 1, opacity: (salvandoEdicaoForn || !editandoFornNome.trim()) ? 0.5 : 1 }}>
                            {salvandoEdicaoForn ? 'Salvando...' : 'Salvar'}
                          </button>
                        </div>
                      </div>

                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-bg)', color: 'var(--accent-text)' }}>
                          <Icon nome="users" size={18} />
                        </span>
                        <span style={{ flex: 1, minWidth: 0, color: D.text, fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nome}</span>
                        <button onClick={() => abrirEdicaoForn(f)} style={botaoIcone} aria-label={`Editar ${f.nome}`} title="Editar">
                          <Icon nome="edit" size={18} />
                        </button>
                        <button onClick={() => { setConfirmarApagarFornId(f.id); setSenhaApagarForn(''); setEditandoFornId(null) }}
                          style={{ ...botaoIcone, color: '#EF4444' }} aria-label={`Apagar ${f.nome}`} title="Apagar">
                          <Icon nome="trash" size={18} />
                        </button>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Page>
  )
}
