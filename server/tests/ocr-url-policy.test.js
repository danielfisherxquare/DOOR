import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { assertSafeOcrBaseUrl } from '../src/modules/ocr/ocr-url-policy.js'

describe('OCR upstream URL policy', () => {
  it('allows an HTTPS provider that resolves only to public addresses', async () => {
    assert.equal(
      await assertSafeOcrBaseUrl(' https://vision.example.com/v1 ', {
        lookup: async () => [{ address: '8.8.8.8', family: 4 }],
      }),
      'https://vision.example.com/v1',
    )
  })

  for (const unsafeUrl of [
    'http://vision.example.com/v1',
    'https://localhost/v1',
    'https://127.0.0.1/v1',
    'https://10.0.0.8/v1',
    'https://169.254.169.254/latest/meta-data',
    'https://[::1]/v1',
    'https://user:password@vision.example.com/v1',
  ]) {
    it(`rejects unsafe URL ${unsafeUrl}`, async () => {
      await assert.rejects(
        () => assertSafeOcrBaseUrl(unsafeUrl),
        (error) => error.status === 400 && error.code === 'OCR_BASE_URL_UNSAFE',
      )
    })
  }

  it('rejects a public-looking hostname when DNS resolves to a private address', async () => {
    await assert.rejects(
      () =>
        assertSafeOcrBaseUrl('https://vision.example.com/v1', {
          lookup: async () => [{ address: '192.168.1.20', family: 4 }],
        }),
      /公网地址/,
    )
  })
})
