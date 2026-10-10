'use client'
import { useEffect, useRef } from 'react'

// Chama `carregar` ao montar e de novo sempre que a tela volta a ficar visível
// (PWA voltando do segundo plano, troca de aba) ou a janela ganha foco. Sem
// isso a tela mostra os números de quando foi aberta até alguém recarregar —
// era a causa do atraso da tela de Compras depois de uma movimentação.
// visibilitychange e focus costumam disparar juntos: o intervalo mínimo evita
// buscar duas vezes seguidas.
export function useRecarregarAoVoltar(carregar: () => void, intervaloMinimoMs = 1500) {
  const ref = useRef(carregar)
  useEffect(() => { ref.current = carregar })

  useEffect(() => {
    let ultima = 0
    function talvezRecarregar() {
      if (document.visibilityState !== 'visible') return
      const agora = Date.now()
      if (agora - ultima < intervaloMinimoMs) return
      ultima = agora
      ref.current()
    }
    talvezRecarregar()
    document.addEventListener('visibilitychange', talvezRecarregar)
    window.addEventListener('focus', talvezRecarregar)
    return () => {
      document.removeEventListener('visibilitychange', talvezRecarregar)
      window.removeEventListener('focus', talvezRecarregar)
    }
  }, [intervaloMinimoMs])
}
