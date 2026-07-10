import { hasCapability } from '../utils/capability-policy.js'
import { authz as defaultAuthz, createAuthzService } from './authz.service.js'
import {
  moduleObjectId,
  organizationObjectId,
  platformObjectId,
  raceObjectId,
  surfaceObjectId,
} from './object-ids.js'
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
  if (workspace.scopeType === 'platform') {
    return { platformId: workspace.platformId || 'root' }
  }
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

function domainRelationRequest(action, resourceKind, workspace) {
  const relations = {
    platform: { manage: 'can_manage' },
    organization: { view: 'can_view', manage: 'can_manage' },
    race: { view: 'can_view', operate: 'can_operate', manage: 'can_manage' },
  }
  const relation = relations[resourceKind]?.[action]
  if (!relation) {
    throw authorizationError(
      400,
      'AUTHORIZATION_ACTION_INVALID',
      `资源 ${resourceKind} 不支持授权动作 ${action}`,
    )
  }

  if (resourceKind === 'platform') {
    return { relation, object: platformObjectId(workspace.platformId || 'root') }
  }
  if (resourceKind === 'organization') {
    if (!workspace.orgId) {
      throw authorizationError(400, 'WORKSPACE_CONTEXT_REQUIRED', '缺少机构上下文')
    }
    return { relation, object: organizationObjectId(workspace.orgId) }
  }
  if (!workspace.raceId) {
    throw authorizationError(400, 'WORKSPACE_CONTEXT_REQUIRED', '缺少赛事上下文')
  }
  return { relation, object: raceObjectId(workspace.raceId) }
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

export function createAuthorization({
  resolveRelationService = resolveDefaultRelationService,
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

      if (resource.kind === 'surface' || resource.kind === 'module') {
        const relationService = await getRelationService()
        await relationService.assert(authContext, relationRequest(action, resource, workspace))
        continue
      }

      if (resource.kind === 'platform' || resource.kind === 'organization' || resource.kind === 'race') {
        const relationService = await getRelationService()
        await relationService.assert(
          authContext,
          domainRelationRequest(action, resource.kind, workspace),
        )
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
