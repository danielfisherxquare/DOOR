import { validationError } from '../../lib/http/validation.js'
import * as defaultRepository from './calendar.repository.js'

function scopeError(message, status, code) {
  const error = validationError(message, undefined, code)
  error.status = status
  return error
}

function resolveOrgId(authContext = {}, query = {}) {
  const requestedOrgId = query.orgId ? String(query.orgId).trim() : null
  const authOrgId = authContext.orgId ? String(authContext.orgId).trim() : null
  if (authContext.role === 'super_admin') return requestedOrgId
  if (!authOrgId) {
    throw scopeError('当前账号未关联机构', 400, 'CALENDAR_ORG_REQUIRED')
  }
  if (requestedOrgId && requestedOrgId !== authOrgId) {
    throw scopeError('无权查看其他机构日历', 403, 'CALENDAR_SCOPE_FORBIDDEN')
  }
  return authOrgId
}

export function createCalendarService({ repository = defaultRepository } = {}) {
  return {
    async getEvents(authContext, query = {}) {
      const orgId = resolveOrgId(authContext, query)
      const [races, milestones] = await Promise.all([
        repository.getRaces(orgId),
        repository.getMilestones(orgId),
      ])
      return [
        ...races.filter((race) => race.date).map((race) => ({ ...race, type: 'race' })),
        ...milestones
          .filter((milestone) => milestone.date)
          .map((milestone) => ({ ...milestone, type: 'milestone' })),
      ]
    },
  }
}

export const calendarService = createCalendarService()
