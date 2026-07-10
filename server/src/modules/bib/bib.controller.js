import { sendSuccess } from '../../lib/http/response.js'
import {
  parseBibAssignments,
  parseBibRaceId,
  parseBibResourceId,
  parseBibTemplate,
} from './bib.schema.js'
import { bibService as defaultService } from './bib.service.js'

export function createBibController({ service = defaultService } = {}) {
  function raceInput(req) {
    return {
      orgId: req.raceAccess.operatorOrgId,
      raceId: parseBibRaceId(req.params.raceId),
    }
  }

  return {
    resolveTemplateInputRaceId(req) {
      const input = parseBibTemplate(req.body)
      req.bibTemplateInput = input
      return input.raceId
    },

    resolveTemplateRaceId(req) {
      const templateId = parseBibResourceId(req.params.id)
      req.bibTemplateId = templateId
      return service.resolveTemplateRaceId(req.authContext, templateId)
    },

    async getOverview(req, res, next) {
      try {
        sendSuccess(res, await service.getOverview(raceInput(req)))
      } catch (error) { next(error) }
    },

    async getTemplates(req, res, next) {
      try {
        sendSuccess(res, await service.getTemplates(raceInput(req)))
      } catch (error) { next(error) }
    },

    async upsertTemplate(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.upsertTemplate({
            orgId: req.raceAccess.operatorOrgId,
            data: req.bibTemplateInput || parseBibTemplate(req.body),
          }),
        )
      } catch (error) { next(error) }
    },

    async deleteTemplate(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.deleteTemplate({
            orgId: req.raceAccess.operatorOrgId,
            templateId: req.bibTemplateId || parseBibResourceId(req.params.id),
          }),
        )
      } catch (error) { next(error) }
    },

    async getDataset(req, res, next) {
      try {
        sendSuccess(res, await service.getDataset(raceInput(req)))
      } catch (error) { next(error) }
    },

    async getExecutionDataset(req, res, next) {
      try {
        sendSuccess(res, await service.getExecutionDataset(raceInput(req)))
      } catch (error) { next(error) }
    },

    async createSnapshot(req, res, next) {
      try {
        sendSuccess(res, await service.createSnapshot(raceInput(req)))
      } catch (error) { next(error) }
    },

    async hasSnapshot(req, res, next) {
      try {
        const hasSnapshot = await service.hasSnapshot(raceInput(req))
        sendSuccess(res, { hasSnapshot })
      } catch (error) { next(error) }
    },

    async rollback(req, res, next) {
      try {
        sendSuccess(res, await service.rollback(raceInput(req)))
      } catch (error) { next(error) }
    },

    async bulkAssign(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.bulkAssign({
            ...raceInput(req),
            assignments: parseBibAssignments(req.body),
          }),
        )
      } catch (error) { next(error) }
    },

    async clear(req, res, next) {
      try {
        sendSuccess(res, await service.clear(raceInput(req)))
      } catch (error) { next(error) }
    },
  }
}

export const bibController = createBibController()
