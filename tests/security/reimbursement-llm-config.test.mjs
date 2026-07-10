import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
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

test('LLM settings explain server encryption instead of claiming browser key storage', async () => {
  const source = await readFile(
    new URL('../../src/views/reimbursement/components/LlmConfigModal.jsx', import.meta.url),
    'utf8',
  )

  assert.doesNotMatch(source, /API Key 将存储在浏览器本地/)
  assert.match(source, /加密保存到服务端/)
  assert.match(source, /浏览器仅保留脱敏占位符/)
})
