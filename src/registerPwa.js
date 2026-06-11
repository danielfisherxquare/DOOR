const INSTALL_PROMPT_EVENT = 'arcspro:installprompt'
const APP_INSTALLED_EVENT = 'arcspro:appinstalled'

function emitInstallPrompt(promptEvent) {
  window.__arcsproInstallPrompt = promptEvent
  window.dispatchEvent(new CustomEvent(INSTALL_PROMPT_EVENT, {
    detail: { promptEvent },
  }))
}

function registerAppServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  if (!window.isSecureContext && window.location.hostname !== 'localhost') return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/arcspro-app-sw.js').catch((error) => {
      console.warn('[ArcSpro PWA] service worker registration failed:', error)
    })
  })
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
