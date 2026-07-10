/**
 * Compatibility wrapper for legacy role/capability permission declarations.
 * New route migrations should use authorize() with relation-backed resources.
 */
import { authorization as defaultAuthorization } from '../authz/authorization.js'
import { createAuthorize } from './authorize.js'

function usesStrictSurfaceModules(req) {
  return Boolean(req.authContext?.strictSurfaceModules)
}

export function createRequirePermission({ authorization = defaultAuthorization } = {}) {
  const authorize = createAuthorize({ authorization })

  return function requirePermission(options = {}) {
    return authorize({
      checks: (req) => {
        const checks = [{ action: 'authenticate', resource: { kind: 'session' } }]

        if (options.surface) {
          checks.push({
            action: 'enter',
            resource: {
              kind: 'surface',
              surface: options.surface,
              policy: 'legacy-role',
            },
          })
        }

        if (options.roles) {
          checks.push({
            action: 'assume',
            resource: { kind: 'role', roles: options.roles },
          })
        }

        if (options.module) {
          checks.push({
            action: 'open',
            resource: {
              kind: 'module',
              surface: options.module.surface,
              moduleId: options.module.moduleId,
              policy: 'legacy-role-or-grant',
              strictSurfaceModules: usesStrictSurfaceModules(req),
            },
          })
        }

        if (options.capability) {
          checks.push({
            action: 'use',
            resource: {
              kind: 'capability',
              scope: options.capability.scope,
              name: options.capability.name,
            },
          })
        }

        return checks
      },
    })
  }
}

export const requirePermission = createRequirePermission()
