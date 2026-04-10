export function detectCurrentSurface() {
  if (typeof window === 'undefined') return 'app'

  const path = window.location.pathname || ''
  if (path.startsWith('/admin')) return 'admin'
  if (path.startsWith('/ops')) return 'ops'
  if (path.startsWith('/app')) return 'app'
  return 'public'
}

export function resolveSurfacePrefix(prefixes, fallbackSurface = 'app') {
  const surface = detectCurrentSurface()
  return prefixes[surface] || prefixes[fallbackSurface] || ''
}
