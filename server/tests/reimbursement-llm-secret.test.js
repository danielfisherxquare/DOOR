import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  decryptReimbursementLlmConfig,
  encryptReimbursementLlmConfig,
  MASKED_REIMBURSEMENT_API_KEY,
  maskReimbursementLlmConfig,
  sanitizeReimbursementLlmRequestConfig,
} from '../src/modules/reimbursement/reimbursement-llm-secret.js'
import {
  buildSettingsUpdatePayload,
  toSettingsResponse,
} from '../src/modules/reimbursement/reimbursement.controller.js'

process.env.PII_ENCRYPTION_KEY_V1 = '33'.repeat(32)
process.env.PII_ACTIVE_KEY_VERSION = 'v1'

describe('reimbursement OCR API key storage', () => {
  it('encrypts API keys with user-bound authenticated data', () => {
    const stored = encryptReimbursementLlmConfig(
      {
        provider: 'custom',
        baseUrl: 'https://vision.example/v1',
        apiKey: 'secret-user-key',
        modelName: 'vision-model',
      },
      'user-1',
    )

    assert.match(stored.apiKey, /^enc:v1:/)
    assert.doesNotMatch(JSON.stringify(stored), /secret-user-key/)
    assert.deepEqual(decryptReimbursementLlmConfig(stored, 'user-1'), {
      provider: 'custom',
      baseUrl: 'https://vision.example/v1',
      apiKey: 'secret-user-key',
      modelName: 'vision-model',
    })
    assert.equal(decryptReimbursementLlmConfig(stored, 'user-2').apiKey, '***解密失败***')
  })

  it('returns only a configured placeholder and ignores it on later requests', () => {
    assert.deepEqual(
      maskReimbursementLlmConfig({ apiKey: 'secret-user-key', provider: 'custom' }),
      { apiKey: MASKED_REIMBURSEMENT_API_KEY, provider: 'custom' },
    )
    assert.deepEqual(
      sanitizeReimbursementLlmRequestConfig({
        apiKey: MASKED_REIMBURSEMENT_API_KEY,
        baseUrl: ' https://vision.example/v1 ',
      }),
      { baseUrl: 'https://vision.example/v1' },
    )
  })

  it('never returns the stored key and preserves it when the placeholder comes back', () => {
    const current = {
      default_reporter: 'Runner',
      llm_config: {
        provider: 'custom',
        baseUrl: 'https://vision.example/v1',
        apiKey: 'secret-user-key',
        modelName: 'vision-model',
      },
    }
    const response = toSettingsResponse(current)

    assert.equal(response.hasUserLlmConfig, true)
    assert.equal(response.llmConfig.apiKey, MASKED_REIMBURSEMENT_API_KEY)
    assert.doesNotMatch(JSON.stringify(response), /secret-user-key/)
    assert.equal(
      buildSettingsUpdatePayload(
        { llmConfig: response.llmConfig, defaultReporter: 'Runner 2' },
        current,
      ).llm_config.apiKey,
      'secret-user-key',
    )
  })
})
