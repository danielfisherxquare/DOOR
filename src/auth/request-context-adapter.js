const inertAdapter = Object.freeze({
  getWorkspaceContext: () => null,
})

let adapter = inertAdapter

export function configureRequestContextAdapter(nextAdapter = {}) {
  if (typeof nextAdapter.getWorkspaceContext !== 'function') {
    throw new TypeError('getWorkspaceContext must be a function')
  }

  adapter = Object.freeze({
    getWorkspaceContext: nextAdapter.getWorkspaceContext,
  })
}

export function readWorkspaceRequestContext() {
  const context = adapter.getWorkspaceContext()
  if (!context || typeof context !== 'object') return null

  return {
    scopeType: context.scopeType || '',
    orgId: context.orgId == null ? '' : String(context.orgId),
    raceId: context.raceId == null ? '' : String(context.raceId),
  }
}

export function resetRequestContextAdapterForTests() {
  adapter = inertAdapter
}
