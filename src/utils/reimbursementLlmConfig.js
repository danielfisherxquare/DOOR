export const MASKED_REIMBURSEMENT_API_KEY = '••••••••'

export function maskPersistedReimbursementLlmConfig(config = {}) {
  const safeConfig = config && typeof config === 'object' && !Array.isArray(config) ? config : {}
  return {
    ...safeConfig,
    apiKey: safeConfig.apiKey ? MASKED_REIMBURSEMENT_API_KEY : '',
  }
}
