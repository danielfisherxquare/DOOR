import { authorization as defaultAuthorization } from '../authz/authorization.js'

function firstValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return String(value)
  }
  return null
}

function resolveWorkspace(req, scopeType) {
  return {
    scopeType,
    orgId: firstValue(req.query?.orgId, req.body?.orgId, req.params?.orgId, req.authContext?.orgId),
    raceId: firstValue(req.query?.raceId, req.body?.raceId, req.params?.raceId),
  }
}

function resolveValue(value, req) {
  return typeof value === 'function' ? value(req) : value
}

export function createAuthorize({ authorization = defaultAuthorization } = {}) {
  return function authorize({ action, resource, scope = 'org', checks } = {}) {
    return async function authorizationMiddleware(req, _res, next) {
      try {
        const checkDefinitions = resolveValue(checks, req) || [{ action, resource, scope }]
        const decisions = checkDefinitions.map((check) => ({
          action: check.action,
          resource: resolveValue(check.resource, req),
          workspace: resolveWorkspace(req, check.scope || scope),
        }))

        await authorization.assertAll(req.authContext, decisions)
        next()
      } catch (error) {
        next(error)
      }
    }
  }
}

export const authorize = createAuthorize()
