import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { env } from '../../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '../../..');
const scriptsDir = path.resolve(serverRoot, 'scripts');
const backupScriptPath = path.join(scriptsDir, 'run-postgres-backup.sh');
const restoreScriptPath = path.join(scriptsDir, 'run-postgres-restore.sh');
const backupFilenameRegex = /^door_backup_\d{8}_\d{6}\.sql\.gz$/;

function createHttpError(status, message, expose = true) {
  const error = new Error(message);
  error.status = status;
  error.expose = expose;
  return error;
}

function formatSize(sizeBytes) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return '0 B';
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 ** 2) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  if (sizeBytes < 1024 ** 3) return `${(sizeBytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(sizeBytes / 1024 ** 3).toFixed(1)} GB`;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function safeReadJson(filePath) {
  try {
    return await readJson(filePath);
  } catch {
    return null;
  }
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function resolveBackupDir() {
  return env.BACKUP_DIR;
}

function resolveUploadDir() {
  return env.RESTORE_UPLOAD_DIR;
}

function resolveRestoreDir() {
  return path.join(resolveBackupDir(), 'restores');
}

function resolveLockDir() {
  return env.DB_OPS_LOCK_DIR;
}

async function ensureStorageDirs() {
  await fs.mkdir(resolveBackupDir(), { recursive: true });
  await fs.mkdir(resolveUploadDir(), { recursive: true });
  await fs.mkdir(resolveRestoreDir(), { recursive: true });
}

function buildSpawnEnv() {
  return {
    ...process.env,
    DATABASE_URL: env.DATABASE_URL,
    BACKUP_DIR: resolveBackupDir(),
    BACKUP_RETENTION_COUNT: String(env.BACKUP_RETENTION_COUNT),
    RESTORE_UPLOAD_DIR: resolveUploadDir(),
    DB_OPS_LOCK_DIR: resolveLockDir(),
  };
}

function runScript(scriptPath, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [scriptPath, ...args], {
      cwd: serverRoot,
      env: buildSpawnEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      child.kill('SIGTERM');
      reject(createHttpError(504, '数据库操作超时'));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(createHttpError(500, error.message));
    });

    child.on('close', (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      } else if ((stderr || stdout).includes('Another backup/restore operation is already running')) {
        reject(createHttpError(409, '已有数据库备份或恢复任务在执行中'));
      } else {
        reject(createHttpError(500, stderr.trim() || stdout.trim() || '数据库操作失败'));
      }
    });
  });
}

function normalizeBackupMetadata(metadata) {
  return {
    ...metadata,
    sizeLabel: formatSize(Number(metadata.sizeBytes || 0)),
    downloadUrl: `/api/admin/system/backups/${metadata.filename}/download`,
  };
}

function normalizeRestoreJob(job) {
  return {
    ...job,
    sizeLabel: formatSize(Number(job.sizeBytes || 0)),
  };
}

export async function listBackups() {
  await ensureStorageDirs();
  const entries = await fs.readdir(resolveBackupDir());
  const items = [];

  for (const entry of entries) {
    if (!entry.endsWith('.meta.json')) continue;
    const metadata = await safeReadJson(path.join(resolveBackupDir(), entry));
    if (!metadata?.filename || !backupFilenameRegex.test(metadata.filename)) continue;
    if (!await pathExists(path.join(resolveBackupDir(), metadata.filename))) continue;
    items.push(normalizeBackupMetadata(metadata));
  }

  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return items.slice(0, env.BACKUP_RETENTION_COUNT);
}

export async function createBackup() {
  await ensureStorageDirs();
  const { stdout } = await runScript(backupScriptPath, ['--trigger', 'manual'], env.BACKUP_TIMEOUT_MS);
  const metadataPath = stdout.split('\n').filter(Boolean).at(-1);
  if (!metadataPath) {
    throw createHttpError(500, '备份脚本未返回元数据文件');
  }
  return normalizeBackupMetadata(await readJson(metadataPath));
}

export async function downloadBackup(filename) {
  if (!backupFilenameRegex.test(filename)) {
    throw createHttpError(400, '非法的备份文件名');
  }
  const filePath = path.join(resolveBackupDir(), filename);
  if (!await pathExists(filePath)) {
    throw createHttpError(404, '备份文件不存在');
  }
  return filePath;
}

export async function getBackupStatus() {
  return { running: await pathExists(resolveLockDir()) };
}

async function listRestoreJobFiles() {
  await ensureStorageDirs();
  const entries = await fs.readdir(resolveRestoreDir());
  return entries
    .filter((entry) => entry.endsWith('.json') && entry.startsWith('restore_'))
    .map((entry) => path.join(resolveRestoreDir(), entry));
}

export async function listRestores() {
  const files = await listRestoreJobFiles();
  const items = [];
  for (const filePath of files) {
    const job = await safeReadJson(filePath);
    if (job?.jobId) items.push(normalizeRestoreJob(job));
  }
  items.sort((a, b) => new Date(b.startedAt || b.uploadedAt || 0).getTime() - new Date(a.startedAt || a.uploadedAt || 0).getTime());
  return items.slice(0, 20);
}

export async function getRestoreStatus() {
  const jobs = await listRestores();
  const active = jobs.find((job) => job.status === 'running');
  return {
    running: await pathExists(resolveLockDir()),
    activeJobId: active?.jobId || null,
  };
}

export async function getRestoreDetail(jobId) {
  const filePath = path.join(resolveRestoreDir(), `${jobId}.json`);
  const job = await safeReadJson(filePath);
  if (!job) {
    throw createHttpError(404, '恢复任务不存在');
  }
  return normalizeRestoreJob(job);
}

async function writeRestoreJob(job) {
  await fs.writeFile(path.join(resolveRestoreDir(), `${job.jobId}.json`), `${JSON.stringify(job, null, 2)}\n`, 'utf8');
}

async function updateRestoreJob(jobId, updater) {
  const filePath = path.join(resolveRestoreDir(), `${jobId}.json`);
  const current = await readJson(filePath);
  const next = updater(current);
  await fs.writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

async function readUploadMetadata(uploadId) {
  const filePath = path.join(resolveUploadDir(), `${uploadId}.json`);
  const metadata = await safeReadJson(filePath);
  if (!metadata) {
    throw createHttpError(404, '上传文件不存在或已过期');
  }
  return metadata;
}

export const uploadMiddleware = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureStorageDirs().then(() => cb(null, resolveUploadDir())).catch((error) => cb(error));
    },
    filename: (_req, _file, cb) => {
      cb(null, `${Date.now()}-${randomUUID()}.sql.gz`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!String(file.originalname || '').toLowerCase().endsWith('.sql.gz')) {
      cb(createHttpError(400, '仅支持上传 .sql.gz 备份文件'));
      return;
    }
    cb(null, true);
  },
});

export async function registerUpload(file) {
  if (!file) {
    throw createHttpError(400, '请先选择要上传的备份文件');
  }

  const uploadId = `upload_${Date.now()}`;
  const metadata = {
    uploadId,
    filename: file.originalname,
    originalFilename: file.originalname,
    storedFilename: file.filename,
    uploadedAt: new Date().toISOString(),
    sizeBytes: file.size,
    filePath: file.path,
  };

  await fs.writeFile(path.join(resolveUploadDir(), `${uploadId}.json`), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  return normalizeRestoreJob(metadata);
}

export async function startRestore(uploadId) {
  await ensureStorageDirs();

  if (await pathExists(resolveLockDir())) {
    throw createHttpError(409, '已有数据库备份或恢复任务在执行中');
  }

  const upload = await readUploadMetadata(uploadId);
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const jobId = `restore_${Date.now()}`;
  const targetDatabase = `door_restore_${timestamp}`;
  const resultFile = path.join(resolveRestoreDir(), `${jobId}.result.json`);
  const job = {
    jobId,
    uploadId,
    filename: upload.originalFilename,
    storedFilename: upload.storedFilename,
    uploadedAt: upload.uploadedAt,
    sizeBytes: upload.sizeBytes,
    targetDatabase,
    status: 'running',
    startedAt: now.toISOString(),
    finishedAt: null,
    checks: null,
    error: null,
  };

  await writeRestoreJob(job);

  const child = spawn('bash', [
    restoreScriptPath,
    '--input',
    upload.filePath,
    '--target-db',
    targetDatabase,
    '--result-file',
    resultFile,
  ], {
    cwd: serverRoot,
    env: buildSpawnEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  let settled = false;
  const timer = setTimeout(() => {
    child.kill('SIGTERM');
  }, env.RESTORE_TIMEOUT_MS);

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  child.on('error', async (error) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    await updateRestoreJob(jobId, (current) => ({
      ...current,
      status: 'failed',
      finishedAt: new Date().toISOString(),
      error: error.message,
    }));
  });

  child.on('close', async (code) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    const finishedAt = new Date().toISOString();

    if (code === 0) {
      const result = await safeReadJson(resultFile);
      await updateRestoreJob(jobId, (current) => ({
        ...current,
        status: 'succeeded',
        finishedAt,
        restoredAt: result?.restoredAt || finishedAt,
        checks: result?.checks || null,
      }));
      return;
    }

    await updateRestoreJob(jobId, (current) => ({
      ...current,
      status: 'failed',
      finishedAt,
      error: (stderr || stdout || '恢复任务失败').trim(),
    }));
  });

  return normalizeRestoreJob(job);
}

export function isValidBackupFilename(filename) {
  return backupFilenameRegex.test(filename);
}
