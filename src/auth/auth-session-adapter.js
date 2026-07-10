const inertAdapter = Object.freeze({
  getAccessToken: () => '',
  onAuthExpired: null,
})

let adapter = inertAdapter

export function configureAuthSessionAdapter(nextAdapter = {}) {
  if (typeof nextAdapter.getAccessToken !== 'function') {
    throw new TypeError('getAccessToken must be a function')
  }
  if (typeof nextAdapter.onAuthExpired !== 'function') {
    throw new TypeError('onAuthExpired must be a function')
  }

  adapter = Object.freeze({
    getAccessToken: nextAdapter.getAccessToken,
    onAuthExpired: nextAdapter.onAuthExpired,
  })
}

export function readAccessToken() {
  const token = adapter.getAccessToken()
  return token == null ? '' : String(token)
}

export function notifyAuthExpired(context = {}) {
  if (!adapter.onAuthExpired) return false
  adapter.onAuthExpired(context)
  return true
}

export function resetAuthSessionAdapterForTests() {
  adapter = inertAdapter
}
