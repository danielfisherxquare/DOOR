import knex from '../../db/knex.js'
import { resolveRaceAccess } from '../races/race-access.service.js'
import * as recordRepository from './record.repository.js'

function serviceError(status, code, message) {
  const error = new Error(message)
  error.status = status
  error.code = code
  error.expose = true
  return error
}

function authenticatedOrgId(authContext) {
  return authContext?.role === 'super_admin' ? null : authContext?.orgId || null
}

export function createRecordService({
  repository = recordRepository,
  resolveAccess = resolveRaceAccess,
  database = knex,
} = {}) {
  async function resolveScopedOrgId(authContext, raceId, method) {
    if (raceId !== undefined) {
      const access = await resolveAccess(authContext, raceId, method)
      return access.operatorOrgId
    }

    if (['race_admin', 'user'].includes(authContext?.role)) {
      throw serviceError(400, 'RACE_CONTEXT_REQUIRED', '当前角色必须指定 raceId')
    }

    return authContext?.orgId || null
  }

  return {
    async queryRecords({ authContext, method, input }) {
      const orgId = await resolveScopedOrgId(authContext, input.raceId, method)
      return repository.query(orgId, input.raceId, {
        keyword: input.keyword,
        filters: input.filters,
        offset: input.offset,
        limit: input.limit,
        sort: input.sort,
      })
    },

    async analyzeRecords({ authContext, method, input }) {
      const orgId = await resolveScopedOrgId(authContext, input.raceId, method)
      return repository.analysis(orgId, input.raceId, {
        keyword: input.keyword,
        filters: input.filters,
      })
    },

    async listUniqueValues({ authContext, method, input }) {
      const orgId = await resolveScopedOrgId(authContext, input.raceId, method)
      return repository.uniqueValues(orgId, input.raceId, input.field, input.limit)
    },

    quickStats({ orgId, raceId, winnerStatuses }) {
      return repository.quickStats(orgId, raceId, winnerStatuses)
    },

    async resolveRaceIdForRecord(authContext, recordId) {
      const record = await repository.findRecordScope(authenticatedOrgId(authContext), recordId)
      if (!record) {
        throw serviceError(404, 'RECORD_NOT_FOUND', '记录不存在')
      }
      return record.raceId
    },

    async resolveRaceIdForBulk(authContext, input) {
      const recordIds = [...new Set(input.updates.map((item) => item.id))]
      const records = await repository.findRecordScopes(authenticatedOrgId(authContext), recordIds)
      if (records.length === 0) {
        throw serviceError(404, 'RECORDS_NOT_FOUND', '记录不存在或不可访问')
      }

      const raceIds = new Set(records.map((record) => Number(record.raceId)))
      if (raceIds.size !== 1) {
        throw serviceError(400, 'RECORD_BULK_CROSS_RACE', '批量修改仅支持同一赛事的数据')
      }
      return [...raceIds][0]
    },

    updateRecord({ orgId, recordId, data }) {
      return repository.updateById(orgId, recordId, data)
    },

    bulkUpdateRecords({ orgId, updates }) {
      return database.transaction((trx) => repository.bulkUpdate(orgId, updates, trx))
    },

    deleteRaceRecords({ orgId, raceId }) {
      return database.transaction((trx) => repository.deleteByRaceId(orgId, raceId, trx))
    },

    streamRaceRecords({ orgId, raceId }) {
      return repository.streamByRaceId(orgId, raceId)
    },

    importVerificationResults({ orgId, raceId, results }) {
      return database.transaction((trx) =>
        repository.importVerificationResults(orgId, raceId, results, trx),
      )
    },
  }
}

export const recordService = createRecordService()
