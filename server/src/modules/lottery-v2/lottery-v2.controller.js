import { sendSuccess } from '../../lib/http/response.js'
import { parseLotteryV2Config, parseLotteryV2RaceId } from './lottery-v2.schema.js'
import { lotteryV2WorkflowService as defaultService } from './lottery-v2.workflow.service.js'

export function createLotteryV2Controller({ service = defaultService } = {}) {
  function input(req) {
    return {
      orgId: req.raceAccess.operatorOrgId,
      raceId: parseLotteryV2RaceId(req.params.raceId),
    }
  }

  return {
    async getConfig(req, res, next) {
      try {
        sendSuccess(res, await service.getConfig(input(req)))
      } catch (error) {
        next(error)
      }
    },

    async saveConfig(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.saveConfig({ ...input(req), data: parseLotteryV2Config(req.body) }),
        )
      } catch (error) {
        next(error)
      }
    },

    async enqueuePreview(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.enqueuePreview({ ...input(req), userId: req.authContext.userId }),
        )
      } catch (error) {
        next(error)
      }
    },

    async getPreview(req, res, next) {
      try {
        sendSuccess(res, await service.getPreview(input(req)))
      } catch (error) {
        next(error)
      }
    },

    async enqueueFinalize(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.enqueueFinalize({ ...input(req), userId: req.authContext.userId }),
        )
      } catch (error) {
        next(error)
      }
    },

    async getResults(req, res, next) {
      try {
        sendSuccess(res, await service.getResults(input(req)))
      } catch (error) {
        next(error)
      }
    },

    async rollback(req, res, next) {
      try {
        sendSuccess(res, await service.rollback(input(req)))
      } catch (error) {
        next(error)
      }
    },
  }
}

export const lotteryV2Controller = createLotteryV2Controller()
