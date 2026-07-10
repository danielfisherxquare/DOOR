import knex from '../db/knex.js'
import {
  getRoleDefaultModules,
  hasAllModuleAccess,
  hasCapability,
  hasSurfaceAccess,
} from '../utils/capability-policy.js'
import { authz as defaultAuthz, createAuthzService } from './authz.service.js'
import { moduleObjectId, surfaceObjectId } from './object-ids.js'
import { loadAuthzRows } from './profile.service.js'
import { projectAuthzTuples } from './tuple-projector.js'

function authorizationError(status, code, message, details) {
  const error = new Error(message)
  error.status = status
  error.code = code
  error.expose = true
  if (details !== undefined) error.details = details
  return error
}

async function resolveDefaultRelationService() {
  if (defaultAuthz.provider !== 'local') return defaultAuthz

  const rows = await loadAuthzRows()
  return createAuthzService({
    provider: 'local',
    tuples: projectAuthzTuples(rows),
  })
}

async function checkUserModuleAccess(userId, moduleId) {
  const access = await knex('user_module_access')
    .where('user_id', userId)
    .where('module_id', moduleId)
    .where(function validAccess() {
      this.whereNull('expires_at').orWhere('expires_at', '>', knex.fn.now())
    })
    .first()

  return Boolean(access)
}

function assertAction(actual, expected, resourceKind) {
  if (actual !== expected) {
    throw authorizationError(
      400,
      'AUTHORIZATION_ACTION_INVALID',
      `资源 ${resourceKind} 不支持授权动作 ${actual}`,
    )
  }
}

function relationScope(workspace = {}) {
  const scopeType = workspace.scopeType === 'race' ? 'race' : 'org'
  if (scopeType === 'race') {
    if (!workspace.raceId) {
      throw authorizationError(400, 'WORKSPACE_CONTEXT_REQUIRED', '缺少赛事上下文')
    }
    return { raceId: workspace.raceId }
  }
  if (!workspace.orgId) {
    throw authorizationError(400, 'WORKSPACE_CONTEXT_REQUIRED', '缺少机构上下文')
  }
  return { orgId: workspace.orgId }
}

function relationRequest(action, resource, workspace) {
  const scope = relationScope(workspace)

  if (resource.kind === 'surface') {
    assertAction(action, 'enter', resource.kind)
    return {
      relation: 'can_enter',
      object: surfaceObjectId({ ...scope, surface: resource.surface }),
    }
  }

  assertAction(action, 'open', resource.kind)
  return {
    relation: 'can_open',
    object: moduleObjectId({
      ...scope,
      surface: resource.surface,
      moduleId: resource.moduleId,
    }),
  }
}

function assertAuthenticated(authContext) {
  if (!authContext?.role || !authContext?.userId) {
    throw authorizationError(401, 'AUTHENTICATION_REQUIRED', '未授权或上下文丢失')
  }
}

async function assertLegacyModule(authContext, resource, checkExplicitModuleAccess) {
  const { role, userId } = authContext
  const strictSurfaceModules = Boolean(resource.strictSurfaceModules)
  if (hasAllModuleAccess(role, { strictSurfaceModules })) return

  const fullModuleId = `${resource.surface}:${resource.moduleId}`
  const roleDefaultModules = getRoleDefaultModules(role)
  if (roleDefaultModules === 'all' || roleDefaultModules.includes(fullModuleId)) return

  if (await checkExplicitModuleAccess(userId, fullModuleId)) return

  throw authorizationError(403, 'MODULE_DENIED', '无权访问该模块')
}

export function createAuthorization({
  resolveRelationService = resolveDefaultRelationService,
  checkUserModuleAccess: checkExplicitModuleAccess = checkUserModuleAccess,
} = {}) {
  async function assertAll(authContext, decisions = []) {
    let relationServicePromise = null
    const getRelationService = () => {
      relationServicePromise ||= Promise.resolve(resolveRelationService())
      return relationServicePromise
    }

    for (const decision of decisions) {
      const { action, resource = {}, workspace = {} } = decision

      if (resource.kind === 'session') {
        assertAction(action, 'authenticate', resource.kind)
        assertAuthenticated(authContext)
        continue
      }

      assertAuthenticated(authContext)

      if (resource.kind === 'role') {
        assertAction(action, 'assume', resource.kind)
        if (!resource.roles?.includes(authContext.role)) {
          throw authorizationError(
            403,
            'ROLE_DENIED',
            `权限不足，需要以下角色之一: ${(resource.roles || []).join(', ')}`,
          )
        }
        continue
      }

      if (resource.kind === 'capability') {
        assertAction(action, 'use', resource.kind)
        if (!hasCapability(authContext.role, resource.scope, resource.name)) {
          throw authorizationError(
            403,
            'CAPABILITY_DENIED',
            `当前角色缺少 ${resource.scope}:${resource.name} 权限`,
          )
        }
        continue
      }

      if (resource.kind === 'surface' && resource.policy === 'legacy-role') {
        assertAction(action, 'enter', resource.kind)
        if (!hasSurfaceAccess(authContext.role, resource.surface)) {
          throw authorizationError(
            403,
            'SURFACE_DENIED',
            `当前角色无权访问 ${resource.surface} 入口`,
          )
        }
        continue
      }

      if (resource.kind === 'module' && resource.policy === 'legacy-role-or-grant') {
        assertAction(action, 'open', resource.kind)
        await assertLegacyModule(authContext, resource, checkExplicitModuleAccess)
        continue
      }

      if (resource.kind === 'surface' || resource.kind === 'module') {
        const relationService = await getRelationService()
        await relationService.assert(authContext, relationRequest(action, resource, workspace))
        continue
      }

      throw authorizationError(
        400,
        'AUTHORIZATION_RESOURCE_INVALID',
        `不支持的授权资源: ${resource.kind || 'unknown'}`,
      )
    }

    return true
  }

  return {
    assertAll,
    async assert(authContext, action, resource, workspace = {}) {
      return assertAll(authContext, [{ action, resource, workspace }])
    },
  }
}

export const authorization = createAuthorization()
