import { sendSuccess } from '../../lib/http/response.js'
import { parseAuditRaceId, parseAuditStepInput } from './audit.schema.js'
import { auditService as defaultService } from './audit.service.js'

export function createAuditController({ service = defaultService } = {}) {
  return {
    async prepStats(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.getPrepStats({
            orgId: req.raceAccess.operatorOrgId,
            raceId: parseAuditRaceId(req.params.raceId),
          }),
        )
      } catch (error) {
        next(error)
      }
    },

    async reset(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.resetAudit({
            orgId: req.raceAccess.operatorOrgId,
            raceId: parseAuditRaceId(req.params.raceId),
          }),
        )
      } catch (error) {
        next(error)
      }
    },

    enqueueStep(stepName) {
      return async (req, res, next) => {
        try {
          const raceId = parseAuditRaceId(req.params.raceId)
          sendSuccess(
            res,
            await service.enqueueStep({
              orgId: req.raceAccess.operatorOrgId,
              raceId,
              stepName,
              payload: parseAuditStepInput(stepName, req.body),
              userId: req.authContext.userId,
            }),
          )
        } catch (error) {
          next(error)
        }
      }
    },
  }
}

export const auditController = createAuditController()
