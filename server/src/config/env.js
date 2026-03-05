/**
 * 环境变量集中管理
 */
export const env = {
  PORT: parseInt(process.env.PORT || '3001', 10),
  DATABASE_URL: process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door',
  JWT_SECRET: process.env.JWT_SECRET || 'door-secret-key-change-in-production',
  NODE_ENV: process.env.NODE_ENV || 'development',
  WORKER_POLL_INTERVAL_MS: parseInt(process.env.WORKER_POLL_INTERVAL_MS || '2000', 10),
  JOB_LEASE_DURATION_MS: parseInt(process.env.JOB_LEASE_DURATION_MS || '60000', 10),
  JOB_HEARTBEAT_INTERVAL_MS: parseInt(process.env.JOB_HEARTBEAT_INTERVAL_MS || '10000', 10),
};
