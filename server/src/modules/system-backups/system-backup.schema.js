import { pickFields, validationError } from '../../lib/http/validation.js';

const restoreUploadIdPattern = /^upload_\d{13}(?:_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?$/i;
const restoreJobIdPattern = /^restore_\d{13}(?:_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?$/i;

function parseIdentifier(value, label, pattern) {
  const parsed = String(value || '').trim();
  if (!pattern.test(parsed)) {
    throw validationError(`${label} 格式无效`, undefined, 'SYSTEM_BACKUP_INPUT_INVALID');
  }
  return parsed;
}

export function parseRestoreUploadId(value) {
  return parseIdentifier(value, 'uploadId', restoreUploadIdPattern);
}

export function parseRestoreJobId(value) {
  return parseIdentifier(value, 'jobId', restoreJobIdPattern);
}

export function parseStartRestorePayload(value) {
  const payload = pickFields(value, ['uploadId']);
  return { uploadId: parseRestoreUploadId(payload.uploadId) };
}
