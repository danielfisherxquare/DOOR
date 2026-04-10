import express from 'express';
import {
    ocrInvoice,
    ocrPayment,
    uploadMiddleware,
    createProject,
    getProjects,
    getProject,
    updateProject,
    deleteProject,
    addRecord,
    getRecords,
    updateRecord,
    deleteRecord,
    batchUpdateRecords,
    batchDeleteRecords,
    clearRecords,
    getSettings,
    updateSettings,
    exportExcel,
    // 新增：处理状态相关
    getProcessingStats,
    getProcessingJobs,
    getProjectDuplicates,
    getProjectErrors,
    // 新增：待匹配项相关
    getProjectPendingMatches,
    resolvePendingMatch,
    rejectPendingMatch,
    // 新增：附件管理
    deleteAttachment,
    replaceAttachment,
    getAttachmentThumbnail,
    getAttachmentImage,
} from '../reimbursement/reimbursement.controller.js';
import {
    importToPreview,
    getPreviewList,
    getPreviewStats,
    recognizeFromPreview,
    discardPreviewFile,
    exportWithImages,
} from '../reimbursement/preview.controller.js';
import { requireCapability } from '../../middleware/require-capability.js';
import { requireSurfaceAccess } from '../../middleware/require-surface-access.js';
import {
    requireReimbursementAttachmentAccess,
    requireReimbursementBatchRecordAccess,
    requireReimbursementPendingMatchAccess,
    requireReimbursementProjectAccess,
    requireReimbursementRecordAccess,
} from '../../middleware/require-reimbursement-access.js';
import invoiceRoutes from '../reimbursement/invoice.routes.js';

const router = express.Router();

router.use(requireSurfaceAccess('app'));
router.use(requireCapability('self', 'operate'));

// ==================== 发票可视化处理路由 ====================
router.use('/invoices', invoiceRoutes);

// ==================== OCR 识别 ====================

router.post('/ocr/invoice', uploadMiddleware.single('file'), requireReimbursementProjectAccess({ body: 'projectId' }, { optional: true }), ocrInvoice);
router.post('/ocr/payment', uploadMiddleware.single('file'), requireReimbursementProjectAccess({ body: 'projectId' }, { optional: true }), ocrPayment);

// ==================== 项目管理 ====================

// 注意：更具体的路由必须放在 :id 参数路由之前
router.post('/projects', createProject);
router.get('/projects', getProjects);

// 处理状态统计 - 必须在 /projects/:id 之前
router.get('/projects/:id/stats', requireReimbursementProjectAccess(), getProcessingStats);
router.get('/projects/:id/jobs', requireReimbursementProjectAccess(), getProcessingJobs);
router.get('/projects/:id/duplicates', requireReimbursementProjectAccess(), getProjectDuplicates);
router.get('/projects/:id/errors', requireReimbursementProjectAccess(), getProjectErrors);
router.get('/projects/:id/pending-matches', requireReimbursementProjectAccess(), getProjectPendingMatches);

// 项目 CRUD
router.get('/projects/:id', requireReimbursementProjectAccess(), getProject);
router.put('/projects/:id', requireReimbursementProjectAccess(), updateProject);
router.delete('/projects/:id', requireReimbursementProjectAccess(), deleteProject);

// ==================== 记录管理 ====================

router.post('/projects/:id/records', requireReimbursementProjectAccess(), addRecord);
router.get('/projects/:id/records', requireReimbursementProjectAccess(), getRecords);
router.delete('/projects/:id/records', requireReimbursementProjectAccess(), clearRecords);
router.put('/records/:id', requireReimbursementRecordAccess(), updateRecord);
router.delete('/records/:id', requireReimbursementRecordAccess(), deleteRecord);

// 批量操作
router.post('/records/batch-update', requireReimbursementBatchRecordAccess(), batchUpdateRecords);
router.post('/records/batch-delete', requireReimbursementBatchRecordAccess(), batchDeleteRecords);

// ==================== 用户设置 ====================

router.get('/settings', getSettings);
router.put('/settings', updateSettings);

// ==================== 导出功能 ====================

router.post('/export', requireReimbursementProjectAccess({ body: 'projectId' }), exportExcel);

// ==================== 待匹配项管理 ====================

router.post('/pending-matches/:id/resolve', requireReimbursementPendingMatchAccess(), resolvePendingMatch);
router.post('/pending-matches/:id/reject', requireReimbursementPendingMatchAccess(), rejectPendingMatch);

// ==================== 预览工作区 ====================

router.post('/projects/:id/preview/import', requireReimbursementProjectAccess(), uploadMiddleware.array('files', 50), importToPreview);
router.get('/projects/:id/preview/list', requireReimbursementProjectAccess(), getPreviewList);
router.get('/projects/:id/preview/stats', requireReimbursementProjectAccess(), getPreviewStats);
router.post('/projects/:id/preview/:fileId/recognize', requireReimbursementProjectAccess(), recognizeFromPreview);
router.delete('/projects/:id/preview/:fileId', requireReimbursementProjectAccess(), discardPreviewFile);
router.get('/projects/:id/export-with-images', requireReimbursementProjectAccess(), exportWithImages);

// ==================== 附件管理 ====================

router.delete('/attachments/:id', requireReimbursementAttachmentAccess(), deleteAttachment);
router.put('/attachments/:id/replace', requireReimbursementAttachmentAccess(), uploadMiddleware.single('file'), replaceAttachment);
router.get('/attachments/:id/thumbnail', requireReimbursementAttachmentAccess(), getAttachmentThumbnail);
router.get('/attachments/:id/image', requireReimbursementAttachmentAccess(), getAttachmentImage);

export default router;
