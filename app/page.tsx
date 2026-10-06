'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { subscribePush } from './components/RegisterSW'
import BarcodeCameraButton from './components/BarcodeCameraButton'
import { useTheme } from './contexts/ThemeContext'
import { FUNCOES, podeAcessar, type Funcao } from './lib/permissoes'
import { D } from './lib/theme'

const COR = {
  roxo: '#8B5CF6',
  indigo: '#6366F1',
  azul: '#3B82F6',
  ciano: '#06B6D4',
  verde: '#10B981',
  vermelho: '#EF4444',
  laranja: '#F97316',
  amarelo: '#F59E0B',
  rosa: '#EC4899',
  teal: '#14B8A6',
}

type Dashboard = {
  vencendo7d: number
  criticos: number
  comprarQuinta: number
  validadesDivergentes: number | null
}

type ScannerProduto = { produto_id: string; nome: string; unidade: string; qtd_atual: number }

// ── Ícones SVG (traço no estilo lucide) ──
const PATHS: Record<string, React.ReactNode> = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></>,
  box: <><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="M3 8l9 5 9-5" /><path d="M12 13v8" /></>,
  scan: <><path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /><path d="M8 8v8M11 8v8M14 8v8M17 8v8" /></>,
  cart: <><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L22 7H6" /></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  upDown: <><path d="M7 20V4M3 8l4-4 4 4" /><path d="M17 4v16M13 16l4 4 4-4" /></>,
  leftRight: <><path d="M4 8h16M16 4l4 4-4 4" /><path d="M20 16H4M8 12l-4 4 4 4" /></>,
  file: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" /><path d="M14 3v6h6" /><path d="M8 13h8M8 17h5" /></>,
  lineChart: <><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 5-6" /></>,
  barChart: <><path d="M3 3v18h18" /><path d="M8 17v-5M13 17V8M18 17v-8" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  chat: <><path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12Z" /></>,
  list: <><path d="M10 6h11M10 12h11M10 18h11" /><path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17" /></>,
  barcode: <><path d="M4 5v14M8 5v14M11 5v14M15 5v14M18 5v14M21 5v14" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><circle cx="17" cy="7" r="2.5" /><path d="M17.5 13a5 5 0 0 1 4 5" /></>,
  timer: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2M10 2h4" /></>,
  check: <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="m8 12 3 3 5-6" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></>,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></>,
  chevron: <><path d="m9 6 6 6-6 6" /></>,
}

function Icone({ nome, size = 22, cor = 'currentColor', traco = 2 }: { nome: string; size?: number; cor?: string; traco?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth={traco} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[nome] ?? PATHS.box}
    </svg>
  )
}

// Visual de cada função (ícone, cor, nome curto). As funções em si vêm da
// lista única em app/lib/permissoes.ts; id sem entrada aqui usa o padrão.
const VISUAL: Record<string, { icone: string; cor: string; curto?: string }> = {
  estoque:                 { icone: 'box',       cor: COR.roxo },
  movimentacao:            { icone: 'upDown',    cor: COR.azul },
  conferencia:             { icone: 'check',     cor: COR.verde },
  historico:               { icone: 'clock',     cor: COR.amarelo },
  chat:                    { icone: 'chat',      cor: COR.rosa, curto: 'Chat' },
  checklist:               { icone: 'list',      cor: COR.ciano },
  transferencia:           { icone: 'leftRight', cor: COR.ciano, curto: 'Transferir' },
  nota:                    { icone: 'file',      cor: COR.roxo, curto: 'Nota fiscal' },
  equipe:                  { icone: 'users',     cor: COR.indigo },
  codigos:                 { icone: 'barcode',   cor: COR.indigo },
  relatorio:               { icone: 'lineChart', cor: COR.teal },
  graficos:                { icone: 'barChart',  cor: COR.teal },
  scanner:                 { icone: 'scan',      cor: COR.roxo },
  'compras-quinta':        { icone: 'cart',      cor: COR.vermelho, curto: 'Compras' },
  'validades-divergentes': { icone: 'timer',     cor: COR.laranja, curto: 'Validades' },
  cadastrar:               { icone: 'plus',      cor: COR.verde },
}
function visual(f: Funcao) {
  const v = VISUAL[f.id]
  return { icone: v?.icone ?? 'box', cor: v?.cor ?? COR.indigo, curto: v?.curto ?? f.nome }
}

// Botões grandes de ação rápida (admin / quem tem mais de 3 funções), nesta ordem.
const ACOES_RAPIDAS = ['movimentacao', 'estoque', 'conferencia']
// Já têm lugar fixo na barra de baixo, então não se repetem na grade "Mais".
const NA_BARRA = ['compras-quinta', 'scanner']

function gradiente(cor: string) {
  return `linear-gradient(135deg, ${cor}, color-mix(in srgb, ${cor} 70%, #000))`
}

function dataPorExtenso() {
  const s = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).replace('-feira', '')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const tituloSecao: React.CSSProperties = {
  color: D.text2, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', margin: '0 0 10px 2px',
}

export default function Home() {
  const router = useRouter()
  const { theme, toggleTheme } = useTheme()
  const [dados, setDados] = useState<Dashboard | null>(null)
  const [nomeUsuario, setNomeUsuario] = useState('')
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [permissoes, setPermissoes] = useState<Record<string, boolean>>({})
  const [busca, setBusca] = useState('')
  const [menuAberto, setMenuAberto] = useState(false)
  const [pushAtivo, setPushAtivo] = useState(false)
  const [pushCarregando, setPushCarregando] = useState(false)
  const [pushSuportado, setPushSuportado] = useState(false)

  const [scannerProduto, setScannerProduto] = useState<ScannerProduto | null>(null)
  const [buscandoCodigo, setBuscandoCodigo] = useState(false)
  const [scannerNaoEncontrado, setScannerNaoEncontrado] = useState(false)

  useEffect(() => {
    if ('Notification' in window && 'PushManager' in window) {
      setPushSuportado(true)
      // Só reflete o estado — nenhuma chamada automática aqui. Ativar push é
      // sempre uma ação explícita do usuário, pelo botão (handleAtivarPush).
      if (Notification.permission === 'granted') setPushAtivo(true)
    }
  }, [])

  async function handleAtivarPush() {
    setPushCarregando(true)
    const ok = await subscribePush()
    if (ok) setPushAtivo(true)
    setPushCarregando(false)
  }

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

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  async function aoEscanear(codigo: string) {
    setScannerNaoEncontrado(false)
    setScannerProduto(null)
    setBuscandoCodigo(true)
    try {
      const res = await fetch(`/api/produto/barcode?codigo=${encodeURIComponent(codigo)}`)
      const json = await res.json()
      if (!res.ok || json.erro) {
        setScannerNaoEncontrado(true)
        setTimeout(() => setScannerNaoEncontrado(false), 3000)
        return
      }
      setScannerProduto(json)
    } catch {
      setScannerNaoEncontrado(true)
      setTimeout(() => setScannerNaoEncontrado(false), 3000)
    } finally { setBuscandoCodigo(false) }
  }

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
    return { vis, liberadas: FUNCOES.filter((f) => !f.foraDoMenu && vis[f.id]) }
  }, [isAdmin, permissoes])

  // Funcionário com até 3 funções: lista simples, um botão grande por linha.
  // Admin ou quem tem mais: ações rápidas + grade "Mais".
  const modoLista = isAdmin === false && liberadas.length <= 3
  const rapidas = ACOES_RAPIDAS.map((id) => liberadas.find((f) => f.id === id)).filter((f): f is Funcao => !!f)
  const mais = liberadas.filter((f) => !ACOES_RAPIDAS.includes(f.id) && !NA_BARRA.includes(f.id))

  // ── Precisa de atenção ──
  const totalCompra = (dados?.criticos ?? 0) + (dados?.comprarQuinta ?? 0)
  const totalValidades = (dados?.vencendo7d ?? 0) + (dados?.validadesDivergentes ?? 0)
  const mostraCompra = vis['compras-quinta'] && totalCompra > 0
  const mostraValidades = (vis['validades-divergentes'] || vis['estoque']) && totalValidades > 0
  // Quem só tem 'estoque' não abre /validades-divergentes (trava do proxy): vai para o filtro do estoque.
  const hrefValidades = vis['validades-divergentes'] ? '/validades-divergentes' : '/estoque?filtro=vencendo'

  const inicial = (nomeUsuario.trim()[0] ?? '').toUpperCase()

  return (
    <main style={{ minHeight: '100vh', background: D.bg, overflowX: 'hidden' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px calc(120px + env(safe-area-inset-bottom))' }}>

        {/* ── TOPO ── */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ minWidth: 0 }}>
            <p suppressHydrationWarning style={{ color: D.text2, fontSize: 13, margin: 0 }}>{dataPorExtenso()}</p>
            <h1 style={{ color: D.text, fontSize: 24, fontWeight: 800, letterSpacing: '-0.5px', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Olá, {nomeUsuario || '...'}
            </h1>
          </div>
          <button
            onClick={() => setMenuAberto(true)}
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
                  texto={`${dados?.criticos ?? 0} crítico${dados?.criticos === 1 ? '' : 's'} · ${dados?.comprarQuinta ?? 0} a comprar`}
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
                      <span style={{ display: 'block', color: '#fff', fontSize: 19, fontWeight: 800 }}>{f.nome}</span>
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
                  <span style={{ color: '#fff', fontSize: 13, fontWeight: 800, textAlign: 'center', lineHeight: 1.2, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {f.nome}
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
                  <Link key={f.id} href={f.href} title={f.nome} style={{
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

      {/* ── AVISOS DO SCANNER ── */}
      {(scannerNaoEncontrado || buscandoCodigo) && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 'calc(100px + env(safe-area-inset-bottom))', display: 'flex', justifyContent: 'center', zIndex: 45, pointerEvents: 'none' }}>
          <p style={{
            background: D.card, border: `1px solid ${D.border}`, borderRadius: 12, padding: '8px 14px', margin: 0, fontSize: 12, fontWeight: 600,
            color: scannerNaoEncontrado ? COR.vermelho : D.text2, boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          }}>
            {scannerNaoEncontrado ? 'Produto não encontrado para este código' : 'Buscando produto...'}
          </p>
        </div>
      )}

      {/* ── BARRA INFERIOR ── */}
      {isAdmin !== null && (
        <nav style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 40,
          background: D.card, borderTop: `1px solid ${D.border}`,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}>
          <div style={{ maxWidth: 480, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', height: 68 }}>
            <div style={{ display: 'flex', justifyContent: 'space-around' }}>
              <ItemBarra icone="home" label="Início" ativo onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
              {vis['estoque'] && <ItemBarra icone="box" label="Estoque" href="/estoque" />}
            </div>
            <div style={{ padding: '0 12px' }}>
              <BarcodeCameraButton
                onScanned={aoEscanear}
                instanceId="home-scanner"
                renderTrigger={(abrir) => (
                  <button
                    onClick={abrir}
                    aria-label="Escanear produto"
                    style={{
                      width: 64, height: 64, marginTop: -30, borderRadius: 20, border: 'none', cursor: 'pointer',
                      background: `linear-gradient(135deg, ${COR.roxo}, ${COR.indigo})`, color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 8px 28px rgba(139,92,246,0.45)',
                    }}
                  >
                    <Icone nome="scan" size={28} cor="#fff" />
                  </button>
                )}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-around' }}>
              {vis['compras-quinta'] && <ItemBarra icone="cart" label="Compras" href="/compras-quinta" />}
              <ItemBarra icone={isAdmin ? 'menu' : 'user'} label={isAdmin ? 'Menu' : 'Perfil'} onClick={() => setMenuAberto(true)} />
            </div>
          </div>
        </nav>
      )}

      {/* ── FOLHA MENU / PERFIL ── */}
      {menuAberto && (
        <div
          style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 60, background: 'rgba(0,0,0,0.55)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setMenuAberto(false) }}
        >
          <div style={{
            width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto', background: D.card,
            borderRadius: '24px 24px 0 0', padding: '12px 16px calc(24px + env(safe-area-inset-bottom))', boxSizing: 'border-box',
          }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: D.border, margin: '0 auto 16px' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
              <span style={{
                width: 42, height: 42, borderRadius: '50%', background: isAdmin ? gradiente(COR.roxo) : gradiente(COR.azul),
                color: '#fff', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>{inicial || '·'}</span>
              <div style={{ minWidth: 0 }}>
                <p style={{ color: D.text, fontWeight: 700, fontSize: 16, margin: 0 }}>{nomeUsuario}</p>
                <p style={{ color: D.text2, fontSize: 12, margin: 0 }}>{isAdmin ? 'Administrador' : 'Funcionário'}</p>
              </div>
            </div>

            {liberadas.length > 0 && (
              <>
                <p style={tituloSecao}>Funções</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 16 }}>
                  {liberadas.map((f) => {
                    const v = visual(f)
                    return (
                      <Link key={f.id} href={f.href} onClick={() => setMenuAberto(false)} style={linhaMenu}>
                        <Icone nome={v.icone} size={20} cor={v.cor} />
                        <span style={{ flex: 1, color: D.text, fontSize: 14, fontWeight: 600 }}>{f.nome}</span>
                        <Icone nome="chevron" size={16} cor="var(--muted)" />
                      </Link>
                    )
                  })}
                </div>
              </>
            )}

            <p style={tituloSecao}>Preferências</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <button onClick={toggleTheme} style={linhaMenu}>
                <Icone nome={theme === 'dark' ? 'sun' : 'moon'} size={20} cor={COR.amarelo} />
                <span style={{ flex: 1, textAlign: 'left', color: D.text, fontSize: 14, fontWeight: 600 }}>
                  {theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
                </span>
              </button>
              {pushSuportado && (
                <button onClick={handleAtivarPush} disabled={pushAtivo || pushCarregando} style={{ ...linhaMenu, cursor: pushAtivo ? 'default' : 'pointer' }}>
                  <Icone nome="bell" size={20} cor={pushAtivo ? COR.verde : COR.indigo} />
                  <span style={{ flex: 1, textAlign: 'left', color: D.text, fontSize: 14, fontWeight: 600 }}>
                    {pushAtivo ? 'Notificações ativas' : pushCarregando ? 'Ativando...' : 'Ativar notificações'}
                  </span>
                </button>
              )}
              <button onClick={handleLogout} style={linhaMenu}>
                <Icone nome="logout" size={20} cor={COR.vermelho} />
                <span style={{ flex: 1, textAlign: 'left', color: COR.vermelho, fontSize: 14, fontWeight: 700 }}>Sair</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL SCANNER — produto encontrado ── */}
      {scannerProduto && (
        <div
          style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 60, background: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setScannerProduto(null) }}
        >
          <div style={{ width: '100%', maxWidth: 480, background: D.card, borderRadius: '24px 24px 0 0', padding: '24px 24px 44px', boxShadow: '0 -4px 40px rgba(0,0,0,0.5)' }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: D.border, margin: '0 auto 20px' }} />

            <p style={{ color: D.muted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>Produto encontrado</p>
            <p style={{ color: D.text, fontWeight: 700, fontSize: 17, marginBottom: 2 }}>{scannerProduto.nome}</p>
            <p style={{ color: D.muted, fontSize: 13, marginBottom: 24 }}>
              {scannerProduto.qtd_atual} {scannerProduto.unidade} em estoque
            </p>

            <p style={{ color: D.muted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10 }}>O que deseja fazer?</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {vis['movimentacao'] && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <button
                    onClick={() => { setScannerProduto(null); router.push(`/movimentacao?produto=${encodeURIComponent(scannerProduto.nome)}&tipo=entrada`) }}
                    style={{ padding: '18px 8px', borderRadius: 16, background: '#10B981', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
                  >
                    <span style={{ fontSize: 22 }}>＋</span>
                    Entrada
                  </button>
                  <button
                    onClick={() => { setScannerProduto(null); router.push(`/movimentacao?produto=${encodeURIComponent(scannerProduto.nome)}&tipo=saida`) }}
                    style={{ padding: '18px 8px', borderRadius: 16, background: '#EF4444', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
                  >
                    <span style={{ fontSize: 22 }}>−</span>
                    Saída
                  </button>
                </div>
              )}
              {vis['transferencia'] && (
                <button
                  onClick={() => { setScannerProduto(null); router.push(`/transferencia?produto=${encodeURIComponent(scannerProduto.nome)}`) }}
                  style={{ width: '100%', padding: '16px', borderRadius: 16, background: '#6366F1', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 14 }}
                >
                  ↔ Transferência
                </button>
              )}
              <button
                onClick={() => setScannerProduto(null)}
                style={{ width: '100%', padding: '12px', border: 'none', background: 'none', color: D.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

const linhaMenu: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '12px 10px', borderRadius: 12,
  background: 'none', border: 'none', textDecoration: 'none', cursor: 'pointer', fontFamily: 'inherit', boxSizing: 'border-box',
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

function ItemBarra({ icone, label, href, onClick, ativo }: {
  icone: string; label: string; href?: string; onClick?: () => void; ativo?: boolean
}) {
  const estilo: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '6px 8px', minWidth: 56,
    color: ativo ? 'var(--accent-text)' : D.text2, background: 'none', border: 'none', cursor: 'pointer',
    textDecoration: 'none', fontFamily: 'inherit', fontSize: 11, fontWeight: 600,
  }
  const conteudo = <><Icone nome={icone} size={22} />{label}</>
  if (href) return <Link href={href} style={estilo}>{conteudo}</Link>
  return <button onClick={onClick} style={estilo}>{conteudo}</button>
}
