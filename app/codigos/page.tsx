'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { D } from '@/app/lib/theme'
import Page from '@/app/components/ui/Page'
import PageHeader from '@/app/components/ui/PageHeader'
import SearchBar from '@/app/components/ui/SearchBar'
import Card from '@/app/components/ui/Card'
import Icon from '@/app/components/ui/Icon'
import FotoThumb from '@/app/components/FotoThumb'
import { buscarEstoque } from '@/app/lib/estoqueCache'

type Item = {
  nome: string
  fornecedor: string
  codigo_barras: string
  foto_url: string | null
}

// Antes, todo BarcodeCell gerava o código de barras (import dinâmico do jsbarcode +
// desenho do SVG) no mesmo instante em que a tabela montava — num catálogo grande
// isso é centenas de imports+desenhos de uma vez, travando a tela. Agora só gera
// quando a linha entra (ou está perto de entrar) na viewport.
function BarcodeCell({ codigo, forcarVisivel }: { codigo: string; forcarVisivel: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [erro, setErro] = useState(false)
  const [visivel, setVisivel] = useState(false)

  useEffect(() => {
    if (!containerRef.current || visivel) return
    const obs = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) { setVisivel(true); obs.disconnect() }
    }, { rootMargin: '200px' }) // gera um pouco antes de aparecer, pra não "piscar" durante o scroll
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [visivel])

  // Imprimir (Ctrl+P, não só o botão Imprimir desta página) só captura o que já está no
  // DOM — então força tudo a renderizar antes de qualquer impressão, mesmo o que
  // ainda não foi visto. O botão de imprimir também força isso explicitamente
  // (prop forcarVisivel) e espera um frame antes de chamar window.print().
  useEffect(() => {
    function forcar() { setVisivel(true) }
    window.addEventListener('beforeprint', forcar)
    return () => window.removeEventListener('beforeprint', forcar)
  }, [])

  useEffect(() => {
    if (forcarVisivel) setVisivel(true)
  }, [forcarVisivel])

  useEffect(() => {
    if (!visivel || !svgRef.current) return
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
  }, [codigo, visivel])

  if (erro) return <span className="text-xs text-red-400">Inválido</span>

  return (
    <div ref={containerRef} className="flex flex-col items-start gap-0.5" style={{ minHeight: 48 }}>
      {visivel
        ? <svg ref={svgRef} />
        : <div aria-hidden style={{ width: 120, height: 48, borderRadius: 4, background: '#F3F4F6' }} />}
      <span className="text-xs text-gray-400 font-mono">{codigo}</span>
    </div>
  )
}

export default function CodigosBarras() {
  const [dados, setDados] = useState<Item[]>([])
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(true)
  const [imprimirTudo, setImprimirTudo] = useState(false)

  useEffect(() => {
    buscarEstoque()
      .then((json) => {
        const itens: Item[] = (json as any[])
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
      .catch(() => {})
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

  // O botão chama isto em vez de window.print() direto: garante que todo código de
  // barras (mesmo os que o usuário nunca rolou até ver) esteja desenhado no DOM antes
  // do navegador "fotografar" a página para impressão.
  async function imprimir() {
    await import('jsbarcode') // garante o módulo em cache antes de forçar todas as linhas de uma vez
    setImprimirTudo(true)
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    window.print()
  }

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
    <div className="etq-raiz min-h-screen" style={{ background: D.bg }}>

      {/* ── Tela (some na impressão) ── */}
      <div className="print:hidden">
        <Page>
          <PageHeader
            titulo="Etiquetas"
            subtitulo={loading ? 'Carregando...' : `${filtrados.length} produto${filtrados.length !== 1 ? 's' : ''}`}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <SearchBar value={busca} onChange={setBusca} placeholder="Buscar por nome, fornecedor ou código..." />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button onClick={exportarCSV} disabled={filtrados.length === 0}
                style={{ height: 46, borderRadius: 14, border: `1px solid ${D.border}`, background: D.card, color: D.text, fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', opacity: filtrados.length === 0 ? 0.4 : 1 }}>
                <Icon nome="download" size={18} /> Exportar CSV
              </button>
              <button onClick={imprimir}
                style={{ height: 46, borderRadius: 14, border: 'none', background: '#6366F1', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
                <Icon nome="printer" size={18} /> Imprimir
              </button>
            </div>

            {loading ? (
              <p style={{ color: D.text2, fontSize: 14, textAlign: 'center', padding: '40px 0' }}>Carregando...</p>
            ) : filtrados.length === 0 ? (
              <p style={{ color: D.text2, fontSize: 14, textAlign: 'center', padding: '40px 0' }}>
                {dados.length === 0
                  ? 'Nenhum produto com código de barras cadastrado.'
                  : 'Nenhum resultado para a busca.'}
              </p>
            ) : filtrados.map((item, idx) => (
              <Card key={item.codigo_barras + idx} style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <FotoThumb src={item.foto_url} size={44} radius={12} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: D.text, fontSize: 15, fontWeight: 800, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.nome}</p>
                    <p style={{ color: D.text2, fontSize: 12, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.fornecedor}</p>
                  </div>
                </div>
                {/* Etiqueta: fundo branco para o código ficar legível também no tema escuro */}
                <div style={{ background: '#fff', borderRadius: 10, padding: '6px 10px', overflowX: 'auto' }}>
                  <BarcodeCell codigo={item.codigo_barras} forcarVisivel={imprimirTudo} />
                </div>
              </Card>
            ))}
          </div>
        </Page>
      </div>

      {/* ── Impressão (layout igual ao de antes; só aparece ao imprimir) ── */}
      <div className="hidden print:block">
        {/* Título só na impressão */}
        <div className="px-6 pt-6 pb-2">
          <h1 className="text-xl font-bold text-gray-900">Etiquetas — Estoque</h1>
          <p className="text-xs text-gray-500 mt-1">
            {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
          </p>
        </div>

        <div className="px-4 py-5 max-w-2xl mx-auto">
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
                        <BarcodeCell codigo={item.codigo_barras} forcarVisivel={imprimirTudo} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Estilos de impressão */}
      <style>{`
        @media print {
          body { background: white !important; }
          .etq-raiz { background: white !important; }
          table { width: 100%; border-collapse: collapse; }
          td, th { padding: 6px 12px; border-bottom: 1px solid #e5e7eb; }
          tr { break-inside: avoid; }
        }
      `}</style>
    </div>
  )
}
