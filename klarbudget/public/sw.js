const CACHE_NAME = 'klarbudget-v2'
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

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
      fetchAndCache(event.request).catch(() => caches.match('/index.html')),
    )
    return
  }

  event.respondWith(
    caches.match(event.request).then((cached) =>
      cached || fetchAndCache(event.request).catch(() => caches.match('/index.html')),
    ),
  )
})
