'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { subscribePush } from './components/RegisterSW'
import ThemeToggle from './components/ThemeToggle'
import BarcodeCameraButton from './components/BarcodeCameraButton'

const C = {
  bg: 'var(--bg)',
  card: 'var(--card)',
  border: 'var(--border)',
  textPrimary: 'var(--text)',
  textSecondary: 'var(--text2)',
  textMuted: 'var(--muted)',
  purple: '#8B5CF6',
  indigo: '#6366F1',
  blue: '#3B82F6',
  green: '#10B981',
  red: '#EF4444',
  orange: '#F97316',
  yellow: '#F59E0B',
}

type Dashboard = {
  total: number
  precisamPedir: number
  estoqueOk: number
  vencendo7d: number
  listaPedir: { nome: string; qtd_atual: number; pedir: number }[]
  listaVencendo: { nome: string; data_validade: string; dias: number }[]
  valorEstoque: number
  criticos: number
  comprarQuinta: number
  validadesDivergentes: number | null
}

type ItemPrevisao = {
  produto_id: string
  nome: string
  unidade: string
  qtd_atual: number
  qtd_base: number
  media_dia: number
  dias_ate_acabar: number
}

function MetricCard({
  label, value, color, span2, href,
}: {
  label: string
  value: number | undefined
  color: string
  span2?: boolean
  href?: string
}) {
  const cardStyle: React.CSSProperties = {
    background: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 16,
    padding: '14px 16px',
    gridColumn: span2 ? 'span 2' : undefined,
    textDecoration: 'none',
    display: 'block',
  }
  const inner = (
    <>
      <p style={{ color: C.textMuted, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
        {label}
      </p>
      <p style={{ color: value != null && value > 0 ? color : C.textSecondary, fontSize: 30, fontWeight: 800, lineHeight: 1 }}>
        {value != null ? value : '—'}
      </p>
    </>
  )
  if (href) return <Link href={href} style={cardStyle}>{inner}</Link>
  return <div style={cardStyle}>{inner}</div>
}

type BtnConfig = {
  id: string
  href: string
  emoji: string
  label: string
  gradient?: string
  shadow?: string
}

const allBotoes: BtnConfig[] = [
  { id: 'estoque',      href: '/estoque',       emoji: '📦', label: 'Estoque',      gradient: 'linear-gradient(145deg,#7C3AED,#4C1D95)', shadow: '0 4px 20px rgba(124,58,237,0.25)' },
  { id: 'movimentacao', href: '/movimentacao',   emoji: '🔄', label: 'Movimentação', gradient: 'linear-gradient(145deg,#2563EB,#1E40AF)', shadow: '0 4px 20px rgba(37,99,235,0.25)' },
  { id: 'historico',    href: '/historico',      emoji: '📋', label: 'Histórico' },
  { id: 'chat',         href: '/chat',           emoji: '💬', label: 'Chat IA' },
  { id: 'checklist',    href: '/checklist',      emoji: '🛒', label: 'Checklist' },
  { id: 'transferencia',href: '/transferencia',  emoji: '↔️', label: 'Transferência' },
  { id: 'nota',         href: '/nota',           emoji: '📷', label: 'Lançar nota' },
  { id: 'equipe',       href: '/admin/usuarios', emoji: '👥', label: 'Equipe' },
  { id: 'codigos',      href: '/codigos',        emoji: '🔢', label: 'Códigos' },
  { id: 'relatorio',    href: '/relatorio',      emoji: '📊', label: 'Relatório' },
  { id: 'graficos',     href: '/graficos',       emoji: '📈', label: 'Gráficos' },
  { id: 'conferencia',  href: '/conferencia',    emoji: '✅', label: 'Conferência' },
  { id: 'scanner',      href: '/scanner',        emoji: '🔍', label: 'Scanner' },
  { id: 'compras-quinta', href: '/compras-quinta', emoji: '🗓️', label: 'Compras quinta' },
  { id: 'validades-divergentes', href: '/validades-divergentes', emoji: '📅', label: 'Validades divergentes' },
]

const DEFAULT_CONFIG = {
  frente: ['estoque', 'movimentacao'],
  painel: ['historico', 'chat', 'checklist', 'compras-quinta', 'transferencia', 'nota', 'equipe', 'codigos', 'relatorio', 'graficos', 'conferencia', 'scanner', 'validades-divergentes'],
}

const FUNCIONARIO_CONFIG = {
  frente: ['movimentacao', 'transferencia'],
  painel: [] as string[],
}

type BotoesConfig = { frente: string[]; painel: string[] }
type DragSrc = { section: 'frente' | 'painel'; index: number }
type ScannerProduto = { produto_id: string; nome: string; unidade: string; qtd_atual: number }

export default function Home() {
  const router = useRouter()
  const [dados, setDados] = useState<Dashboard | null>(null)
  const [previsao, setPrevisao] = useState<ItemPrevisao[]>([])
  const [nomeUsuario, setNomeUsuario] = useState('')
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [perfil, setPerfil] = useState('')
  const [permissoes, setPermissoes] = useState<Record<string, boolean>>({})
  const [abaAlerta, setAbaAlerta] = useState<'pedir' | 'vencer'>('pedir')
  const [pushAtivo, setPushAtivo] = useState(false)
  const [pushCarregando, setPushCarregando] = useState(false)
  const [pushSuportado, setPushSuportado] = useState(false)

  const [scannerProduto, setScannerProduto] = useState<ScannerProduto | null>(null)
  const [buscandoCodigo, setBuscandoCodigo] = useState(false)
  const [scannerNaoEncontrado, setScannerNaoEncontrado] = useState(false)

  // Botões: dois grupos — destaque (frente) e painel recolhível
  const [config, setConfig] = useState<BotoesConfig>(DEFAULT_CONFIG)
  const [maisOpcoes, setMaisOpcoes] = useState(false)
  const [dragSrc, setDragSrc] = useState<DragSrc | null>(null)
  const [dragOverTarget, setDragOverTarget] = useState<DragSrc | null>(null)
  const dragSrcRef = useRef<DragSrc | null>(null)

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
        setPerfil(json.perfil ?? '')
        setPermissoes(admin ? {} : (json.permissoes ?? {}))
      })

    fetch('/api/previsao')
      .then((r) => r.json())
      .then((json) => { if (Array.isArray(json)) setPrevisao(json.slice(0, 3)) })
  }, [])

  useEffect(() => {
    try {
      const saved = localStorage.getItem('botoes-config')
      if (saved) setConfig(JSON.parse(saved))
    } catch {}
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

  const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })

  // Listas filtradas por permissão e ordenadas pelo config salvo
  const { botoesFrente, botoesPainel, vis } = useMemo(() => {
    const vis: Record<string, boolean> = {
      estoque:       isAdmin != null && (isAdmin || permissoes['estoque'] === true),
      movimentacao:  isAdmin != null && (isAdmin || permissoes['movimentacao'] === true),
      historico:     isAdmin != null && (isAdmin || permissoes['historico'] === true),
      chat:          isAdmin != null && (isAdmin || permissoes['chat'] === true),
      checklist:     isAdmin != null && (isAdmin || permissoes['checklist'] === true),
      transferencia: isAdmin != null && (isAdmin || permissoes['transferencia'] === true),
      nota:          isAdmin != null && (isAdmin || permissoes['nota'] === true),
      equipe:        isAdmin === true,
      codigos:       isAdmin != null && (isAdmin || permissoes['codigos'] === true),
      relatorio:     isAdmin != null && (isAdmin || permissoes['relatorio'] === true),
      graficos:      isAdmin != null && (isAdmin || permissoes['graficos'] === true),
      conferencia:   isAdmin != null && (isAdmin || permissoes['conferencia'] === true),
      scanner:       isAdmin != null && (isAdmin || permissoes['scanner'] === true),
      // Correção de lotes de validade — mesma permissão da Conferência
      'validades-divergentes': isAdmin != null && (isAdmin || permissoes['conferencia'] === true),
    }

    // Funcionário: todos os botões permitidos vão direto para frente (sem painel, sem drag)
    if (perfil === 'funcionario') {
      return { botoesFrente: allBotoes.filter((b) => !!vis[b.id]), botoesPainel: [], vis }
    }

    const frente = config.frente
      .map((id) => allBotoes.find((b) => b.id === id))
      .filter((b): b is BtnConfig => b != null && !!vis[b.id])

    // Botões configurados em painel + quaisquer não cadastrados em nenhuma seção
    const configuredIds = new Set([...config.frente, ...config.painel])
    const unconfigured = allBotoes.filter((b) => !!vis[b.id] && !configuredIds.has(b.id))

    const painel = [
      ...config.painel
        .map((id) => allBotoes.find((b) => b.id === id))
        .filter((b): b is BtnConfig => b != null && !!vis[b.id]),
      ...unconfigured,
    ]

    return { botoesFrente: frente, botoesPainel: painel, vis }
  }, [config, perfil, isAdmin, permissoes])

  function saveConfig(newConfig: BotoesConfig) {
    setConfig(newConfig)
    try { localStorage.setItem('botoes-config', JSON.stringify(newConfig)) } catch {}
  }

  function startDrag(section: 'frente' | 'painel', index: number) {
    const src = { section, index }
    dragSrcRef.current = src
    setDragSrc(src)
    setDragOverTarget(null)
  }

  function onDragOverItem(e: React.DragEvent, section: 'frente' | 'painel', index: number) {
    e.preventDefault()
    e.stopPropagation()
    setDragOverTarget({ section, index })
  }

  function onDropItem(e: React.DragEvent, section: 'frente' | 'painel', index: number) {
    e.preventDefault()
    e.stopPropagation()
    performDrop(section, index)
  }

  function onDropZone(e: React.DragEvent, section: 'frente' | 'painel') {
    e.preventDefault()
    e.stopPropagation()
    const endIndex = section === 'frente' ? botoesFrente.length : botoesPainel.length
    performDrop(section, endIndex)
  }

  function performDrop(toSection: 'frente' | 'painel', toIndex: number) {
    const src = dragSrcRef.current
    if (!src) return

    const newF = botoesFrente.map((b) => b.id)
    const newP = botoesPainel.map((b) => b.id)

    let movedId: string
    if (src.section === 'frente') {
      movedId = newF.splice(src.index, 1)[0]
    } else {
      movedId = newP.splice(src.index, 1)[0]
    }

    // Ajusta índice se for mesma seção e a origem estava antes do destino
    let insertIdx = toIndex
    if (src.section === toSection && src.index < toIndex) insertIdx--
    insertIdx = Math.max(0, insertIdx)

    if (toSection === 'frente') {
      newF.splice(insertIdx, 0, movedId)
    } else {
      newP.splice(insertIdx, 0, movedId)
    }

    // Preserva IDs invisíveis (restrição de permissão) no config
    const nowVisible = new Set([...botoesFrente.map((b) => b.id), ...botoesPainel.map((b) => b.id)])
    const hiddenF = config.frente.filter((id) => !nowVisible.has(id))
    const hiddenP = config.painel.filter((id) => !nowVisible.has(id))

    saveConfig({ frente: [...newF, ...hiddenF], painel: [...newP, ...hiddenP] })
    setDragSrc(null)
    setDragOverTarget(null)
    dragSrcRef.current = null
  }

  function endDrag() {
    setDragSrc(null)
    setDragOverTarget(null)
    dragSrcRef.current = null
  }

  return (
    <main style={{ minHeight: '100vh', background: C.bg, padding: '16px 16px 40px' }}>
      <div style={{ maxWidth: 430, margin: '0 auto' }}>

        {/* ── HEADER ── */}
        <div style={{
          background: 'var(--page-header)',
          border: `1px solid ${C.border}`,
          borderRadius: 22,
          padding: '20px 18px',
          marginBottom: 14,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}>
          <div>
            <p style={{ color: C.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: '0.5px', marginBottom: 2 }}>FLUXIO</p>
            <h1 style={{ color: C.textPrimary, fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', margin: 0 }}>
              Olá, {nomeUsuario || '...'}
            </h1>
            <p style={{ color: C.textMuted, fontSize: 11, marginTop: 5 }}>{hoje}</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ThemeToggle />
              <button
                onClick={handleLogout}
                style={{ background: 'none', border: 'none', color: C.textMuted, fontSize: 12, cursor: 'pointer', padding: 0 }}
              >
                Sair →
              </button>
            </div>
            {!pushAtivo && pushSuportado && (
              <button
                onClick={handleAtivarPush}
                disabled={pushCarregando}
                style={{
                  background: 'var(--card2)',
                  border: `1px solid ${C.border}`,
                  color: 'var(--accent-text)',
                  fontSize: 11,
                  padding: '5px 10px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  opacity: pushCarregando ? 0.6 : 1,
                }}
              >
                {pushCarregando ? '...' : '🔔 Ativar'}
              </button>
            )}
            {pushAtivo && <span style={{ fontSize: 11, color: C.green }}>🔔 Ativo</span>}
          </div>
        </div>

        {/* ── SCANNER RÁPIDO — visível para todos após autenticação ── */}
        {isAdmin !== null && (
          <div style={{ marginBottom: 14 }}>
            <BarcodeCameraButton
              onScanned={aoEscanear}
              instanceId="home-scanner"
              renderTrigger={(abrir) => (
                <button
                  onClick={abrir}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                    padding: '16px 20px', borderRadius: 18, background: '#1A3C5E', color: '#fff',
                    border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                >
                  <span style={{ fontSize: 22 }}>📷</span>
                  Escanear produto
                </button>
              )}
            />
            {scannerNaoEncontrado && (
              <p style={{ color: C.red, fontSize: 12, fontWeight: 600, textAlign: 'center', marginTop: 8 }}>
                Produto não encontrado para este código
              </p>
            )}
            {buscandoCodigo && (
              <p style={{ color: C.textMuted, fontSize: 12, textAlign: 'center', marginTop: 8 }}>
                Buscando produto...
              </p>
            )}
          </div>
        )}

        {/* ── METRIC CARDS — oculto para funcionários ── */}
        {perfil !== 'funcionario' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <MetricCard label="Produtos" value={dados?.total} color={C.indigo} href="/estoque" />
            <MetricCard label="Pedir hoje" value={dados?.precisamPedir} color={C.red} href="/estoque?filtro=pedir" />
            <MetricCard label="Estoque OK" value={dados?.estoqueOk} color={C.green} href="/estoque?filtro=ok" />
            <MetricCard label="Vencendo 7d" value={dados?.vencendo7d ?? 0} color={C.orange} href="/estoque?filtro=vencendo" />
            <MetricCard label="Validades divergentes" value={dados?.validadesDivergentes ?? undefined} color={C.red} href="/validades-divergentes" span2 />
            {dados?.valorEstoque != null && dados.valorEstoque > 0 && (
              <div style={{
                gridColumn: 'span 2',
                background: 'var(--card2)',
                border: `1px solid ${C.border}`,
                borderRadius: 16,
                padding: '14px 16px',
              }}>
                <p style={{ color: C.textMuted, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                  Valor em estoque
                </p>
                <p style={{ color: 'var(--accent-text)', fontSize: 26, fontWeight: 800, lineHeight: 1 }}>
                  {dados.valorEstoque.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>
            )}
            {((dados?.criticos ?? 0) > 0 || (dados?.comprarQuinta ?? 0) > 0) && (
              <Link href="/compras-quinta" style={{
                gridColumn: 'span 2',
                background: 'var(--card2)',
                border: `1px solid ${C.border}`,
                borderRadius: 16,
                padding: '14px 16px',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div>
                  <p style={{ color: C.textMuted, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                    Compra de quinta
                  </p>
                  <p style={{ fontSize: 13, color: C.textSecondary }}>
                    <strong style={{ color: C.red, fontSize: 18 }}>{dados?.criticos ?? 0}</strong> crítico{(dados?.criticos ?? 0) !== 1 ? 's' : ''}
                    {'  ·  '}
                    <strong style={{ color: C.yellow, fontSize: 18 }}>{dados?.comprarQuinta ?? 0}</strong> p/ comprar
                  </p>
                </div>
                <span style={{ fontSize: 20 }}>🗓️</span>
              </Link>
            )}
          </div>
        )}

        {/* ── BOTÕES: funcionário — coluna única, grandes e centralizados ── */}
        {isAdmin !== null && perfil === 'funcionario' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
            {botoesFrente.map((btn) => (
              <Link
                key={btn.id}
                href={btn.href}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 10, padding: '24px 20px',
                  background: '#1A3C5E',
                  border: 'none',
                  borderRadius: 20, textDecoration: 'none',
                  minHeight: 120, boxSizing: 'border-box',
                }}
              >
                <span style={{ fontSize: 36, lineHeight: 1 }}>{btn.emoji}</span>
                <span style={{ color: '#fff', fontSize: 14, fontWeight: 700, textAlign: 'center', letterSpacing: '-0.2px' }}>
                  {btn.label}
                </span>
              </Link>
            ))}
          </div>
        )}

        {/* ── BOTÕES DE DESTAQUE (grandes, arrastar p/ reorganizar) — admin ── */}
        {isAdmin !== null && perfil !== 'funcionario' && (
          <div style={{ marginBottom: 14 }}>

            {/* Seção frente — grid 2 colunas, botões grandes */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
              {botoesFrente.map((btn, i) => {
                const isDragging = dragSrc?.section === 'frente' && dragSrc.index === i
                const isOver = dragOverTarget?.section === 'frente' && dragOverTarget.index === i
                return (
                  <div
                    key={btn.id}
                    draggable
                    onDragStart={() => startDrag('frente', i)}
                    onDragOver={(e) => onDragOverItem(e, 'frente', i)}
                    onDrop={(e) => onDropItem(e, 'frente', i)}
                    onDragEnd={endDrag}
                    style={{
                      opacity: isDragging ? 0.35 : 1,
                      boxShadow: isOver ? `0 0 0 2px ${C.indigo}` : 'none',
                      borderRadius: 16,
                      transition: 'opacity 0.1s, box-shadow 0.1s',
                      cursor: 'grab',
                    }}
                  >
                    <Link
                      href={btn.href}
                      draggable={false}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        padding: '22px 8px',
                        background: btn.gradient ?? C.card,
                        border: btn.gradient ? '1px solid rgba(255,255,255,0.08)' : `1px solid ${C.border}`,
                        borderRadius: 16,
                        textDecoration: 'none',
                        boxShadow: btn.shadow ?? 'none',
                        minHeight: 90,
                        boxSizing: 'border-box',
                        userSelect: 'none',
                      }}
                    >
                      <span style={{ fontSize: 28, lineHeight: 1 }}>{btn.emoji}</span>
                      <span style={{
                        color: btn.gradient ? '#fff' : C.textSecondary,
                        fontSize: 12,
                        fontWeight: 700,
                        textAlign: 'center',
                        lineHeight: 1.25,
                        letterSpacing: '-0.2px',
                      }}>
                        {btn.label}
                      </span>
                    </Link>
                  </div>
                )
              })}

              {/* Estado vazio da frente */}
              {botoesFrente.length === 0 && (
                <div style={{
                  gridColumn: 'span 2',
                  border: `2px dashed ${C.border}`,
                  borderRadius: 16,
                  padding: '20px 12px',
                  textAlign: 'center',
                  color: C.textMuted,
                  fontSize: 12,
                }}>
                  Arraste um botão de "Mais opções" aqui para destacar
                </div>
              )}
            </div>

            {/* Zona de soltar para promover do painel → frente */}
            {dragSrc?.section === 'painel' && (
              <div
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                onDrop={(e) => onDropZone(e, 'frente')}
                style={{
                  border: `2px dashed ${C.indigo}`,
                  borderRadius: 14,
                  padding: '10px 12px',
                  textAlign: 'center',
                  color: C.indigo,
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 8,
                  cursor: 'copy',
                }}
              >
                ↑ Soltar aqui para destacar
              </div>
            )}

            {/* Toggle "Mais opções" — oculto para funcionários */}
            {perfil !== 'funcionario' && <button
              onClick={() => setMaisOpcoes((v) => !v)}
              style={{
                width: '100%',
                padding: '8px 14px',
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                color: C.textMuted,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                marginBottom: maisOpcoes ? 8 : 0,
              }}
            >
              {maisOpcoes ? '▲ Ver menos' : '▼ Mais opções'}
              {botoesPainel.length > 0 && (
                <span style={{
                  background: C.border,
                  borderRadius: 20,
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '1px 7px',
                  color: C.textMuted,
                }}>
                  {botoesPainel.length}
                </span>
              )}
            </button>}

            {/* Zona de soltar frente → painel — sempre visível ao arrastar botão grande */}
            {dragSrc?.section === 'frente' && (
              <div
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                onDrop={(e) => onDropZone(e, 'painel')}
                style={{
                  border: `2px dashed ${C.border}`,
                  borderRadius: 12,
                  padding: '8px 12px',
                  textAlign: 'center',
                  color: C.textMuted,
                  fontSize: 12,
                  fontWeight: 600,
                  marginTop: 8,
                  cursor: 'copy',
                }}
              >
                ↓ Soltar aqui para mover para o painel
              </div>
            )}

            {/* Painel expansível — grid 3 colunas, botões compactos */}
            {maisOpcoes && (
              <div style={{ marginTop: dragSrc?.section === 'frente' ? 6 : 0 }}>
                <div
                  style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onDropZone(e, 'painel')}
                >
                  {botoesPainel.map((btn, i) => {
                    const isDragging = dragSrc?.section === 'painel' && dragSrc.index === i
                    const isOver = dragOverTarget?.section === 'painel' && dragOverTarget.index === i
                    return (
                      <div
                        key={btn.id}
                        draggable
                        onDragStart={() => startDrag('painel', i)}
                        onDragOver={(e) => onDragOverItem(e, 'painel', i)}
                        onDrop={(e) => onDropItem(e, 'painel', i)}
                        onDragEnd={endDrag}
                        style={{
                          opacity: isDragging ? 0.35 : 1,
                          boxShadow: isOver ? `0 0 0 2px ${C.indigo}` : 'none',
                          borderRadius: 14,
                          transition: 'opacity 0.1s, box-shadow 0.1s',
                          cursor: 'grab',
                        }}
                      >
                        <Link
                          href={btn.href}
                          draggable={false}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 5,
                            padding: '14px 6px',
                            background: C.card,
                            border: `1px solid ${C.border}`,
                            borderRadius: 14,
                            textDecoration: 'none',
                            minHeight: 72,
                            boxSizing: 'border-box',
                            userSelect: 'none',
                          }}
                        >
                          <span style={{ fontSize: 20, lineHeight: 1 }}>{btn.emoji}</span>
                          <span style={{ color: C.textSecondary, fontSize: 10, fontWeight: 700, textAlign: 'center', lineHeight: 1.25 }}>
                            {btn.label}
                          </span>
                        </Link>
                      </div>
                    )
                  })}

                  {botoesPainel.length === 0 && (
                    <p style={{ gridColumn: 'span 3', color: C.textMuted, fontSize: 12, textAlign: 'center', padding: '12px 0' }}>
                      Todos os botões estão em destaque.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ALERTAS — oculto para funcionários ── */}
        {perfil !== 'funcionario' && dados && (dados.listaPedir.length > 0 || (dados.listaVencendo?.length ?? 0) > 0) && (
          <div style={{ marginBottom: 14 }}>
            {/* Tab bar */}
            <div style={{
              display: 'flex',
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: 4,
              marginBottom: 10,
            }}>
              <button
                onClick={() => setAbaAlerta('pedir')}
                style={{
                  flex: 1,
                  padding: '7px 0',
                  borderRadius: 9,
                  fontSize: 12,
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  background: abaAlerta === 'pedir' ? '#EF4444' : 'transparent',
                  color: abaAlerta === 'pedir' ? '#fff' : C.textMuted,
                  transition: 'background 0.2s',
                }}
              >
                🔴 Pedir ({dados.listaPedir.length})
              </button>
              <button
                onClick={() => setAbaAlerta('vencer')}
                style={{
                  flex: 1,
                  padding: '7px 0',
                  borderRadius: 9,
                  fontSize: 12,
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  background: abaAlerta === 'vencer' ? '#F97316' : 'transparent',
                  color: abaAlerta === 'vencer' ? '#fff' : C.textMuted,
                  transition: 'background 0.2s',
                }}
              >
                🟠 Vencer ({dados.listaVencendo?.length ?? 0})
              </button>
            </div>

            {/* Lista pedir */}
            {abaAlerta === 'pedir' && (
              dados.listaPedir.length === 0
                ? <p style={{ color: C.textMuted, fontSize: 12, textAlign: 'center', padding: '8px 0' }}>Nenhum produto para pedir.</p>
                : dados.listaPedir.map((item) => (
                  <Link
                    key={item.nome}
                    href={`/movimentacao?produto=${encodeURIComponent(item.nome)}&tipo=entrada`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: 'rgba(239,68,68,0.08)',
                      border: '1px solid rgba(239,68,68,0.2)',
                      borderLeft: '3px solid #EF4444',
                      borderRadius: 12,
                      padding: '10px 14px',
                      marginBottom: 6,
                      textDecoration: 'none',
                    }}
                  >
                    <span style={{ color: '#FCA5A5', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>
                      {item.nome}
                    </span>
                    <span style={{
                      background: '#EF4444',
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '3px 9px',
                      borderRadius: 20,
                      whiteSpace: 'nowrap',
                    }}>
                      Pedir {item.pedir}
                    </span>
                  </Link>
                ))
            )}

            {/* Lista vencer */}
            {abaAlerta === 'vencer' && (
              (dados.listaVencendo?.length ?? 0) === 0
                ? <p style={{ color: C.textMuted, fontSize: 12, textAlign: 'center', padding: '8px 0' }}>Nenhum produto vencendo.</p>
                : (dados.listaVencendo ?? []).map((item, i) => (
                  <Link
                    key={i}
                    href={`/movimentacao?produto=${encodeURIComponent(item.nome)}&tipo=saida`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: item.dias <= 0 ? 'rgba(239,68,68,0.08)' : 'rgba(249,115,22,0.08)',
                      border: `1px solid ${item.dias <= 0 ? 'rgba(239,68,68,0.2)' : 'rgba(249,115,22,0.2)'}`,
                      borderLeft: `3px solid ${item.dias <= 0 ? '#EF4444' : '#F97316'}`,
                      borderRadius: 12,
                      padding: '10px 14px',
                      marginBottom: 6,
                      textDecoration: 'none',
                    }}
                  >
                    <span style={{ color: item.dias <= 0 ? '#FCA5A5' : '#FDBA74', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>
                      {item.nome}
                    </span>
                    <span style={{
                      background: item.dias <= 0 ? '#EF4444' : '#F97316',
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '3px 9px',
                      borderRadius: 20,
                      whiteSpace: 'nowrap',
                    }}>
                      {item.dias <= 0 ? 'Vencido' : `Vence em ${item.dias}d`}
                    </span>
                  </Link>
                ))
            )}
          </div>
        )}

        {/* Estoque em dia */}
        {perfil !== 'funcionario' && dados && dados.listaPedir.length === 0 && (dados.listaVencendo?.length ?? 0) === 0 && (
          <div style={{
            background: 'rgba(16,185,129,0.08)',
            border: '1px solid rgba(16,185,129,0.2)',
            borderRadius: 14,
            padding: '12px 16px',
            textAlign: 'center',
            marginBottom: 14,
          }}>
            <p style={{ color: C.green, fontSize: 13, fontWeight: 600 }}>✓ Estoque em dia!</p>
          </div>
        )}

        {/* ── ACABANDO EM BREVE — oculto para funcionários ── */}
        {perfil !== 'funcionario' && previsao.length > 0 && (
          <div>
            <p style={{ color: C.textMuted, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10 }}>
              Acabando em breve
            </p>
            {previsao.map((item) => {
              const dias = item.dias_ate_acabar
              const cor = dias <= 7 ? C.red : dias <= 14 ? C.orange : C.yellow
              const bg = dias <= 7 ? 'rgba(239,68,68,0.07)' : dias <= 14 ? 'rgba(249,115,22,0.07)' : 'rgba(245,158,11,0.07)'
              const bd = dias <= 7 ? 'rgba(239,68,68,0.2)' : dias <= 14 ? 'rgba(249,115,22,0.2)' : 'rgba(245,158,11,0.2)'
              const baseInsuficiente = item.qtd_base > 0 && item.media_dia > item.qtd_base / 7
              const basesugerida = Math.ceil(item.media_dia * 7)
              return (
                <div key={item.produto_id} style={{
                  background: bg,
                  border: `1px solid ${bd}`,
                  borderLeft: `3px solid ${cor}`,
                  borderRadius: 12,
                  padding: '10px 14px',
                  marginBottom: 6,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ minWidth: 0, marginRight: 8 }}>
                      <p style={{ color: cor, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.nome}
                      </p>
                      <p style={{ color: cor, fontSize: 11, opacity: 0.65, marginTop: 2 }}>
                        {item.qtd_atual} {item.unidade} · {item.media_dia}/dia
                      </p>
                    </div>
                    <span style={{
                      background: cor,
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '3px 9px',
                      borderRadius: 20,
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}>
                      Acaba em {dias}d
                    </span>
                  </div>
                  {baseInsuficiente && (
                    <div style={{ marginTop: 8, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.yellow }}>⚠️ Revisar base</span>
                      <span style={{ fontSize: 11, color: C.textMuted }}>·</span>
                      <span style={{ fontSize: 11, color: C.textMuted }}>Sugestão: base mínima = {basesugerida} {item.unidade}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

      </div>

      {/* ── MODAL SCANNER — produto encontrado ── */}
      {scannerProduto && (
        <div
          style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 60, background: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setScannerProduto(null) }}
        >
          <div style={{ width: '100%', maxWidth: 430, background: C.card, borderRadius: '24px 24px 0 0', padding: '24px 24px 44px', boxShadow: '0 -4px 40px rgba(0,0,0,0.5)' }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: C.border, margin: '0 auto 20px' }} />

            <p style={{ color: C.textMuted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>Produto encontrado</p>
            <p style={{ color: C.textPrimary, fontWeight: 700, fontSize: 17, marginBottom: 2 }}>{scannerProduto.nome}</p>
            <p style={{ color: C.textMuted, fontSize: 13, marginBottom: 24 }}>
              {scannerProduto.qtd_atual} {scannerProduto.unidade} em estoque
            </p>

            <p style={{ color: C.textMuted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10 }}>O que deseja fazer?</p>

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
                style={{ width: '100%', padding: '12px', border: 'none', background: 'none', color: C.textMuted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
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
