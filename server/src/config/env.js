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

function resolveReimbursementOcrBaseUrl() {
    const explicit = process.env.REIMBURSEMENT_OCR_BASE_URL;
    if (explicit) return explicit;

    const legacyDashScope = process.env.DASHSCOPE_BASE_URL || '';
    if (legacyDashScope && !/coding\.dashscope\.aliyuncs\.com/i.test(legacyDashScope)) {
        return legacyDashScope;
    }

    return 'https://dashscope.aliyuncs.com/compatible-mode/v1';
}

export const env = {
  PORT: parseInt(process.env.PORT || '3001', 10),
    PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || 'http://localhost:5173',
    FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
    CORS_ORIGIN: process.env.CORS_ORIGIN || '',
    CORS_CLOUD_ORIGINS: process.env.CORS_CLOUD_ORIGINS || '',
  DATABASE_URL: process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door',
  SUPER_ADMIN_USERNAME: process.env.SUPER_ADMIN_USERNAME || 'superadmin',
  SUPER_ADMIN_EMAIL: process.env.SUPER_ADMIN_EMAIL || 'admin@platform.local',
    SUPER_ADMIN_PASSWORD: requireEnv('SUPER_ADMIN_PASSWORD') || 'change-me-in-dev',
    // 安全敏感配置：生产环境必须设置，开发环境使用明确的 dev-only 标记值
    JWT_SECRET: requireEnv('JWT_SECRET') || 'dev-only-do-not-use-in-production',
    ASSESSMENT_FIELD_ENCRYPTION_KEY:
        requireEnv('ASSESSMENT_FIELD_ENCRYPTION_KEY') || 'dev-only-assessment-field-encryption-key',
    ASSESSMENT_SESSION_JWT_SECRET:
        requireEnv('ASSESSMENT_SESSION_JWT_SECRET') ||
        requireEnv('JWT_SECRET') ||
        'dev-only-assessment-session-secret',
    ASSESSMENT_HASH_PEPPER:
        requireEnv('ASSESSMENT_HASH_PEPPER') || 'dev-only-assessment-hash-pepper',
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
  REIMBURSEMENT_OCR_PROVIDER: process.env.REIMBURSEMENT_OCR_PROVIDER || 'qwen',
  REIMBURSEMENT_OCR_BASE_URL: resolveReimbursementOcrBaseUrl(),
    REIMBURSEMENT_OCR_API_KEY:
        process.env.REIMBURSEMENT_OCR_API_KEY || process.env.DASHSCOPE_API_KEY || '',
  REIMBURSEMENT_OCR_MODEL_NAME: process.env.REIMBURSEMENT_OCR_MODEL_NAME || 'qwen3.5-plus',
};
