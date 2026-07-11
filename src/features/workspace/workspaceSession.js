const DEFAULT_PATHS = {
  app: '/app',
  ops: '/ops',
  admin: '/admin',
}

const VALID_SURFACES = new Set(['app', 'ops', 'admin'])
const VALID_SCOPE_TYPES = new Set(['platform', 'org', 'race'])
export const PLATFORM_WORKSPACE_ID = '__platform__'
export const PLATFORM_SCOPE_VALUE = '__platform_control__'
export const ORG_OPERATION_SCOPE_VALUE = '__org_operation__'

export const WORKSPACE_SURFACES = [
  { key: 'app', label: '应用层', description: '名单、报销、证件、地图和仓储。', pathKey: 'lastAppPath', defaultPath: '/app', icon: 'apps' },
  { key: 'ops', label: '执行层', description: '扫码、领取、发放、入库和出库。', pathKey: 'lastOpsPath', defaultPath: '/ops', icon: 'qr_code_scanner' },
  { key: 'admin', label: '管理层', description: '机构、赛事、账号、权限和规则。', pathKey: 'lastAdminPath', defaultPath: '/admin', icon: 'admin_panel_settings' },
]

function toId(value) {
  return value == null || value === '' ? '' : String(value)
}

function normalizeSurface(surface) {
  return VALID_SURFACES.has(surface) ? surface : 'app'
}

function normalizeScopeType(scopeType, raceId) {
  if (VALID_SCOPE_TYPES.has(scopeType)) return scopeType
  return raceId ? 'race' : 'org'
}

export function createWorkspaceSession(input = {}) {
  const raceId = toId(input.raceId)
  const scopeType = normalizeScopeType(input.scopeType, raceId)
  return {
    orgId: scopeType === 'platform' ? '' : toId(input.orgId),
    orgName: scopeType === 'platform' ? (input.orgName || '系统平台') : (input.orgName || ''),
    raceId,
    raceName: input.raceName || '',
    scopeType,
    surface: normalizeSurface(input.surface || (scopeType === 'platform' ? 'admin' : 'app')),
    lastAppPath: input.lastAppPath || DEFAULT_PATHS.app,
    lastOpsPath: input.lastOpsPath || DEFAULT_PATHS.ops,
    lastAdminPath: input.lastAdminPath || DEFAULT_PATHS.admin,
  }
}

export function resolveWorkspaceFromLegacyContext({ queryOrgId, queryRaceId, user } = {}) {
  return createWorkspaceSession({
    orgId: queryOrgId || user?.preferences?.lastOrgId || user?.orgId || '',
    raceId: queryRaceId || user?.preferences?.lastRaceId || '',
  })
}

export function serializeWorkspaceSession(session) {
  return JSON.stringify(createWorkspaceSession(session))
}

export function parseWorkspaceSession(value) {
  if (!value) return null

  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    const session = parsed?.state?.session || parsed?.session || parsed
    if (!session?.orgId && session?.scopeType !== 'platform') return null
    return createWorkspaceSession(session)
  } catch {
    return null
  }
}

export function resolveSurfaceWorkspaceSession({ user, session, surface } = {}) {
  if (session) return session
  if (user?.role !== 'super_admin' || user?.authzProfile?.scopeType !== 'platform') return null
  return createWorkspaceSession({ scopeType: 'platform', surface })
}

export function getWorkspacePathKey(surface) {
  if (surface === 'ops') return 'lastOpsPath'
  if (surface === 'admin') return 'lastAdminPath'
  return 'lastAppPath'
}

function canAccessSurface(user, surface) {
  const access = user?.surfaceAccess
  if (Array.isArray(access)) return access.includes(surface)
  if (access && typeof access === 'object') return Boolean(access[surface])
  return false
}

function profileSurfaces(profile) {
  return Array.isArray(profile?.surfaces) ? profile.surfaces : []
}

export function canCommitWorkspaceProfile(profile, scope = {}) {
  if (!profile || !scope) return false
  const expectedScopeType = normalizeScopeType(scope.scopeType, scope.raceId)

  if (expectedScopeType === 'platform') {
    return profile.scopeType === 'platform'
  }

  if (toId(profile.orgId) !== toId(scope.orgId)) return false

  if (expectedScopeType === 'race') {
    return profile.scopeType === 'race' && toId(profile.raceId) === toId(scope.raceId)
  }

  return profile.scopeType === 'org' && !toId(profile.raceId)
}

export function getWorkspaceProfileRefreshParams(scope = {}) {
  if (!scope) return null
  const scopeType = normalizeScopeType(scope.scopeType, scope.raceId)

  if (scopeType === 'platform') {
    return { scopeType: 'platform' }
  }

  const orgId = toId(scope.orgId)
  if (!orgId) return null

  if (scopeType === 'race') {
    const raceId = toId(scope.raceId)
    if (!raceId) return null
    return { orgId, raceId }
  }

  return { orgId, raceId: '' }
}

export function getWorkspaceProfileKey(scope = {}) {
  const params = getWorkspaceProfileRefreshParams(scope)
  if (!params) return ''
  if (params.scopeType === 'platform') return 'platform'
  return [params.orgId, params.raceId || ''].join(':')
}

export function canAccessWorkspaceSurface({ user, session, surface } = {}) {
  if (!VALID_SURFACES.has(surface)) return false
  const profile = user?.authzProfile
  if (!session || !canCommitWorkspaceProfile(profile, session)) return false
  return profileSurfaces(profile).includes(surface)
}

export function getAvailableWorkspaceSurfaces(user, session = null) {
  if (session) {
    return WORKSPACE_SURFACES.filter((surface) => canAccessWorkspaceSurface({ user, session, surface: surface.key }))
  }
  return WORKSPACE_SURFACES.filter((surface) => canAccessSurface(user, surface.key))
}

export function resolveWorkspaceSwitchRedirect({ currentPath = '', user } = {}) {
  const safeCurrentPath = typeof currentPath === 'string' && currentPath.startsWith('/') && !currentPath.startsWith('/login')
    ? currentPath
    : '/launcher'
  const surfaces = getAvailableWorkspaceSurfaces(user)

  return surfaces.length > 1 ? '/launcher' : safeCurrentPath
}

function normalizeOptionId(value) {
  return value == null || value === '' ? '' : String(value)
}

export function normalizeWorkspaceOptions(payload = {}) {
  const races = Array.isArray(payload.races) ? payload.races : []
  const racesByOrgId = new Map()
  const isSuperAdmin = payload.role === 'super_admin'

  for (const race of races) {
    const orgId = normalizeOptionId(race.orgId || race.org_id)
    if (!orgId) continue
    const normalizedRace = {
      id: normalizeOptionId(race.id || race.raceId),
      name: race.name || race.raceName || '未命名赛事',
      orgId,
      scopeType: 'race',
      accessLevel: race.accessLevel || '',
      sourceType: race.sourceType || race.source || '',
    }
    if (!normalizedRace.id) continue
    const orgRaces = racesByOrgId.get(orgId) || []
    orgRaces.push(normalizedRace)
    racesByOrgId.set(orgId, orgRaces)
  }

  const organizations = (Array.isArray(payload.organizations) ? payload.organizations : [])
    .map((org) => {
      const id = normalizeOptionId(org.id || org.orgId)
      const racesForOrg = racesByOrgId.get(id) || []
      return {
        id,
        name: org.name || org.orgName || '未命名机构',
        slug: org.slug || '',
        races: racesForOrg,
        scopes: [
          {
            id: ORG_OPERATION_SCOPE_VALUE,
            name: '机构运营',
            orgId: id,
            raceId: '',
            raceName: '',
            scopeType: 'org',
          },
          ...racesForOrg.map((race) => ({
            ...race,
            raceId: race.id,
            raceName: race.name,
            scopeType: 'race',
          })),
        ],
      }
    })
    .filter((org) => org.id)
  const allOrganizations = isSuperAdmin
    ? [
        {
          id: PLATFORM_WORKSPACE_ID,
          name: '系统平台',
          slug: 'platform',
          races: [],
          scopes: [
            {
              id: PLATFORM_SCOPE_VALUE,
              name: '平台控制台',
              orgId: '',
              raceId: '',
              raceName: '',
              scopeType: 'platform',
            },
          ],
        },
        ...organizations,
      ]
    : organizations
  const currentScopeType = payload.current?.scopeType || (payload.current?.raceId ? 'race' : (isSuperAdmin && !payload.current?.orgId ? 'platform' : 'org'))

  return {
    role: payload.role || '',
    canSwitchOrg: Boolean(payload.canSwitchOrg),
    canSwitchRace: Boolean(payload.canSwitchRace),
    current: {
      orgId: currentScopeType === 'platform' ? PLATFORM_WORKSPACE_ID : normalizeOptionId(payload.current?.orgId),
      raceId: normalizeOptionId(payload.current?.raceId),
      scopeType: currentScopeType,
    },
    organizations: allOrganizations,
  }
}
