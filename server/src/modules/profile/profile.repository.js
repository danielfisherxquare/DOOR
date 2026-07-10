import knex from '../../db/knex.js'

export async function findFullUser(userId, database = knex) {
  return database('users')
    .select(
      'id',
      'username',
      'email',
      'role',
      'status',
      'org_id',
      'job_title',
      'department',
      'avatar_url',
      'avatar_for_credential',
      'phone',
      'bio',
      'skills',
      'user_preferences',
      'email_verified',
      'must_change_password',
      'created_at',
    )
    .where('id', userId)
    .first()
}

export async function findContextAccount(userId, database = knex) {
  return database('users').select('id', 'role', 'org_id', 'preferences').where('id', userId).first()
}

export async function findOrganization(orgId, database = knex) {
  return database('organizations').select('id', 'name', 'slug').where('id', orgId).first()
}

export async function listOrganizations(database = knex) {
  return database('organizations').select('id', 'name', 'slug').orderBy('name', 'asc')
}

export async function listUserRaces(userId, database = knex) {
  return database('user_race_permissions')
    .join('races', 'user_race_permissions.race_id', 'races.id')
    .select('races.id', 'races.name', 'user_race_permissions.access_level')
    .where('user_race_permissions.user_id', userId)
}

export async function findRacesByIds(raceIds, database = knex) {
  if (raceIds.length === 0) return []
  return database('races').whereIn('id', raceIds).select('id', 'name', 'org_id')
}

export async function findPublicUser(userId, database = knex) {
  return database('users')
    .select(
      'id',
      'username',
      'role',
      'job_title',
      'department',
      'avatar_url',
      'phone',
      'bio',
      'skills',
      'org_id',
    )
    .where('id', userId)
    .first()
}

export async function updateUser(userId, data, database = knex) {
  const updates = {}
  if (data.phone !== undefined) updates.phone = data.phone
  if (data.bio !== undefined) updates.bio = data.bio
  if (data.skills !== undefined) updates.skills = data.skills
  if (data.preferences !== undefined) updates.user_preferences = data.preferences
  if (data.avatarUrl !== undefined) updates.avatar_url = data.avatarUrl
  if (data.credentialPhotoUrl !== undefined) updates.avatar_for_credential = data.credentialPhotoUrl
  updates.updated_at = database.fn.now()
  return database('users').where('id', userId).update(updates)
}
