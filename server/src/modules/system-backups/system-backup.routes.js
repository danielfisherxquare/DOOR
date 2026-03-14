import { Router } from 'express';
import { requireRoles } from '../../middleware/require-roles.js';
import {
  createBackup,
  downloadBackup,
  getBackupStatus,
  getRestoreDetail,
  getRestoreStatus,
  listBackups,
  listRestores,
  registerUpload,
  startRestore,
  uploadMiddleware,
} from './system-backup.service.js';

const router = Router();

router.use(requireRoles('super_admin'));

router.get('/backups', async (_req, res, next) => {
  try {
    const items = await listBackups();
    res.json({ success: true, data: { items } });
  } catch (error) {
    next(error);
  }
});

router.post('/backups', async (_req, res, next) => {
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

router.post('/restores/upload', uploadMiddleware.single('file'), async (req, res, next) => {
  try {
    const upload = await registerUpload(req.file);
    res.status(201).json({ success: true, data: upload });
  } catch (error) {
    next(error);
  }
});

router.post('/restores', async (req, res, next) => {
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

export default router;
