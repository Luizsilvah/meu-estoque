'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

type ItemEstoque = {
  id: string
  qtd_atual: number
  qtd_base: number
  qtd_max: number
  data_validade: string | null
  produtos: {
    nome: string
    unidade: string
    fornecedores: { nome: string } | null
  } | null
}

export default function Estoque() {
  const [dados, setDados] = useState<ItemEstoque[]>([])
  const [filtroFornecedor, setFiltroFornecedor] = useState('Todos')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function buscar() {
      try {
        const res = await fetch('/api/estoque')
        if (!res.ok) {
          const texto = await res.text()
          setErro(`HTTP ${res.status}: ${texto}`)
          return
        }
        const json = await res.json()
        if (json.erro) setErro(json.erro)
        else setDados(json)
      } catch (err) {
        setErro(err instanceof Error ? err.message : 'Erro desconhecido')
      } finally {
        setLoading(false)
      }
    }
    buscar()
  }, [])

  const fornecedores = useMemo(() => {
    const nomes = dados
      .map((item) => item.produtos?.fornecedores?.nome)
      .filter((n): n is string => !!n)
    return ['Todos', ...Array.from(new Set(nomes)).sort()]
  }, [dados])

  const dadosFiltrados = useMemo(
    () =>
      filtroFornecedor === 'Todos'
        ? dados
        : dados.filter((item) => item.produtos?.fornecedores?.nome === filtroFornecedor),
    [dados, filtroFornecedor]
  )

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F0F2F5' }}>
      <p className="text-gray-400 text-sm">Carregando...</p>
    </div>
  )

  if (erro) return (
    <div className="min-h-screen p-6" style={{ background: '#F0F2F5' }}>
      <p className="text-red-600 font-bold">Erro ao carregar estoque</p>
      <pre className="text-red-500 text-xs mt-2 bg-red-50 rounded-xl p-4 whitespace-pre-wrap border border-red-100">{erro}</pre>
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: '#F0F2F5' }}>

      {/* Header */}
      <div style={{ background: '#1A3C5E' }} className="px-5 pt-10 pb-6">
        <Link href="/" className="text-blue-300 text-xs mb-3 block">← Voltar</Link>
        <h1 className="text-white text-2xl font-bold tracking-tight">Estoque</h1>
        <p className="text-blue-200 text-sm mt-1">{dadosFiltrados.length} itens</p>
      </div>

      <div className="px-4 py-5 space-y-4">

        {/* Filtros por fornecedor */}
        <div className="flex gap-2 flex-wrap">
          {fornecedores.map((f) => (
            <button
              key={f}
              onClick={() => setFiltroFornecedor(f)}
              className="px-4 py-1.5 rounded-full text-sm font-medium transition-all"
              style={
                filtroFornecedor === f
                  ? { background: '#1A3C5E', color: '#fff', boxShadow: '0 2px 8px rgba(26,60,94,0.25)' }
                  : { background: '#fff', color: '#4B5563', border: '1px solid #E5E7EB' }
              }
            >
              {f}
            </button>
          ))}
        </div>

        {/* Cards */}
        {dadosFiltrados.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-10">Nenhum produto encontrado.</p>
        ) : (
          dadosFiltrados.map((item) => {
            const precisaPedir = item.qtd_atual < item.qtd_base
            const qtdPedir = precisaPedir ? item.qtd_max - item.qtd_atual : 0

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl flex justify-between items-center px-4 py-3"
                style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}
              >
                {/* Info */}
                <div className="flex-1 min-w-0 pr-3">
                  <p className="text-gray-900 font-semibold text-sm leading-snug truncate">
                    {item.produtos?.nome ?? '—'}
                  </p>
                  <p className="text-gray-400 text-xs mt-0.5">
                    {item.produtos?.fornecedores?.nome ?? 'Fornecedor desconhecido'} · {item.produtos?.unidade}
                  </p>
                  <p className="text-gray-300 text-xs mt-0.5">
                    Base {item.qtd_base} · Máx {item.qtd_max}
                  </p>

                  {precisaPedir && (
                    <span
                      className="inline-block mt-1.5 text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: '#FEE2E2', color: '#DC2626' }}
                    >
                      Pedir {qtdPedir}
                    </span>
                  )}
                </div>

                {/* Quantidade */}
                <div className="text-right shrink-0">
                  <p
                    className="text-3xl font-bold leading-none"
                    style={{ color: precisaPedir ? '#DC2626' : '#16A34A' }}
                  >
                    {item.qtd_atual}
                  </p>
                  <p className="text-gray-300 text-xs mt-0.5">{item.produtos?.unidade}</p>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
