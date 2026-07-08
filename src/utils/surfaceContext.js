function toContextId(value) {
  return value === undefined || value === null || value === '' ? '' : String(value)
}

export function resolveSurfaceOrgId(searchParams, user, session = null) {
  const explicitOrgId = searchParams?.get?.('orgId')
  if (explicitOrgId) return String(explicitOrgId)

  if (session?.scopeType !== 'platform' && session?.orgId) {
    return String(session.orgId)
  }

  return (
    toContextId(user?.org?.id)
    || toContextId(user?.orgId)
    || toContextId(user?.preferences?.lastOrgId)
    || ''
  )
}

export function resolveSurfaceRaceId(searchParams, user, currentOrgId = '', session = null) {
  const explicitRaceId = searchParams?.get?.('raceId')
  if (explicitRaceId) {
    return String(explicitRaceId)
  }

  const normalizedOrgId = currentOrgId
    || resolveSurfaceOrgId(searchParams, user, session)
    || ''
  const sessionOrgId = toContextId(session?.orgId)
  const sessionRaceId = toContextId(session?.raceId)

  if (
    sessionRaceId
    && (!sessionOrgId || !normalizedOrgId || sessionOrgId === String(normalizedOrgId))
  ) {
    return sessionRaceId
  }

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
