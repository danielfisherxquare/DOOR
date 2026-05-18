/**
 * Reimbursement Routes
 * 发票报销API路由 - 完整版
 */

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
  getOrgProjects,
  getAllProjects,
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
} from './reimbursement.controller.js';
import {
  importToPreview,
  getPreviewList,
  getPreviewStats,
  recognizeFromPreview,
  discardPreviewFile,
  exportWithImages,
} from './preview.controller.js';
import { requireReimbursementAccess } from '../../middleware/require-reimbursement-access.js';

const router = express.Router();

// ==================== OCR识别 ====================

// POST /api/reimbursement/ocr/invoice - 发票OCR识别
router.post('/ocr/invoice', uploadMiddleware.single('file'), ocrInvoice);

// POST /api/reimbursement/ocr/payment - 付款凭证OCR识别
router.post('/ocr/payment', uploadMiddleware.single('file'), ocrPayment);

// ==================== 项目管理 ====================

// POST /api/reimbursement/projects - 创建项目
router.post('/projects', createProject);

// GET /api/reimbursement/projects - 获取项目列表
router.get('/projects', getProjects);

// GET /api/reimbursement/projects/:id - 获取项目详情
router.get('/projects/:id', getProject);

// PUT /api/reimbursement/projects/:id - 更新项目
router.put('/projects/:id', updateProject);

// DELETE /api/reimbursement/projects/:id - 删除项目
router.delete('/projects/:id', deleteProject);

// ==================== 记录管理 ====================

// POST /api/reimbursement/projects/:id/records - 添加记录
router.post('/projects/:id/records', addRecord);

// GET /api/reimbursement/projects/:id/records - 获取记录列表
router.get('/projects/:id/records', getRecords);

// DELETE /api/reimbursement/projects/:id/records - 清空项目记录
router.delete('/projects/:id/records', clearRecords);

// PUT /api/reimbursement/records/:id - 更新记录
router.put('/records/:id', updateRecord);

// DELETE /api/reimbursement/records/:id - 删除记录
router.delete('/records/:id', deleteRecord);

// POST /api/reimbursement/records/batch-update - 批量更新记录
router.post('/records/batch-update', batchUpdateRecords);

// POST /api/reimbursement/records/batch-delete - 批量删除记录
router.post('/records/batch-delete', batchDeleteRecords);

// ==================== 用户设置 ====================

// GET /api/reimbursement/settings - 获取用户设置
router.get('/settings', getSettings);

// PUT /api/reimbursement/settings - 更新用户设置
router.put('/settings', updateSettings);

// ==================== 导出功能 ====================

// POST /api/reimbursement/export - 导出Excel
router.post('/export', exportExcel);

// ==================== 管理员功能 ====================

// GET /api/reimbursement/admin/org/:orgId - 获取机构所有报销项目
router.get('/admin/org/:orgId', requireReimbursementAccess({ accessLevel: 'org_admin' }), getOrgProjects);

// GET /api/reimbursement/admin/all - 获取全部报销项目（超管）
router.get('/admin/all', requireReimbursementAccess({ accessLevel: 'super_admin' }), getAllProjects);

// ==================== 处理状态统计 ====================

// GET /api/reimbursement/projects/:id/stats - 获取处理统计
router.get('/projects/:id/stats', getProcessingStats);

// GET /api/reimbursement/projects/:id/jobs - 获取处理记录列表
router.get('/projects/:id/jobs', getProcessingJobs);

// GET /api/reimbursement/projects/:id/duplicates - 获取重复文件列表
router.get('/projects/:id/duplicates', getProjectDuplicates);

// GET /api/reimbursement/projects/:id/errors - 获取错误文件列表
router.get('/projects/:id/errors', getProjectErrors);

// ==================== 待匹配项管理 ====================

// GET /api/reimbursement/projects/:id/pending-matches - 获取待匹配项
router.get('/projects/:id/pending-matches', getProjectPendingMatches);

// POST /api/reimbursement/pending-matches/:id/resolve - 解决待匹配
router.post('/pending-matches/:id/resolve', resolvePendingMatch);

// POST /api/reimbursement/pending-matches/:id/reject - 拒绝待匹配
router.post('/pending-matches/:id/reject', rejectPendingMatch);

// ==================== 预览工作区 ====================

// POST /api/reimbursement/projects/:id/preview/import - 导入文件到预览区
router.post('/projects/:id/preview/import', uploadMiddleware.array('files', 50), importToPreview);

// GET /api/reimbursement/projects/:id/preview/list - 获取预览文件列表
router.get('/projects/:id/preview/list', getPreviewList);

// GET /api/reimbursement/projects/:id/preview/stats - 获取预览统计
router.get('/projects/:id/preview/stats', getPreviewStats);

// POST /api/reimbursement/projects/:id/preview/:fileId/recognize - 从预览区识别文件
router.post('/projects/:id/preview/:fileId/recognize', recognizeFromPreview);

// DELETE /api/reimbursement/projects/:id/preview/:fileId - 从预览区移除文件
router.delete('/projects/:id/preview/:fileId', discardPreviewFile);

// GET /api/reimbursement/projects/:id/export-with-images - 导出Excel和图片ZIP
router.get('/projects/:id/export-with-images', exportWithImages);

// ==================== 附件管理 ====================

// DELETE /api/reimbursement/attachments/:id - 删除附件
router.delete('/attachments/:id', deleteAttachment);

// PUT /api/reimbursement/attachments/:id/replace - 替换附件图片
router.put('/attachments/:id/replace', uploadMiddleware.single('file'), replaceAttachment);

// GET /api/reimbursement/attachments/:id/thumbnail - 获取附件缩略图
router.get('/attachments/:id/thumbnail', getAttachmentThumbnail);

// GET /api/reimbursement/attachments/:id/image - 获取附件图片（大图预览）
router.get('/attachments/:id/image', getAttachmentImage);

export default router;