const INSTALL_PROMPT_EVENT = 'arcspro:installprompt'
const APP_INSTALLED_EVENT = 'arcspro:appinstalled'
const APP_SERVICE_WORKER_URL = '/arcspro-app-sw.js'
const LOCAL_PREVIEW_RELOAD_KEY = 'arcspro:local-app-shell-sw-cleanup-reload:v1'
const LOCAL_PREVIEW_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])
const APP_SHELL_CACHE_PREFIXES = ['arcspro-app-shell-', 'zao-event-app-shell-']

function emitInstallPrompt(promptEvent) {
  window.__arcsproInstallPrompt = promptEvent
  window.dispatchEvent(new CustomEvent(INSTALL_PROMPT_EVENT, {
    detail: { promptEvent },
  }))
}

function registerAppServiceWorker() {
  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    if (isLocalPreviewOrigin(window.location)) {
      cleanupLocalAppShellServiceWorkers()
      return
    }

    if (!window.isSecureContext) return

    navigator.serviceWorker.register(APP_SERVICE_WORKER_URL).catch((error) => {
      console.warn('[ArcSpro PWA] service worker registration failed:', error)
    })
  })
}

function isLocalPreviewOrigin(location) {
  return location?.protocol === 'http:' && LOCAL_PREVIEW_HOSTS.has(location.hostname)
}

function isAppShellCache(cacheName) {
  return APP_SHELL_CACHE_PREFIXES.some((prefix) => cacheName.startsWith(prefix))
}

function isAppShellWorker(registration) {
  return [registration.active, registration.installing, registration.waiting]
    .some((worker) => worker?.scriptURL?.includes(APP_SERVICE_WORKER_URL))
}

async function cleanupLocalAppShellServiceWorkers() {
  try {
    const registrations = typeof navigator.serviceWorker.getRegistrations === 'function'
      ? await navigator.serviceWorker.getRegistrations()
      : []
    await Promise.all(
      registrations
        .filter(isAppShellWorker)
        .map((registration) => registration.unregister()),
    )

    if (typeof caches !== 'undefined') {
      const cacheNames = await caches.keys()
      await Promise.all(
        cacheNames
          .filter(isAppShellCache)
          .map((cacheName) => caches.delete(cacheName)),
      )
    }

    if (navigator.serviceWorker.controller && !window.sessionStorage?.getItem(LOCAL_PREVIEW_RELOAD_KEY)) {
      window.sessionStorage?.setItem(LOCAL_PREVIEW_RELOAD_KEY, '1')
      window.location.reload()
    }
  } catch (error) {
    console.warn('[ArcSpro PWA] local service worker cleanup failed:', error)
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    emitInstallPrompt(event)
  })

  window.addEventListener('appinstalled', () => {
    window.__arcsproInstallPrompt = null
    window.dispatchEvent(new CustomEvent(APP_INSTALLED_EVENT))
  })

  registerAppServiceWorker()
}
