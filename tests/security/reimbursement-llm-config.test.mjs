import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MASKED_REIMBURSEMENT_API_KEY,
  maskPersistedReimbursementLlmConfig,
} from '../../src/utils/reimbursementLlmConfig.js'

test('reimbursement persistence never serializes the OCR API key', () => {
  const persisted = maskPersistedReimbursementLlmConfig({
    provider: 'custom',
    apiKey: 'secret-browser-key',
  })

  assert.equal(persisted.apiKey, MASKED_REIMBURSEMENT_API_KEY)
  assert.doesNotMatch(JSON.stringify(persisted), /secret-browser-key/)
})
