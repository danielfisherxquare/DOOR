import { validationError } from '../../lib/http/validation.js'
import { sendSuccess } from '../../lib/http/response.js'
import {
  parseProfileContextQuery,
  parseProfileUpdate,
  parseProfileUserId,
} from './profile.schema.js'
import { profileService as defaultService } from './profile.service.js'

export function createProfileController({ service = defaultService } = {}) {
  function requireFile(req) {
    if (!req.file?.buffer) {
      throw validationError('未提供图片文件', undefined, 'PROFILE_IMAGE_REQUIRED')
    }
    return req.file.buffer
  }

  return {
    async getMe(req, res, next) {
      try {
        sendSuccess(res, await service.getMe({ userId: req.authContext.userId }))
      } catch (error) {
        next(error)
      }
    },

    async getContextOptions(req, res, next) {
      try {
        const selection = parseProfileContextQuery(req.query)
        sendSuccess(
          res,
          await service.getContextOptions({
            userId: req.authContext.userId,
            requestedOrgId: selection.orgId,
            requestedRaceId: selection.raceId,
          }),
        )
      } catch (error) {
        next(error)
      }
    },

    async updateMe(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.updateMe({
            userId: req.authContext.userId,
            data: parseProfileUpdate(req.body),
          }),
        )
      } catch (error) {
        next(error)
      }
    },

    async uploadAvatar(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.uploadAvatar({
            userId: req.authContext.userId,
            buffer: requireFile(req),
          }),
        )
      } catch (error) {
        next(error)
      }
    },

    async uploadCredentialPhoto(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.uploadCredentialPhoto({
            userId: req.authContext.userId,
            buffer: requireFile(req),
          }),
        )
      } catch (error) {
        next(error)
      }
    },

    async getUser(req, res, next) {
      try {
        sendSuccess(
          res,
          await service.getUser({
            authContext: req.authContext,
            userId: parseProfileUserId(req.params.userId),
          }),
        )
      } catch (error) {
        next(error)
      }
    },
  }
}

export const profileController = createProfileController()
