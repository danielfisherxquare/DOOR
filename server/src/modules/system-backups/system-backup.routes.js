import { Router } from 'express';
import { authorize } from '../../middleware/authorize.js';
import { operationLog } from '../../middleware/operation-log.js';
import {
  createBackup,
  downloadBackup,
  downloadEnvFile,
  getBackupStatus,
  getRestoreDetail,
  getRestoreStatus,
  listBackups,
  listRestores,
  registerEnvUpload,
  registerUpload,
  startRestore,
  updateUploadMetadata,
  uploadMiddleware,
} from './system-backup.service.js';

const router = Router();

router.use(authorize({
    action: 'assume',
    resource: { kind: 'role', roles: ['super_admin'] },
}));

router.get('/backups', async (_req, res, next) => {
  try {
    const items = await listBackups();
    res.json({ success: true, data: { items } });
  } catch (error) {
    next(error);
  }
});

router.post('/backups', operationLog({ module: 'system', businessType: 'EXPORT', titleFactory: () => '创建系统备份' }), async (_req, res, next) => {
  try {
    const backup = await createBackup();
    res.status(201).json({ success: true, data: backup });
  } catch (error) {
    next(error);
  }
});

router.get('/backups/status', async (_req, res, next) => {
  try {
    const status = await getBackupStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    next(error);
  }
});

router.get('/backups/:filename/download', async (req, res, next) => {
  try {
    const filePath = await downloadBackup(req.params.filename);
    res.download(filePath, req.params.filename);
  } catch (error) {
    next(error);
  }
});

router.get('/backups/:filename/download-env', async (req, res, next) => {
  try {
    const filePath = await downloadEnvFile(req.params.filename);
    res.download(filePath, req.params.filename);
  } catch (error) {
    next(error);
  }
});

router.post('/restores/upload', uploadMiddleware.fields([{ name: 'file', maxCount: 1 }, { name: 'envFile', maxCount: 1 }]), async (req, res, next) => {
  try {
    const sqlFile = req.files?.file?.[0];
    const envFile = req.files?.envFile?.[0];
    const upload = await registerUpload(sqlFile);
    let envUpload = null;
    if (envFile) {
      envUpload = await registerEnvUpload(envFile);
      // Persist env file path into the upload metadata so startRestore can find it
      await updateUploadMetadata(upload.uploadId, { envFilePath: envUpload.filePath });
    }
    res.status(201).json({ success: true, data: { ...upload, envUpload } });
  } catch (error) {
    next(error);
  }
});

router.post('/restores', operationLog({ module: 'system', businessType: 'IMPORT', titleFactory: (req) => '启动系统恢复: uploadId=' + (req.body?.uploadId || '') }), async (req, res, next) => {
  try {
    const { uploadId } = req.body || {};
    if (!uploadId) {
      return res.status(400).json({ success: false, message: '缺少 uploadId' });
    }
    const job = await startRestore(uploadId);
    res.status(202).json({ success: true, data: job });
  } catch (error) {
    next(error);
  }
});

router.get('/restores', async (_req, res, next) => {
  try {
    const items = await listRestores();
    res.json({ success: true, data: { items } });
  } catch (error) {
    next(error);
  }
});

router.get('/restores/status', async (_req, res, next) => {
  try {
    const status = await getRestoreStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    next(error);
  }
});

router.get('/restores/:jobId', async (req, res, next) => {
  try {
    const job = await getRestoreDetail(req.params.jobId);
    res.json({ success: true, data: job });
  } catch (error) {
    next(error);
  }
});

// ── 加密密钥健康状态 ──────────────────────────────────────
router.get('/encryption-status', async (_req, res, next) => {
  try {
    const { checkKeyHealth, getCurrentKeyFingerprints } = await import('../../utils/key-guard.js');
    const knex = (await import('../../db/knex.js')).default;

    const fingerprints = getCurrentKeyFingerprints();
    const health = await checkKeyHealth(knex);

    // 查找可用的 .env 备份文件
    const allBackups = await listBackups();
    const envBackups = allBackups
      .filter((b) => b.envFile)
      .slice(0, 5)
      .map((b) => ({
        filename: b.envFile,
        backupDate: b.createdAt,
        trigger: b.trigger,
      }));

    // 读取数据库中存储的指纹（如有）
    let storedFingerprint = null;
    try {
      const row = await knex('system_settings').where('key', 'pii_key_fingerprint').first();
      if (row?.value) storedFingerprint = JSON.parse(row.value);
    } catch { /* table may not exist yet */ }

    res.json({
      success: true,
      data: {
        healthy: health.healthy,
        reason: health.reason || null,
        current: {
          version: fingerprints.version,
          encryptionKeyFingerprint: fingerprints.encryptionKeyFingerprint,
          hmacKeyFingerprint: fingerprints.hmacKeyFingerprint,
          isSet: fingerprints.encryptionKeyFingerprint !== 'UNSET',
        },
        stored: storedFingerprint ? {
          version: storedFingerprint.version,
          encryptionKeyFingerprint: storedFingerprint.encryptionKeyFingerprint,
          hmacKeyFingerprint: storedFingerprint.hmacKeyFingerprint,
        } : null,
        envBackups,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
