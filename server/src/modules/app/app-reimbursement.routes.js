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
import { requirePermission } from '../../middleware/require-permission.js';
import { requireReimbursementAccess } from '../../middleware/require-reimbursement-access.js';
import invoiceRoutes from '../reimbursement/invoice.routes.js';

const router = express.Router();

router.use(requirePermission({ surface: 'app', capability: { scope: 'self', name: 'operate' } }));

// ==================== 发票可视化处理路由 ====================
router.use('/invoices', invoiceRoutes);

// ==================== OCR 识别 ====================

router.post('/ocr/invoice', uploadMiddleware.single('file'), requireReimbursementAccess({ resourceType: 'project', source: { body: 'projectId' }, optional: true }), ocrInvoice);
router.post('/ocr/payment', uploadMiddleware.single('file'), requireReimbursementAccess({ resourceType: 'project', source: { body: 'projectId' }, optional: true }), ocrPayment);

// ==================== 项目管理 ====================

// 注意：更具体的路由必须放在 :id 参数路由之前
router.post('/projects', createProject);
router.get('/projects', getProjects);

// 处理状态统计 - 必须在 /projects/:id 之前
router.get('/projects/:id/stats', requireReimbursementAccess({ resourceType: 'project' }), getProcessingStats);
router.get('/projects/:id/jobs', requireReimbursementAccess({ resourceType: 'project' }), getProcessingJobs);
router.get('/projects/:id/duplicates', requireReimbursementAccess({ resourceType: 'project' }), getProjectDuplicates);
router.get('/projects/:id/errors', requireReimbursementAccess({ resourceType: 'project' }), getProjectErrors);
router.get('/projects/:id/pending-matches', requireReimbursementAccess({ resourceType: 'project' }), getProjectPendingMatches);

// 项目 CRUD
router.get('/projects/:id', requireReimbursementAccess({ resourceType: 'project' }), getProject);
router.put('/projects/:id', requireReimbursementAccess({ resourceType: 'project' }), updateProject);
router.delete('/projects/:id', requireReimbursementAccess({ resourceType: 'project' }), deleteProject);

// ==================== 记录管理 ====================

router.post('/projects/:id/records', requireReimbursementAccess({ resourceType: 'project' }), addRecord);
router.get('/projects/:id/records', requireReimbursementAccess({ resourceType: 'project' }), getRecords);
router.delete('/projects/:id/records', requireReimbursementAccess({ resourceType: 'project' }), clearRecords);
router.put('/records/:id', requireReimbursementAccess({ resourceType: 'record' }), updateRecord);
router.delete('/records/:id', requireReimbursementAccess({ resourceType: 'record' }), deleteRecord);

// 批量操作
router.post('/records/batch-update', requireReimbursementAccess({ resourceType: 'record', source: 'body' }), batchUpdateRecords);
router.post('/records/batch-delete', requireReimbursementAccess({ resourceType: 'record', source: 'body' }), batchDeleteRecords);

// ==================== 用户设置 ====================

router.get('/settings', getSettings);
router.put('/settings', updateSettings);

// ==================== 导出功能 ====================

router.post('/export', requireReimbursementAccess({ resourceType: 'project', source: { body: 'projectId' } }), exportExcel);

// ==================== 待匹配项管理 ====================

router.post('/pending-matches/:id/resolve', requireReimbursementAccess({ resourceType: 'pendingMatch' }), resolvePendingMatch);
router.post('/pending-matches/:id/reject', requireReimbursementAccess({ resourceType: 'pendingMatch' }), rejectPendingMatch);

// ==================== 预览工作区 ====================

router.post('/projects/:id/preview/import', requireReimbursementAccess({ resourceType: 'project' }), uploadMiddleware.array('files', 50), importToPreview);
router.get('/projects/:id/preview/list', requireReimbursementAccess({ resourceType: 'project' }), getPreviewList);
router.get('/projects/:id/preview/stats', requireReimbursementAccess({ resourceType: 'project' }), getPreviewStats);
router.post('/projects/:id/preview/:fileId/recognize', requireReimbursementAccess({ resourceType: 'project' }), recognizeFromPreview);
router.delete('/projects/:id/preview/:fileId', requireReimbursementAccess({ resourceType: 'project' }), discardPreviewFile);
router.get('/projects/:id/export-with-images', requireReimbursementAccess({ resourceType: 'project' }), exportWithImages);

// ==================== 附件管理 ====================

router.delete('/attachments/:id', requireReimbursementAccess({ resourceType: 'attachment' }), deleteAttachment);
router.put('/attachments/:id/replace', requireReimbursementAccess({ resourceType: 'attachment' }), uploadMiddleware.single('file'), replaceAttachment);
router.get('/attachments/:id/thumbnail', requireReimbursementAccess({ resourceType: 'attachment' }), getAttachmentThumbnail);
router.get('/attachments/:id/image', requireReimbursementAccess({ resourceType: 'attachment' }), getAttachmentImage);

export default router;
