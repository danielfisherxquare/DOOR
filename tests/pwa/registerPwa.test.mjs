import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

const previousWindow = globalThis.window
const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
const previousCaches = globalThis.caches

function restoreGlobals() {
  if (previousWindow === undefined) delete globalThis.window
  else globalThis.window = previousWindow

  if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator)
  else delete globalThis.navigator

  if (previousCaches === undefined) delete globalThis.caches
  else globalThis.caches = previousCaches
}

function createBrowserEnv({ hostname, protocol = 'http:', isSecureContext = true, controlled = false } = {}) {
  const loadHandlers = []
  const registerCalls = []
  const unregisterCalls = []
  const deletedCaches = []
  const sessionValues = new Map()
  const registrations = [
    {
      active: { scriptURL: protocol + '//' + hostname + '/arcspro-app-sw.js' },
      installing: null,
      waiting: null,
      unregister: async () => {
        unregisterCalls.push('/arcspro-app-sw.js')
        return true
      },
    },
  ]

  const window = {
    isSecureContext,
    location: {
      hostname,
      protocol,
      reload: () => {},
    },
    sessionStorage: {
      getItem: (key) => sessionValues.get(key) || null,
      setItem: (key, value) => sessionValues.set(key, String(value)),
      removeItem: (key) => sessionValues.delete(key),
    },
    addEventListener: (type, handler) => {
      if (type === 'load') loadHandlers.push(handler)
    },
    dispatchEvent: () => {},
  }

  const navigator = {
    serviceWorker: {
      controller: controlled ? {} : null,
      register: async (scriptUrl) => {
        registerCalls.push(scriptUrl)
        return { scriptURL: scriptUrl }
      },
      getRegistrations: async () => registrations,
    },
  }

  const caches = {
    keys: async () => ['zao-event-app-shell-v1', 'arcspro-app-shell-old', 'map-tiles-cache'],
    delete: async (cacheName) => {
      deletedCaches.push(cacheName)
      return true
    },
  }

  return {
    caches,
    deletedCaches,
    loadHandlers,
    navigator,
    registerCalls,
    unregisterCalls,
    window,
  }
}

async function importRegisterPwa(env) {
  globalThis.window = env.window
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: env.navigator,
  })
  globalThis.caches = env.caches

  await import(`../../src/registerPwa.js?test=${Date.now()}-${Math.random()}`)
}

async function runLoadHandlers(env) {
  for (const handler of env.loadHandlers) {
    await handler()
  }
  await new Promise((resolve) => setTimeout(resolve, 0))
}

afterEach(() => {
  restoreGlobals()
})

describe('registerPwa', () => {
  it('cleans stale app shell workers instead of registering them on local 127 previews', async () => {
    const env = createBrowserEnv({ hostname: '127.0.0.1', protocol: 'http:', isSecureContext: true })

    await importRegisterPwa(env)
    await runLoadHandlers(env)

    assert.deepEqual(env.registerCalls, [])
    assert.deepEqual(env.unregisterCalls, ['/arcspro-app-sw.js'])
    assert.deepEqual(env.deletedCaches.sort(), ['arcspro-app-shell-old', 'zao-event-app-shell-v1'])
  })

  it('registers the app service worker on production-like secure origins', async () => {
    const env = createBrowserEnv({ hostname: 'events.example.com', protocol: 'https:', isSecureContext: true })

    await importRegisterPwa(env)
    await runLoadHandlers(env)

    assert.deepEqual(env.registerCalls, ['/arcspro-app-sw.js'])
    assert.deepEqual(env.unregisterCalls, [])
    assert.deepEqual(env.deletedCaches, [])
  })
})
