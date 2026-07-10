import {
  authorization as defaultAuthorization,
  createAuthorization,
} from '../authz/authorization.js'
import { createAuthorize } from './authorize.js'

export function createRequireAuthz({ authz = null, authorization = null } = {}) {
  const authorizationAdapter =
    authorization ||
    (authz
      ? createAuthorization({ resolveRelationService: async () => authz })
      : defaultAuthorization)
  const authorize = createAuthorize({ authorization: authorizationAdapter })

  return function requireAuthz({ surface, moduleId, scope = 'org' } = {}) {
    const checks = [
      {
        action: 'enter',
        resource: { kind: 'surface', surface },
      },
    ]

    if (moduleId) {
      checks.push({
        action: 'open',
        resource: { kind: 'module', surface, moduleId },
      })
    }

    return authorize({ scope, checks })
  }
}

export const requireAuthz = createRequireAuthz()
