import knex from '../db/knex.js'
import { getRoleDefaultModules, hasAllModuleAccess } from '../utils/capability-policy.js'

function activeGrants(query) {
  return query.where(function validGrant() {
    this.whereNull('expires_at').orWhere('expires_at', '>', knex.fn.now())
  })
}

export async function hasExplicitModuleGrant(userId, moduleId) {
  const access = await activeGrants(
    knex('user_module_access')
      .where('user_id', userId)
      .where('module_id', moduleId),
  ).first()

  return Boolean(access)
}

export async function batchCheckModuleAccess(userId, role, modules, surface, options = {}) {
  const fullModuleIds = modules.map((moduleId) => `${surface}:${moduleId}`)

  if (hasAllModuleAccess(role, options)) {
    return Object.fromEntries(fullModuleIds.map((moduleId) => [moduleId, true]))
  }

  const defaultModules = getRoleDefaultModules(role)
  if (defaultModules === 'all') {
    return Object.fromEntries(fullModuleIds.map((moduleId) => [moduleId, true]))
  }

  const toCheck = fullModuleIds.filter((moduleId) => !defaultModules.includes(moduleId))
  const result = Object.fromEntries(
    fullModuleIds
      .filter((moduleId) => defaultModules.includes(moduleId))
      .map((moduleId) => [moduleId, true]),
  )

  if (toCheck.length > 0) {
    const accesses = await activeGrants(
      knex('user_module_access')
        .where('user_id', userId)
        .whereIn('module_id', toCheck),
    )
    const granted = new Set(accesses.map((access) => access.module_id))
    for (const moduleId of toCheck) result[moduleId] = granted.has(moduleId)
  }

  return result
}

export async function getUserAllModules(userId, role, options = {}) {
  if (hasAllModuleAccess(role, options)) return null

  const defaultModules = getRoleDefaultModules(role)
  if (defaultModules === 'all') return null

  const accesses = await activeGrants(
    knex('user_module_access').where('user_id', userId),
  )

  return [...new Set([...defaultModules, ...accesses.map((access) => access.module_id)])]
}
