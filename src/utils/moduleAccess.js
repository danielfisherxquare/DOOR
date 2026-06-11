export const DEFAULT_MODULES = ['app:home', 'app:profile']

export function hasModuleAccess(user, surface, moduleId) {
  if (!user) return false

  const fullModuleId = `${surface}:${moduleId}`
  const profileModules = user.authzProfile?.modules
  const moduleAccess = Array.isArray(profileModules)
    ? profileModules
    : (Array.isArray(user.moduleAccess) ? user.moduleAccess : [])
  return moduleAccess.includes(fullModuleId)
}
