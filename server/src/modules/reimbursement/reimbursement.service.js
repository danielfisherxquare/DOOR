/**
 * Reimbursement Service
 * 发票报销业务逻辑层
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import knex from '../../db/knex.js';
import { generateThumbnail } from './invoice.storage.js';
import { renderPdfToImageBuffers } from './ocr.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIRECT_PAYMENT_STORAGE_DIR = path.join(__dirname, '../../../storage/reimbursement-payments');

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function getNextRecordIndex(projectId) {
  const maxIndex = await knex('reimbursement_records')
    .where({ project_id: projectId })
    .max('index as max')
    .first();

  return (maxIndex?.max || 0) + 1;
}

async function attachPreviewPayment(recordId, previewFileId) {
  if (!previewFileId) return null;

  const previewFile = await knex('reimbursement_preview_files')
    .where({ id: previewFileId })
    .first();

  if (!previewFile) return null;

  const existing = await knex('reimbursement_attachments')
    .where({
      record_id: recordId,
      original_path: previewFile.original_path,
      file_type: 'payment',
    })
    .first();

  if (!existing) {
    await knex('reimbursement_attachments')
      .insert({
        record_id: recordId,
        file_name: previewFile.file_name,
        original_name: previewFile.original_name,
        file_type: 'payment',
        file_size: previewFile.file_size,
        mime_type: previewFile.mime_type,
        thumbnail_data: previewFile.thumbnail_data,
        original_path: previewFile.original_path,
      });
  }

  await knex('reimbursement_preview_files')
    .where({ id: previewFileId })
    .update({
      status: 'recognized',
      recognized_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });

  return previewFile;
}

function normalizeReimbursementDate(dateString) {
  if (!dateString) {
    return null;
  }

  if (dateString instanceof Date) {
    return dateString.toISOString().slice(0, 10);
  }

  if (typeof dateString !== 'string') {
    return null;
  }

  const chineseDateMatch = dateString.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (chineseDateMatch) {
    const [, year, month, day] = chineseDateMatch;
    return `${year}-${String(parseInt(month, 10)).padStart(2, '0')}-${String(parseInt(day, 10)).padStart(2, '0')}`;
  }

  const patterns = [
    /(\d{4})-(\d{1,2})-(\d{1,2})/,
    /(\d{4})\/(\d{1,2})\/(\d{1,2})/,
  ];

  for (const regex of patterns) {
    const match = dateString.match(regex);
    if (match) {
      const [, year, month, day] = match;
      return `${year}-${String(parseInt(month, 10)).padStart(2, '0')}-${String(parseInt(day, 10)).padStart(2, '0')}`;
    }
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return dateString;
  }

  return null;
}

function toNullableNumber(value) {
  if (value === '' || value == null) {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function normalizeSortText(value) {
  return String(value || '').trim();
}

function compareSortText(left, right) {
  const leftText = normalizeSortText(left);
  const rightText = normalizeSortText(right);
  const leftEmpty = !leftText;
  const rightEmpty = !rightText;

  if (leftEmpty && !rightEmpty) return 1;
  if (!leftEmpty && rightEmpty) return -1;

  return leftText.localeCompare(rightText, 'zh-CN', {
    numeric: true,
    sensitivity: 'base',
  });
}

function compareRecordOrder(left, right) {
  const categoryDiff = compareSortText(left.category, right.category);
  if (categoryDiff !== 0) return categoryDiff;

  const subCategoryDiff = compareSortText(left.sub_category, right.sub_category);
  if (subCategoryDiff !== 0) return subCategoryDiff;

  const dateDiff = compareSortText(left.payment_date, right.payment_date);
  if (dateDiff !== 0) return dateDiff;

  return Number(left.index || 0) - Number(right.index || 0);
}

export async function reorderProjectRecordIndexes(projectId) {
  return knex.transaction(async (trx) => {
    const records = await trx('reimbursement_records')
      .where({ project_id: projectId })
      .select('id', 'index', 'category', 'sub_category', 'payment_date');

    if (records.length === 0) {
      return [];
    }

    const sortedRecords = [...records].sort(compareRecordOrder);

    // 收集需要更新的记录
    const needsUpdate = [];
    for (let i = 0; i < sortedRecords.length; i += 1) {
      const record = sortedRecords[i];
      const nextIndex = i + 1;
      if (Number(record.index) !== nextIndex) {
        needsUpdate.push({ id: record.id, index: nextIndex });
      }
    }

    // 使用单条 SQL 批量更新（替代 N 次并发 UPDATE）
    if (needsUpdate.length > 0) {
      const values = needsUpdate.map(() => '(?, ?)').join(', ');
      const params = needsUpdate.flatMap(u => [u.id, u.index]);

      await trx.raw(`
        UPDATE reimbursement_records AS r
        SET index = v.new_index::integer, updated_at = NOW()
        FROM (VALUES ${values}) AS v(id, new_index)
        WHERE r.id = v.id::uuid
      `, params);
    }

    return sortedRecords.map((record, index) => ({
      ...record,
      index: index + 1,
    }));
  });
}

export function buildInvoiceRecordData(invoiceData = {}) {
  return {
    payment_date: normalizeReimbursementDate(invoiceData.payment_date ?? invoiceData.date),
    invoice_code: invoiceData.invoice_code ?? invoiceData.invoiceCode ?? null,
    invoice_number: invoiceData.invoice_number ?? invoiceData.invoiceNumber ?? null,
    category: invoiceData.category || null,
    sub_category: invoiceData.sub_category ?? invoiceData.subCategory ?? null,
    description: invoiceData.description ?? invoiceData.details ?? null,
    expense: toNullableNumber(invoiceData.expense ?? invoiceData.amount),
    company: invoiceData.company ?? invoiceData.buyer ?? null,
    has_invoice: true,
    unit_price: toNullableNumber(invoiceData.unit_price ?? invoiceData.unitPrice),
    unit: invoiceData.unit ?? null,
    quantity: toNullableNumber(invoiceData.quantity),
    remarks: invoiceData.remarks ?? null,
  };
}

export async function findInvoiceMatchCandidates(projectId, invoiceData = {}) {
  const normalizedInvoice = buildInvoiceRecordData(invoiceData);

  if (!normalizedInvoice.expense || !normalizedInvoice.payment_date) {
    return [];
  }

  return knex('reimbursement_records as rr')
    .where('rr.project_id', projectId)
    .where('rr.expense', normalizedInvoice.expense)
    .where('rr.payment_date', normalizedInvoice.payment_date)
    .where('rr.has_invoice', false)
    .where(function () {
      this.where('rr.sub_category', '付款凭证')
        .orWhere('rr.remarks', 'like', '%付款凭证%')
        .orWhereExists(function () {
          this.select('*')
            .from('reimbursement_attachments as att')
            .whereRaw('att.record_id = rr.id')
            .where({ file_type: 'payment' });
        });
    })
    .whereNotExists(function () {
      this.select('*')
        .from('reimbursement_attachments as att')
        .whereRaw('att.record_id = rr.id')
        .where({ file_type: 'invoice' });
    })
    .orderBy('rr.index', 'asc');
}

export async function mergeInvoiceIntoRecord(recordId, invoiceData = {}, options = {}) {
  const record = await knex('reimbursement_records')
    .where({ id: recordId })
    .first();

  if (!record) return null;

  const normalizedInvoice = buildInvoiceRecordData(invoiceData);
  const [updated] = await knex('reimbursement_records')
    .where({ id: recordId })
    .update({
      payment_date: normalizedInvoice.payment_date || record.payment_date,
      invoice_code: normalizedInvoice.invoice_code || record.invoice_code,
      invoice_number: normalizedInvoice.invoice_number || record.invoice_number,
      category: normalizedInvoice.category || record.category,
      sub_category: normalizedInvoice.sub_category || record.sub_category,
      description: normalizedInvoice.description || record.description,
      expense: normalizedInvoice.expense ?? record.expense,
      reporter: invoiceData.reporter || record.reporter,
      has_invoice: true,
      company: normalizedInvoice.company || record.company,
      remarks: normalizedInvoice.remarks || record.remarks,
      unit_price: normalizedInvoice.unit_price ?? record.unit_price,
      unit: normalizedInvoice.unit || record.unit,
      quantity: normalizedInvoice.quantity ?? record.quantity,
      preview_file_id: record.preview_file_id || options.previewFileId || null,
      updated_at: knex.fn.now(),
    })
    .returning('*');

  await updateProjectStats(record.project_id);
  await reorderProjectRecordIndexes(record.project_id);

  return updated;
}

function buildStandalonePaymentRecordData(paymentData = {}, remarks = '由付款凭证识别生成') {
  const amount = Number(paymentData.amount) || 0;

  return {
    payment_date: normalizeReimbursementDate(paymentData.date),
    category: paymentData.category || '其他费用',
    sub_category: paymentData.subCategory || '付款凭证',
    description: paymentData.payee || paymentData.targetName || '付款凭证',
    expense: amount || null,
    has_invoice: false,
    company: paymentData.payee || paymentData.targetName || null,
    remarks,
  };
}

async function getFileBufferIfExists(filePath) {
  if (!filePath) return null;

  try {
    return await fs.promises.readFile(filePath);
  } catch {
    return null;
  }
}

function resolveStoredFileExt(mimeType, originalName) {
  if (mimeType === 'application/pdf' || String(originalName || '').toLowerCase().endsWith('.pdf')) {
    return '.pdf';
  }
  if (mimeType === 'image/png' || String(originalName || '').toLowerCase().endsWith('.png')) {
    return '.png';
  }
  if (mimeType === 'image/webp' || String(originalName || '').toLowerCase().endsWith('.webp')) {
    return '.webp';
  }
  return '.jpg';
}

/**
 * 保存直传付款凭证文件，供独立写库或待匹配后补挂附件使用
 */
export async function persistProcessedPaymentUpload(projectId, processedFileId, {
  fileBuffer,
  mimeType,
  originalName,
}) {
  const paymentDir = path.join(DIRECT_PAYMENT_STORAGE_DIR, projectId, processedFileId);
  await ensureDir(paymentDir);

  const ext = resolveStoredFileExt(mimeType, originalName);
  const originalPath = path.join(paymentDir, `original${ext}`);
  await fs.promises.writeFile(originalPath, fileBuffer);

  let thumbnailPath = null;

  if (mimeType === 'application/pdf' || String(originalName || '').toLowerCase().endsWith('.pdf')) {
    const pageBuffers = await renderPdfToImageBuffers(fileBuffer);

    for (let i = 0; i < pageBuffers.length; i++) {
      const pageNum = i + 1;
      const pagePath = path.join(paymentDir, `page_${pageNum}.jpg`);
      const pageThumbnailPath = path.join(paymentDir, `thumbnail_${pageNum}.jpg`);
      await fs.promises.writeFile(pagePath, pageBuffers[i]);
      await generateThumbnail(pageBuffers[i], pageThumbnailPath, 150);
      if (pageNum === 1) {
        thumbnailPath = pageThumbnailPath;
      }
    }
  } else {
    thumbnailPath = path.join(paymentDir, 'thumb.jpg');
    await generateThumbnail(fileBuffer, thumbnailPath, 150);
  }

  await knex('reimbursement_processed_files')
    .where({ id: processedFileId })
    .update({
      original_path: originalPath,
      thumbnail_path: thumbnailPath,
    });

  return {
    originalPath,
    thumbnailPath,
  };
}

/**
 * 将直传付款凭证挂到报销记录
 */
export async function attachProcessedPayment(recordId, paymentFile = {}) {
  const processedFileId = paymentFile.processedFileId;
  if (!processedFileId) return null;

  const processedFile = await knex('reimbursement_processed_files')
    .where({ id: processedFileId })
    .first();

  if (!processedFile?.original_path) {
    return null;
  }

  const existing = await knex('reimbursement_attachments')
    .where({
      record_id: recordId,
      original_path: processedFile.original_path,
      file_type: 'payment',
    })
    .first();

  if (existing) {
    return existing;
  }

  const thumbnailData = await getFileBufferIfExists(processedFile.thumbnail_path);
  const [attachment] = await knex('reimbursement_attachments')
    .insert({
      record_id: recordId,
      file_name: paymentFile.fileName || processedFile.file_name,
      original_name: paymentFile.originalName || paymentFile.fileName || processedFile.file_name,
      file_type: 'payment',
      file_size: paymentFile.fileSize ?? null,
      mime_type: paymentFile.mimeType || null,
      thumbnail_data: thumbnailData,
      original_path: processedFile.original_path,
    })
    .returning('*');

  return attachment;
}

/**
 * 将已处理发票挂到报销记录
 */
export async function attachProcessedInvoice(recordId, invoiceFile = {}) {
  const processedFileId = invoiceFile.processedFileId;
  if (!processedFileId) return null;

  const processedFile = await knex('reimbursement_processed_files')
    .where({ id: processedFileId })
    .first();

  if (!processedFile?.original_path) {
    return null;
  }

  const existing = await knex('reimbursement_attachments')
    .where({
      record_id: recordId,
      original_path: processedFile.original_path,
      file_type: 'invoice',
    })
    .first();

  if (existing) {
    return existing;
  }

  const record = await knex('reimbursement_records')
    .where({ id: recordId })
    .first();
  const thumbnailData = await getFileBufferIfExists(processedFile.thumbnail_path);
  const [attachment] = await knex('reimbursement_attachments')
    .insert({
      record_id: recordId,
      file_name: invoiceFile.fileName || processedFile.file_name,
      original_name: invoiceFile.originalName || invoiceFile.fileName || processedFile.file_name,
      file_type: 'invoice',
      file_size: invoiceFile.fileSize ?? null,
      mime_type: invoiceFile.mimeType || null,
      thumbnail_data: thumbnailData,
      original_path: processedFile.original_path,
      invoice_number: record?.invoice_number || processedFile.ocr_result?.invoiceNumber || null,
    })
    .returning('*');

  return attachment;
}

// ==================== 项目管理 ====================

/**
 * 创建报销项目
 */
export async function createProject(userId, orgId, { name, description, shortName }) {
  const [project] = await knex('reimbursement_projects')
    .insert({
      user_id: userId,
      org_id: orgId,
      name,
      description,
      short_name: shortName || null,
      status: 'active',
      record_count: 0,
      total_income: 0,
      total_expense: 0,
    })
    .returning('*');

  return project;
}

/**
 * 获取用户的项目列表
 */
export async function getUserProjects(userId) {
  return knex('reimbursement_projects')
    .where({ user_id: userId })
    .orderBy('created_at', 'desc');
}

/**
 * 获取项目详情
 */
export async function getProjectById(projectId, userId) {
  const project = await knex('reimbursement_projects')
    .where({ id: projectId })
    .first();

  if (!project) return null;

  // 验证权限（所有者或管理员）
  // 在控制器层处理权限检查

  return project;
}

/**
 * 更新项目（字段白名单防护）
 */
const PROJECT_UPDATABLE_FIELDS = [
  'name', 'description', 'type', 'year', 'status',
  'race_name', 'race_date', 'race_location', 'notes',
];

export async function updateProject(projectId, updates) {
  const data = {};
  for (const key of PROJECT_UPDATABLE_FIELDS) {
    if (updates[key] !== undefined) data[key] = updates[key];
  }

  if (Object.keys(data).length === 0) {
    return knex('reimbursement_projects').where({ id: projectId }).first();
  }

  const [project] = await knex('reimbursement_projects')
    .where({ id: projectId })
    .update({
      ...data,
      updated_at: knex.fn.now(),
    })
    .returning('*');

  return project;
}

/**
 * 删除项目（事务保护）
 */
export async function deleteProject(projectId) {
  return knex.transaction(async (trx) => {
    // 先删除关联的记录和附件
    await trx('reimbursement_attachments')
      .whereIn('record_id', function() {
        this.select('id').from('reimbursement_records').where({ project_id: projectId });
      })
      .del();

    await trx('reimbursement_records').where({ project_id: projectId }).del();
    await trx('reimbursement_pending_matches').where({ project_id: projectId }).del();
    await trx('reimbursement_processed_files').where({ project_id: projectId }).del();

    // 删除项目
    await trx('reimbursement_projects').where({ id: projectId }).del();

    return true;
  });
}

/**
 * 更新项目统计
 */
export async function updateProjectStats(projectId) {
  const stats = await knex('reimbursement_records')
    .where({ project_id: projectId })
    .select(
      knex.raw('COUNT(*) as record_count'),
      knex.raw('COALESCE(SUM(income), 0) as total_income'),
      knex.raw('COALESCE(SUM(expense), 0) as total_expense')
    )
    .first();

  await knex('reimbursement_projects')
    .where({ id: projectId })
    .update({
      record_count: stats.record_count,
      total_income: stats.total_income,
      total_expense: stats.total_expense,
      updated_at: knex.fn.now(),
    });
}

// ==================== 记录管理 ====================

/**
 * 添加报销记录
 */
export async function addRecord(projectId, userId, recordData) {
  const attachmentMeta = recordData.processed_file_id ? {
    processedFileId: recordData.processed_file_id,
    fileName: recordData.file_name,
    originalName: recordData.original_name ?? recordData.file_name,
    mimeType: recordData.mime_type,
    fileSize: recordData.file_size,
  } : null;
  const shouldTryInvoiceMerge = recordData.file_type === 'invoice' || Boolean(recordData.has_invoice);

  if (shouldTryInvoiceMerge) {
    const candidates = await findInvoiceMatchCandidates(projectId, recordData);
    if (candidates.length === 1) {
      const mergedRecord = await mergeInvoiceIntoRecord(candidates[0].id, recordData);

      if (attachmentMeta && recordData.file_type === 'invoice') {
        await attachProcessedInvoice(mergedRecord.id, attachmentMeta);
      }

      return mergedRecord;
    }
  }

  // 获取当前最大序号
  const maxIndex = await knex('reimbursement_records')
    .where({ project_id: projectId })
    .max('index as max')
    .first();

  const index = (maxIndex?.max || 0) + 1;

  const [record] = await knex('reimbursement_records')
    .insert({
      project_id: projectId,
      user_id: userId,
      index,
      payment_date: recordData.payment_date,
      invoice_code: recordData.invoice_code ?? recordData.invoiceCode ?? null,
      invoice_number: recordData.invoice_number ?? recordData.invoiceNumber ?? null,
      category: recordData.category,
      sub_category: recordData.sub_category,
      description: recordData.description,
      income: recordData.income,
      expense: recordData.expense,
      reporter: recordData.reporter,
      has_invoice: recordData.has_invoice || false,
      company: recordData.company,
      remarks: recordData.remarks,
      unit_price: recordData.unit_price,
      unit: recordData.unit,
      quantity: recordData.quantity,
    })
    .returning('*');

  if (attachmentMeta) {
    if (recordData.file_type === 'payment') {
      await attachProcessedPayment(record.id, attachmentMeta);
    } else if (recordData.file_type === 'invoice') {
      await attachProcessedInvoice(record.id, attachmentMeta);
    }
  }

  // 更新项目统计
  await updateProjectStats(projectId);
  await reorderProjectRecordIndexes(projectId);

  return knex('reimbursement_records')
    .where({ id: record.id })
    .first();
}

/**
 * 基于付款凭证创建独立报销记录
 */
export async function createStandalonePaymentRecord(projectId, userId, paymentData, options = {}) {
  const recordData = buildStandalonePaymentRecordData(
    paymentData,
    options.remarks || '由付款凭证识别生成'
  );

  const [record] = await knex('reimbursement_records')
    .insert({
      project_id: projectId,
      user_id: userId,
      index: await getNextRecordIndex(projectId),
      ...recordData,
    })
    .returning('*');

  await updateProjectStats(projectId);
  await reorderProjectRecordIndexes(projectId);

  return knex('reimbursement_records')
    .where({ id: record.id })
    .first();
}

/**
 * 获取项目的记录列表
 */
export async function getProjectRecords(projectId) {
  const records = await knex('reimbursement_records')
    .where({ project_id: projectId })
    .orderBy('index', 'asc');

  // 获取附件
  const recordIds = records.map(r => r.id);
  const attachments = recordIds.length > 0
    ? await knex('reimbursement_attachments').whereIn('record_id', recordIds)
    : [];

  // 处理附件缩略图数据，将Buffer转为base64字符串
  const processedAttachments = attachments.map(att => ({
    ...att,
    thumbnail_data: att.thumbnail_data ? att.thumbnail_data.toString('base64') : null,
  }));

  const attachmentMap = {};
  for (const att of processedAttachments) {
    if (!attachmentMap[att.record_id]) {
      attachmentMap[att.record_id] = [];
    }
    attachmentMap[att.record_id].push(att);
  }

  return records.map(r => ({
    ...r,
    attachments: attachmentMap[r.id] || [],
  }));
}

/**
 * 更新记录（字段白名单防护）
 */
const RECORD_UPDATABLE_FIELDS = [
  'category', 'sub_category', 'item_name', 'specification',
  'quantity', 'unit_price', 'amount', 'income', 'expense',
  'payment_date', 'payment_method', 'payee', 'payer',
  'invoice_number', 'invoice_type', 'invoice_date',
  'tax_rate', 'tax_amount', 'remarks', 'status',
  'index', 'matched_invoice_id',
];

export async function updateRecord(recordId, updates) {
  const record = await knex('reimbursement_records')
    .where({ id: recordId })
    .first();

  if (!record) return null;

  // 字段白名单过滤
  const data = {};
  for (const key of RECORD_UPDATABLE_FIELDS) {
    if (updates[key] !== undefined) data[key] = updates[key];
  }

  if (Object.keys(data).length === 0) {
    return record;
  }

  const [updated] = await knex('reimbursement_records')
    .where({ id: recordId })
    .update({
      ...data,
      updated_at: knex.fn.now(),
    })
    .returning('*');

  // 更新项目统计
  await updateProjectStats(record.project_id);
  await reorderProjectRecordIndexes(record.project_id);

  return knex('reimbursement_records')
    .where({ id: recordId })
    .first();
}

/**
 * 删除记录
 */
export async function deleteRecord(recordId) {
  const record = await knex('reimbursement_records')
    .where({ id: recordId })
    .first();

  if (!record) return false;

  // 删除附件
  await knex('reimbursement_attachments')
    .where({ record_id: recordId })
    .del();

  // 删除记录
  await knex('reimbursement_records')
    .where({ id: recordId })
    .del();

  // 更新项目统计
  await updateProjectStats(record.project_id);
  await reorderProjectRecordIndexes(record.project_id);

  return true;
}

/**
 * 批量更新记录（字段白名单防护）
 */
export async function batchUpdateRecords(recordIds, updates) {
  if (!recordIds || recordIds.length === 0) return 0;

  // 获取第一条记录的项目ID用于更新统计
  const firstRecord = await knex('reimbursement_records')
    .where({ id: recordIds[0] })
    .first();

  // 字段白名单过滤
  const data = {};
  for (const key of RECORD_UPDATABLE_FIELDS) {
    if (updates[key] !== undefined) data[key] = updates[key];
  }

  if (Object.keys(data).length === 0) return 0;

  const updatedCount = await knex('reimbursement_records')
    .whereIn('id', recordIds)
    .update({
      ...data,
      updated_at: knex.fn.now(),
    });

  // 更新项目统计
  if (firstRecord) {
    await updateProjectStats(firstRecord.project_id);
    await reorderProjectRecordIndexes(firstRecord.project_id);
  }

  return updatedCount;
}

/**
 * 批量删除记录
 */
export async function batchDeleteRecords(recordIds) {
  if (!recordIds || recordIds.length === 0) return 0;

  // 获取第一条记录的项目 ID 用于更新统计
  const firstRecord = await knex('reimbursement_records')
    .where({ id: recordIds[0] })
    .first();

  // 删除附件
  await knex('reimbursement_attachments')
    .whereIn('record_id', recordIds)
    .del();

  // 删除记录
  const deletedCount = await knex('reimbursement_records')
    .whereIn('id', recordIds)
    .del();

  // 更新项目统计
  if (firstRecord) {
    await updateProjectStats(firstRecord.project_id);
    await reorderProjectRecordIndexes(firstRecord.project_id);
  }

  return deletedCount;
}

/**
 * 清空项目记录
 */
export async function clearProjectRecords(projectId) {
  const recordIds = await knex('reimbursement_records')
    .where({ project_id: projectId })
    .pluck('id');

  if (recordIds.length > 0) {
    await knex('reimbursement_attachments')
      .whereIn('record_id', recordIds)
      .del();
  }

  await knex('reimbursement_records')
    .where({ project_id: projectId })
    .del();

  await knex('reimbursement_processed_files')
    .where({ project_id: projectId })
    .del();

  await knex('reimbursement_pending_matches')
    .where({ project_id: projectId })
    .del();

  await updateProjectStats(projectId);

  return true;
}

// ==================== 附件管理 ====================

/**
 * 添加附件
 */
export async function addAttachment(recordId, attachmentData) {
  const [attachment] = await knex('reimbursement_attachments')
    .insert({
      record_id: recordId,
      file_name: attachmentData.file_name,
      original_name: attachmentData.original_name,
      file_type: attachmentData.file_type,
      file_size: attachmentData.file_size,
      mime_type: attachmentData.mime_type,
      local_path: attachmentData.local_path,
    })
    .returning('*');

  return attachment;
}

/**
 * 获取记录的附件
 */
export async function getRecordAttachments(recordId) {
  return knex('reimbursement_attachments')
    .where({ record_id: recordId });
}

// ==================== 用户设置 ====================

/**
 * 获取用户设置
 */
export async function getUserSettings(userId) {
  const settings = await knex('reimbursement_user_settings')
    .where({ user_id: userId })
    .first();

  return settings || {
    user_id: userId,
    default_reporter: '',
    watch_directory_path: '',
    llm_config: {
      provider: 'qwen',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: '',
      modelName: 'qwen3.5-plus',
    },
  };
}

/**
 * 更新用户设置
 */
export async function updateUserSettings(userId, settings) {
  const existing = await knex('reimbursement_user_settings')
    .where({ user_id: userId })
    .first();

  if (existing) {
    await knex('reimbursement_user_settings')
      .where({ user_id: userId })
      .update({
        ...settings,
        updated_at: knex.fn.now(),
      });
  } else {
    await knex('reimbursement_user_settings')
      .insert({
        user_id: userId,
        ...settings,
      });
  }

  return getUserSettings(userId);
}

// ==================== 管理员功能 ====================

/**
 * 获取机构所有报销项目
 */
export async function getOrgProjects(orgId) {
  const projects = await knex('reimbursement_projects as rp')
    .join('users as u', 'rp.user_id', 'u.id')
    .where('rp.org_id', orgId)
    .select(
      'rp.*',
      'rp.name as project_name',
      'u.username as user_name',
      'u.email as user_email'
    )
    .orderBy('rp.created_at', 'desc');

  return projects;
}

/**
 * 获取所有报销项目（超管）
 */
export async function getAllProjects() {
  const projects = await knex('reimbursement_projects as rp')
    .join('users as u', 'rp.user_id', 'u.id')
    .leftJoin('organizations as o', 'rp.org_id', 'o.id')
    .select(
      'rp.*',
      'rp.name as project_name',
      'u.username as user_name',
      'u.email as user_email',
      'o.name as org_name'
    )
    .orderBy('rp.created_at', 'desc');

  return projects;
}

/**
 * 获取机构报销统计
 */
export async function getOrgStats(orgId) {
  const stats = await knex('reimbursement_projects')
    .where({ org_id: orgId })
    .select(
      knex.raw('COUNT(*) as project_count'),
      knex.raw('SUM(record_count) as total_records'),
      knex.raw('SUM(total_income) as total_income'),
      knex.raw('SUM(total_expense) as total_expense')
    )
    .first();

  return stats;
}

// ==================== 处理记录管理 ====================

/**
 * 记录处理开始（含去重检查）
 * @param {string} projectId - 项目ID
 * @param {string} userId - 用户ID
 * @param {Object} options - 选项
 * @param {string} options.fileName - 文件名
 * @param {string} options.fileType - 文件类型 (invoice/payment)
 * @param {string} options.fileHash - 文件哈希
 * @returns {Promise<{skipped: boolean, record?: Object, existing?: Object}>}
 */
export async function startProcessingFile(projectId, userId, { fileName, fileType, fileHash }) {
  // 检查是否已处理过（按文件内容哈希）
  const existing = await knex('reimbursement_processed_files')
    .where({
      project_id: projectId,
      file_hash: fileHash,
      file_type: fileType,
    })
    .first();

  if (existing) {
    const [record] = await knex('reimbursement_processed_files')
      .insert({
        project_id: projectId,
        file_name: fileName,
        file_type: fileType,
        file_hash: fileHash,
        status: 'skipped',
        processed_at: knex.fn.now(),
      })
      .returning('*');

    return { skipped: true, record, existing };
  }

  const [record] = await knex('reimbursement_processed_files')
    .insert({
      project_id: projectId,
      file_name: fileName,
      file_type: fileType,
      file_hash: fileHash,
      status: 'processing',
    })
    .returning('*');

  return { skipped: false, record };
}

/**
 * 更新处理状态
 * @param {string} recordId - 处理记录ID
 * @param {string} status - 状态 (processing/completed/error/skipped)
 * @param {Object} options - 选项
 * @param {string} options.errorMessage - 错误信息
 */
export async function updateProcessingStatus(recordId, status, { errorMessage } = {}) {
  const updateData = {
    status,
    processed_at: knex.fn.now(),
    error_message: errorMessage ?? undefined,
  };

  // 如果需要存储错误信息，可以扩展表结构或使用日志
  // 目前仅更新状态

  return knex('reimbursement_processed_files')
    .where({ id: recordId })
    .update(updateData);
}

/**
 * 获取处理统计
 * @param {string} projectId - 项目ID
 * @returns {Promise<{pending: number, processing: number, completed: number, skipped: number, errored: number}>}
 */
export async function getProcessingStats(projectId) {
  const stats = await knex('reimbursement_processed_files')
    .where({ project_id: projectId })
    .select('status')
    .count('* as count')
    .groupBy('status');

  const result = {
    pending: 0,
    processing: 0,
    completed: 0,
    skipped: 0,
    errored: 0,
  };

  for (const stat of stats) {
    const status = stat.status;
    const count = Number(stat.count);
    if (status === 'pending') result.pending = count;
    else if (status === 'processing') result.processing = count;
    else if (status === 'completed') result.completed = count;
    else if (status === 'skipped') result.skipped = count;
    else if (status === 'error') result.errored = count;
  }

  return result;
}

/**
 * 获取处理记录列表
 * @param {string} projectId - 项目ID
 * @param {string} status - 可选的状态过滤
 * @returns {Promise<Array>}
 */
export async function getProcessingJobs(projectId, status) {
  let query = knex('reimbursement_processed_files')
    .where({ project_id: projectId })
    .orderBy('processed_at', 'desc')
    .limit(100);

  if (status) {
    query = query.where({ status });
  }

  return query;
}

/**
 * 获取重复文件列表
 * @param {string} projectId - 项目ID
 * @returns {Promise<Array>}
 */
export async function getDuplicateFiles(projectId) {
  return knex('reimbursement_processed_files')
    .where({ project_id: projectId, status: 'skipped' })
    .orderBy('processed_at', 'desc');
}

/**
 * 获取错误文件列表
 * @param {string} projectId - 项目ID
 * @returns {Promise<Array>}
 */
export async function getErrorFiles(projectId) {
  return knex('reimbursement_processed_files')
    .where({ project_id: projectId, status: 'error' })
    .orderBy('processed_at', 'desc');
}

/**
 * 清空项目处理记录
 * @param {string} projectId - 项目ID
 */
export async function clearProcessingRecords(projectId) {
  return knex('reimbursement_processed_files')
    .where({ project_id: projectId })
    .del();
}

// ==================== 待匹配项管理 ====================

/**
 * 创建待匹配项
 * @param {string} projectId - 项目ID
 * @param {string} userId - 用户ID
 * @param {Object} options - 选项
 * @param {Object} options.paymentData - 付款凭证识别数据
 * @param {string[]} options.candidateIds - 候选记录ID列表
 */
export async function createPendingMatch(projectId, userId, { paymentData, candidateIds }) {
  const [match] = await knex('reimbursement_pending_matches')
    .insert({
      project_id: projectId,
      user_id: userId,
      payment_data: paymentData,
      candidate_ids: candidateIds,
      status: 'pending',
    })
    .returning('*');

  return match;
}

/**
 * 获取项目待匹配项
 * @param {string} projectId - 项目ID
 * @returns {Promise<Array>}
 */
export async function getPendingMatches(projectId) {
  return knex('reimbursement_pending_matches')
    .where({ project_id: projectId, status: 'pending' })
    .orderBy('created_at', 'desc');
}

/**
 * 解决待匹配项（关联到指定记录）
 * @param {string} matchId - 待匹配项ID
 * @param {string} targetRecordId - 目标记录ID
 */
export async function resolvePendingMatch(matchId, targetRecordId) {
  const existingMatch = await knex('reimbursement_pending_matches')
    .where({ id: matchId })
    .first();

  if (!existingMatch) return null;

  const targetRecord = await knex('reimbursement_records')
    .where({ id: targetRecordId, project_id: existingMatch.project_id })
    .first();

  if (!targetRecord) return null;

  const [match] = await knex('reimbursement_pending_matches')
    .where({ id: matchId })
    .update({
      status: 'resolved',
      resolved_record_id: targetRecordId,
      resolved_at: knex.fn.now(),
    })
    .returning('*');

  await attachPreviewPayment(targetRecordId, match?.payment_data?.previewFileId);
  await attachProcessedPayment(targetRecordId, match?.payment_data);

  return match;
}

/**
 * 拒绝待匹配项（不关联任何记录）
 * @param {string} matchId - 待匹配项ID
 */
export async function rejectPendingMatch(matchId) {
  const match = await knex('reimbursement_pending_matches')
    .where({ id: matchId })
    .first();

  if (!match) return null;

  const paymentData = match.payment_data || {};
  const recordData = buildStandalonePaymentRecordData(paymentData, '由待匹配付款凭证独立生成');
  const [record] = await knex('reimbursement_records')
    .insert({
      project_id: match.project_id,
      user_id: match.user_id,
      index: await getNextRecordIndex(match.project_id),
      ...recordData,
      preview_file_id: paymentData.previewFileId || null,
    })
    .returning('*');

  await attachPreviewPayment(record.id, paymentData.previewFileId);
  await attachProcessedPayment(record.id, paymentData);

  const [updatedMatch] = await knex('reimbursement_pending_matches')
    .where({ id: matchId })
    .update({
      status: 'rejected',
      resolved_record_id: record.id,
      resolved_at: knex.fn.now(),
    })
    .returning('*');

  await updateProjectStats(match.project_id);
  await reorderProjectRecordIndexes(match.project_id);

  return updatedMatch;
}

// ==================== 付款凭证匹配逻辑 ====================

/**
 * 查找金额匹配的记录（用于付款凭证自动匹配）
 * @param {string} projectId - 项目ID
 * @param {number} amount - 付款金额
 * @returns {Promise<Array>}
 */
export async function findMatchingRecords(projectId, amount) {
  if (!amount || amount <= 0) return [];

  // 查找金额匹配且没有付款凭证附件的记录
  return knex('reimbursement_records')
    .where({ project_id: projectId })
    .where('expense', amount)
    .whereNotExists(function() {
      this.select('*')
        .from('reimbursement_attachments')
        .whereRaw('reimbursement_attachments.record_id = reimbursement_records.id')
        .where({ file_type: 'payment' });
    });
}
