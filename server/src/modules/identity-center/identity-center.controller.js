import { sendSuccess } from '../../lib/http/response.js'
import * as defaultService from './identity-center.service.js'
import {
  parseIdentityListQuery,
  parseIdentityModuleMatrixPayload,
  parseIdentityModuleQuery,
  parseIdentityOrgRacePayload,
  parseIdentityScopeQuery,
  parseIdentityUserRacePayload,
} from './identity-center.schema.js'

export function createIdentityCenterController({ service = defaultService } = {}) {
  return {
    async getSummary(req, res, next) {
      try {
        const query = parseIdentityScopeQuery(req.query)
        sendSuccess(res, await service.getIdentityCenterSummary(req.authContext, query.orgId))
      } catch (error) {
        next(error)
      }
    },
    async listAccounts(req, res, next) {
      try {
        const query = parseIdentityListQuery(req.query)
        sendSuccess(
          res,
          await service.listIdentityAccounts(req.authContext, query.orgId, {
            page: query.page,
            limit: query.limit,
            keyword: query.keyword,
          }),
        )
      } catch (error) {
        next(error)
      }
    },
    async getModuleMatrix(req, res, next) {
      try {
        const query = parseIdentityModuleQuery(req.query)
        sendSuccess(
          res,
          await service.getModuleMatrix(req.authContext, query.orgId, {
            keyword: query.keyword,
          }),
        )
      } catch (error) {
        next(error)
      }
    },
    async saveModuleMatrix(req, res, next) {
      try {
        const query = parseIdentityScopeQuery(req.query)
        sendSuccess(
          res,
          await service.saveModuleMatrix(
            req.authContext,
            query.orgId,
            parseIdentityModuleMatrixPayload(req.body),
          ),
        )
      } catch (error) {
        next(error)
      }
    },
    async getOrgRaceMatrix(req, res, next) {
      try {
        const query = parseIdentityScopeQuery(req.query)
        sendSuccess(res, await service.getOrgRaceMatrix(req.authContext, query.orgId))
      } catch (error) {
        next(error)
      }
    },
    async saveOrgRaceMatrix(req, res, next) {
      try {
        const query = parseIdentityScopeQuery(req.query)
        sendSuccess(
          res,
          await service.saveOrgRaceMatrix(
            req.authContext,
            query.orgId,
            parseIdentityOrgRacePayload(req.body),
          ),
        )
      } catch (error) {
        next(error)
      }
    },
    async getUserRaceMatrix(req, res, next) {
      try {
        const query = parseIdentityListQuery(req.query)
        sendSuccess(
          res,
          await service.getUserRaceMatrix(req.authContext, query.orgId, {
            page: query.page,
            limit: query.limit,
            keyword: query.keyword,
          }),
        )
      } catch (error) {
        next(error)
      }
    },
    async saveUserRaceMatrix(req, res, next) {
      try {
        const query = parseIdentityScopeQuery(req.query)
        sendSuccess(
          res,
          await service.saveUserRaceMatrix(
            req.authContext,
            query.orgId,
            parseIdentityUserRacePayload(req.body),
          ),
        )
      } catch (error) {
        next(error)
      }
    },
  }
}

export const identityCenterController = createIdentityCenterController()
