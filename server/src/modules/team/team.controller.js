import path from 'node:path'
import { validationError } from '../../lib/http/validation.js'
import { sendCreated, sendSuccess } from '../../lib/http/response.js'
import * as defaultService from './team.service.js'
import {
  parseTeamImportRows,
  parseTeamKeyword,
  parseTeamListQuery,
  parseTeamMemberId,
  parseTeamMemberInput,
  resolveTeamOrgId,
} from './team.schema.js'

export function createTeamController({ service = defaultService } = {}) {
  function orgId(req) {
    return req.teamOrgId || resolveTeamOrgId(req.authContext, req.query)
  }

  return {
    resolveOrgContext(req, _res, next) {
      try {
        req.teamOrgId = resolveTeamOrgId(req.authContext, req.query)
        next()
      } catch (error) {
        next(error)
      }
    },

    async listTeamMembers(req, res, next) {
      try {
        sendSuccess(res, await service.listTeamMembers(orgId(req), parseTeamListQuery(req.query)))
      } catch (error) { next(error) }
    },

    async getImportTemplate(_req, res, next) {
      try {
        sendSuccess(res, await service.getImportTemplate())
      } catch (error) { next(error) }
    },

    async previewImport(req, res, next) {
      try {
        sendSuccess(res, await service.previewImport(orgId(req), parseTeamImportRows(req.body)))
      } catch (error) { next(error) }
    },

    async commitImport(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.commitImport(
            orgId(req),
            req.authContext.userId,
            parseTeamImportRows(req.body),
          ),
        )
      } catch (error) { next(error) }
    },

    async getTeamMember(req, res, next) {
      try {
        sendSuccess(res, await service.getTeamMember(orgId(req), parseTeamMemberId(req.params.teamMemberId)))
      } catch (error) { next(error) }
    },

    async getTeamMemberPhoto(req, res, next) {
      try {
        const absolutePath = await service.getTeamMemberPhotoFile(
          orgId(req),
          parseTeamMemberId(req.params.teamMemberId),
        )
        res.type(path.extname(absolutePath))
        res.sendFile(absolutePath)
      } catch (error) { next(error) }
    },

    async createTeamMember(req, res, next) {
      try {
        sendCreated(
          res,
          await service.createTeamMember(
            orgId(req),
            req.authContext.userId,
            parseTeamMemberInput(req.body),
          ),
        )
      } catch (error) { next(error) }
    },

    async updateTeamMember(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.updateTeamMember(
            orgId(req),
            parseTeamMemberId(req.params.teamMemberId),
            parseTeamMemberInput(req.body),
          ),
        )
      } catch (error) { next(error) }
    },

    async uploadTeamMemberPhoto(req, res, next) {
      try {
        if (!req.file) throw validationError('缺少照片文件', undefined, 'TEAM_PHOTO_REQUIRED')
        sendSuccess(
          res,
          await service.uploadTeamMemberPhoto(
            orgId(req),
            parseTeamMemberId(req.params.teamMemberId),
            req.file,
          ),
        )
      } catch (error) { next(error) }
    },

    async deleteTeamMemberPhoto(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.deleteTeamMemberPhoto(
            orgId(req),
            parseTeamMemberId(req.params.teamMemberId),
          ),
        )
      } catch (error) { next(error) }
    },

    async archiveTeamMember(req, res, next) {
      try {
        sendSuccess(res, await service.archiveTeamMember(orgId(req), parseTeamMemberId(req.params.teamMemberId)))
      } catch (error) { next(error) }
    },

    async restoreTeamMember(req, res, next) {
      try {
        sendSuccess(res, await service.restoreTeamMember(orgId(req), parseTeamMemberId(req.params.teamMemberId)))
      } catch (error) { next(error) }
    },

    async enableTeamMemberAccount(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.enableTeamMemberAccount(
            orgId(req),
            parseTeamMemberId(req.params.teamMemberId),
            req.authContext.userId,
          ),
        )
      } catch (error) { next(error) }
    },

    async resetTeamMemberPassword(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.resetTeamMemberPassword(
            orgId(req),
            parseTeamMemberId(req.params.teamMemberId),
          ),
        )
      } catch (error) { next(error) }
    },

    async listTeamCandidates(req, res, next) {
      try {
        sendSuccess(res, await service.listTeamCandidates(orgId(req), parseTeamKeyword(req.query.keyword)))
      } catch (error) { next(error) }
    },
  }
}

export const teamController = createTeamController()
