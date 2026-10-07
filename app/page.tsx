'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FUNCOES, podeAcessar, type Funcao } from './lib/permissoes'
import { D } from './lib/theme'
import Icone from './components/ui/Icon'
import { abrirMenu } from './components/ui/BottomNav'
import { COR, gradiente, tituloSecaoStyle as tituloSecao, visual } from './components/ui/visualFuncoes'

type Dashboard = {
  vencendo7d: number
  criticos: number
  comprarQuinta: number
  valorCompraQuinta?: number
  validadesDivergentes: number | null
}

type MinhaAcao = { id: string; tipo: 'entrada' | 'saida'; quantidade: number; data_hora: string; produto: string }

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

// "hoje, 09:42" / "ontem, 18:03" / "03/10, 14:10"
function quando(iso: string) {
  const d = new Date(iso)
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const dia = new Date(d); dia.setHours(0, 0, 0, 0)
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const diff = Math.round((hoje.getTime() - dia.getTime()) / 86400000)
  if (diff === 0) return `hoje, ${hora}`
  if (diff === 1) return `ontem, ${hora}`
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}, ${hora}`
}

// Botões grandes de ação rápida (admin / quem tem mais de 3 funções), nesta ordem.
const ACOES_RAPIDAS = ['movimentacao', 'estoque', 'conferencia']
// Já têm lugar fixo na barra de baixo, então não se repetem na grade "Mais".
const NA_BARRA = ['compras-quinta', 'scanner']

function dataPorExtenso() {
  const s = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).replace('-feira', '')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function Home() {
  const router = useRouter()
  const [dados, setDados] = useState<Dashboard | null>(null)
  const [nomeUsuario, setNomeUsuario] = useState('')
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [permissoes, setPermissoes] = useState<Record<string, boolean>>({})
  const [minhasAcoes, setMinhasAcoes] = useState<MinhaAcao[]>([])
  const [busca, setBusca] = useState('')
  useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => r.json())
      .then((json) => { if (!json.erro) setDados(json) })

    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((json) => {
        if (json.nome) setNomeUsuario(json.nome)
        const admin = json.perfil === 'admin'
        setIsAdmin(admin)
        setPermissoes(admin ? {} : (json.permissoes ?? {}))
      })
  }, [])

  function enviarBusca(e: React.FormEvent) {
    e.preventDefault()
    const termo = busca.trim()
    if (termo) router.push(`/estoque?busca=${encodeURIComponent(termo)}`)
  }

  // Cada função com a sua própria permissão; mesma regra da trava das páginas (proxy.ts).
  // isAdmin null = /api/auth/me ainda não respondeu → nada visível.
  const { vis, liberadas } = useMemo(() => {
    const vis: Record<string, boolean> = Object.fromEntries(
      FUNCOES.map((f) => [f.id, isAdmin != null && podeAcessar(f, isAdmin ? 'admin' : 'funcionario', permissoes)]),
    )
    // Quem tem Relatório e Gráficos vê um botão só (Relatório); a página mostra as duas abas.
    const liberadas = FUNCOES.filter((f) => !f.foraDoMenu && vis[f.id] && !(f.id === 'graficos' && vis['relatorio']))
    return { vis, liberadas }
  }, [isAdmin, permissoes])

  // Funcionário com até 3 funções: lista simples, um botão grande por linha.
  // Admin ou quem tem mais: ações rápidas + grade "Mais".
  const modoLista = isAdmin === false && liberadas.length <= 3

  // "Suas últimas ações" — só no layout de lista do funcionário (admin nunca busca)
  useEffect(() => {
    if (!modoLista) return
    fetch('/api/minhas-acoes')
      .then((r) => r.json())
      .then((json) => { if (Array.isArray(json)) setMinhasAcoes(json) })
      .catch(() => {})
  }, [modoLista])
  const rapidas = ACOES_RAPIDAS.map((id) => liberadas.find((f) => f.id === id)).filter((f): f is Funcao => !!f)
  const mais = liberadas.filter((f) => !ACOES_RAPIDAS.includes(f.id) && !NA_BARRA.includes(f.id))

  // ── Precisa de atenção ──
  const totalCompra = (dados?.criticos ?? 0) + (dados?.comprarQuinta ?? 0)
  const totalValidades = (dados?.vencendo7d ?? 0) + (dados?.validadesDivergentes ?? 0)
  const mostraCompra = vis['compras-quinta'] && totalCompra > 0
  const mostraValidades = (vis['validades-divergentes'] || vis['estoque']) && totalValidades > 0
  // Quem só tem 'estoque' não abre /validades (trava do proxy): vai para o filtro do estoque.
  const hrefValidades = !vis['validades-divergentes'] ? '/estoque?filtro=vencendo'
    : (dados?.vencendo7d ?? 0) > 0 ? '/validades?aba=vencendo' : '/validades?aba=divergentes'

  const inicial = (nomeUsuario.trim()[0] ?? '').toUpperCase()

  return (
    <main style={{ minHeight: '100vh', background: D.bg, overflowX: 'hidden' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px 24px' }}>

        {/* ── TOPO ── */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ minWidth: 0 }}>
            <p suppressHydrationWarning style={{ color: D.text2, fontSize: 13, margin: 0 }}>{dataPorExtenso()}</p>
            <h1 style={{ color: D.text, fontSize: 24, fontWeight: 800, letterSpacing: '-0.5px', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Olá, {nomeUsuario || '...'}
            </h1>
          </div>
          <button
            onClick={abrirMenu}
            aria-label="Abrir perfil"
            style={{
              width: 46, height: 46, borderRadius: '50%', flexShrink: 0, border: 'none', cursor: 'pointer',
              background: isAdmin ? gradiente(COR.roxo) : gradiente(COR.azul),
              color: '#fff', fontSize: 18, fontWeight: 800, fontFamily: 'inherit',
            }}
          >
            {inicial || '·'}
          </button>
        </header>

        {/* ── BUSCA — só quem tem acesso ao estoque ── */}
        {vis['estoque'] && (
          <form onSubmit={enviarBusca} style={{ position: 'relative', marginBottom: 22 }}>
            <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: D.text2, display: 'flex' }}>
              <Icone nome="search" size={18} />
            </span>
            <input
              type="search"
              enterKeyHint="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar produto..."
              style={{
                width: '100%', boxSizing: 'border-box', padding: '14px 14px 14px 42px', borderRadius: 14,
                background: D.card, border: `1px solid ${D.border}`, color: D.text, fontSize: 15, fontFamily: 'inherit', outline: 'none',
              }}
            />
          </form>
        )}

        {/* ── PRECISA DE ATENÇÃO ── */}
        {(mostraCompra || mostraValidades) && (
          <section style={{ marginBottom: 22 }}>
            <p style={tituloSecao}>Precisa de atenção</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {mostraCompra && (
                <CardAtencao
                  href="/compras-quinta" icone="cart" cor={COR.vermelho} titulo="Compra de quinta" numero={totalCompra}
                  texto={`${dados?.criticos ?? 0} crítico${dados?.criticos === 1 ? '' : 's'} · ${dados?.comprarQuinta ?? 0} a comprar${dados?.valorCompraQuinta ? ` · ≈ ${BRL.format(dados.valorCompraQuinta)}` : ''}`}
                />
              )}
              {mostraValidades && (
                <CardAtencao
                  href={hrefValidades} icone="timer" cor={COR.laranja} titulo="Validades" numero={totalValidades}
                  texto={`${dados?.vencendo7d ?? 0} vencendo em 7 dias · ${dados?.validadesDivergentes ?? 0} divergente${dados?.validadesDivergentes === 1 ? '' : 's'}`}
                />
              )}
            </div>
          </section>
        )}

        {/* ── FUNCIONÁRIO COM POUCAS FUNÇÕES: lista de botões grandes ── */}
        {modoLista && (
          <section style={{ marginBottom: 22 }}>
            <p style={tituloSecao}>Suas tarefas</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {liberadas.map((f) => {
                const v = visual(f)
                return (
                  <Link key={f.id} href={f.href} style={{
                    display: 'flex', alignItems: 'center', gap: 16, padding: '22px 20px', borderRadius: 20,
                    background: gradiente(v.cor), textDecoration: 'none', boxShadow: `0 6px 20px color-mix(in srgb, ${v.cor} 25%, transparent)`,
                  }}>
                    <span style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icone nome={v.icone} size={26} cor="#fff" />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', color: '#fff', fontSize: 19, fontWeight: 800 }}>{v.nome}</span>
                      <span style={{ display: 'block', color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 }}>{f.descricao}</span>
                    </span>
                  </Link>
                )
              })}
              {liberadas.length === 0 && (
                <p style={{ color: D.text2, fontSize: 13, textAlign: 'center', padding: '16px 0' }}>
                  Nenhuma função liberada ainda. Fale com o administrador.
                </p>
              )}
            </div>
          </section>
        )}

        {/* ── SUAS ÚLTIMAS AÇÕES — funcionário no layout de lista ── */}
        {modoLista && minhasAcoes.length > 0 && (
          <section style={{ marginBottom: 22 }}>
            <p style={tituloSecao}>Suas últimas ações</p>
            <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 18, overflow: 'hidden' }}>
              {minhasAcoes.map((a, idx) => {
                const entrada = a.tipo === 'entrada'
                const cor = entrada ? COR.verde : COR.vermelho
                return (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderTop: idx > 0 ? `1px solid ${D.border}` : 'none' }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', color: D.text, fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.produto}</span>
                      <span suppressHydrationWarning style={{ display: 'block', color: D.text2, fontSize: 12, marginTop: 2 }}>{quando(a.data_hora)}</span>
                    </span>
                    <span style={{
                      flexShrink: 0, fontSize: 12, fontWeight: 800, padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap',
                      color: cor, background: `color-mix(in srgb, ${cor} 14%, transparent)`,
                    }}>
                      {entrada ? 'Entrada' : 'Saída'} {entrada ? '+' : '−'}{a.quantidade}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* ── AÇÕES RÁPIDAS ── */}
        {!modoLista && rapidas.length > 0 && (
          <section style={{ display: 'grid', gridTemplateColumns: `repeat(${rapidas.length}, minmax(0, 1fr))`, gap: 10, marginBottom: 22 }}>
            {rapidas.map((f) => {
              const v = visual(f)
              return (
                <Link key={f.id} href={f.href} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
                  padding: '18px 6px', borderRadius: 18, background: gradiente(v.cor), textDecoration: 'none', minHeight: 110, boxSizing: 'border-box',
                  boxShadow: `0 6px 20px color-mix(in srgb, ${v.cor} 25%, transparent)`,
                }}>
                  <span style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icone nome={v.icone} size={22} cor="#fff" />
                  </span>
                  <span style={{ color: '#fff', fontSize: 13, fontWeight: 800, textAlign: 'center', lineHeight: 1.2, maxWidth: '100%', overflowWrap: 'anywhere' }}>
                    {v.curto}
                  </span>
                </Link>
              )
            })}
          </section>
        )}

        {/* ── MAIS ── */}
        {!modoLista && mais.length > 0 && (
          <section>
            <p style={tituloSecao}>Mais</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
              {mais.map((f) => {
                const v = visual(f)
                return (
                  <Link key={f.id} href={f.href} title={v.nome} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '14px 4px', borderRadius: 16, background: D.card, border: `1px solid ${D.border}`,
                    textDecoration: 'none', minHeight: 84, boxSizing: 'border-box',
                  }}>
                    <Icone nome={v.icone} size={24} cor={v.cor} />
                    <span style={{ color: D.text, fontSize: 11, fontWeight: 700, textAlign: 'center', lineHeight: 1.2, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {v.curto}
                    </span>
                  </Link>
                )
              })}
            </div>
          </section>
        )}
      </div>

    </main>
  )
}

function CardAtencao({ href, icone, cor, titulo, texto, numero }: {
  href: string; icone: string; cor: string; titulo: string; texto: string; numero: number
}) {
  return (
    <Link href={href} style={{
      display: 'flex', alignItems: 'center', gap: 14, padding: '16px', borderRadius: 18,
      background: D.card, border: `1px solid ${D.border}`, textDecoration: 'none',
    }}>
      <span style={{
        width: 48, height: 48, borderRadius: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `color-mix(in srgb, ${cor} 16%, transparent)`,
      }}>
        <Icone nome={icone} size={24} cor={cor} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', color: D.text, fontSize: 16, fontWeight: 800 }}>{titulo}</span>
        <span style={{ display: 'block', color: D.text2, fontSize: 13, marginTop: 2, lineHeight: 1.35 }}>{texto}</span>
      </span>
      <span style={{ color: cor, fontSize: 30, fontWeight: 800, lineHeight: 1, flexShrink: 0 }}>{numero}</span>
      <Icone nome="chevron" size={16} cor="var(--muted)" />
    </Link>
  )
}
