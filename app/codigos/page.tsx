'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import FotoThumb from '@/app/components/FotoThumb'

type Item = {
  nome: string
  fornecedor: string
  codigo_barras: string
  foto_url: string | null
}

function BarcodeCell({ codigo }: { codigo: string }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    if (!svgRef.current) return
    setErro(false)
    import('jsbarcode').then(({ default: JsBarcode }) => {
      try {
        JsBarcode(svgRef.current!, codigo, {
          format: 'CODE128',
          displayValue: false,
          margin: 4,
          height: 48,
          width: 1.4,
        })
      } catch {
        setErro(true)
      }
    })
  }, [codigo])

  if (erro) return <span className="text-xs text-red-400">Inválido</span>

  return (
    <div className="flex flex-col items-start gap-0.5">
      <svg ref={svgRef} />
      <span className="text-xs text-gray-400 font-mono">{codigo}</span>
    </div>
  )
}

export default function CodigosBarras() {
  const [dados, setDados] = useState<Item[]>([])
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/estoque')
      .then((r) => r.json())
      .then((json: any[]) => {
        if (!Array.isArray(json)) return
        const itens: Item[] = json
          .filter((i) => i.produtos?.codigo_barras)
          .map((i) => ({
            nome: i.produtos?.nome ?? '—',
            fornecedor: i.produtos?.fornecedores?.nome ?? '—',
            codigo_barras: i.produtos.codigo_barras as string,
            foto_url: (i.produtos?.foto_url as string | null) ?? null,
          }))
          .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
        setDados(itens)
      })
      .finally(() => setLoading(false))
  }, [])

  const filtrados = useMemo(() =>
    busca.trim()
      ? dados.filter((i) =>
          i.nome.toLowerCase().includes(busca.toLowerCase()) ||
          i.fornecedor.toLowerCase().includes(busca.toLowerCase()) ||
          i.codigo_barras.includes(busca)
        )
      : dados,
    [dados, busca]
  )

  function exportarCSV() {
    const header = 'Nome,Fornecedor,Código de Barras'
    const rows = filtrados.map((i) =>
      [
        `"${i.nome.replace(/"/g, '""')}"`,
        `"${i.fornecedor.replace(/"/g, '""')}"`,
        `"${i.codigo_barras}"`,
      ].join(',')
    )
    const csv = '\uFEFF' + [header, ...rows].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'codigos_barras.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen" style={{ background: '#F0F2F5' }}>

      {/* Header — oculto na impressão */}
      <div style={{ background: '#1A3C5E' }} className="px-5 pt-10 pb-6 print:hidden">
        <Link href="/" className="text-blue-300 text-xs mb-3 block">← Voltar</Link>
        <h1 className="text-white text-2xl font-bold tracking-tight">Códigos de barras</h1>
        <p className="text-blue-200 text-sm mt-1">
          {loading ? 'Carregando...' : `${filtrados.length} produto${filtrados.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Título só na impressão */}
      <div className="hidden print:block px-6 pt-6 pb-2">
        <h1 className="text-xl font-bold text-gray-900">Códigos de barras — Estoque</h1>
        <p className="text-xs text-gray-500 mt-1">
          {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
        </p>
      </div>

      <div className="px-4 py-5 max-w-2xl mx-auto">

        {/* Barra de ações */}
        <div className="flex gap-2 mb-4 print:hidden">
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, fornecedor ou código..."
            className="flex-1 bg-white rounded-xl px-4 py-2.5 text-sm text-gray-800 border border-gray-200 outline-none focus:border-[#1A3C5E] transition-colors"
          />
          <button
            onClick={exportarCSV}
            disabled={filtrados.length === 0}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 shrink-0"
            style={{ background: '#1A3C5E' }}
          >
            CSV
          </button>
          <button
            onClick={() => window.print()}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white shrink-0"
            style={{ background: '#374151' }}
          >
            🖨️
          </button>
        </div>

        {/* Tabela */}
        {loading ? (
          <p className="text-gray-400 text-sm text-center py-10">Carregando...</p>
        ) : filtrados.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-10">
            {dados.length === 0
              ? 'Nenhum produto com código de barras cadastrado.'
              : 'Nenhum resultado para a busca.'}
          </p>
        ) : (
          <div
            className="bg-white rounded-2xl overflow-hidden print:rounded-none print:shadow-none"
            style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}
          >
            <table className="w-full text-sm">
              <thead className="print:hidden">
                <tr style={{ background: '#F8F9FA' }}>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Produto</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Fornecedor</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Código</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((item, idx) => (
                  <tr key={item.codigo_barras + idx} className="border-t border-gray-100 print:break-inside-avoid">
                    <td className="px-4 py-3 align-top">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <FotoThumb src={item.foto_url} />
                        <span className="text-gray-800 font-medium">{item.nome}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden sm:table-cell align-top">{item.fornecedor}</td>
                    <td className="px-4 py-3 align-top">
                      <BarcodeCell codigo={item.codigo_barras} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Estilos de impressão */}
      <style>{`
        @media print {
          body { background: white !important; }
          table { width: 100%; border-collapse: collapse; }
          td, th { padding: 6px 12px; border-bottom: 1px solid #e5e7eb; }
          tr { break-inside: avoid; }
        }
      `}</style>
    </div>
  )
}
