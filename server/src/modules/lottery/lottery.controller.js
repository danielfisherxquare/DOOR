import { sendSuccess } from '../../lib/http/response.js'
import {
  parseLotteryListEntries,
  parseLotteryListIds,
  parseLotteryListType,
  parseLotteryListUpdate,
  parseLotteryRaceCapacity,
  parseLotteryRaceId,
  parseLotteryResourceId,
  parseLotteryRule,
  parseLotteryWeight,
} from './lottery.schema.js'
import { lotteryService as defaultService } from './lottery.service.js'

function notFound(code, message) {
  const error = new Error(message)
  error.status = 404
  error.code = code
  error.expose = true
  return error
}

export function createLotteryController({ service = defaultService } = {}) {
  return {
    resolveCapacityRaceId(req) {
      const id = parseLotteryResourceId(req.params.id)
      req.lotteryResourceId = id
      return service.resolveCapacityRaceId(req.authContext, id)
    },

    resolveListRaceId(req) {
      const id = parseLotteryResourceId(req.params.id)
      req.lotteryResourceId = id
      return service.resolveListRaceId(req.authContext, id)
    },

    resolveListEntriesRaceId(req) {
      const input = parseLotteryListEntries(req.body)
      req.lotteryListEntriesInput = input
      return input.raceId
    },

    resolveBulkListRaceId(req) {
      const ids = parseLotteryListIds(req.body)
      req.lotteryListIds = ids
      return service.resolveBulkListRaceId(req.authContext, ids)
    },

    resolveWeightRaceId(req) {
      const id = parseLotteryResourceId(req.params.id)
      req.lotteryResourceId = id
      return service.resolveWeightRaceId(req.authContext, id)
    },

    resolveRuleInputRaceId(req) {
      const data = parseLotteryRule(req.body)
      req.lotteryRuleInput = data
      return data.raceId
    },

    resolveWeightInputRaceId(req) {
      const data = parseLotteryWeight(req.body)
      req.lotteryWeightInput = data
      return data.raceId
    },

    async getRaceCapacity(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.getRaceCapacity({
            orgId: req.raceAccess.operatorOrgId,
            raceId: parseLotteryRaceId(req.params.raceId),
          }),
        )
      } catch (error) {
        next(error)
      }
    },

    async saveRaceCapacity(req, res, next) {
      try {
        const raceId = parseLotteryRaceId(req.params.raceId)
        sendSuccess(
          res,
          await service.saveRaceCapacity({
            orgId: req.raceAccess.operatorOrgId,
            raceId,
            data: parseLotteryRaceCapacity(raceId, req.body),
          }),
        )
      } catch (error) {
        next(error)
      }
    },

    async deleteRaceCapacity(req, res, next) {
      try {
        const deleted = await service.deleteRaceCapacity({
          orgId: req.raceAccess.operatorOrgId,
          id: req.lotteryResourceId || parseLotteryResourceId(req.params.id),
        })
        if (!deleted) throw notFound('LOTTERY_CAPACITY_NOT_FOUND', '容量配置不存在')
        sendSuccess(res, { deleted: true })
      } catch (error) {
        next(error)
      }
    },

    async getLists(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.getLists({
            orgId: req.raceAccess.operatorOrgId,
            raceId: parseLotteryRaceId(req.params.raceId),
            listType: parseLotteryListType(req.query.listType, { optional: true }),
          }),
        )
      } catch (error) {
        next(error)
      }
    },

    async saveLists(req, res, next) {
      try {
        const input = req.lotteryListEntriesInput || parseLotteryListEntries(req.body)
        sendSuccess(
          res,
          await service.saveLists({ orgId: req.raceAccess.operatorOrgId, entries: input.entries }),
        )
      } catch (error) {
        next(error)
      }
    },

    async deleteLists(req, res, next) {
      try {
        const deleted = await service.deleteLists({
          orgId: req.raceAccess.operatorOrgId,
          raceId: parseLotteryRaceId(req.params.raceId),
          listType: parseLotteryListType(req.query.listType),
        })
        sendSuccess(res, { deleted })
      } catch (error) {
        next(error)
      }
    },

    async deleteList(req, res, next) {
      try {
        const deleted = await service.deleteList({
          orgId: req.raceAccess.operatorOrgId,
          id: req.lotteryResourceId || parseLotteryResourceId(req.params.id),
        })
        if (!deleted) throw notFound('LOTTERY_LIST_NOT_FOUND', '名单条目不存在')
        sendSuccess(res, { deleted: true })
      } catch (error) {
        next(error)
      }
    },

    async updateList(req, res, next) {
      try {
        const data = await service.updateList({
          orgId: req.raceAccess.operatorOrgId,
          id: req.lotteryResourceId || parseLotteryResourceId(req.params.id),
          data: parseLotteryListUpdate(req.body),
        })
        if (!data) throw notFound('LOTTERY_LIST_NOT_FOUND', '名单条目不存在')
        sendSuccess(res, data)
      } catch (error) {
        next(error)
      }
    },

    async bulkAddLists(req, res, next) {
      try {
        const input = req.lotteryListEntriesInput || parseLotteryListEntries(req.body)
        sendSuccess(
          res,
          await service.bulkAddLists({
            orgId: req.raceAccess.operatorOrgId,
            entries: input.entries,
          }),
        )
      } catch (error) {
        next(error)
      }
    },

    async bulkPutLists(req, res, next) {
      try {
        const input = req.lotteryListEntriesInput || parseLotteryListEntries(req.body)
        sendSuccess(
          res,
          await service.bulkPutLists({
            orgId: req.raceAccess.operatorOrgId,
            entries: input.entries,
          }),
        )
      } catch (error) {
        next(error)
      }
    },

    async bulkDeleteLists(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.bulkDeleteLists({
            orgId: req.raceAccess.operatorOrgId,
            ids: req.lotteryListIds || parseLotteryListIds(req.body),
          }),
        )
      } catch (error) {
        next(error)
      }
    },

    async getConflicts(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.getConflicts({
            orgId: req.raceAccess.operatorOrgId,
            raceId: parseLotteryRaceId(req.params.raceId),
          }),
        )
      } catch (error) {
        next(error)
      }
    },

    async getRules(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.getRules({
            orgId: req.raceAccess.operatorOrgId,
            raceId: parseLotteryRaceId(req.params.raceId),
          }),
        )
      } catch (error) {
        next(error)
      }
    },

    async saveRule(req, res, next) {
      try {
        const data = req.lotteryRuleInput || parseLotteryRule(req.body)
        sendSuccess(res, await service.saveRule({ orgId: req.raceAccess.operatorOrgId, data }))
      } catch (error) {
        next(error)
      }
    },

    async getWeights(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.getWeights({
            orgId: req.raceAccess.operatorOrgId,
            raceId: parseLotteryRaceId(req.params.raceId),
          }),
        )
      } catch (error) {
        next(error)
      }
    },

    async saveWeight(req, res, next) {
      try {
        const data = req.lotteryWeightInput || parseLotteryWeight(req.body)
        sendSuccess(res, await service.saveWeight({ orgId: req.raceAccess.operatorOrgId, data }))
      } catch (error) {
        next(error)
      }
    },

    async deleteWeight(req, res, next) {
      try {
        const deleted = await service.deleteWeight({
          orgId: req.raceAccess.operatorOrgId,
          id: req.lotteryResourceId || parseLotteryResourceId(req.params.id),
        })
        if (!deleted) throw notFound('LOTTERY_WEIGHT_NOT_FOUND', '权重不存在')
        sendSuccess(res, { deleted: true })
      } catch (error) {
        next(error)
      }
    },

    async deleteAllWeights(req, res, next) {
      try {
        const deleted = await service.deleteAllWeights({
          orgId: req.raceAccess.operatorOrgId,
          raceId: parseLotteryRaceId(req.params.raceId),
        })
        sendSuccess(res, { deleted })
      } catch (error) {
        next(error)
      }
    },

    async finalize(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.enqueueFinalize({
            orgId: req.raceAccess.operatorOrgId,
            raceId: parseLotteryRaceId(req.params.raceId),
            userId: req.authContext.userId,
          }),
        )
      } catch (error) {
        next(error)
      }
    },

    async getResults(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.getResults({
            orgId: req.raceAccess.operatorOrgId,
            raceId: parseLotteryRaceId(req.params.raceId),
          }),
        )
      } catch (error) {
        next(error)
      }
    },

    async hasSnapshot(req, res, next) {
      try {
        const hasSnapshot = await service.hasSnapshot({
          orgId: req.raceAccess.operatorOrgId,
          raceId: parseLotteryRaceId(req.params.raceId),
        })
        sendSuccess(res, { hasSnapshot })
      } catch (error) {
        next(error)
      }
    },

    async rollback(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.rollback({
            orgId: req.raceAccess.operatorOrgId,
            raceId: parseLotteryRaceId(req.params.raceId),
          }),
        )
      } catch (error) {
        next(error)
      }
    },
  }
}

export const lotteryController = createLotteryController()
