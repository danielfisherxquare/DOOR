import knex from '../../db/knex.js'
import * as jobRepository from '../jobs/job.repository.js'
import { importSessionRepository as defaultRepository } from './import-session.repository.js'

function serviceError(status, code, message) {
  const error = new Error(message)
  error.status = status
  error.code = code
  error.expose = true
  return error
}

export function createImportSessionService({
  repository = defaultRepository,
  jobs = jobRepository,
  database = knex,
} = {}) {
  async function requireSession(orgId, sessionId) {
    const session = await repository.findById(orgId, sessionId)
    if (!session) throw serviceError(404, 'IMPORT_SESSION_NOT_FOUND', 'Session not found')
    return session
  }

  return {
    async resolveOrgId({ authContext, input = {}, sessionId }) {
      if (authContext?.orgId) return authContext.orgId
      if (authContext?.role !== 'super_admin') {
        throw serviceError(
          400,
          'IMPORT_ORG_CONTEXT_REQUIRED',
          '当前账号未绑定机构，无法操作导入会话',
        )
      }

      if (input.orgId) {
        const organization = await repository.findOrganization(input.orgId)
        if (!organization) throw serviceError(404, 'IMPORT_ORG_NOT_FOUND', '目标机构不存在')
        return organization.id
      }

      if (sessionId) {
        const session = await repository.findSessionScope(sessionId)
        if (!session) throw serviceError(404, 'IMPORT_SESSION_NOT_FOUND', 'Session not found')
        return session.orgId
      }

      if (!input.raceId) {
        throw serviceError(
          400,
          'IMPORT_RACE_CONTEXT_REQUIRED',
          'super_admin 创建导入会话时必须提供 raceId 或 orgId',
        )
      }
      const race = await repository.findRaceScope(input.raceId)
      if (!race) throw serviceError(404, 'IMPORT_RACE_NOT_FOUND', '目标赛事不存在')
      return race.orgId
    },

    createSession({ orgId }) {
      return repository.create(orgId)
    },

    getSession({ orgId, sessionId }) {
      return requireSession(orgId, sessionId)
    },

    setSummary({ orgId, sessionId, summary }) {
      return database.transaction(async (trx) => {
        await repository.lockOpenSession(orgId, sessionId, trx)
        const session = await repository.setSummary(orgId, sessionId, summary, trx)
        if (!session) {
          throw serviceError(409, 'IMPORT_SESSION_NOT_OPEN', 'Cannot modify a non-open session')
        }
        return session
      })
    },

    appendChunk({ orgId, sessionId, rows }) {
      return database.transaction((trx) => repository.appendChunk(orgId, sessionId, rows, trx))
    },

    getChunk({ orgId, sessionId, offset, limit }) {
      return repository.getChunk(orgId, sessionId, offset, limit)
    },

    async cancelSession({ orgId, sessionId }) {
      const deleted = await repository.cancel(orgId, sessionId)
      if (!deleted) {
        throw serviceError(404, 'IMPORT_SESSION_NOT_FOUND', 'Session not found or already deleted')
      }
      return null
    },

    async enqueueCommit({ orgId, sessionId, raceId, category, createdBy }) {
      const session = await requireSession(orgId, sessionId)
      if (session.status !== 'open') {
        throw serviceError(409, 'IMPORT_SESSION_NOT_OPEN', 'Session invalid or already committed')
      }
      const job = await jobs.enqueue(
        orgId,
        'commit-import-session',
        { sessionId, raceId, category },
        `${orgId}:import:${sessionId}`,
        createdBy,
        raceId,
      )
      return { jobId: job.id }
    },
  }
}

export const importSessionService = createImportSessionService()
