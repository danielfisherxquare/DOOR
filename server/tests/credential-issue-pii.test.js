import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

process.env.PII_ENCRYPTION_KEY_V1 ||= '11'.repeat(32)
process.env.PII_HMAC_KEY_V1 ||= '22'.repeat(32)

const {
  decryptCredentialRecipientId,
  encryptCredentialRecipientId,
} = await import('../src/modules/credential/credential-pii.js')

describe('credential issue recipient PII', () => {
  it('encrypts and normalizes recipient identity numbers with tenant AAD', () => {
    const encrypted = encryptCredentialRecipientId(' 11010119900101123x ', {
      orgId: 'org-1',
      raceId: 7,
    })

    assert.match(encrypted, /^enc:v1:/u)
    assert.equal(encrypted.includes('11010119900101123X'), false)
    assert.equal(
      decryptCredentialRecipientId(encrypted, { orgId: 'org-1', raceId: 7 }),
      '11010119900101123X',
    )
  })

  it('rejects decrypting the value under another tenant context', () => {
    const encrypted = encryptCredentialRecipientId('11010119900101123X', {
      orgId: 'org-1',
      raceId: 7,
    })

    assert.equal(
      decryptCredentialRecipientId(encrypted, { orgId: 'org-2', raceId: 7 }),
      '***解密失败***',
    )
  })
})
