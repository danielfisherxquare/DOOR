/**
 * Reimbursement Controller
 * 发票报销控制器 - 完整CRUD操作
 */

import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { processInvoice, processPayment } from './ocr.service.js';
import * as service from './reimbursement.service.js';
import { generateExportWorkbook } from './preview.service.js';
import knex from '../../db/knex.js';
import { env } from '../../config/env.js';
import { attachOcrReview } from './ocr.review.js';

// 配置文件上传
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    // 修复文件名编码问题：将 Latin-1 编码转换回 UTF-8
    // 这解决了中文文件名显示为乱码的问题
    if (file.originalname) {
      try {
        file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf-8');
      } catch (error) {
        console.error('文件名编码转换失败:', error);
      }
    }
    cb(null, true);
  },
});

const DEFAULT_LLM_CONFIG = {
  provider: 'qwen',
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: '',
  modelName: 'qwen3.5-plus',
};

function getServerLlmConfig() {
  return {
    provider: env.REIMBURSEMENT_OCR_PROVIDER || DEFAULT_LLM_CONFIG.provider,
    baseUrl: env.REIMBURSEMENT_OCR_BASE_URL || DEFAULT_LLM_CONFIG.baseUrl,
    apiKey: env.REIMBURSEMENT_OCR_API_KEY || '',
    modelName: env.REIMBURSEMENT_OCR_MODEL_NAME || DEFAULT_LLM_CONFIG.modelName,
  };
}

function buildPaymentReviewRecordData(paymentData = {}) {
  const rawExpense = paymentData.amount ?? paymentData.expense ?? null;
  return {
    payment_date: paymentData.date || paymentData.payment_date || null,
    category: paymentData.category || null,
    sub_category: paymentData.subCategory || paymentData.sub_category || null,
    expense: rawExpense != null ? Math.abs(Number(rawExpense) || 0) || null : null,
    company: paymentData.payee || paymentData.targetName || paymentData.company || null,
  };
}

function mergeNonEmptyConfig(...configs) {
  const merged = {};

  for (const config of configs) {
    if (!config || typeof config !== 'object') continue;

    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) {
          merged[key] = trimmed;
        }
        continue;
      }

      if (value != null) {
        merged[key] = value;
      }
    }
  }

  return merged;
}

function getServerOcrOverrideConfig() {
  const serverConfig = getServerLlmConfig();

  if (!serverConfig.apiKey) {
    return null;
  }

  return serverConfig;
}

function readRequestConfig(req) {
  const directConfig = {
    provider: req.body?.provider,
    baseUrl: req.body?.baseUrl,
    apiKey: req.body?.apiKey,
    modelName: req.body?.modelName,
  };

  if (!req.body?.config) {
    return directConfig;
  }

  try {
    const parsed = typeof req.body.config === 'string' ? JSON.parse(req.body.config) : req.body.config;
    return { ...directConfig, ...(parsed || {}) };
  } catch {
    return directConfig;
  }
}

export async function resolveOcrConfig(req) {
  const userId = req.authContext?.userId;
  const settings = userId ? await service.getUserSettings(userId) : null;
  const requestConfig = readRequestConfig(req);

  return mergeNonEmptyConfig(
    DEFAULT_LLM_CONFIG,
    settings?.llm_config,
    requestConfig,
    getServerOcrOverrideConfig(),
  );
}

function createMissingOcrConfigError() {
  const error = new Error('缺少 OCR 模型配置，请在报销助手中填写模型配置，或由服务端配置 REIMBURSEMENT_OCR_* 环境变量');
  error.status = 400;
  error.expose = true;
  return error;
}

export function normalizeOcrError(error, label) {
  const upstreamStatus = error?.response?.status;
  if (!upstreamStatus) {
    return error;
  }

  const upstreamData = error.response?.data;
  const rawDetail = typeof upstreamData === 'string'
    ? upstreamData
    : upstreamData?.message || upstreamData?.error?.message || upstreamData?.error || '';
  const detail = typeof rawDetail === 'string' ? rawDetail : JSON.stringify(rawDetail);
  const message = upstreamStatus === 401
    ? `${label}上游模型鉴权失败，请检查 API Key、Base URL 与模型配置`
    : `${label}上游模型调用失败 (${upstreamStatus})`;

  const normalized = new Error(detail ? `${message}: ${String(detail).slice(0, 240)}` : message);
  normalized.status = 502;
  normalized.expose = true;
  return normalized;
}

function toSettingsResponse(settings) {
  const userConfig = settings?.llm_config || {};
  const serverConfig = getServerLlmConfig();
  const hasServerLlmConfig = Boolean(serverConfig.apiKey && serverConfig.baseUrl);

  // 用户在前端配置的 apiKey 优先展示，不再被服务端配置强制覆盖
  // 这样用户可以自行选择使用服务端默认模型或自定义模型（如硅基流动）
  const hasUserApiKey = Boolean(userConfig.apiKey?.trim());
  const mergedConfig = {
    ...DEFAULT_LLM_CONFIG,
    provider: hasUserApiKey ? (userConfig.provider || DEFAULT_LLM_CONFIG.provider) : (hasServerLlmConfig ? serverConfig.provider : (userConfig.provider || DEFAULT_LLM_CONFIG.provider)),
    baseUrl: hasUserApiKey ? (userConfig.baseUrl || DEFAULT_LLM_CONFIG.baseUrl) : (hasServerLlmConfig ? serverConfig.baseUrl : (userConfig.baseUrl || serverConfig.baseUrl || DEFAULT_LLM_CONFIG.baseUrl)),
    apiKey: hasUserApiKey ? userConfig.apiKey : (hasServerLlmConfig ? '' : (userConfig.apiKey || '')),
    modelName: hasUserApiKey ? (userConfig.modelName || DEFAULT_LLM_CONFIG.modelName) : (hasServerLlmConfig ? serverConfig.modelName : (userConfig.modelName || serverConfig.modelName || DEFAULT_LLM_CONFIG.modelName)),
  };

  return {
    defaultReporter: settings?.default_reporter || '',
    watchDirectoryPath: settings?.watch_directory_path || '',
    llmConfig: mergedConfig,
    hasServerLlmConfig,
  };
}

// ==================== OCR识别 ====================

/**
 * POST /api/reimbursement/ocr/invoice
 * 发票OCR识别
 * 集成处理记录追踪：去重检查、状态更新
 */
export async function ocrInvoice(req, res, next) {
  let processingRecord = null;

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '未上传文件' });
    }

    const userId = req.authContext?.userId;
    const projectId = req.body?.projectId;

    // 计算文件哈希用于去重
    const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

    // 如果提供了projectId，记录处理状态
    if (projectId) {
      const { skipped, record, existing } = await service.startProcessingFile(
        projectId,
        userId,
        {
          fileName: req.file.originalname,
          fileType: 'invoice',
          fileHash,
        }
      );

      if (skipped) {
        return res.json({
          success: true,
          skipped: true,
          message: '文件已处理过，跳过重复处理',
        });
      }

      processingRecord = record;
    }

    const config = await resolveOcrConfig(req);
    if (!config.baseUrl || !config.apiKey) {
      throw createMissingOcrConfigError();
    }

    const result = await processInvoice({
      fileBuffer: req.file.buffer,
      mimeType: req.file.mimetype || 'application/octet-stream',
      filename: req.file.originalname,
      config,
    });
    const reviewedOcrMeta = attachOcrReview(result.meta, 'invoice', service.buildInvoiceRecordData(result.data));
    const reviewedResult = { ...result, meta: reviewedOcrMeta };

    // 更新处理状态为完成
    if (processingRecord) {
      await service.updateProcessingStatus(processingRecord.id, 'completed', {
        ocrResult: result.data,
        ocrMeta: reviewedOcrMeta,
      });
    }

    res.json(reviewedResult);
  } catch (error) {
    console.error('OCR Invoice Error:', error);

    // 更新处理状态为错误
    if (processingRecord) {
      await service.updateProcessingStatus(processingRecord.id, 'error', {
        errorMessage: error.message,
      });
    }

    next(normalizeOcrError(error, '发票识别'));
  }
}

/**
 * POST /api/reimbursement/ocr/payment
 * 付款凭证OCR识别
 * 集成处理记录追踪、自动匹配逻辑
 */
export async function ocrPayment(req, res, next) {
  let processingRecord = null;

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '未上传文件' });
    }

    const userId = req.authContext?.userId;
    const projectId = req.body?.projectId;

    // 计算文件哈希用于去重
    const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

    // 如果提供了projectId，记录处理状态
    if (projectId) {
      const { skipped, record, existing } = await service.startProcessingFile(
        projectId,
        userId,
        {
          fileName: req.file.originalname,
          fileType: 'payment',
          fileHash,
        }
      );

      if (skipped) {
        return res.json({
          success: true,
          skipped: true,
          message: '文件已处理过，跳过重复处理',
        });
      }

      processingRecord = record;
    }

    const config = await resolveOcrConfig(req);
    if (!config.baseUrl || !config.apiKey) {
      throw createMissingOcrConfigError();
    }

    const result = await processPayment({
      fileBuffer: req.file.buffer,
      mimeType: req.file.mimetype || 'application/octet-stream',
      filename: req.file.originalname,
      config,
    });
    const reviewedOcrMeta = attachOcrReview(result.meta, 'payment', buildPaymentReviewRecordData(result.data));
    const reviewedResult = { ...result, meta: reviewedOcrMeta };

    // 更新处理状态为完成
    if (processingRecord) {
      await service.updateProcessingStatus(processingRecord.id, 'completed', {
        ocrResult: result.data,
        ocrMeta: reviewedOcrMeta,
      });
    }

    if (processingRecord && result.success && result.data) {
      await service.persistProcessedPaymentUpload(projectId, processingRecord.id, {
        fileBuffer: req.file.buffer,
        mimeType: req.file.mimetype || 'application/octet-stream',
        originalName: req.file.originalname,
      });
    }

    // 如果识别成功且有projectId，尝试自动匹配或直接落库
    let matchResult = null;
    if (result.success && result.data && projectId) {
      const amount = result.data.amount;
      const candidates = await service.findMatchingRecords(projectId, amount);

      if (candidates.length === 1) {
        await service.attachProcessedPayment(candidates[0].id, {
          processedFileId: processingRecord?.id,
          fileName: req.file.originalname,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype || 'application/octet-stream',
          fileSize: req.file.size,
        });
        await service.mergePaymentOcrMetaIntoRecord(candidates[0].id, reviewedOcrMeta);
        // 自动匹配成功
        matchResult = {
          autoMatched: true,
          recordId: candidates[0].id,
          record: candidates[0],
        };
      } else if (candidates.length > 1) {
        // 多个候选，创建待匹配项
        const pendingMatch = await service.createPendingMatch(projectId, userId, {
          paymentData: {
            ...result.data,
            ocrMeta: reviewedOcrMeta,
            processedFileId: processingRecord?.id,
            fileName: req.file.originalname,
            originalName: req.file.originalname,
            mimeType: req.file.mimetype || 'application/octet-stream',
            fileSize: req.file.size,
          },
          candidateIds: candidates.map((c) => c.id),
        });
        matchResult = {
          pendingMatch: true,
          matchId: pendingMatch.id,
          candidateCount: candidates.length,
        };
      } else {
        const record = await service.createStandalonePaymentRecord(projectId, userId, result.data, {
          ocrMeta: reviewedOcrMeta,
        });
        await service.attachProcessedPayment(record.id, {
          processedFileId: processingRecord?.id,
          fileName: req.file.originalname,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype || 'application/octet-stream',
          fileSize: req.file.size,
        });
        matchResult = {
          createdRecord: true,
          recordId: record.id,
          record,
        };
      }
    }

    res.json({
      ...reviewedResult,
      matchResult,
      recordId: matchResult?.recordId || null,
    });
  } catch (error) {
    console.error('OCR Payment Error:', error);

    // 更新处理状态为错误
    if (processingRecord) {
      await service.updateProcessingStatus(processingRecord.id, 'error', {
        errorMessage: error.message,
      });
    }

    next(normalizeOcrError(error, '付款凭证识别'));
  }
}

// ==================== 项目管理 ====================

/**
 * POST /api/reimbursement/projects
 * 创建项目
 */
export async function createProject(req, res, next) {
  try {
    const { name, description, shortName } = req.body;
    const userId = req.authContext.userId;
    const orgId = req.authContext.orgId;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: '项目名称不能为空' });
    }

    const project = await service.createProject(userId, orgId, {
      name: name.trim(),
      description,
      shortName: shortName?.trim() || null,
    });

    res.status(201).json({ project });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/reimbursement/projects
 * 获取项目列表
 */
export async function getProjects(req, res, next) {
  try {
    const userId = req.authContext.userId;
    const projects = await service.getUserProjects(userId);
    res.json({ projects });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/reimbursement/projects/:id
 * 获取项目详情
 */
export async function getProject(req, res, next) {
  try {
    const { id } = req.params;
    const project = await service.getProjectById(id);

    if (!project) {
      return res.status(404).json({ error: '项目不存在' });
    }

    res.json({ project });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/reimbursement/projects/:id
 * 更新项目
 */
export async function updateProject(req, res, next) {
  try {
    const { id } = req.params;
    const updates = { ...req.body };

    if (typeof updates.name === 'string') {
      updates.name = updates.name.trim();
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'description')) {
      updates.description = typeof updates.description === 'string'
        ? updates.description.trim() || null
        : updates.description ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'shortName') && !Object.prototype.hasOwnProperty.call(updates, 'short_name')) {
      updates.short_name = typeof updates.shortName === 'string'
        ? updates.shortName.trim() || null
        : updates.shortName ?? null;
      delete updates.shortName;
    }

    const project = await service.updateProject(id, updates);

    if (!project) {
      return res.status(404).json({ error: '项目不存在' });
    }

    res.json({ project });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/reimbursement/projects/:id
 * 删除项目
 */
export async function deleteProject(req, res, next) {
  try {
    const { id } = req.params;
    await service.deleteProject(id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

// ==================== 记录管理 ====================

/**
 * POST /api/reimbursement/projects/:id/records
 * 添加记录
 */
export async function addRecord(req, res, next) {
  try {
    const { id: projectId } = req.params;
    const userId = req.authContext.userId;
    const recordData = req.body;

    const record = await service.addRecord(projectId, userId, recordData);
    res.status(201).json({ record });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/reimbursement/projects/:id/records
 * 获取记录列表
 */
export async function getRecords(req, res, next) {
  try {
    const { id: projectId } = req.params;
    const records = await service.getProjectRecords(projectId);
    res.json({ records });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/reimbursement/records/:id
 * 更新记录
 */
export async function updateRecord(req, res, next) {
  try {
    const { id } = req.params;
    const updates = req.body;

    const record = await service.updateRecord(id, updates);

    if (!record) {
      return res.status(404).json({ error: '记录不存在' });
    }

    res.json({ record });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/reimbursement/records/:id
 * 删除记录
 */
export async function deleteRecord(req, res, next) {
  try {
    const { id } = req.params;
    await service.deleteRecord(id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/reimbursement/records/batch-update
 * 批量更新记录
 */
export async function batchUpdateRecords(req, res, next) {
  try {
    const { recordIds, updates } = req.body;

    if (!recordIds || !Array.isArray(recordIds) || recordIds.length === 0) {
      return res.status(400).json({ error: '请选择要更新的记录' });
    }

    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({ error: '请提供更新内容' });
    }

    const updatedCount = await service.batchUpdateRecords(recordIds, updates);
    res.json({ success: true, updatedCount });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/reimbursement/records/batch-delete
 * 批量删除记录
 */
export async function batchDeleteRecords(req, res, next) {
  try {
    const { recordIds } = req.body;

    if (!recordIds || !Array.isArray(recordIds) || recordIds.length === 0) {
      return res.status(400).json({ error: '请选择要删除的记录' });
    }

    const deletedCount = await service.batchDeleteRecords(recordIds);
    res.json({ success: true, deletedCount });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/reimbursement/projects/:id/records
 * 清空项目记录
 */
export async function clearRecords(req, res, next) {
  try {
    const { id: projectId } = req.params;
    await service.clearProjectRecords(projectId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

// ==================== 用户设置 ====================

/**
 * GET /api/reimbursement/settings
 */
export async function getSettings(req, res, next) {
  try {
    const userId = req.authContext.userId;
    const settings = await service.getUserSettings(userId);
    res.json({ settings: toSettingsResponse(settings) });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/reimbursement/settings
 */
export async function updateSettings(req, res, next) {
  try {
    const userId = req.authContext.userId;
    const current = await service.getUserSettings(userId);
    const requestConfig = req.body?.llmConfig ?? req.body?.llm_config;
    const nextConfig = requestConfig
      ? {
        provider: requestConfig.provider ?? current?.llm_config?.provider ?? DEFAULT_LLM_CONFIG.provider,
        baseUrl: requestConfig.baseUrl ?? current?.llm_config?.baseUrl ?? DEFAULT_LLM_CONFIG.baseUrl,
        apiKey: requestConfig.apiKey ?? current?.llm_config?.apiKey ?? '',
        modelName: requestConfig.modelName ?? current?.llm_config?.modelName ?? DEFAULT_LLM_CONFIG.modelName,
      }
      : (current?.llm_config || DEFAULT_LLM_CONFIG);

    const payload = {
      default_reporter: req.body?.defaultReporter ?? req.body?.default_reporter ?? current?.default_reporter ?? '',
      watch_directory_path: req.body?.watchDirectoryPath ?? req.body?.watch_directory_path ?? current?.watch_directory_path ?? '',
      llm_config: nextConfig,
    };

    const settings = await service.updateUserSettings(userId, payload);
    res.json({ settings: toSettingsResponse(settings) });
  } catch (error) {
    next(error);
  }
}

// ==================== 导出功能 ====================

/**
 * POST /api/reimbursement/export
 * 导出 Excel
 */
export async function exportExcel(req, res, next) {
  try {
    const { projectId } = req.body;
    const project = await service.getProjectById(projectId);
    const excelBuffer = await generateExportWorkbook(projectId);

    // 设置响应头
    const fileName = `${project?.name || '报销单'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );

    res.end(excelBuffer);
  } catch (error) {
    next(error);
  }
}

// ==================== 管理员功能 ====================

/**
 * GET /api/reimbursement/admin/org/:orgId
 */
export async function getOrgProjects(req, res, next) {
  try {
    const { orgId } = req.params;
    const projects = await service.getOrgProjects(orgId);
    res.json({ data: projects });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/reimbursement/admin/all
 */
export async function getAllProjects(req, res, next) {
  try {
    const projects = await service.getAllProjects();
    res.json({ data: projects });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/reimbursement/admin/projects/:id/records
 * 管理员获取项目记录明细
 */
export async function getProjectRecords(req, res, next) {
  try {
    const { id: projectId } = req.params;
    const project = await service.getProjectById(projectId);

    if (!project) {
      return res.status(404).json({ error: '项目不存在' });
    }

    const records = await service.getProjectRecords(projectId);
    res.json({ project, records });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/reimbursement/admin/projects/:id/export
 * 管理员导出项目Excel
 */
export async function exportProjectExcel(req, res, next) {
  try {
    const { id: projectId } = req.params;
    const project = await service.getProjectById(projectId);

    if (!project) {
      return res.status(404).json({ error: '项目不存在' });
    }

    const excelBuffer = await generateExportWorkbook(projectId);

    // 设置响应头
    const fileName = `${project?.name || '报销单'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );

    res.end(excelBuffer);
  } catch (error) {
    next(error);
  }
}

// ==================== 处理状态统计 ====================

/**
 * GET /api/reimbursement/projects/:id/stats
 * 获取处理统计
 */
export async function getProcessingStats(req, res, next) {
  try {
    const { id: projectId } = req.params;
    const stats = await service.getProcessingStats(projectId);
    res.json({ stats });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/reimbursement/projects/:id/jobs
 * 获取处理记录列表
 */
export async function getProcessingJobs(req, res, next) {
  try {
    const { id: projectId } = req.params;
    const { status } = req.query;
    const jobs = await service.getProcessingJobs(projectId, status);
    res.json({ jobs });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/reimbursement/projects/:id/duplicates
 * 获取重复文件列表
 */
export async function getProjectDuplicates(req, res, next) {
  try {
    const { id: projectId } = req.params;
    const duplicates = await service.getDuplicateFiles(projectId);
    res.json({ duplicates });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/reimbursement/projects/:id/errors
 * 获取错误文件列表
 */
export async function getProjectErrors(req, res, next) {
  try {
    const { id: projectId } = req.params;
    const errors = await service.getErrorFiles(projectId);
    res.json({ errors });
  } catch (error) {
    next(error);
  }
}

// ==================== 待匹配项管理 ====================

/**
 * GET /api/reimbursement/projects/:id/pending-matches
 * 获取待匹配项列表
 */
export async function getProjectPendingMatches(req, res, next) {
  try {
    const { id: projectId } = req.params;
    const matches = await service.getPendingMatches(projectId);

    // 为每个待匹配项获取候选记录详情
    const matchesWithCandidates = await Promise.all(
      matches.map(async (match) => {
        const candidateIds = match.candidate_ids || [];
        const candidates = candidateIds.length > 0
          ? await knex('reimbursement_records').whereIn('id', candidateIds)
          : [];
        return {
          ...match,
          candidates,
        };
      })
    );

    res.json({ matches: matchesWithCandidates });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/reimbursement/pending-matches/:id/resolve
 * 解决待匹配项
 */
export async function resolvePendingMatch(req, res, next) {
  try {
    const { id: matchId } = req.params;
    const { recordId } = req.body;

    if (!recordId) {
      return res.status(400).json({ error: '请选择要关联的记录' });
    }

    const match = await service.resolvePendingMatch(matchId, recordId);

    if (!match) {
      return res.status(404).json({ error: '待匹配项不存在' });
    }

    res.json({ success: true, match });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/reimbursement/pending-matches/:id/reject
 * 拒绝待匹配项（不关联任何记录，后续可单独处理）
 */
export async function rejectPendingMatch(req, res, next) {
  try {
    const { id: matchId } = req.params;

    const match = await service.rejectPendingMatch(matchId);

    if (!match) {
      return res.status(404).json({ error: '待匹配项不存在' });
    }

    res.json({ success: true, match });
  } catch (error) {
    next(error);
  }
}

// ==================== 附件管理 ====================

/**
 * DELETE /api/reimbursement/attachments/:id
 * 删除附件
 */
export async function deleteAttachment(req, res, next) {
  try {
    const { id: attachmentId } = req.params;

    const attachment = await knex('reimbursement_attachments')
      .where({ id: attachmentId })
      .first();

    if (!attachment) {
      return res.status(404).json({ error: '附件不存在' });
    }

    // 删除文件
    if (attachment.original_path) {
      try {
        await fs.promises.unlink(attachment.original_path);
      } catch (err) {
        console.error('删除附件文件失败:', err);
      }
    }

    // 删除数据库记录
    await knex('reimbursement_attachments')
      .where({ id: attachmentId })
      .del();

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/reimbursement/attachments/:id/replace
 * 替换附件图片
 */
export async function replaceAttachment(req, res, next) {
  try {
    const { id: attachmentId } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: '未上传文件' });
    }

    const attachment = await knex('reimbursement_attachments')
      .where({ id: attachmentId })
      .first();

    if (!attachment) {
      return res.status(404).json({ error: '附件不存在' });
    }

    // 更新文件
    const newFileName = `${Date.now()}_${req.file.originalname}`;
    const newPath = path.join(path.dirname(attachment.original_path || ''), newFileName);

    // 保存新文件
    await fs.promises.writeFile(newPath, req.file.buffer);

    // 删除旧文件
    if (attachment.original_path) {
      try {
        await fs.promises.unlink(attachment.original_path);
      } catch (err) {
        console.error('删除旧文件失败:', err);
      }
    }

    // 更新数据库
    await knex('reimbursement_attachments')
      .where({ id: attachmentId })
      .update({
        file_name: newFileName,
        original_name: req.file.originalname,
        original_path: newPath,
        file_size: req.file.size,
        mime_type: req.file.mimetype,
        updated_at: knex.fn.now(),
      });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/reimbursement/attachments/:id/thumbnail
 * 获取附件缩略图
 */
export async function getAttachmentThumbnail(req, res, next) {
  try {
    const { id: attachmentId } = req.params;

    const attachment = await knex('reimbursement_attachments')
      .where({ id: attachmentId })
      .first();

    if (!attachment) {
      return res.status(404).json({ error: '附件不存在' });
    }

    // 优先返回数据库中存储的缩略图数据
    if (attachment.thumbnail_data) {
      res.set('Content-Type', 'image/jpeg');
      return res.send(attachment.thumbnail_data);
    }

    // 如果没有缩略图数据，尝试从文件系统读取
    if (!attachment.original_path) {
      return res.status(404).json({ error: '附件文件路径不存在' });
    }

    const fileDir = path.dirname(attachment.original_path);
    const isPdf = attachment.mime_type === 'application/pdf' ||
                  attachment.original_name?.toLowerCase().endsWith('.pdf');

    // 尝试查找缩略图文件
    const thumbnailCandidates = isPdf
      ? ['thumb_1.jpg', 'thumbnail_1.jpg']
      : ['thumb.jpg', 'thumbnail.jpg'];

    for (const thumbName of thumbnailCandidates) {
      const thumbPath = path.join(fileDir, thumbName);
      try {
        const thumbBuffer = await fs.promises.readFile(thumbPath);
        res.set('Content-Type', 'image/jpeg');
        return res.send(thumbBuffer);
      } catch {
        // 继续尝试下一个
      }
    }

    // 如果是图片文件且没有缩略图，返回原图
    if (!isPdf) {
      try {
        const originalBuffer = await fs.promises.readFile(attachment.original_path);
        res.set('Content-Type', attachment.mime_type || 'image/jpeg');
        return res.send(originalBuffer);
      } catch {
        // 文件读取失败
      }
    }

    // 无法获取缩略图
    return res.status(404).json({ error: '缩略图不可用' });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/reimbursement/attachments/:id/image
 * 获取附件图片（用于大图预览）
 */
export async function getAttachmentImage(req, res, next) {
  try {
    const { id: attachmentId } = req.params;

    const attachment = await knex('reimbursement_attachments')
      .where({ id: attachmentId })
      .first();

    if (!attachment) {
      return res.status(404).json({ error: '附件不存在' });
    }

    if (!attachment.original_path) {
      return res.status(404).json({ error: '附件文件路径不存在' });
    }

    const fileDir = path.dirname(attachment.original_path);
    const isPdf = attachment.mime_type === 'application/pdf' ||
                  attachment.original_name?.toLowerCase().endsWith('.pdf');

    if (isPdf) {
      // 对于PDF，返回第一页渲染图片
      const pageCandidates = ['page_1.jpg', 'page_1.png'];
      for (const pageName of pageCandidates) {
        const pagePath = path.join(fileDir, pageName);
        try {
          const pageBuffer = await fs.promises.readFile(pagePath);
          res.set('Content-Type', 'image/jpeg');
          return res.send(pageBuffer);
        } catch {
          // 继续尝试
        }
      }
      return res.status(404).json({ error: 'PDF渲染图片不存在' });
    }

    // 对于图片，返回原图
    try {
      const originalBuffer = await fs.promises.readFile(attachment.original_path);
      res.set('Content-Type', attachment.mime_type || 'image/jpeg');
      return res.send(originalBuffer);
    } catch {
      return res.status(404).json({ error: '图片文件不存在' });
    }
  } catch (error) {
    next(error);
  }
}

// 导出upload中间件
export const uploadMiddleware = upload;
