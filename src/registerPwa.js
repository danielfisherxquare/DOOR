const INSTALL_PROMPT_EVENT = 'door:installprompt'
const APP_INSTALLED_EVENT = 'door:appinstalled'

function emitInstallPrompt(promptEvent) {
  window.__doorInstallPrompt = promptEvent
  window.dispatchEvent(new CustomEvent(INSTALL_PROMPT_EVENT, {
    detail: { promptEvent },
  }))
}

function registerAppServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  if (!window.isSecureContext && window.location.hostname !== 'localhost') return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/door-app-sw.js').catch((error) => {
      console.warn('[DOOR PWA] service worker registration failed:', error)
    })
  })
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    emitInstallPrompt(event)
  })

  window.addEventListener('appinstalled', () => {
    window.__doorInstallPrompt = null
    window.dispatchEvent(new CustomEvent(APP_INSTALLED_EVENT))
  })

  registerAppServiceWorker()
}
