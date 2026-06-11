const DEFAULT_PATHS = {
  app: '/app',
  ops: '/ops',
  admin: '/admin',
}

const VALID_SURFACES = new Set(['app', 'ops', 'admin'])

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

export function createWorkspaceSession(input = {}) {
  return {
    orgId: toId(input.orgId),
    orgName: input.orgName || '',
    raceId: toId(input.raceId),
    raceName: input.raceName || '',
    surface: normalizeSurface(input.surface),
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
    const parsed = JSON.parse(value)
    if (!parsed?.orgId || !parsed?.raceId) return null
    return createWorkspaceSession(parsed)
  } catch {
    return null
  }
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
  if (user?.role === 'super_admin' || user?.role === 'org_admin') return true
  return surface === 'app'
}

export function getAvailableWorkspaceSurfaces(user) {
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

  for (const race of races) {
    const orgId = normalizeOptionId(race.orgId || race.org_id)
    if (!orgId) continue
    const normalizedRace = {
      id: normalizeOptionId(race.id || race.raceId),
      name: race.name || race.raceName || '未命名赛事',
      orgId,
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
      return {
        id,
        name: org.name || org.orgName || '未命名机构',
        slug: org.slug || '',
        races: racesByOrgId.get(id) || [],
      }
    })
    .filter((org) => org.id)

  return {
    role: payload.role || '',
    canSwitchOrg: Boolean(payload.canSwitchOrg),
    canSwitchRace: Boolean(payload.canSwitchRace),
    current: {
      orgId: normalizeOptionId(payload.current?.orgId),
      raceId: normalizeOptionId(payload.current?.raceId),
    },
    organizations,
  }
}
