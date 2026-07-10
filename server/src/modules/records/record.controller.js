import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { recordMapper } from '../../db/mappers/records.js'
import { sendSuccess } from '../../lib/http/response.js'
import {
  parseBulkRecordUpdate,
  parseRaceId,
  parseRecordAnalysis,
  parseRecordId,
  parseRecordQuery,
  parseRecordUpdate,
  parseUniqueValues,
  parseVerificationResults,
  parseWinnerStatuses,
} from './record.schema.js'
import { recordService as defaultRecordService } from './record.service.js'

export function createRecordController({ service = defaultRecordService } = {}) {
  return {
    async resolveRaceIdByRecordId(req) {
      return service.resolveRaceIdForRecord(req.authContext, parseRecordId(req.params.recordId))
    },

    async resolveRaceIdByBulkUpdates(req) {
      const input = parseBulkRecordUpdate(req.body)
      req.recordBulkUpdateInput = input
      return service.resolveRaceIdForBulk(req.authContext, input)
    },

    async query(req, res, next) {
      try {
        const data = await service.queryRecords({
          authContext: req.authContext,
          method: req.method,
          input: parseRecordQuery(req.body),
        })
        sendSuccess(res, data)
      } catch (error) {
        next(error)
      }
    },

    async analysis(req, res, next) {
      try {
        const data = await service.analyzeRecords({
          authContext: req.authContext,
          method: req.method,
          input: parseRecordAnalysis(req.body),
        })
        sendSuccess(res, data)
      } catch (error) {
        next(error)
      }
    },

    async uniqueValues(req, res, next) {
      try {
        const data = await service.listUniqueValues({
          authContext: req.authContext,
          method: req.method,
          input: parseUniqueValues(req.body),
        })
        sendSuccess(res, data)
      } catch (error) {
        next(error)
      }
    },

    async quickStats(req, res, next) {
      try {
        const data = await service.quickStats({
          orgId: req.raceAccess.operatorOrgId,
          raceId: parseRaceId(req.params.raceId),
          winnerStatuses: parseWinnerStatuses(req.query.statuses),
        })
        sendSuccess(res, data)
      } catch (error) {
        next(error)
      }
    },

    async update(req, res, next) {
      try {
        const data = await service.updateRecord({
          orgId: req.raceAccess.operatorOrgId,
          recordId: parseRecordId(req.params.recordId),
          data: parseRecordUpdate(req.body),
        })
        if (!data) {
          const error = new Error('记录不存在')
          error.status = 404
          error.code = 'RECORD_NOT_FOUND'
          error.expose = true
          throw error
        }
        sendSuccess(res, data)
      } catch (error) {
        next(error)
      }
    },

    async bulkUpdate(req, res, next) {
      try {
        const input = req.recordBulkUpdateInput || parseBulkRecordUpdate(req.body)
        const data = await service.bulkUpdateRecords({
          orgId: req.raceAccess.operatorOrgId,
          updates: input.updates,
        })
        sendSuccess(res, data)
      } catch (error) {
        next(error)
      }
    },

    async deleteRace(req, res, next) {
      try {
        const deleted = await service.deleteRaceRecords({
          orgId: req.raceAccess.operatorOrgId,
          raceId: parseRaceId(req.params.raceId),
        })
        sendSuccess(res, { deleted })
      } catch (error) {
        next(error)
      }
    },

    async exportRace(req, res, next) {
      try {
        res.setHeader('Content-Type', 'application/x-ndjson')
        res.setHeader('Transfer-Encoding', 'chunked')

        const dbStream = service.streamRaceRecords({
          orgId: req.raceAccess.operatorOrgId,
          raceId: parseRaceId(req.params.raceId),
        })
        const toNdjson = new Transform({
          objectMode: true,
          transform(row, _encoding, callback) {
            try {
              callback(null, `${JSON.stringify(recordMapper.fromDbRow(row))}\n`)
            } catch (error) {
              callback(error)
            }
          },
        })

        await pipeline(dbStream, toNdjson, res)
      } catch (error) {
        if (res.headersSent) {
          res.end()
          return
        }
        next(error)
      }
    },

    async importVerification(req, res, next) {
      try {
        const data = await service.importVerificationResults({
          orgId: req.raceAccess.operatorOrgId,
          raceId: parseRaceId(req.params.raceId),
          results: parseVerificationResults(req.body),
        })
        sendSuccess(res, data)
      } catch (error) {
        next(error)
      }
    },
  }
}

export const recordController = createRecordController()
