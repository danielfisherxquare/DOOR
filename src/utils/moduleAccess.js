export const DEFAULT_MODULES = ['app:home', 'app:profile']

export function hasModuleAccess(user, surface, moduleId) {
  if (!user) return false

  if (['super_admin', 'org_admin'].includes(user.role)) {
    return true
  }

  const fullModuleId = `${surface}:${moduleId}`
  if (DEFAULT_MODULES.includes(fullModuleId)) {
    return true
  }

  const moduleAccess = user.moduleAccess || []
  return moduleAccess.includes(fullModuleId)
}
