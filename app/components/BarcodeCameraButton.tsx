'use client'
import { useRef, useState } from 'react'

interface Props {
  onScanned: (codigo: string) => void
  /** ID único para o div do scanner — deve ser diferente em cada instância na página */
  instanceId?: string
  /** Se fornecido, renderiza este trigger em vez do botão 📷 padrão */
  renderTrigger?: (abrir: () => void) => React.ReactNode
}

export default function BarcodeCameraButton({ onScanned, instanceId = 'barcode-scanner-div', renderTrigger }: Props) {
  const [aberto, setAberto] = useState(false)
  const [status, setStatus] = useState<'lendo' | 'ok' | 'nao_encontrado'>('lendo')
  const qrcodeRef = useRef<any>(null)
  const processandoRef = useRef(false)

  async function abrir() {
    processandoRef.current = false
    setStatus('lendo')
    setAberto(true)

    setTimeout(async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        const qrcode = new Html5Qrcode(instanceId)
        qrcodeRef.current = qrcode

        await qrcode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 260, height: 100 } },
          async (codigo: string) => {
            if (processandoRef.current) return
            processandoRef.current = true
            try { await qrcode.stop() } catch { /* ignorar */ }
            qrcodeRef.current = null
            setStatus('ok')
            setTimeout(() => {
              setAberto(false)
              onScanned(codigo)
            }, 400)
          },
          () => {}
        )
      } catch {
        setAberto(false)
      }
    }, 150)
  }

  async function fechar() {
    try { await qrcodeRef.current?.stop() } catch { /* ignorar */ }
    qrcodeRef.current = null
    setAberto(false)
  }

  return (
    <>
      {renderTrigger ? renderTrigger(abrir) : (
        <button
          type="button"
          onClick={abrir}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#1A3C5E] transition-colors text-lg leading-none"
          title="Escanear código de barras"
        >
          📷
        </button>
      )}

      {aberto && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.85)' }}
        >
          <div className="w-full max-w-sm px-4">
            <p className="text-white text-center text-sm font-medium mb-4">
              {status === 'lendo' && 'Aponte para o código de barras'}
              {status === 'ok' && '✅ Código lido!'}
              {status === 'nao_encontrado' && '❌ Não encontrado'}
            </p>

            <div
              id={instanceId}
              className="w-full rounded-2xl overflow-hidden"
              style={{ minHeight: 220, background: '#000' }}
            />

            <button
              type="button"
              onClick={fechar}
              className="mt-5 w-full py-3 rounded-2xl text-white text-sm font-semibold"
              style={{ background: 'rgba(255,255,255,0.15)' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </>
  )
}
