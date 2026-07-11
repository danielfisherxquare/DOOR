import { buildAuthzProfileFromRows, loadAuthzRows } from '../../authz/profile.service.js'
import { getUserAllModules } from '../../authz/module-grants.js'
import {
  listEffectiveRacePermissionsForUser,
  listVisibleRacesForOrg,
} from '../races/race-access.service.js'
import { profileMediaStore as defaultMedia } from './profile.media.js'
import * as profileRepository from './profile.repository.js'

function serviceError(status, code, message) {
  const error = new Error(message)
  error.status = status
  error.code = code
  error.expose = true
  return error
}

function normalizeId(value) {
  if (value === undefined || value === null || value === '') return null
  const normalized = String(value).trim()
  return normalized || null
}

function normalizeRaceId(value) {
  if (value === undefined || value === null || value === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return String(parsed)
}

function resolveSourceType(source) {
  if (source === 'user_assignment') return 'explicit'
  if (source === 'super_admin') return 'platform'
  return 'inherited'
}

function pickFirstValid(candidates, validSet) {
  for (const candidate of candidates) {
    const normalized = normalizeId(candidate)
    if (normalized && validSet.has(normalized)) return normalized
  }
  return null
}

export function createProfileService({
  repository = profileRepository,
  media = defaultMedia,
  authz = { buildProfile: buildAuthzProfileFromRows, loadRows: loadAuthzRows },
  modules = { getUserAllModules },
  raceAccess = { listEffectiveRacePermissionsForUser, listVisibleRacesForOrg },
} = {}) {
  async function filterRaceOptionsByAuthzProfile(account, races, rows) {
    const visible = []
    for (const race of races) {
      try {
        await authz.buildProfile({
          authContext: {
            userId: account.id,
            role: account.role,
            orgId: account.org_id || null,
          },
          requestedOrgId: race.orgId,
          requestedRaceId: race.id,
          rows,
        })
        visible.push(race)
      } catch (error) {
        if (error?.status !== 403) throw error
      }
    }
    return visible
  }

  return {
    async getMe({ userId }) {
      const user = await repository.findFullUser(userId)
      if (!user) throw serviceError(404, 'PROFILE_USER_NOT_FOUND', '用户不存在')
      const [organization, moduleAccess, races] = await Promise.all([
        user.org_id ? repository.findOrganization(user.org_id) : null,
        modules.getUserAllModules(userId, user.role),
        repository.listUserRaces(userId),
      ])
      return { ...user, organization, moduleAccess, races }
    },

    async getContextOptions({ userId, requestedOrgId, requestedRaceId }) {
      const account = await repository.findContextAccount(userId)
      if (!account) throw serviceError(404, 'PROFILE_USER_NOT_FOUND', '用户不存在')

      const preferredOrgId = normalizeId(account.preferences?.lastOrgId)
      const preferredRaceId = normalizeRaceId(account.preferences?.lastRaceId)
      const authzRows = await authz.loadRows()
      let organizations = []
      let races = []
      let selectedOrgId = null
      let canSwitchOrg = false

      if (account.role === 'super_admin') {
        canSwitchOrg = true
        organizations = (await repository.listOrganizations()).map((row) => ({
          id: String(row.id),
          name: row.name,
          slug: row.slug,
        }))
        selectedOrgId = pickFirstValid(
          [requestedOrgId, preferredOrgId],
          new Set(organizations.map((org) => org.id)),
        )
        if (selectedOrgId) {
          races = (await raceAccess.listVisibleRacesForOrg(selectedOrgId)).map((race) => ({
            id: String(race.id),
            raceId: String(race.id),
            name: race.name,
            raceName: race.name,
            orgId: selectedOrgId,
            ownerOrgId: String(race.orgId),
            accessLevel: 'editor',
            source: 'super_admin',
            sourceType: 'platform',
            inheritedAccessLevel: 'editor',
            explicitAccessLevel: null,
          }))
          races = await filterRaceOptionsByAuthzProfile(account, races, authzRows)
        }
      } else {
        selectedOrgId = normalizeId(account.org_id)
        if (selectedOrgId) {
          const organization = await repository.findOrganization(selectedOrgId)
          if (organization) {
            organizations = [{
              id: String(organization.id),
              name: organization.name,
              slug: organization.slug,
            }]
          }
        }

        if (account.role === 'org_admin') {
          races = (await raceAccess.listVisibleRacesForOrg(selectedOrgId)).map((race) => ({
            id: String(race.id),
            raceId: String(race.id),
            name: race.name,
            raceName: race.name,
            orgId: selectedOrgId,
            ownerOrgId: String(race.orgId),
            accessLevel: race.orgAccessLevel || 'viewer',
            source: race.source,
            sourceType: 'inherited',
            inheritedAccessLevel: race.orgAccessLevel || 'viewer',
            explicitAccessLevel: null,
          }))
          races = await filterRaceOptionsByAuthzProfile(account, races, authzRows)
        } else {
          const effectiveRaces = await raceAccess.listEffectiveRacePermissionsForUser({
            userId: account.id,
            role: account.role,
            orgId: account.org_id || null,
          })
          const raceIds = effectiveRaces
            .map((item) => Number(item.raceId))
            .filter((id) => Number.isFinite(id))
          const raceRows = await repository.findRacesByIds(raceIds)
          const raceMap = new Map(raceRows.map((row) => [Number(row.id), row]))
          races = effectiveRaces.map((permission) => {
            const race = raceMap.get(Number(permission.raceId))
            return {
              id: String(permission.raceId),
              raceId: String(permission.raceId),
              name: race?.name || null,
              raceName: race?.name || null,
              orgId: selectedOrgId,
              ownerOrgId: race?.org_id ? String(race.org_id) : selectedOrgId,
              accessLevel: permission.accessLevel,
              source: permission.source,
              sourceType: resolveSourceType(permission.source),
              inheritedAccessLevel: permission.inheritedAccessLevel || null,
              explicitAccessLevel: permission.explicitAccessLevel || null,
            }
          })
          races = await filterRaceOptionsByAuthzProfile(account, races, authzRows)
        }
      }

      const selectedRaceId = pickFirstValid(
        [requestedRaceId, preferredRaceId],
        new Set(races.map((race) => String(race.id))),
      )
      return {
        role: account.role,
        canSwitchOrg,
        canSwitchRace: races.length > 0,
        locks: { orgId: canSwitchOrg ? null : selectedOrgId, raceId: null },
        current: {
          orgId: selectedOrgId,
          raceId: selectedRaceId,
          scopeType:
            account.role === 'super_admin' && !selectedOrgId
              ? 'platform'
              : selectedRaceId
                ? 'race'
                : 'org',
        },
        organizations,
        races,
      }
    },

    async updateMe({ userId, data }) {
      await repository.updateUser(userId, data)
      return { updated: true }
    },

    async uploadAvatar({ userId, buffer }) {
      const avatarUrl = await media.saveAvatar(userId, buffer)
      await repository.updateUser(userId, { avatarUrl })
      return { avatarUrl }
    },

    async uploadCredentialPhoto({ userId, buffer }) {
      const photoUrl = await media.saveCredentialPhoto(userId, buffer)
      await repository.updateUser(userId, { credentialPhotoUrl: photoUrl })
      return { photoUrl }
    },

    async getUser({ authContext, userId }) {
      const user = await repository.findPublicUser(userId)
      if (!user) throw serviceError(404, 'PROFILE_USER_NOT_FOUND', '用户不存在')
      if (authContext.role !== 'super_admin' && user.org_id !== authContext.orgId) {
        throw serviceError(403, 'PROFILE_USER_FORBIDDEN', '无权查看该用户信息')
      }
      const organization = user.org_id ? await repository.findOrganization(user.org_id) : null
      return { ...user, organization }
    },
  }
}

export const profileService = createProfileService()
