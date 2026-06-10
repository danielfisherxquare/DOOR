const DOOR_APP_CACHE = 'door-app-shell-v1'
const LEGACY_TILE_WORKER = '/sw' + '-tiles.js'

const APP_SHELL_URLS = [
  '/',
  '/app',
  '/manifest.webmanifest',
  '/icons/door-icon.svg',
  '/icons/door-icon-180.png',
  '/icons/door-icon-192.png',
  '/icons/door-icon-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(DOOR_APP_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('door-app-shell-') && key !== DOOR_APP_CACHE)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  )
})

function shouldBypass(requestUrl) {
  return requestUrl.pathname.startsWith('/api/')
    || requestUrl.pathname === LEGACY_TILE_WORKER
    || requestUrl.pathname.startsWith('/tiles/')
    || requestUrl.pathname.startsWith('/cesium/')
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached

  const response = await fetch(request)
  const cache = await caches.open(DOOR_APP_CACHE)
  cache.put(request, response.clone())
  return response
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(DOOR_APP_CACHE)
      cache.put('/app', response.clone())
    }
    return response
  } catch (error) {
    const cachedApp = await caches.match('/app')
    const cachedRoot = await caches.match('/')
    return cachedApp || cachedRoot || Response.error()
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const requestUrl = new URL(request.url)
  if (requestUrl.origin !== self.location.origin || shouldBypass(requestUrl)) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request))
    return
  }

  if (
    requestUrl.pathname === '/manifest.webmanifest'
    || requestUrl.pathname.startsWith('/icons/')
  ) {
    event.respondWith(cacheFirst(request))
  }
})
