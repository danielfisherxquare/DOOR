import os from 'os';
import path from 'path';

function requireEnv(name) {
    const value = process.env[name];
    if (!value && process.env.NODE_ENV === 'production') {
        console.error(`[FATAL] 环境变量 ${name} 未设置，生产环境必须配置`);
        process.exit(1);
    }
    return value;
}

export const env = {
  PORT: parseInt(process.env.PORT || '3001', 10),
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || 'http://47.251.107.41',
  DATABASE_URL: process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door',
  // 安全敏感配置：生产环境必须设置
  JWT_SECRET: requireEnv('JWT_SECRET') || 'door-secret-key-dev-only',
  ASSESSMENT_FIELD_ENCRYPTION_KEY: requireEnv('ASSESSMENT_FIELD_ENCRYPTION_KEY') || 'door-assessment-field-encryption-key-dev',
  ASSESSMENT_SESSION_JWT_SECRET: requireEnv('ASSESSMENT_SESSION_JWT_SECRET') || requireEnv('JWT_SECRET') || 'door-assessment-session-secret-dev',
  ASSESSMENT_HASH_PEPPER: requireEnv('ASSESSMENT_HASH_PEPPER') || 'door-assessment-hash-pepper-dev',
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
