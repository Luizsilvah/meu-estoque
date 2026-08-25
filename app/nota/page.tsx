'use client'
import { useRef, useState, useEffect, ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'

type ProdutoEstoque = {
  produto_id: string
  produtos: { nome: string; unidade: string } | null
}

type ItemNota = {
  nome_nota: string
  quantidade: number
  produto_id: string | null
  nome_sistema: string | null
  unidade: string | null
}

type ItemEditavel = {
  nome_nota: string
  quantidade: number
  produto_id_sel: string | null
  incluir: boolean
}

type Etapa = 'upload' | 'analisando' | 'revisao' | 'lancando' | 'concluido'

export default function NotaPage() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const [etapa, setEtapa] = useState<Etapa>('upload')
  const [imagemPreview, setImagemPreview] = useState<string | null>(null)
  const [imagemBase64, setImagemBase64] = useState('')
  const [mediaType, setMediaType] = useState('image/jpeg')
  const [fornecedor, setFornecedor] = useState<string | null>(null)
  const [itens, setItens] = useState<ItemEditavel[]>([])
  const [estoque, setEstoque] = useState<ProdutoEstoque[]>([])
  const [erroMsg, setErroMsg] = useState('')
  const [progresso, setProgresso] = useState<{ atual: number; total: number; nome: string }>({ atual: 0, total: 0, nome: '' })

  useEffect(() => {
    fetch('/api/estoque')
      .then((r) => r.json())
      .then((json) => { if (Array.isArray(json)) setEstoque(json) })
  }, [])

  function lerArquivo(file: File) {
    if (!file.type.startsWith('image/')) {
      setErroMsg('Selecione um arquivo de imagem.')
      return
    }
    setErroMsg('')
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      setImagemPreview(dataUrl)
      // Extrai base64 puro e media type
      const [meta, b64] = dataUrl.split(',')
      const mt = meta.match(/:(.*?);/)?.[1] ?? 'image/jpeg'
      setMediaType(mt)
      setImagemBase64(b64)
      setEtapa('upload')
    }
    reader.readAsDataURL(file)
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) lerArquivo(file)
    e.target.value = ''
  }

  async function analisarNota() {
    if (!imagemBase64) return
    setEtapa('analisando')
    setErroMsg('')

    try {
      const res = await fetch('/api/nota', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagemBase64, mediaType }),
      })
      const json = await res.json()

      if (!res.ok || json.erro) {
        setErroMsg(json.erro ?? 'Erro ao analisar a nota.')
        setEtapa('upload')
        return
      }

      const resultado = json as { fornecedor: string | null; produtos: ItemNota[] }
      setFornecedor(resultado.fornecedor)
      setItens(
        (resultado.produtos ?? []).map((item) => ({
          nome_nota: item.nome_nota,
          quantidade: item.quantidade > 0 ? item.quantidade : 1,
          produto_id_sel: item.produto_id ?? null,
          incluir: true,
        }))
      )
      setEtapa('revisao')
    } catch {
      setErroMsg('Erro de conexão ao analisar a nota.')
      setEtapa('upload')
    }
  }

  async function lancarEntradas() {
    const selecionados = itens.filter((i) => i.incluir && i.produto_id_sel)
    if (selecionados.length === 0) {
      setErroMsg('Selecione ao menos um produto com correspondência.')
      return
    }

    setEtapa('lancando')
    setErroMsg('')
    setProgresso({ atual: 0, total: selecionados.length, nome: '' })

    let erros = 0
    for (let idx = 0; idx < selecionados.length; idx++) {
      const item = selecionados[idx]
      const nomeProd = estoque.find((e) => e.produto_id === item.produto_id_sel)?.produtos?.nome ?? item.nome_nota
      setProgresso({ atual: idx + 1, total: selecionados.length, nome: nomeProd })

      const res = await fetch('/api/movimentacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          produto_id: item.produto_id_sel,
          tipo: 'entrada',
          quantidade: item.quantidade,
        }),
      })

      if (!res.ok) erros++
    }

    setErroMsg(erros > 0 ? `${erros} entrada(s) falharam. Verifique o estoque.` : '')
    setEtapa('concluido')
  }

  function atualizarItem(idx: number, campo: Partial<ItemEditavel>) {
    setItens((prev) => prev.map((it, i) => i === idx ? { ...it, ...campo } : it))
  }

  const btnBase = 'w-full py-3 rounded-xl font-semibold text-white text-sm transition-opacity active:opacity-80'

  // ── Upload ──────────────────────────────────────────────────────────────────
  if (etapa === 'upload') {
    return (
      <main className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-3 mb-5">
            <button onClick={() => router.back()} className="text-gray-500 text-sm">← Voltar</button>
            <h1 className="text-lg font-semibold text-gray-800">Lançar Nota Fiscal</h1>
          </div>

          {/* Área de upload */}
          <div
            className="border-2 border-dashed border-gray-300 rounded-2xl p-8 flex flex-col items-center gap-3 bg-white mb-4 cursor-pointer"
            onClick={() => inputRef.current?.click()}
          >
            {imagemPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imagemPreview} alt="Nota" className="max-h-60 rounded-xl object-contain" />
            ) : (
              <>
                <span className="text-5xl">🧾</span>
                <p className="text-gray-500 text-sm text-center">Toque para escolher uma imagem da galeria</p>
              </>
            )}
          </div>

          {/* Botões de seleção */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <button
              onClick={() => cameraRef.current?.click()}
              className={btnBase}
              style={{ background: '#1A3C5E' }}
            >
              📷 Câmera
            </button>
            <button
              onClick={() => inputRef.current?.click()}
              className={btnBase}
              style={{ background: '#374151' }}
            >
              🖼️ Galeria
            </button>
          </div>

          {/* Input câmera */}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={onFileChange}
          />
          {/* Input galeria */}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onFileChange}
          />

          {erroMsg && (
            <p className="text-red-600 text-sm text-center mt-2">{erroMsg}</p>
          )}

          {imagemPreview && (
            <button
              onClick={analisarNota}
              className={btnBase}
              style={{ background: '#16A34A' }}
            >
              🔍 Analisar nota
            </button>
          )}
        </div>
      </main>
    )
  }

  // ── Analisando ───────────────────────────────────────────────────────────────
  if (etapa === 'analisando') {
    return (
      <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="text-center">
          <div className="text-5xl mb-4 animate-pulse">🔍</div>
          <p className="text-gray-700 font-semibold">Analisando nota fiscal...</p>
          <p className="text-gray-400 text-sm mt-1">Isso pode levar alguns segundos</p>
        </div>
      </main>
    )
  }

  // ── Lançando ─────────────────────────────────────────────────────────────────
  if (etapa === 'lancando') {
    return (
      <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="text-center max-w-xs w-full">
          <div className="text-5xl mb-4 animate-bounce">📦</div>
          <p className="text-gray-700 font-semibold mb-1">Lançando entradas...</p>
          <p className="text-gray-500 text-sm mb-4 truncate">{progresso.nome}</p>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all"
              style={{ width: `${(progresso.atual / progresso.total) * 100}%`, background: '#16A34A' }}
            />
          </div>
          <p className="text-gray-400 text-xs mt-2">{progresso.atual} de {progresso.total}</p>
        </div>
      </main>
    )
  }

  // ── Concluído ────────────────────────────────────────────────────────────────
  if (etapa === 'concluido') {
    const lancados = itens.filter((i) => i.incluir && i.produto_id_sel).length
    return (
      <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="text-center max-w-xs w-full">
          <div className="text-6xl mb-4">✅</div>
          <p className="text-gray-800 font-semibold text-lg mb-1">
            {lancados} entrada{lancados !== 1 ? 's' : ''} registrada{lancados !== 1 ? 's' : ''}!
          </p>
          {erroMsg && <p className="text-red-500 text-sm mb-3">{erroMsg}</p>}
          <div className="flex flex-col gap-3 mt-6">
            <button
              onClick={() => { setEtapa('upload'); setImagemPreview(null); setImagemBase64(''); setItens([]) }}
              className={btnBase}
              style={{ background: '#1A3C5E' }}
            >
              📷 Lançar outra nota
            </button>
            <button
              onClick={() => router.push('/')}
              className={btnBase}
              style={{ background: '#374151' }}
            >
              ← Voltar ao início
            </button>
          </div>
        </div>
      </main>
    )
  }

  // ── Revisão ──────────────────────────────────────────────────────────────────
  const selecionados = itens.filter((i) => i.incluir && i.produto_id_sel).length
  const semCorrespondencia = itens.filter((i) => i.incluir && !i.produto_id_sel).length

  return (
    <main className="min-h-screen bg-gray-50 p-4 pb-28">
      <div className="max-w-md mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => setEtapa('upload')}
            className="text-gray-500 text-sm"
          >
            ← Voltar
          </button>
          <h1 className="text-lg font-semibold text-gray-800">Revisar Nota</h1>
        </div>

        {fornecedor && (
          <div className="bg-blue-50 rounded-xl px-4 py-2 mb-4 flex items-center gap-2">
            <span className="text-blue-500 text-sm">🏪</span>
            <span className="text-blue-800 text-sm font-medium">{fornecedor}</span>
          </div>
        )}

        {/* Preview miniatura */}
        {imagemPreview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imagemPreview}
            alt="Nota"
            className="w-full max-h-40 object-contain rounded-xl mb-4 bg-white border border-gray-100"
          />
        )}

        <p className="text-xs text-gray-500 mb-3 uppercase tracking-wide font-semibold">
          {itens.length} produto{itens.length !== 1 ? 's' : ''} encontrado{itens.length !== 1 ? 's' : ''}
        </p>

        {/* Lista de itens */}
        <div className="space-y-3 mb-4">
          {itens.map((item, idx) => {
            const produtoSel = estoque.find((e) => e.produto_id === item.produto_id_sel)
            return (
              <div
                key={idx}
                className="bg-white rounded-xl p-4 border border-gray-100"
                style={{ opacity: item.incluir ? 1 : 0.5 }}
              >
                {/* Cabeçalho do item */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{item.nome_nota}</p>
                    {produtoSel && (
                      <p className="text-xs text-green-600 mt-0.5">
                        ✓ {produtoSel.produtos?.nome}
                      </p>
                    )}
                    {!item.produto_id_sel && item.incluir && (
                      <p className="text-xs text-orange-500 mt-0.5">⚠ Sem correspondência</p>
                    )}
                  </div>
                  <label className="flex items-center gap-1.5 shrink-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.incluir}
                      onChange={(e) => atualizarItem(idx, { incluir: e.target.checked })}
                      className="w-4 h-4 accent-blue-600"
                    />
                    <span className="text-xs text-gray-500">Incluir</span>
                  </label>
                </div>

                {/* Selecionar produto */}
                <div className="mb-2">
                  <label className="text-xs text-gray-500 mb-1 block">Produto no sistema</label>
                  <select
                    value={item.produto_id_sel ?? ''}
                    onChange={(e) => atualizarItem(idx, { produto_id_sel: e.target.value || null })}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white"
                  >
                    <option value="">— Nenhum (ignorar) —</option>
                    {estoque.map((e) => (
                      <option key={e.produto_id} value={e.produto_id}>
                        {e.produtos?.nome ?? e.produto_id}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Quantidade */}
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Quantidade</label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => atualizarItem(idx, { quantidade: Math.max(1, item.quantidade - 1) })}
                      className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white"
                      style={{ background: '#1A3C5E' }}
                    >
                      <span style={{ display: 'block', width: 12, height: 2, background: '#fff', borderRadius: 2 }} />
                    </button>
                    <input
                      type="number"
                      min={1}
                      value={item.quantidade}
                      onChange={(e) => {
                        const v = parseInt(e.target.value)
                        if (v > 0) atualizarItem(idx, { quantidade: v })
                      }}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-center text-sm font-semibold"
                    />
                    <button
                      onClick={() => atualizarItem(idx, { quantidade: item.quantidade + 1 })}
                      className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-lg"
                      style={{ background: '#1A3C5E' }}
                    >
                      +
                    </button>
                    {produtoSel?.produtos?.unidade && (
                      <span className="text-xs text-gray-400 w-8 text-center shrink-0">
                        {produtoSel.produtos.unidade}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {erroMsg && (
          <p className="text-red-600 text-sm text-center mb-3">{erroMsg}</p>
        )}
      </div>

      {/* Botão fixo no rodapé */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gray-50 border-t border-gray-200">
        <div className="max-w-md mx-auto space-y-2">
          {semCorrespondencia > 0 && (
            <p className="text-orange-600 text-xs text-center">
              {semCorrespondencia} item{semCorrespondencia !== 1 ? 's' : ''} sem correspondência {semCorrespondencia !== 1 ? 'serão ignorados' : 'será ignorado'}
            </p>
          )}
          <button
            onClick={lancarEntradas}
            disabled={selecionados === 0}
            className={btnBase}
            style={{ background: selecionados > 0 ? '#16A34A' : '#9CA3AF' }}
          >
            📦 Lançar {selecionados > 0 ? `${selecionados} entrada${selecionados !== 1 ? 's' : ''}` : 'entradas'}
          </button>
        </div>
      </div>
    </main>
  )
}
