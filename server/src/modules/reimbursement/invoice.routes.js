/**
 * Invoice Routes
 * 发票可视化处理 API 路由
 */

import express from 'express';
import {
    getProcessingQueue,
    getInvoiceStats,
    getInvoiceDetail,
    getInvoiceImage,
    updateInvoiceOCR,
    reprocessInvoice,
    deleteInvoice,
    uploadAndProcessInvoice,
    uploadAndProcessPayment,
    uploadMiddleware,
} from './invoice.controller.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { requireReimbursementAccess } from '../../middleware/require-reimbursement-access.js';

const router = express.Router();

// 应用认证和访问控制中间件
router.use(requirePermission({ surface: 'app', capability: { scope: 'self', name: 'operate' } }));

// ==================== 处理队列和统计 ====================

// GET /api/reimbursement/invoices/processing-queue/:projectId - 获取处理队列
router.get('/processing-queue/:projectId', requireReimbursementAccess({ resourceType: 'project', source: { param: 'projectId' } }), getProcessingQueue);

// GET /api/reimbursement/invoices/stats/:projectId - 获取处理统计
router.get('/stats/:projectId', requireReimbursementAccess({ resourceType: 'project', source: { param: 'projectId' } }), getInvoiceStats);

// ==================== 发票管理 ====================

// GET /api/reimbursement/invoices/:projectId/:id - 获取发票详情
router.get('/:projectId/:id', requireReimbursementAccess({ resourceType: 'project', source: { param: 'projectId' } }), getInvoiceDetail);

// GET /api/reimbursement/invoices/:projectId/:id/image - 获取发票图片
router.get('/:projectId/:id/image', requireReimbursementAccess({ resourceType: 'project', source: { param: 'projectId' } }), getInvoiceImage);

// PUT /api/reimbursement/invoices/:projectId/:id/ocr - 更新 OCR 结果
router.put('/:projectId/:id/ocr', requireReimbursementAccess({ resourceType: 'project', source: { param: 'projectId' } }), updateInvoiceOCR);

// POST /api/reimbursement/invoices/:projectId/:id/reprocess - 重新处理
router.post('/:projectId/:id/reprocess', requireReimbursementAccess({ resourceType: 'project', source: { param: 'projectId' } }), reprocessInvoice);

// DELETE /api/reimbursement/invoices/:projectId/:id - 删除发票
router.delete('/:projectId/:id', requireReimbursementAccess({ resourceType: 'project', source: { param: 'projectId' } }), deleteInvoice);

// ==================== 上传处理 ====================

// POST /api/reimbursement/invoices/upload/:projectId - 上传并处理发票
router.post('/upload/:projectId', requireReimbursementAccess({ resourceType: 'project', source: { param: 'projectId' } }), uploadMiddleware.single('file'), uploadAndProcessInvoice);

// POST /api/reimbursement/invoices/upload-payment/:projectId - 上传并处理付款凭证
router.post('/upload-payment/:projectId', requireReimbursementAccess({ resourceType: 'project', source: { param: 'projectId' } }), uploadMiddleware.single('file'), uploadAndProcessPayment);

export default router;
