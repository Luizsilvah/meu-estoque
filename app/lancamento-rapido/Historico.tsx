'use client'
// Aba "Histórico" do Lançamento rápido: cada clique em "Lançar tudo" dos
// últimos 30 dias, com o resultado real de cada item (gravado pela rota
// /api/lancamento-rapido/lancar). Funcionário vê só os dele; admin vê de todos
// e filtra por pessoa. Item com erro tem "Tentar de novo", que devolve só ele
// para a aba Lançar.
import { useEffect, useState } from 'react'
import Card from '@/app/components/ui/Card'
import Chips from '@/app/components/ui/Chips'
import Icon from '@/app/components/ui/Icon'
import { D } from '@/app/lib/theme'
import type { ItemLog, LocalLog, RegistroLog } from '@/app/lib/lancamentoRapidoLog'

type Resposta = { admin: boolean; registros: RegistroLog[]; tem_mais: boolean; pessoas?: { id: string; nome: string }[]; erro?: string }

const VERDE = '#10B981'
const VERMELHO = '#EF4444'
const SINAL: Record<NonNullable<ItemLog['tipo']>, { sinal: string; cor: string; nome: string }> = {
  saida: { sinal: '−', cor: VERMELHO, nome: 'Saída' },
  entrada: { sinal: '+', cor: VERDE, nome: 'Entrada' },
  transferencia: { sinal: '', cor: '#06B6D4', nome: 'Transf.' },
}

const nomeLocal = (l: LocalLog | null | undefined) => l === 'cozinha' ? 'Cozinha' : l === 'principal' ? 'Principal' : '?'

function lugarDoItem(i: ItemLog) {
  if (i.tipo === 'transferencia') return `${nomeLocal(i.local)} → ${nomeLocal(i.destino)}`
  return nomeLocal(i.local)
}

function dataHora(iso: string) {
  const d = new Date(iso)
  const hoje = new Date()
  const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1)
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === hoje.toDateString()) return `Hoje · ${hora}`
  if (d.toDateString() === ontem.toDateString()) return `Ontem · ${hora}`
  return `${d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })} · ${hora}`
}

function dataCurta(iso: string) {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

export default function Historico({ onTentarDeNovo }: {
  /** Devolve um item com erro para a aba Lançar. */
  onTentarDeNovo: (item: ItemLog) => void
}) {
  const [registros, setRegistros] = useState<RegistroLog[]>([])
  const [admin, setAdmin] = useState(false)
  const [pessoas, setPessoas] = useState<{ id: string; nome: string }[]>([])
  const [pessoa, setPessoa] = useState<string | null>(null)
  const [temMais, setTemMais] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [erro, setErro] = useState('')
  /** Itens que já voltaram para a lista nesta visita (registro.id:índice). */
  const [devolvidos, setDevolvidos] = useState<Set<string>>(new Set())

  async function buscar(antes: string | null): Promise<Resposta> {
    const qs = new URLSearchParams()
    if (antes) qs.set('antes', antes)
    if (pessoa) qs.set('usuario', pessoa)
    const res = await fetch(`/api/lancamento-rapido/historico?${qs}`)
    const json = await res.json() as Resposta
    if (!res.ok) throw new Error(json.erro ?? 'Erro ao carregar o histórico')
    return json
  }

  useEffect(() => {
    let vivo = true
    setCarregando(true); setErro('')
    buscar(null).then((json) => {
      if (!vivo) return
      setRegistros(json.registros); setTemMais(json.tem_mais); setAdmin(json.admin)
      // Mantém a lista de pessoas do 1º carregamento (filtrada, ela viria só com a escolhida).
      if (json.pessoas && !pessoa) setPessoas(json.pessoas)
    }).catch((e) => { if (vivo) setErro(e instanceof Error ? e.message : 'Erro ao carregar') })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recarrega só quando troca a pessoa
  }, [pessoa])

  async function carregarMais() {
    const ultimo = registros.at(-1)
    if (!ultimo || carregandoMais) return
    setCarregandoMais(true)
    try {
      const json = await buscar(ultimo.criado_em)
      setRegistros((prev) => [...prev, ...json.registros.filter((r) => !prev.some((p) => p.id === r.id))])
      setTemMais(json.tem_mais)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar')
    } finally {
      setCarregandoMais(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {admin && pessoas.length > 0 && (
        <Chips itens={[
          { chave: 'todos', label: 'Todos', ativo: pessoa === null, onClick: () => setPessoa(null) },
          ...pessoas.map((p) => ({ chave: p.id, label: p.nome, ativo: pessoa === p.id, onClick: () => setPessoa(p.id) })),
        ]} />
      )}

      <p style={{ color: D.text2, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', margin: 0 }}>
        Últimos 30 dias
      </p>

      {erro && <p style={{ color: VERMELHO, fontWeight: 700, background: 'rgba(239,68,68,0.1)', borderRadius: 12, padding: '12px 14px', margin: 0, fontSize: 13 }}>{erro}</p>}

      {carregando ? (
        <p style={{ color: D.text2, fontSize: 14, textAlign: 'center', paddingTop: 30 }}>Carregando...</p>
      ) : registros.length === 0 && !erro ? (
        <Card style={{ padding: 18 }}>
          <span style={{ width: 48, height: 48, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-bg)', color: 'var(--accent-text)', marginBottom: 12 }}>
            <Icon nome="clock" size={24} />
          </span>
          <p style={{ color: D.text, fontSize: 16, fontWeight: 800, margin: '0 0 6px' }}>Nenhum lançamento ainda</p>
          <p style={{ color: D.text2, fontSize: 13, margin: 0, lineHeight: 1.45 }}>
            Cada vez que você toca em <b>Lançar tudo</b>, o resultado aparece aqui.
          </p>
        </Card>
      ) : (
        registros.map((r) => (
          <CardRegistro key={r.id} registro={r} mostrarNome={admin} devolvidos={devolvidos}
            onTentarDeNovo={(item, idx) => {
              onTentarDeNovo(item)
              setDevolvidos((prev) => new Set(prev).add(`${r.id}:${idx}`))
            }} />
        ))
      )}

      {temMais && !carregando && (
        <button type="button" onClick={carregarMais} disabled={carregandoMais}
          style={{ height: 46, borderRadius: 14, border: `1px solid ${D.border}`, background: D.card, color: D.text, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: carregandoMais ? 0.6 : 1 }}>
          {carregandoMais ? 'Carregando...' : 'Carregar mais'}
        </button>
      )}
    </div>
  )
}

function CardRegistro({ registro, mostrarNome, devolvidos, onTentarDeNovo }: {
  registro: RegistroLog
  mostrarNome: boolean
  devolvidos: Set<string>
  onTentarDeNovo: (item: ItemLog, idx: number) => void
}) {
  const ok = registro.itens.filter((i) => i.status === 'ok').length
  const erros = registro.itens.length - ok
  const resumo = [
    ok ? `${ok} ${ok === 1 ? 'lançado' : 'lançados'}` : 'Nada lançado',
    erros ? `${erros} com erro` : null,
  ].filter(Boolean).join(' · ')

  return (
    <Card style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, borderColor: erros ? 'rgba(239,68,68,0.45)' : D.border }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
        <span style={{ color: erros ? VERMELHO : VERDE, fontSize: 13, fontWeight: 800 }}>{resumo}</span>
        <span style={{ color: D.text2, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{dataHora(registro.criado_em)}</span>
      </div>
      {mostrarNome && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: D.text, fontSize: 13, fontWeight: 700, marginTop: -4 }}>
          <Icon nome="user" size={14} /> {registro.usuario_nome ?? 'Sem nome'}
        </span>
      )}
      {registro.texto && (
        <p style={{ margin: 0, color: D.muted, fontSize: 12.5, fontStyle: 'italic', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>“{registro.texto}”</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid ${D.border}`, paddingTop: 8 }}>
        {registro.itens.map((item, idx) => {
          const deuCerto = item.status === 'ok'
          const vis = item.tipo ? SINAL[item.tipo] : null
          const devolvido = devolvidos.has(`${registro.id}:${idx}`)
          return (
            <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', minWidth: 0 }}>
              <span aria-label={deuCerto ? 'Lançado' : 'Com erro'} style={{ flexShrink: 0, marginTop: 1, width: 20, height: 20, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: deuCerto ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: deuCerto ? VERDE : VERMELHO }}>
                <Icon nome={deuCerto ? 'tick' : 'close'} size={13} traco={3} />
              </span>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                  <span style={{ flex: 1, minWidth: 0, color: D.text, fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.nome ?? 'Produto desconhecido'}
                  </span>
                  <span style={{ flexShrink: 0, color: vis?.cor ?? D.text, fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                    {vis?.sinal}{item.quantidade ?? '?'}
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5, color: D.text2, fontSize: 12 }}>
                  {vis && <span style={{ fontWeight: 700, color: vis.cor }}>{vis.nome}</span>}
                  <span>· {lugarDoItem(item)}</span>
                  {item.lotes.map((l, i) => (
                    <span key={i} style={{ padding: '1px 6px', borderRadius: 6, background: D.input, border: `1px solid ${D.border}`, color: D.text, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {dataCurta(l.data_validade)} · {l.quantidade}
                    </span>
                  ))}
                </div>
                {!deuCerto && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                    <span style={{ flex: '1 1 160px', color: VERMELHO, fontSize: 12, fontWeight: 700 }}>{item.erro ?? 'Erro'}</span>
                    {devolvido ? (
                      <span style={{ color: D.text2, fontSize: 12, fontWeight: 700 }}>Voltou para a lista</span>
                    ) : (
                      <button type="button" onClick={() => onTentarDeNovo(item, idx)}
                        style={{ padding: '6px 12px', borderRadius: 10, border: '1px solid rgba(99,102,241,0.5)', background: 'var(--accent-bg)', color: 'var(--accent-text)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Tentar de novo
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
