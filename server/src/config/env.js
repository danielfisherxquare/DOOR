import os from 'os';
import path from 'path';

export const env = {
  PORT: parseInt(process.env.PORT || '3001', 10),
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || 'http://47.251.107.41',
  DATABASE_URL: process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door',
  JWT_SECRET: process.env.JWT_SECRET || 'door-secret-key-change-in-production',
  ASSESSMENT_FIELD_ENCRYPTION_KEY: process.env.ASSESSMENT_FIELD_ENCRYPTION_KEY || 'door-assessment-field-encryption-key',
  ASSESSMENT_SESSION_JWT_SECRET: process.env.ASSESSMENT_SESSION_JWT_SECRET || process.env.JWT_SECRET || 'door-assessment-session-secret',
  ASSESSMENT_HASH_PEPPER: process.env.ASSESSMENT_HASH_PEPPER || 'door-assessment-hash-pepper',
  NODE_ENV: process.env.NODE_ENV || 'development',
  WORKER_POLL_INTERVAL_MS: parseInt(process.env.WORKER_POLL_INTERVAL_MS || '2000', 10),
  JOB_LEASE_DURATION_MS: parseInt(process.env.JOB_LEASE_DURATION_MS || '60000', 10),
  JOB_HEARTBEAT_INTERVAL_MS: parseInt(process.env.JOB_HEARTBEAT_INTERVAL_MS || '10000', 10),
  BACKUP_DIR: process.env.BACKUP_DIR || '/backups',
  BACKUP_RETENTION_COUNT: parseInt(process.env.BACKUP_RETENTION_COUNT || '10', 10),
  BACKUP_TIMEOUT_MS: parseInt(process.env.BACKUP_TIMEOUT_MS || '600000', 10),
  RESTORE_UPLOAD_DIR: process.env.RESTORE_UPLOAD_DIR || '/backups/uploads',
  RESTORE_TIMEOUT_MS: parseInt(process.env.RESTORE_TIMEOUT_MS || '1800000', 10),
  DB_OPS_LOCK_DIR: process.env.DB_OPS_LOCK_DIR || path.join(os.tmpdir(), 'door-db-ops.lock'),
};
