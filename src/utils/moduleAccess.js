export const DEFAULT_MODULES = ['app:home', 'app:profile']

export function usesStrictSurfaceModules(user, options = {}) {
  if (options.strictSurfaceModules !== undefined) {
    return Boolean(options.strictSurfaceModules)
  }
  return Boolean(user?.preferences?.strictSurfaceModules)
}

export function hasModuleAccess(user, surface, moduleId, options = {}) {
  if (!user) return false

  if (user.role === 'super_admin') {
    return true
  }

  if (user.role === 'org_admin' && !usesStrictSurfaceModules(user, options)) {
    return true
  }

  const fullModuleId = `${surface}:${moduleId}`
  if (DEFAULT_MODULES.includes(fullModuleId)) {
    return true
  }

  const moduleAccess = user.moduleAccess || []
  return moduleAccess.includes(fullModuleId)
}
