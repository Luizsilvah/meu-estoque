'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { subscribePush } from '../RegisterSW'
import BarcodeCameraButton from '../BarcodeCameraButton'
import { useTheme } from '@/app/contexts/ThemeContext'
import { FUNCOES, podeAcessar } from '@/app/lib/permissoes'
import { D } from '@/app/lib/theme'
import Icon from './Icon'
import { COR, gradiente, tituloSecaoStyle as tituloSecao, visual } from './visualFuncoes'

// Barra inferior de todas as telas logadas: Início · Estoque · [Escanear] · Compras · Menu.
// Fica no layout raiz; some nas telas de autenticação.

const ROTAS_SEM_BARRA = ['/login', '/reset-senha']

// Espaço que a barra ocupa, publicado em variáveis CSS SÓ enquanto ela está
// visível (sem barra no login/reset-senha nem com o teclado aberto → sem as
// variáveis → espaço 0). Medidas da barra/botão: --bottomnav-barra e
// --bottomnav-bump em app/globals.css.
//   --bottomnav-h    fim do conteúdo: barra + botão central + safe area + 16px de folga
//                    (usado no padding-bottom do body, em globals.css)
//   --bottomnav-topo onde barras fixas da página devem ficar (bottom), acima da barra e do botão
//   --bottomnav-safe a safe area já fica por conta da barra: barras fixas acima dela não somam de novo
const VARIAVEIS_BARRA = `:root{` +
  `--bottomnav-h:calc(var(--bottomnav-barra) + var(--bottomnav-bump) + env(safe-area-inset-bottom) + 16px);` +
  `--bottomnav-topo:calc(var(--bottomnav-barra) + var(--bottomnav-bump) + env(safe-area-inset-bottom));` +
  `--bottomnav-safe:0px}`
const EVENTO_ABRIR_MENU = 'fluxio:abrir-menu'

/** Abre a folha de Menu/Perfil da barra (ex.: avatar da tela inicial). */
export function abrirMenu() {
  window.dispatchEvent(new Event(EVENTO_ABRIR_MENU))
}

type Me = { nome: string; isAdmin: boolean; permissoes: Record<string, boolean> }
type ScannerProduto = { produto_id: string; nome: string; unidade: string; qtd_atual: number }

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const oculta = ROTAS_SEM_BARRA.some((r) => pathname === r || pathname.startsWith(r + '/'))

  const { theme, toggleTheme } = useTheme()
  const [me, setMe] = useState<Me | null>(null)
  const [menuAberto, setMenuAberto] = useState(false)
  const [teclado, setTeclado] = useState(false)
  const [pushAtivo, setPushAtivo] = useState(false)
  const [pushCarregando, setPushCarregando] = useState(false)
  const [pushSuportado, setPushSuportado] = useState(false)

  const [scannerProduto, setScannerProduto] = useState<ScannerProduto | null>(null)
  const [buscandoCodigo, setBuscandoCodigo] = useState(false)
  const [scannerNaoEncontrado, setScannerNaoEncontrado] = useState(false)

  // Usuário/permissões: busca ao entrar numa tela logada; zera ao ir para o login (troca de conta).
  useEffect(() => {
    if (oculta) return
    let ativo = true
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((json) => {
        if (!ativo) return
        const admin = json.perfil === 'admin'
        setMe({ nome: json.nome ?? '', isAdmin: admin, permissoes: admin ? {} : (json.permissoes ?? {}) })
      })
      .catch(() => {})
    return () => { ativo = false; setMe(null) }
  }, [oculta])

  useEffect(() => {
    if ('Notification' in window && 'PushManager' in window) {
      setPushSuportado(true)
      // Só reflete o estado — ativar push é sempre uma ação explícita do usuário.
      if (Notification.permission === 'granted') setPushAtivo(true)
    }
  }, [])

  useEffect(() => {
    const abrir = () => setMenuAberto(true)
    window.addEventListener(EVENTO_ABRIR_MENU, abrir)
    return () => window.removeEventListener(EVENTO_ABRIR_MENU, abrir)
  }, [])

  // Celular: esconde a barra enquanto o teclado está aberto (campo de texto focado),
  // para ela não subir junto e cobrir o que se está digitando.
  useEffect(() => {
    const toque = window.matchMedia('(pointer: coarse)')
    const editavel = (el: Element | null) => {
      if (!(el instanceof HTMLElement)) return false
      if (el.isContentEditable || el.tagName === 'TEXTAREA') return true
      if (el.tagName !== 'INPUT') return false
      return !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color', 'image'].includes((el as HTMLInputElement).type)
    }
    const aoFocar = () => setTeclado(toque.matches && editavel(document.activeElement))
    const aoSair = () => setTimeout(aoFocar, 0)
    document.addEventListener('focusin', aoFocar)
    document.addEventListener('focusout', aoSair)
    return () => { document.removeEventListener('focusin', aoFocar); document.removeEventListener('focusout', aoSair) }
  }, [])

  // Fecha a folha do menu ao trocar de página
  useEffect(() => { setMenuAberto(false) }, [pathname])

  // Mesma regra da trava das páginas (proxy.ts).
  const { vis, liberadas } = useMemo(() => {
    const vis: Record<string, boolean> = Object.fromEntries(
      FUNCOES.map((f) => [f.id, me != null && podeAcessar(f, me.isAdmin ? 'admin' : 'funcionario', me.permissoes)]),
    )
    const liberadas = FUNCOES.filter((f) => !f.foraDoMenu && vis[f.id] && !(f.id === 'graficos' && vis['relatorio']))
    return { vis, liberadas }
  }, [me])

  async function handleAtivarPush() {
    setPushCarregando(true)
    const ok = await subscribePush()
    if (ok) setPushAtivo(true)
    setPushCarregando(false)
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    setMenuAberto(false)
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

  if (oculta) return null

  const naInicio = pathname === '/'
  const inicial = (me?.nome.trim()[0] ?? '').toUpperCase()

  return (
    <>
      {/* ── AVISOS DO SCANNER ── */}
      {(scannerNaoEncontrado || buscandoCodigo) && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 'calc(var(--bottomnav-topo, 0px) + 12px)', display: 'flex', justifyContent: 'center', zIndex: 45, pointerEvents: 'none' }}>
          <p style={{
            background: D.card, border: `1px solid ${D.border}`, borderRadius: 12, padding: '8px 14px', margin: 0, fontSize: 12, fontWeight: 600,
            color: scannerNaoEncontrado ? COR.vermelho : D.text2, boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          }}>
            {scannerNaoEncontrado ? 'Produto não encontrado para este código' : 'Buscando produto...'}
          </p>
        </div>
      )}

      {/* Variáveis de espaço da barra (ver VARIAVEIS_BARRA) — somem com o teclado aberto */}
      {!teclado && <style>{VARIAVEIS_BARRA}</style>}

      {/* ── BARRA ── */}
      <nav
        data-bottom-nav=""
        data-oculta={teclado ? '' : undefined}
        aria-label="Navegação principal"
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 40,
          background: D.card, borderTop: `1px solid ${D.border}`,
          paddingBottom: 'env(safe-area-inset-bottom)',
          transform: teclado ? 'translateY(110%)' : 'none', visibility: teclado ? 'hidden' : 'visible',
          transition: 'transform 0.15s ease, visibility 0.15s',
        }}
      >
        {me && (
          <div style={{ maxWidth: 480, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', height: 'var(--bottomnav-barra)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-around' }}>
              {naInicio
                ? <ItemBarra icone="home" label="Início" ativo onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
                : <ItemBarra icone="home" label="Início" href="/" />}
              {vis['estoque'] && <ItemBarra icone="box" label="Estoque" href="/estoque" ativo={pathname.startsWith('/estoque')} />}
            </div>
            <div style={{ position: 'relative', width: 88, alignSelf: 'stretch' }}>
              <BarcodeCameraButton
                onScanned={aoEscanear}
                instanceId="bottom-nav-scanner"
                renderTrigger={(abrir) => (
                  <button
                    onClick={abrir}
                    aria-label="Escanear produto"
                    style={{
                      position: 'absolute', left: 12, top: 'calc(-1 * var(--bottomnav-bump))',
                      width: 64, height: 64, borderRadius: 20, border: 'none', cursor: 'pointer',
                      background: `linear-gradient(135deg, ${COR.roxo}, ${COR.indigo})`, color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 8px 28px rgba(139,92,246,0.45)',
                    }}
                  >
                    <Icon nome="scan" size={28} cor="#fff" />
                  </button>
                )}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-around' }}>
              {vis['compras-quinta'] && <ItemBarra icone="cart" label="Compras" href="/compras-quinta" ativo={pathname.startsWith('/compras-quinta')} />}
              <ItemBarra icone={me.isAdmin ? 'menu' : 'user'} label={me.isAdmin ? 'Menu' : 'Perfil'} ativo={menuAberto} onClick={() => setMenuAberto(true)} />
            </div>
          </div>
        )}
        {!me && <div style={{ height: 'var(--bottomnav-barra)' }} />}
      </nav>

      {/* ── FOLHA MENU / PERFIL ── */}
      {menuAberto && me && (
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
                width: 42, height: 42, borderRadius: '50%', background: me.isAdmin ? gradiente(COR.roxo) : gradiente(COR.azul),
                color: '#fff', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>{inicial || '·'}</span>
              <div style={{ minWidth: 0 }}>
                <p style={{ color: D.text, fontWeight: 700, fontSize: 16, margin: 0 }}>{me.nome}</p>
                <p style={{ color: D.text2, fontSize: 12, margin: 0 }}>{me.isAdmin ? 'Administrador' : 'Funcionário'}</p>
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
                        <Icon nome={v.icone} size={20} cor={v.cor} />
                        <span style={{ flex: 1, color: D.text, fontSize: 14, fontWeight: 600 }}>{v.nome}</span>
                        <Icon nome="chevron" size={16} cor="var(--muted)" />
                      </Link>
                    )
                  })}
                </div>
              </>
            )}

            <p style={tituloSecao}>Preferências</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <button onClick={toggleTheme} style={linhaMenu}>
                <Icon nome={theme === 'dark' ? 'sun' : 'moon'} size={20} cor={COR.amarelo} />
                <span style={{ flex: 1, textAlign: 'left', color: D.text, fontSize: 14, fontWeight: 600 }}>
                  {theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
                </span>
              </button>
              {pushSuportado && (
                <button onClick={handleAtivarPush} disabled={pushAtivo || pushCarregando} style={{ ...linhaMenu, cursor: pushAtivo ? 'default' : 'pointer' }}>
                  <Icon nome="bell" size={20} cor={pushAtivo ? COR.verde : COR.indigo} />
                  <span style={{ flex: 1, textAlign: 'left', color: D.text, fontSize: 14, fontWeight: 600 }}>
                    {pushAtivo ? 'Notificações ativas' : pushCarregando ? 'Ativando...' : 'Ativar notificações'}
                  </span>
                </button>
              )}
              <button onClick={handleLogout} style={linhaMenu}>
                <Icon nome="logout" size={20} cor={COR.vermelho} />
                <span style={{ flex: 1, textAlign: 'left', color: COR.vermelho, fontSize: 14, fontWeight: 700 }}>Sair</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SCANNER — produto encontrado ── */}
      {scannerProduto && (
        <div
          style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 60, background: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setScannerProduto(null) }}
        >
          <div style={{ width: '100%', maxWidth: 480, background: D.card, borderRadius: '24px 24px 0 0', padding: '24px 24px calc(44px + env(safe-area-inset-bottom))', boxShadow: '0 -4px 40px rgba(0,0,0,0.5)', boxSizing: 'border-box' }}>
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
                    style={{ ...botaoScan, background: COR.verde }}
                  >
                    <Icon nome="plus" size={22} cor="#fff" traco={2.6} />
                    Entrada
                  </button>
                  <button
                    onClick={() => { setScannerProduto(null); router.push(`/movimentacao?produto=${encodeURIComponent(scannerProduto.nome)}&tipo=saida`) }}
                    style={{ ...botaoScan, background: COR.vermelho }}
                  >
                    <Icon nome="minus" size={22} cor="#fff" traco={2.6} />
                    Saída
                  </button>
                </div>
              )}
              {vis['transferencia'] && (
                <button
                  onClick={() => { setScannerProduto(null); router.push(`/transferencia?produto=${encodeURIComponent(scannerProduto.nome)}`) }}
                  style={{ width: '100%', padding: '16px', borderRadius: 16, background: COR.indigo, color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  <Icon nome="leftRight" size={18} cor="#fff" /> Transferência
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
    </>
  )
}

const linhaMenu: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '12px 10px', borderRadius: 12,
  background: 'none', border: 'none', textDecoration: 'none', cursor: 'pointer', fontFamily: 'inherit', boxSizing: 'border-box',
}

const botaoScan: React.CSSProperties = {
  padding: '18px 8px', borderRadius: 16, color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
  fontWeight: 700, fontSize: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
}

function ItemBarra({ icone, label, href, onClick, ativo }: {
  icone: string; label: string; href?: string; onClick?: () => void; ativo?: boolean
}) {
  const estilo: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '6px 8px', minWidth: 56,
    color: ativo ? 'var(--accent-text)' : D.text2, background: 'none', border: 'none', cursor: 'pointer',
    textDecoration: 'none', fontFamily: 'inherit', fontSize: 11, fontWeight: 600,
  }
  const conteudo = <><Icon nome={icone} size={22} />{label}</>
  if (href) return <Link href={href} style={estilo} aria-current={ativo ? 'page' : undefined}>{conteudo}</Link>
  return <button onClick={onClick} style={estilo}>{conteudo}</button>
}
