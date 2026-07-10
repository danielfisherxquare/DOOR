import knex from '../db/knex.js'
import { getRoleDefaultModules, hasAllModuleAccess } from '../utils/capability-policy.js'

function activeGrants(query) {
  return query.where(function validGrant() {
    this.whereNull('expires_at').orWhere('expires_at', '>', knex.fn.now())
  })
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
