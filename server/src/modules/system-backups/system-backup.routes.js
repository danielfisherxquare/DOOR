import { Router } from 'express';
import { authorize } from '../../middleware/authorize.js';
import { operationLog } from '../../middleware/operation-log.js';
import {
  createBackup,
  downloadBackup,
  downloadEnvFile,
  getBackupStatus,
  getEncryptionStatus,
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
import { parseRestoreJobId, parseStartRestorePayload } from './system-backup.schema.js';

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
    const { uploadId } = parseStartRestorePayload(req.body);
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
    const job = await getRestoreDetail(parseRestoreJobId(req.params.jobId));
    res.json({ success: true, data: job });
  } catch (error) {
    next(error);
  }
});

// ── 加密密钥健康状态 ──────────────────────────────────────
router.get('/encryption-status', async (_req, res, next) => {
  try {
    res.json({
      success: true,
      data: await getEncryptionStatus(),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
