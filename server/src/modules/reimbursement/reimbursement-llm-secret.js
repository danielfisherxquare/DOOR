import { decryptField, encryptField } from '../../utils/crypto.js'

export const MASKED_REIMBURSEMENT_API_KEY = '••••••••'

function parseConfig(value) {
  if (!value) return {}
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  return typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function secretContext(userId) {
  return {
    tableName: 'reimbursement_user_settings',
    columnName: 'llm_config.apiKey',
    orgId: userId,
  }
}

export function encryptReimbursementLlmConfig(value, userId) {
  const config = parseConfig(value)
  return {
    ...config,
    apiKey: config.apiKey ? encryptField(String(config.apiKey).trim(), secretContext(userId)) : '',
  }
}

export function decryptReimbursementLlmConfig(value, userId) {
  const config = parseConfig(value)
  return {
    ...config,
    apiKey: config.apiKey ? decryptField(config.apiKey, secretContext(userId)) : '',
  }
}

export function maskReimbursementLlmConfig(value) {
  const config = parseConfig(value)
  return {
    ...config,
    apiKey: config.apiKey ? MASKED_REIMBURSEMENT_API_KEY : '',
  }
}

export function sanitizeReimbursementLlmRequestConfig(value) {
  const config = parseConfig(value)
  const sanitized = {}

  for (const field of ['provider', 'baseUrl', 'apiKey', 'modelName']) {
    if (typeof config[field] !== 'string') continue
    const parsed = config[field].trim()
    if (!parsed || (field === 'apiKey' && parsed === MASKED_REIMBURSEMENT_API_KEY)) continue
    sanitized[field] = parsed
  }

  return sanitized
}
