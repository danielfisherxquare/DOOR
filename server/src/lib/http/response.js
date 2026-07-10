import { createSuccessResponse } from '@arcspro/contracts'

export function sendSuccess(res, data, { status = 200, meta } = {}) {
  return res.status(status).json(createSuccessResponse(data, meta))
}

export function sendCreated(res, data, options = {}) {
  return sendSuccess(res, data, { ...options, status: 201 })
}
