import knex from '../../db/knex.js'
import * as snapshotRepository from '../pipeline/snapshot.repository.js'
import * as rollbackRepository from '../lottery/lottery-rollback.repository.js'
import * as bibRepository from './bib.repository.js'

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

export function createBibService({
  repository = bibRepository,
  snapshots = snapshotRepository,
  rollbacks = rollbackRepository,
  database = knex,
} = {}) {
  async function ensureSnapshot(orgId, raceId, trx) {
    if (await snapshots.hasSnapshot(orgId, raceId, 'pre_bib', trx)) {
      return { reused: true }
    }
    const snapshot = await snapshots.createSnapshot(
      orgId,
      raceId,
      'pre_bib',
      { createdBy: 'bib:execution' },
      trx,
    )
    return { ...snapshot, reused: false }
  }

  return {
    async resolveTemplateRaceId(authContext, templateId) {
      const scope = await repository.findTemplateScope(
        authenticatedOrgId(authContext),
        templateId,
      )
      if (!scope) throw serviceError(404, 'BIB_TEMPLATE_NOT_FOUND', '模板不存在')
      return scope.raceId
    },

    getOverview: ({ orgId, raceId }) => repository.getOverview(orgId, raceId),
    getTemplates: ({ orgId, raceId }) => repository.getTemplates(orgId, raceId),
    upsertTemplate: ({ orgId, data }) => repository.upsertTemplate(orgId, data),
    getDataset: ({ orgId, raceId }) => repository.getDataset(orgId, raceId),
    getExecutionDataset: ({ orgId, raceId }) => repository.getExecutionDataset(orgId, raceId),
    hasSnapshot: ({ orgId, raceId }) => snapshots.hasSnapshot(orgId, raceId, 'pre_bib'),
    rollback: ({ orgId, raceId }) => rollbacks.rollbackBib(orgId, raceId),

    async deleteTemplate({ orgId, templateId }) {
      const deleted = await repository.deleteTemplate(orgId, templateId)
      if (!deleted) throw serviceError(404, 'BIB_TEMPLATE_NOT_FOUND', '模板不存在')
      return { deleted: true }
    },

    createSnapshot({ orgId, raceId }) {
      return database.transaction(async (trx) => {
        await repository.lockRaceScope(orgId, raceId, trx)
        await repository.assertNoActiveExecution(orgId, raceId, trx)
        return ensureSnapshot(orgId, raceId, trx)
      })
    },

    bulkAssign({ orgId, raceId, assignments }) {
      return database.transaction(async (trx) => {
        await repository.lockRaceScope(orgId, raceId, trx)
        await repository.assertNoActiveExecution(orgId, raceId, trx)
        await ensureSnapshot(orgId, raceId, trx)

        const recordIds = assignments.map((assignment) => assignment.recordId)
        const lockedIds = await repository.lockAssignmentRecords(orgId, raceId, recordIds, trx)
        if (lockedIds.length !== recordIds.length) {
          throw serviceError(
            400,
            'BIB_ASSIGNMENT_SCOPE_MISMATCH',
            '部分排号记录不存在或不属于当前赛事',
          )
        }

        const executionId = await repository.createExecution(orgId, raceId, trx)
        const updated = await repository.applyAssignments(orgId, raceId, assignments, trx)
        if (updated !== assignments.length) {
          throw serviceError(409, 'BIB_ASSIGNMENT_INCOMPLETE', '排号写入数量与请求不一致')
        }
        await repository.completeExecution(orgId, raceId, executionId, updated, trx)
        return { updated }
      })
    },

    clear({ orgId, raceId }) {
      return database.transaction(async (trx) => {
        await repository.lockRaceScope(orgId, raceId, trx)
        await repository.assertNoActiveExecution(orgId, raceId, trx)
        await ensureSnapshot(orgId, raceId, trx)
        return repository.clearBib(orgId, raceId, trx)
      })
    },
  }
}

export const bibService = createBibService()
