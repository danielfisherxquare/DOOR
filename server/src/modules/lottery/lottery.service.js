import * as jobRepository from '../jobs/job.repository.js'
import * as snapshotRepository from '../pipeline/snapshot.repository.js'
import * as lotteryRepository from './lottery.repository.js'
import * as rollbackRepository from './lottery-rollback.repository.js'

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

export function createLotteryService({
  repository = lotteryRepository,
  jobs = jobRepository,
  snapshots = snapshotRepository,
  rollbacks = rollbackRepository,
  now = Date.now,
} = {}) {
  async function requireScope(scope, code, message) {
    const result = await scope
    if (!result) throw serviceError(404, code, message)
    return result
  }

  return {
    async resolveCapacityRaceId(authContext, id) {
      const scope = await requireScope(
        repository.findCapacityScope(authenticatedOrgId(authContext), id),
        'LOTTERY_CAPACITY_NOT_FOUND',
        '容量配置不存在',
      )
      return scope.raceId
    },

    async resolveListRaceId(authContext, id) {
      const scope = await requireScope(
        repository.findListScope(authenticatedOrgId(authContext), id),
        'LOTTERY_LIST_NOT_FOUND',
        '名单条目不存在',
      )
      return scope.raceId
    },

    async resolveBulkListRaceId(authContext, ids) {
      const scopes = await repository.findListScopes(authenticatedOrgId(authContext), ids)
      if (scopes.length === 0) {
        throw serviceError(404, 'LOTTERY_LIST_NOT_FOUND', '名单条目不存在或不可访问')
      }
      const raceIds = new Set(scopes.map((scope) => scope.raceId))
      if (raceIds.size !== 1) {
        throw serviceError(400, 'LOTTERY_LIST_CROSS_RACE', '批量删除仅支持同一赛事的数据')
      }
      return [...raceIds][0]
    },

    async resolveWeightRaceId(authContext, id) {
      const scope = await requireScope(
        repository.findWeightScope(authenticatedOrgId(authContext), id),
        'LOTTERY_WEIGHT_NOT_FOUND',
        '权重不存在',
      )
      return scope.raceId
    },

    getRaceCapacity: (input) => repository.getRaceCapacity(input.orgId, input.raceId),
    saveRaceCapacity: (input) => repository.saveRaceCapacity(input.orgId, input.raceId, input.data),
    deleteRaceCapacity: (input) => repository.deleteRaceCapacity(input.orgId, input.id),
    getLists: (input) => repository.getLists(input.orgId, input.raceId, input.listType),
    saveLists: (input) => repository.saveLists(input.orgId, input.entries),
    deleteLists: (input) => repository.deleteLists(input.orgId, input.raceId, input.listType),
    deleteList: (input) => repository.deleteList(input.orgId, input.id),
    updateList: (input) => repository.updateList(input.orgId, input.id, input.data),
    bulkAddLists: (input) => repository.bulkAddLists(input.orgId, input.entries),
    bulkPutLists: (input) => repository.bulkPutLists(input.orgId, input.entries),
    bulkDeleteLists: (input) => repository.bulkDeleteLists(input.orgId, input.ids),
    getConflicts: (input) => repository.getConflicts(input.orgId, input.raceId),
    getRules: (input) => repository.getRules(input.orgId, input.raceId),
    saveRule: (input) => repository.saveRule(input.orgId, input.data),
    getWeights: (input) => repository.getWeights(input.orgId, input.raceId),
    saveWeight: (input) => repository.saveWeight(input.orgId, input.data),
    deleteWeight: (input) => repository.deleteWeight(input.orgId, input.id),
    deleteAllWeights: (input) => repository.deleteAllWeights(input.orgId, input.raceId),
    getResults: (input) => repository.getLotteryResults(input.orgId, input.raceId),
    hasSnapshot: (input) => snapshots.hasSnapshot(input.orgId, input.raceId, 'pre_lottery'),
    rollback: (input) => rollbacks.rollbackLottery(input.orgId, input.raceId),

    async enqueueFinalize({ orgId, raceId, userId }) {
      const job = await jobs.enqueue(
        orgId,
        'lottery:finalize',
        { raceId },
        `lottery:finalize:${raceId}:${now()}`,
        userId,
        raceId,
      )
      return { jobId: job.id }
    },
  }
}

export const lotteryService = createLotteryService()
