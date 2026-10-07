// Troque a versão a cada deploy que precise derrubar o cache: o arquivo muda,
// o navegador instala o SW novo e o activate apaga os caches com outro nome.
const CACHE_NAME = 'meu-estoque-v2'

// Páginas e assets para pré-cachear na instalação
const PRECACHE_URLS = [
  '/',
  '/estoque',
  '/movimentacao',
  '/historico',
  '/checklist',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
]

// ── Instalação: assume na hora e pré-cacheia páginas principais ─────────────
self.addEventListener('install', (event) => {
  // Não espera as abas antigas fecharem: o SW novo ativa assim que instala.
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(PRECACHE_URLS).catch(() => {
        // Ignora erros de precache (página pode exigir auth)
      })
    )
  )
})

// ── Ativação: remove caches antigos e assume as abas abertas ────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  )
})

// ── Push: exibe notificação ──────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'Meu Estoque', body: 'Você tem alertas de estoque.', icon: '/icon-192.png', url: '/' }
  if (event.data) {
    try { data = { ...data, ...JSON.parse(event.data.text()) } } catch (_) {}
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: '/icon-192.png',
      data: { url: data.url },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      const found = cs.find((c) => c.url.includes(self.location.origin))
      if (found) return found.focus()
      return clients.openWindow(url)
    })
  )
})

// ── Fetch: network-first para API, cache-first para assets estáticos ─────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  // Ignora esquemas que o Cache API não aceita (ex.: chrome-extension://)
  if (!request.url.startsWith('http')) return
  const url = new URL(request.url)

  // Ignora requisições não-GET e chamadas de API
  if (request.method !== 'GET') return
  if (url.pathname.startsWith('/api/')) return
  if (url.pathname.startsWith('/_next/')) {
    // Assets do Next.js: cache-first
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return response
        })
      })
    )
    return
  }

  // Páginas: network-first, fallback para cache
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        }
        return response
      })
      .catch(() => caches.match(request))
  )
})
