'use client'
import { useEffect } from 'react'

export async function subscribePush(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false

  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return false

  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  const sub = existing ?? await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
    ),
  })

  await fetch('/api/notificacoes/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub.toJSON()),
  })

  return true
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export default function RegisterSW() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    // SW novo assumiu (skipWaiting + clients.claim em public/sw.js) → recarrega
    // uma vez para a página usar os arquivos novos. Na primeira instalação não
    // havia controller, então não recarrega; a flag evita recarregar em loop.
    const tinhaController = !!navigator.serviceWorker.controller
    let recarregou = false
    const aoTrocar = () => {
      if (!tinhaController || recarregou) return
      recarregou = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', aoTrocar)
    navigator.serviceWorker
      .register('/sw.js')
      .catch(() => {})
    return () => navigator.serviceWorker.removeEventListener('controllerchange', aoTrocar)
  }, [])
  return null
}
