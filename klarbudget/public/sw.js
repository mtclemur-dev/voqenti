const CACHE_NAME = 'klarbudget-v2026-06-05-shopping-preview'
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => caches.delete(key))),
    ),
  )
  self.clients.claim()
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.hostname.includes('supabase.co') || url.hostname.includes('googleapis.com')) return

  const isNavigationRequest = event.request.mode === 'navigate' ||
    (event.request.headers.get('accept') || '').includes('text/html')

  const fetchAndCache = (request) =>
    fetch(request).then((response) => {
      if (!response || response.status !== 200 || response.type !== 'basic') {
        return response
      }
      const copy = response.clone()
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
      return response
    })

  if (isNavigationRequest) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy))
          return response
        })
        .catch(() => caches.match('/index.html')),
    )
    return
  }

  event.respondWith(
    fetchAndCache(event.request).catch(() => caches.match(event.request)),
  )
})
