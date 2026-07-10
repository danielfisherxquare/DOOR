import {
  decryptField,
  encryptField,
  normalizeIdNumber,
} from '../../utils/crypto.js'

function recipientIdContext({ orgId, raceId }) {
  return {
    tableName: 'credential_issue_logs',
    columnName: 'issued_to_id_number',
    orgId,
    raceId,
  }
}

export function encryptCredentialRecipientId(value, context) {
  const normalized = normalizeIdNumber(String(value || ''))
  return normalized ? encryptField(normalized, recipientIdContext(context)) : null
}

export function decryptCredentialRecipientId(value, context) {
  return value ? decryptField(value, recipientIdContext(context)) : null
}
