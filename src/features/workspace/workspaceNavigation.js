function isSafeInternalPath(value) {
  return typeof value === 'string'
    && value.startsWith('/')
    && !value.startsWith('//')
    && !value.startsWith('/login')
}

export function resolveLoginDestination({
  protectedRouteReturn,
  redirect,
  hasPlatformProfile = false,
  defaultLanding = '/workspaces',
} = {}) {
  if (isSafeInternalPath(protectedRouteReturn)) return protectedRouteReturn
  if (isSafeInternalPath(redirect)) return redirect
  return hasPlatformProfile ? '/launcher' : defaultLanding
}

export function resolvePlatformWorkspaceTarget(redirect) {
  if (!isSafeInternalPath(redirect)) return '/admin'
  if (redirect === '/launcher') return redirect
  if (redirect === '/admin' || redirect.startsWith('/admin/') || redirect.startsWith('/admin?')) return redirect
  return '/admin'
}

export function resolveSurfaceWorkspaceRedirect({ scopeType, surface } = {}) {
  if (scopeType !== 'platform' || !['app', 'ops'].includes(surface)) return ''
  return `/workspaces/select?redirect=${encodeURIComponent(`/${surface}`)}`
}
