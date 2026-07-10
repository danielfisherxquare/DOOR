import { sendSuccess } from '../../lib/http/response.js'
import {
  parseChunkPage,
  parseCommitImportSession,
  parseCreateImportSession,
  parseImportChunk,
  parseImportSummary,
  parseSessionId,
} from './import-session.schema.js'
import { importSessionService as defaultService } from './import-session.service.js'

function mergeCreateInput(req) {
  return {
    ...(req.query || {}),
    ...(req.body || {}),
  }
}

export function createImportSessionController({ service = defaultService } = {}) {
  async function resolveRequestOrgId(req, sessionId) {
    return service.resolveOrgId({
      authContext: req.authContext,
      input: parseCreateImportSession(mergeCreateInput(req)),
      sessionId,
    })
  }

  return {
    resolveRaceIdByCommit(req) {
      const input = parseCommitImportSession(req.body)
      req.importCommitInput = input
      return input.raceId
    },

    async create(req, res, next) {
      try {
        const orgId = await resolveRequestOrgId(req)
        sendSuccess(res, await service.createSession({ orgId }))
      } catch (error) {
        next(error)
      }
    },

    async get(req, res, next) {
      try {
        const sessionId = parseSessionId(req.params.sid)
        const orgId = await resolveRequestOrgId(req, sessionId)
        sendSuccess(res, await service.getSession({ orgId, sessionId }))
      } catch (error) {
        next(error)
      }
    },

    async setSummary(req, res, next) {
      try {
        const sessionId = parseSessionId(req.params.sid)
        const orgId = await resolveRequestOrgId(req, sessionId)
        sendSuccess(
          res,
          await service.setSummary({
            orgId,
            sessionId,
            summary: parseImportSummary(req.body),
          }),
        )
      } catch (error) {
        next(error)
      }
    },

    async appendChunk(req, res, next) {
      try {
        const sessionId = parseSessionId(req.params.sid)
        const orgId = await resolveRequestOrgId(req, sessionId)
        const totalRows = await service.appendChunk({
          orgId,
          sessionId,
          rows: parseImportChunk(req.body),
        })
        sendSuccess(res, { totalRows })
      } catch (error) {
        next(error)
      }
    },

    async getChunk(req, res, next) {
      try {
        const sessionId = parseSessionId(req.params.sid)
        const orgId = await resolveRequestOrgId(req, sessionId)
        const page = parseChunkPage(req.query)
        sendSuccess(res, await service.getChunk({ orgId, sessionId, ...page }))
      } catch (error) {
        next(error)
      }
    },

    async cancel(req, res, next) {
      try {
        const sessionId = parseSessionId(req.params.sid)
        const orgId = await resolveRequestOrgId(req, sessionId)
        sendSuccess(res, await service.cancelSession({ orgId, sessionId }))
      } catch (error) {
        next(error)
      }
    },

    async commit(req, res, next) {
      try {
        const sessionId = parseSessionId(req.params.sid)
        const input = req.importCommitInput || parseCommitImportSession(req.body)
        sendSuccess(
          res,
          await service.enqueueCommit({
            orgId: req.raceAccess.operatorOrgId,
            sessionId,
            raceId: input.raceId,
            category: input.category,
            createdBy: req.authContext.userId,
          }),
        )
      } catch (error) {
        next(error)
      }
    },
  }
}

export const importSessionController = createImportSessionController()
