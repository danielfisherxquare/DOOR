import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidBackupFilename } from '../src/modules/system-backups/system-backup.service.js';

test('accepts valid backup filenames', () => {
  assert.equal(isValidBackupFilename('door_backup_20260314_033000.sql.gz'), true);
});

test('rejects invalid backup filenames', () => {
  assert.equal(isValidBackupFilename('../door_backup.sql.gz'), false);
  assert.equal(isValidBackupFilename('door_backup_20260314_033000.sql'), false);
  assert.equal(isValidBackupFilename('evil.sql.gz'), false);
});
