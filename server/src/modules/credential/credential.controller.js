import { sendCreated, sendSuccess } from '../../lib/http/response.js'
import * as defaultService from './credential.service.js'
import {
  parseCredentialPayload,
  parseCredentialRaceId,
  parseCredentialResourceId,
  parseCredentialStatusFilter,
} from './credential.schema.js'

export function createCredentialController({ service = defaultService } = {}) {
  const context = (req) => ({ ...req.authContext, requestId: req.id || null })
  const raceId = (req) => parseCredentialRaceId(req.params.raceId)
  const resourceId = (req, name) => parseCredentialResourceId(req.params[name])

  return {
    async getAccessAreas(req, res, next) {
      try {
        sendSuccess(res, await service.getAccessAreas(context(req), raceId(req)))
      } catch (error) {
        next(error)
      }
    },
    async createAccessArea(req, res, next) {
      try {
        sendCreated(
          res,
          await service.createAccessArea(
            context(req),
            raceId(req),
            parseCredentialPayload('accessArea', req.body),
          ),
        )
      } catch (error) {
        next(error)
      }
    },
    async updateAccessArea(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.updateAccessArea(
            context(req),
            raceId(req),
            resourceId(req, 'accessAreaId'),
            parseCredentialPayload('accessArea', req.body),
          ),
        )
      } catch (error) {
        next(error)
      }
    },
    async deleteAccessArea(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.deleteAccessArea(
            context(req),
            raceId(req),
            resourceId(req, 'accessAreaId'),
          ),
        )
      } catch (error) {
        next(error)
      }
    },
    async getCategories(req, res, next) {
      try {
        sendSuccess(res, await service.getCategories(context(req), raceId(req)))
      } catch (error) {
        next(error)
      }
    },
    async createCategory(req, res, next) {
      try {
        sendCreated(
          res,
          await service.createCategory(
            context(req),
            raceId(req),
            parseCredentialPayload('category', req.body),
          ),
        )
      } catch (error) {
        next(error)
      }
    },
    async updateCategory(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.updateCategory(
            context(req),
            raceId(req),
            resourceId(req, 'categoryId'),
            parseCredentialPayload('category', req.body),
          ),
        )
      } catch (error) {
        next(error)
      }
    },
    async deleteCategory(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.deleteCategory(context(req), raceId(req), resourceId(req, 'categoryId')),
        )
      } catch (error) {
        next(error)
      }
    },
    async getStyleTemplates(req, res, next) {
      try {
        sendSuccess(res, await service.getStyleTemplates(context(req), raceId(req)))
      } catch (error) {
        next(error)
      }
    },
    async getStyleTemplate(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.getStyleTemplate(context(req), raceId(req), resourceId(req, 'templateId')),
        )
      } catch (error) {
        next(error)
      }
    },
    async createStyleTemplate(req, res, next) {
      try {
        sendCreated(
          res,
          await service.createStyleTemplate(
            context(req),
            raceId(req),
            parseCredentialPayload('styleTemplate', req.body),
          ),
        )
      } catch (error) {
        next(error)
      }
    },
    async updateStyleTemplate(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.updateStyleTemplate(
            context(req),
            raceId(req),
            resourceId(req, 'templateId'),
            parseCredentialPayload('styleTemplate', req.body),
          ),
        )
      } catch (error) {
        next(error)
      }
    },
    async deleteStyleTemplate(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.deleteStyleTemplate(
            context(req),
            raceId(req),
            resourceId(req, 'templateId'),
          ),
        )
      } catch (error) {
        next(error)
      }
    },
    async getRequests(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.getRequests(
            context(req),
            raceId(req),
            parseCredentialStatusFilter(req.query),
          ),
        )
      } catch (error) {
        next(error)
      }
    },
    async getRequest(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.getRequest(context(req), raceId(req), resourceId(req, 'requestId')),
        )
      } catch (error) {
        next(error)
      }
    },
    async createRequest(req, res, next) {
      try {
        sendCreated(
          res,
          await service.createRequest(
            context(req),
            raceId(req),
            parseCredentialPayload('request', req.body),
          ),
        )
      } catch (error) {
        next(error)
      }
    },
    async reviewRequest(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.reviewRequest(
            context(req),
            raceId(req),
            resourceId(req, 'requestId'),
            parseCredentialPayload('review', req.body),
          ),
        )
      } catch (error) {
        next(error)
      }
    },
    async getCredentials(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.getCredentials(
            context(req),
            raceId(req),
            parseCredentialStatusFilter(req.query),
          ),
        )
      } catch (error) {
        next(error)
      }
    },
    async getCredential(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.getCredential(context(req), raceId(req), resourceId(req, 'credentialId')),
        )
      } catch (error) {
        next(error)
      }
    },
    async resolveCredential(req, res, next) {
      try {
        const input = parseCredentialPayload('qr', req.body)
        sendSuccess(res, await service.resolveCredentialByQrPayload(context(req), input.qrPayload))
      } catch (error) {
        next(error)
      }
    },
    async voidCredential(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.voidCredential(
            context(req),
            raceId(req),
            resourceId(req, 'credentialId'),
            parseCredentialPayload('void', req.body),
          ),
        )
      } catch (error) {
        next(error)
      }
    },
    async issueCredential(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.issueCredential(
            context(req),
            raceId(req),
            resourceId(req, 'credentialId'),
            parseCredentialPayload('issue', req.body),
          ),
        )
      } catch (error) {
        next(error)
      }
    },
    async reissueCredential(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.reissueCredential(
            context(req),
            raceId(req),
            resourceId(req, 'credentialId'),
            parseCredentialPayload('reissue', req.body),
          ),
        )
      } catch (error) {
        next(error)
      }
    },
    async getStats(req, res, next) {
      try {
        sendSuccess(res, await service.getCredentialStats(context(req), raceId(req)))
      } catch (error) {
        next(error)
      }
    },
  }
}

export const credentialController = createCredentialController()
