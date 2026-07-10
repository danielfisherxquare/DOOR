import { pickFields, validationError } from '../../lib/http/validation.js'

function invalid(message) {
  throw validationError(message, undefined, 'OCR_INPUT_INVALID')
}

function requiredText(value, label, max) {
  const parsed = typeof value === 'string' ? value.trim() : ''
  if (!parsed) invalid(`${label} 不能为空`)
  if (parsed.length > max) invalid(`${label} 最长 ${max} 个字符`)
  return parsed
}

export function parseOcrConfig(value) {
  const config = pickFields(value, ['provider', 'baseUrl', 'apiKey', 'modelName'])
  return {
    provider: requiredText(config.provider, 'provider', 50),
    baseUrl: requiredText(config.baseUrl, 'baseUrl', 2000),
    apiKey: requiredText(config.apiKey, 'apiKey', 1000),
    modelName: requiredText(config.modelName, 'modelName', 200),
  }
}

export function requireOcrFile(file) {
  if (!file?.buffer || !Buffer.isBuffer(file.buffer)) invalid('未上传文件')
  return {
    fileBuffer: file.buffer,
    mimeType: file.mimetype || 'application/octet-stream',
    filename: file.originalname || 'upload',
  }
}
