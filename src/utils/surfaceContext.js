export function resolveSurfaceOrgId(searchParams, user) {
  return (
    searchParams?.get?.('orgId')
    || user?.org?.id
    || user?.orgId
    || user?.preferences?.lastOrgId
    || ''
  )
}

export function resolveSurfaceRaceId(searchParams, user, currentOrgId = '') {
  const explicitRaceId = searchParams?.get?.('raceId')
  if (explicitRaceId) {
    return String(explicitRaceId)
  }

  const normalizedOrgId = currentOrgId
    || resolveSurfaceOrgId(searchParams, user)
    || ''
  const preferredOrgId = user?.preferences?.lastOrgId
    ? String(user.preferences.lastOrgId)
    : ''

  if (preferredOrgId && normalizedOrgId && preferredOrgId !== normalizedOrgId) {
    return ''
  }

  const preferredRaceId = user?.preferences?.lastRaceId
  return preferredRaceId ? String(preferredRaceId) : ''
}

export function buildSurfaceHref(basePath, { orgId, raceId } = {}) {
  const params = new URLSearchParams()

  if (orgId) {
    params.set('orgId', String(orgId))
  }

  if (raceId) {
    params.set('raceId', String(raceId))
  }

  const query = params.toString()
  return `${basePath}${query ? `?${query}` : ''}`
}
