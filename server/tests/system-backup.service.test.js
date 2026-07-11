import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getEncryptionStatus,
  isValidBackupFilename,
} from '../src/modules/system-backups/system-backup.service.js';
import {
  parseRestoreJobId,
  parseRestoreUploadId,
} from '../src/modules/system-backups/system-backup.schema.js';

test('accepts valid backup filenames', () => {
  assert.equal(isValidBackupFilename('door_backup_20260314_033000.dump'), true);
  assert.equal(isValidBackupFilename('door_backup_20260314_033000.sql.gz'), true);
});

test('rejects invalid backup filenames', () => {
  assert.equal(isValidBackupFilename('../door_backup.sql.gz'), false);
  assert.equal(isValidBackupFilename('door_backup_20260314_033000.sql'), false);
  assert.equal(isValidBackupFilename('evil.sql.gz'), false);
});

test('validates restore upload and job identifiers before filesystem access', () => {
  assert.equal(parseRestoreUploadId('upload_1710000000000'), 'upload_1710000000000');
  assert.equal(parseRestoreJobId('restore_1710000000000'), 'restore_1710000000000');

  assert.throws(() => parseRestoreUploadId('../upload_1710000000000'), /uploadId/);
  assert.throws(() => parseRestoreUploadId('env_upload_1710000000000'), /uploadId/);
  assert.throws(() => parseRestoreJobId('../../etc/passwd'), /jobId/);
});

test('builds encryption status without database access in the route layer', async () => {
  const status = await getEncryptionStatus({
    database: { marker: 'database' },
    keyHealthChecker: async (database) => {
      assert.deepEqual(database, { marker: 'database' });
      return { healthy: false, reason: 'hmac_key_mismatch' };
    },
    currentFingerprintReader: () => ({
      version: 'v2',
      encryptionKeyFingerprint: 'enc-current',
      hmacKeyFingerprint: 'hmac-current',
    }),
    storedFingerprintReader: async (database) => {
      assert.deepEqual(database, { marker: 'database' });
      return JSON.stringify({
        version: 'v1',
        encryptionKeyFingerprint: 'enc-stored',
        hmacKeyFingerprint: 'hmac-stored',
      });
    },
    backupLister: async () => [
      { envFile: 'door_backup_20260710_010203.env', createdAt: '2026-07-10T01:02:03Z', trigger: 'manual' },
      { filename: 'door_backup_20260710_010203.sql.gz' },
    ],
  });

  assert.deepEqual(status, {
    healthy: false,
    reason: 'hmac_key_mismatch',
    current: {
      version: 'v2',
      encryptionKeyFingerprint: 'enc-current',
      hmacKeyFingerprint: 'hmac-current',
      isSet: true,
    },
    stored: {
      version: 'v1',
      encryptionKeyFingerprint: 'enc-stored',
      hmacKeyFingerprint: 'hmac-stored',
    },
    envBackups: [
      {
        filename: 'door_backup_20260710_010203.env',
        backupDate: '2026-07-10T01:02:03Z',
        trigger: 'manual',
      },
    ],
  });
});

test('ignores malformed stored encryption fingerprint metadata', async () => {
  const status = await getEncryptionStatus({
    database: {},
    keyHealthChecker: async () => ({ healthy: true }),
    currentFingerprintReader: () => ({
      version: 'v1',
      encryptionKeyFingerprint: 'UNSET',
      hmacKeyFingerprint: 'UNSET',
    }),
    storedFingerprintReader: async () => '{broken json',
    backupLister: async () => [],
  });

  assert.equal(status.current.isSet, false);
  assert.equal(status.stored, null);
});
