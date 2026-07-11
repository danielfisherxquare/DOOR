/**
 * Preview Service
 * 预览工作区服务 - 文件预览、重复检测、拖拽识别
 */

import knex from '../../db/knex.js';

/**
 * 将中文日期格式转换为 PostgreSQL 兼容格式
 * 例如："2026 年 3 月 5 日" -> "2026-03-05"
 * @param {string} dateString - 日期字符串
 * @returns {string|null} 格式化后的日期或 null
 */
function normalizeChineseDate(dateString) {
    if (!dateString || typeof dateString !== 'string') {
        return null;
    }

    // 尝试匹配中文日期格式（支持带空格和不带空格）
    // "2026 年 3 月 5 日" 或 "2026年03月05日"
    const chineseDateMatch = dateString.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if (chineseDateMatch) {
        const [, year, month, day] = chineseDateMatch;
        return `${year}-${String(parseInt(month)).padStart(2, '0')}-${String(parseInt(day)).padStart(2, '0')}`;
    }

    // 尝试匹配其他常见日期格式
    const patterns = [
        [/(\d{4})-(\d{1,2})-(\d{1,2})/, 'hyphen'],  // 2026-3-5 或 2026-03-05
        [/(\d{4})\/(\d{1,2})\/(\d{1,2})/, 'slash'], // 2026/3/5
    ];

    for (const [regex] of patterns) {
        const match = dateString.match(regex);
        if (match) {
            const [, year, month, day] = match;
            return `${year}-${String(parseInt(month)).padStart(2, '0')}-${String(parseInt(day)).padStart(2, '0')}`;
        }
    }

    // 如果已经是标准格式，直接返回
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        return dateString;
    }

    // 无法解析，返回 null 让数据库使用默认值
    return null;
}
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { renderPdfToImageBuffers } from './ocr.service.js';
import { generateThumbnail } from './invoice.storage.js';
import sharp from 'sharp';
import {
    buildInvoiceRecordData,
    findInvoiceMatchCandidates,
    mergeInvoiceIntoRecord,
    reorderProjectRecordIndexes,
} from './reimbursement.service.js';
import { addExportCheckWorksheet } from './reimbursement-export-checks.js';
import { attachOcrReview } from './ocr.review.js';
import { mergeRecordOcrMeta } from './reimbursement-ocr-meta.js';

const STORAGE_DIR = path.join(process.cwd(), 'storage', 'preview');
const PREVIEW_STATUS = {
    PREVIEW: 'preview',
    OCR_PROCESSING: 'ocr_processing',
    RECOGNIZED: 'recognized',
    DISCARDED: 'discarded',
};

/**
 * 确保目录存在
 */
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

function buildReviewedOcrMeta(fileType, ocrMeta, ocrData) {
    if (fileType === 'payment') {
        return attachOcrReview(ocrMeta, 'payment', buildPaymentRecordData(ocrData));
    }

    return attachOcrReview(ocrMeta, 'invoice', buildInvoiceRecordData(ocrData));
}

async function markPreviewFileRecognized(fileId, ocrMeta = null) {
    await knex('reimbursement_preview_files')
        .where({ id: fileId })
        .update({
            status: 'recognized',
            recognized_at: knex.fn.now(),
            ocr_meta: ocrMeta || undefined,
            updated_at: knex.fn.now(),
        });
}

async function claimPreviewFileForOcr(projectId, fileId) {
    const updated = await knex('reimbursement_preview_files')
        .where({
            id: fileId,
            project_id: projectId,
            status: PREVIEW_STATUS.PREVIEW,
        })
        .update({
            status: PREVIEW_STATUS.OCR_PROCESSING,
            updated_at: knex.fn.now(),
        });

    if (updated > 0) return true;

    const latest = await knex('reimbursement_preview_files')
        .where({ id: fileId, project_id: projectId })
        .first();

    if (!latest) {
        throw new Error('预览文件不存在');
    }

    if (latest.status === PREVIEW_STATUS.RECOGNIZED) {
        throw new Error('该文件已识别');
    }

    if (latest.status === PREVIEW_STATUS.OCR_PROCESSING) {
        throw new Error('该文件正在识别，请等待当前任务完成');
    }

    throw new Error('该文件当前状态不能识别');
}

async function releasePreviewFileOcrClaim(fileId) {
    await knex('reimbursement_preview_files')
        .where({
            id: fileId,
            status: PREVIEW_STATUS.OCR_PROCESSING,
        })
        .update({
            status: PREVIEW_STATUS.PREVIEW,
            updated_at: knex.fn.now(),
        });
}

async function attachPreviewFileToRecord(recordId, previewFile, fileType) {
    const existing = await knex('reimbursement_attachments')
        .where({
            record_id: recordId,
            original_path: previewFile.original_path,
            file_type: fileType,
        })
        .first();

    if (existing) {
        return existing;
    }

    const [attachment] = await knex('reimbursement_attachments')
        .insert({
            record_id: recordId,
            file_name: previewFile.file_name,
            original_name: previewFile.original_name,
            file_type: fileType,
            file_size: previewFile.file_size,
            mime_type: previewFile.mime_type,
            thumbnail_data: previewFile.thumbnail_data,
            original_path: previewFile.original_path,
        })
        .returning('*');

    return attachment;
}

async function createInvoiceRecord(projectId, userId, previewFile, ocrData, ocrMeta = null) {
    const invoiceData = buildInvoiceRecordData(ocrData);
    const amount = Number(invoiceData.expense) || 0;
    const [record] = await knex('reimbursement_records')
        .insert({
            project_id: projectId,
            user_id: userId,
            index: await getNextRecordIndex(projectId),
            ...invoiceData,
            is_duplicate: previewFile.is_duplicate,
            duplicate_count: previewFile.duplicate_count,
            preview_file_id: previewFile.id,
            ocr_meta: ocrMeta,
        })
        .returning('*');

    await attachPreviewFileToRecord(record.id, previewFile, 'invoice');
    await markPreviewFileRecognized(previewFile.id, ocrMeta);
    await knex('reimbursement_projects')
        .where({ id: projectId })
        .increment('record_count', 1)
        .increment('total_expense', amount)
        .update({ updated_at: knex.fn.now() });
    await reorderProjectRecordIndexes(projectId);

    return knex('reimbursement_records')
        .where({ id: record.id })
        .first();
}

function buildPaymentRecordData(paymentData) {
    const amount = Math.abs(Number(paymentData.amount) || 0);
    const normalizedDate = normalizeChineseDate(paymentData.date);
    return {
        payment_date: normalizedDate || null,
        category: paymentData.category || '其他费用',
        sub_category: '付款凭证',
        description: paymentData.payee || paymentData.targetName || '付款凭证',
        expense: amount || null,
        company: paymentData.payee || paymentData.targetName || null,
        has_invoice: false,
        remarks: '由付款凭证识别生成',
    };
}

async function createPaymentRecord(projectId, userId, previewFile, paymentData, ocrMeta = null) {
    const recordData = buildPaymentRecordData(paymentData);
    const [record] = await knex('reimbursement_records')
        .insert({
            project_id: projectId,
            user_id: userId,
            index: await getNextRecordIndex(projectId),
            ...recordData,
            preview_file_id: previewFile.id,
            ocr_meta: ocrMeta,
        })
        .returning('*');

    await attachPreviewFileToRecord(record.id, previewFile, 'payment');
    await markPreviewFileRecognized(previewFile.id, ocrMeta);
    await knex('reimbursement_projects')
        .where({ id: projectId })
        .increment('record_count', 1)
        .increment('total_expense', Number(recordData.expense) || 0)
        .update({ updated_at: knex.fn.now() });
    await reorderProjectRecordIndexes(projectId);

    return knex('reimbursement_records')
        .where({ id: record.id })
        .first();
}

/**
 * 计算文件哈希
 * @param {Buffer} fileBuffer - 文件Buffer
 * @returns {string} SHA256哈希值
 */
function calculateFileHash(fileBuffer) {
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

async function findActiveDuplicateFile(projectId, fileHash, documentType = 'invoice') {
    const normalizedDocumentType = documentType === 'payment' ? 'payment' : 'invoice';

    const previewDuplicate = await knex('reimbursement_preview_files as pf')
        .leftJoin('reimbursement_records as rr', 'rr.preview_file_id', 'pf.id')
        .where('pf.project_id', projectId)
        .where('pf.file_hash', fileHash)
        .where('pf.document_type', normalizedDocumentType)
        .whereNot('pf.status', PREVIEW_STATUS.DISCARDED)
        .where(function () {
            this.whereIn('pf.status', [PREVIEW_STATUS.PREVIEW, PREVIEW_STATUS.OCR_PROCESSING])
                .orWhereExists(function () {
                    this.select(knex.raw('1'))
                        .from('reimbursement_records as rr')
                        .whereRaw('rr.preview_file_id = pf.id');
                });
        })
        .orderByRaw('CASE WHEN pf.status = ? THEN 0 WHEN pf.status = ? THEN 1 ELSE 2 END', [
            PREVIEW_STATUS.PREVIEW,
            PREVIEW_STATUS.OCR_PROCESSING,
        ])
        .select(
            'pf.id',
            'pf.file_name',
            'pf.original_name',
            'pf.status',
            'pf.duplicate_count',
            'pf.recognized_at',
            'rr.id as record_id',
            'rr.index as record_index'
        )
        .first();

    if (previewDuplicate) {
        return {
            source: [PREVIEW_STATUS.PREVIEW, PREVIEW_STATUS.OCR_PROCESSING].includes(previewDuplicate.status) ? 'preview' : 'record',
            id: previewDuplicate.id,
            fileName: previewDuplicate.original_name || previewDuplicate.file_name,
            duplicateCount: Math.max(Number(previewDuplicate.duplicate_count) || 0, 1),
            previewFileId: previewDuplicate.id,
            recordId: previewDuplicate.record_id || null,
            recordIndex: previewDuplicate.record_index || null,
        };
    }

    const previewAttachmentDuplicate = await knex('reimbursement_preview_files as pf')
        .join('reimbursement_attachments as att', 'att.original_path', 'pf.original_path')
        .join('reimbursement_records as rr', 'rr.id', 'att.record_id')
        .where('pf.project_id', projectId)
        .where('pf.file_hash', fileHash)
        .where('pf.document_type', normalizedDocumentType)
        .where('att.file_type', normalizedDocumentType)
        .where('rr.project_id', projectId)
        .select(
            'pf.id',
            'pf.file_name',
            'pf.original_name',
            'rr.id as record_id',
            'rr.index as record_index'
        )
        .first();

    if (previewAttachmentDuplicate) {
        return {
            source: 'record',
            id: previewAttachmentDuplicate.id,
            fileName: previewAttachmentDuplicate.original_name || previewAttachmentDuplicate.file_name,
            duplicateCount: 1,
            previewFileId: previewAttachmentDuplicate.id,
            recordId: previewAttachmentDuplicate.record_id,
            recordIndex: previewAttachmentDuplicate.record_index || null,
        };
    }

    const attachmentDuplicate = await knex('reimbursement_processed_files as pf')
        .join('reimbursement_attachments as att', 'att.original_path', 'pf.original_path')
        .join('reimbursement_records as rr', 'rr.id', 'att.record_id')
        .where('pf.project_id', projectId)
        .where('pf.file_hash', fileHash)
        .where('pf.file_type', normalizedDocumentType)
        .where('rr.project_id', projectId)
        .select(
            'pf.id',
            'pf.file_name',
            'rr.id as record_id',
            'rr.index as record_index'
        )
        .first();

    if (attachmentDuplicate) {
        return {
            source: 'record',
            id: attachmentDuplicate.id,
            fileName: attachmentDuplicate.file_name,
            duplicateCount: 1,
            previewFileId: null,
            recordId: attachmentDuplicate.record_id,
            recordIndex: attachmentDuplicate.record_index || null,
        };
    }

    return null;
}

/**
 * 导入文件到预览区
 * @param {string} projectId - 项目ID
 * @param {string} userId - 用户ID
 * @param {Object[]} files - 文件数组 [{ buffer, originalname, mimetype, size }]
 * @returns {Promise<{ imported: Object[], duplicates: Object[] }>}
 */
export async function importToPreview(projectId, userId, files, documentType = 'invoice') {
    const imported = [];
    const duplicates = [];

    for (const file of files) {
        const fileHash = calculateFileHash(file.buffer);
        const existing = await findActiveDuplicateFile(projectId, fileHash, documentType);

        if (existing) {
            duplicates.push({
                id: existing.id,
                fileName: file.originalname,
                originalId: existing.id,
                duplicateCount: existing.duplicateCount,
                source: existing.source,
                previewFileId: existing.previewFileId,
                recordId: existing.recordId,
                recordIndex: existing.recordIndex,
                existingFileName: existing.fileName,
            });
            continue;
        }

        // 新文件：保存并同步处理缩略图
        const [record] = await knex('reimbursement_preview_files')
            .insert({
                project_id: projectId,
                user_id: userId,
                file_name: file.originalname,
                original_name: file.originalname,
                file_hash: fileHash,
                mime_type: file.mimetype,
                file_size: file.size,
                status: 'preview',
                document_type: documentType,
            })
            .returning('*');

        // 同步处理缩略图，确保导入响应返回时缩略图已生成
        try {
            await processFileToImages(projectId, record.id, file.buffer, file.mimetype, file.originalname);
        } catch (err) {
            console.error('处理文件缩略图失败:', err);
            // 缩略图处理失败不影响导入流程，继续返回成功
        }

        imported.push({
            id: record.id,
            fileName: file.originalname,
            pageCount: 1,
            isDuplicate: false,
            duplicateCount: 0,
            documentType,
        });
        }

        return { imported, duplicates };
    }

    /**
     * 处理文件转图片（后台异步）
     * @param {string} projectId - 项目ID
     * @param {string} fileId - 文件ID
     * @param {Buffer} fileBuffer - 文件Buffer
     * @param {string} mimeType - MIME类型
     * @param {string} originalName - 原始文件名
     */
    async function processFileToImages(projectId, fileId, fileBuffer, mimeType, originalName) {
        const fileDir = path.join(STORAGE_DIR, projectId, fileId);
        await ensureDir(fileDir);

        const isPdf = mimeType === 'application/pdf' || originalName.toLowerCase().endsWith('.pdf');
        let thumbnailData = null;
        let originalPath = null;
        let pageCount = 1;
        let pageThumbnailPaths = [];

        if (isPdf) {
            // PDF: 渲染所有页面
            const pageBuffers = await renderPdfToImageBuffers(fileBuffer);
            pageCount = pageBuffers.length;

            // 保存原始PDF
            originalPath = path.join(fileDir, 'original.pdf');
            await fs.promises.writeFile(originalPath, fileBuffer);

            // 保存每页图片和缩略图
            for (let i = 0; i < pageBuffers.length; i++) {
                const pageNum = i + 1;
                const imagePath = path.join(fileDir, `page_${pageNum}.jpg`);
                const thumbPath = path.join(fileDir, `thumb_${pageNum}.jpg`);

                await fs.promises.writeFile(imagePath, pageBuffers[i]);
                await generateThumbnail(pageBuffers[i], thumbPath, 150);

                pageThumbnailPaths.push(thumbPath);

                // 第一页作为主缩略图
                if (i === 0) {
                    thumbnailData = await fs.promises.readFile(thumbPath);
                }
            }
        } else {
            // 图片文件
            originalPath = path.join(fileDir, 'original.jpg');
            await fs.promises.writeFile(originalPath, fileBuffer);

            // 生成缩略图
            const thumbPath = path.join(fileDir, 'thumb.jpg');
            await generateThumbnail(fileBuffer, thumbPath, 150);
            thumbnailData = await fs.promises.readFile(thumbPath);
            pageThumbnailPaths = [thumbPath];
        }

        // 更新数据库记录
        await knex('reimbursement_preview_files')
            .where({ id: fileId })
            .update({
                thumbnail_data: thumbnailData,
                original_path: originalPath,
                page_count: pageCount,
                page_thumbnail_paths: pageThumbnailPaths,
                updated_at: knex.fn.now(),
            });
    }

    /**
     * 获取预览文件列表
     * @param {string} projectId - 项目ID
     * @returns {Promise<Object[]>}
     */
    export async function getPreviewList(projectId) {
        const files = await knex('reimbursement_preview_files')
            .where({ project_id: projectId })
            .whereNot({ status: 'discarded' })
            .orderBy('created_at', 'desc');

        // 将缩略图转为base64
        return files.map(file => ({
            id: file.id,
            fileName: file.file_name,
            originalName: file.original_name,
            fileHash: file.file_hash,
            mimeType: file.mime_type,
            fileSize: file.file_size,
            pageCount: file.page_count,
            isDuplicate: file.is_duplicate,
            duplicateCount: file.duplicate_count,
            documentType: file.document_type || 'invoice',
            originalFileId: file.original_file_id,
            status: file.status,
            ocrMeta: file.ocr_meta,
            thumbnailBase64: file.thumbnail_data
                ? `data:image/jpeg;base64,${file.thumbnail_data.toString('base64')}`
                : null,
            createdAt: file.created_at,
            recognizedAt: file.recognized_at,
        }));
    }

async function readPreviewPageImageBuffers(previewFile) {
    if (!previewFile?.original_path) return [];

    const pageCount = Math.max(0, Number(previewFile.page_count) || 0);
    if (pageCount === 0) return [];

    const fileDir = path.dirname(previewFile.original_path);
    const pageBuffers = [];

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        const pagePath = path.join(fileDir, 'page_' + pageNumber + '.jpg');
        try {
            pageBuffers.push(await fs.promises.readFile(pagePath));
        } catch {
            return [];
        }
    }

    return pageBuffers;
}

/**
 * 从预览区识别文件
 * @param {string} projectId - 项目ID
 * @param {string} userId - 用户ID
 * @param {string} fileId - 预览文件ID
 * @param {Object} config - LLM配置
 * @param {boolean} forceRecognize - 强制识别重复文件
 * @returns {Promise<Object>}
 */
export async function recognizeFromPreview(projectId, userId, fileId, config, forceRecognize = false) {
    const previewFile = await knex('reimbursement_preview_files')
        .where({ id: fileId, project_id: projectId })
        .first();

    if (!previewFile) {
        throw new Error('预览文件不存在');
    }

    if (previewFile.status === PREVIEW_STATUS.RECOGNIZED) {
        throw new Error('该文件已识别');
    }

    if (previewFile.status === PREVIEW_STATUS.OCR_PROCESSING) {
        throw new Error('该文件正在识别，请等待当前任务完成');
    }

    // 检查是否为重复文件
    if (previewFile.is_duplicate && !forceRecognize) {
        return {
            needConfirm: true,
            message: '该文件已上传过，是否强制识别？',
            duplicateCount: previewFile.duplicate_count,
        };
    }

    if (!previewFile.original_path) {
        throw new Error('文件尚未处理完成，请稍后再试');
    }

    await claimPreviewFileForOcr(projectId, fileId);

    try {
        const fileBuffer = await fs.promises.readFile(previewFile.original_path);

        // PDF 在导入预览时已经渲染过页面，优先复用页面图。
        const {
            processInvoice,
            processMultiPageInvoice,
            processMultiPagePayment,
            processPayment,
        } = await import('./ocr.service.js');
        const fileType = previewFile.document_type || 'invoice';
        const isPdf = previewFile.mime_type === 'application/pdf' ||
            String(previewFile.file_name || '').toLowerCase().endsWith('.pdf') ||
            String(previewFile.original_name || '').toLowerCase().endsWith('.pdf');
        const pageImageBuffers = isPdf ? await readPreviewPageImageBuffers(previewFile) : [];

        const ocrResult = fileType === 'payment'
            ? (pageImageBuffers.length > 0
                ? await processMultiPagePayment({ imageBuffers: pageImageBuffers, config })
                : await processPayment({
                    fileBuffer,
                    mimeType: previewFile.mime_type,
                    filename: previewFile.original_name || previewFile.file_name,
                    config,
                }))
            : (pageImageBuffers.length > 0
                ? await processMultiPageInvoice({
                    imageBuffers: pageImageBuffers,
                    config,
                    filename: previewFile.original_name || previewFile.file_name,
                })
                : await processInvoice({
                    fileBuffer,
                    mimeType: previewFile.mime_type,
                    filename: previewFile.original_name || previewFile.file_name,
                    config,
                }));

        if (!ocrResult.success) {
            throw new Error('OCR识别失败');
        }

        const reviewedOcrMeta = buildReviewedOcrMeta(fileType, ocrResult.meta, ocrResult.data);

        if (fileType === 'payment') {
            const amount = Number(ocrResult.data.amount) || 0;
            const candidates = amount > 0
                ? await knex('reimbursement_records')
                    .where({ project_id: projectId })
                    .where('expense', amount)
                    .whereNotExists(function () {
                        this.select('*')
                            .from('reimbursement_attachments')
                            .whereRaw('reimbursement_attachments.record_id = reimbursement_records.id')
                            .where({ file_type: 'payment' });
                    })
                : [];

            if (candidates.length === 1) {
                await attachPreviewFileToRecord(candidates[0].id, previewFile, 'payment');
                await knex('reimbursement_records')
                    .where({ id: candidates[0].id })
                    .update({
                        ocr_meta: mergeRecordOcrMeta(candidates[0].ocr_meta, 'payment', reviewedOcrMeta),
                        updated_at: knex.fn.now(),
                    });
                await markPreviewFileRecognized(fileId, reviewedOcrMeta);
                return {
                    success: true,
                    ocrResult: ocrResult.data,
                    ocrMeta: reviewedOcrMeta,
                    recordId: candidates[0].id,
                    autoMatched: true,
                    isDuplicate: previewFile.is_duplicate,
                };
            }

            if (candidates.length > 1) {
                const [pendingMatch] = await knex('reimbursement_pending_matches')
                    .insert({
                        project_id: projectId,
                        user_id: userId,
                        payment_data: {
                            ...ocrResult.data,
                            ocrMeta: reviewedOcrMeta,
                            previewFileId: previewFile.id,
                            fileName: previewFile.file_name,
                        },
                        candidate_ids: candidates.map((candidate) => candidate.id),
                        status: 'pending',
                    })
                    .returning('*');

                await markPreviewFileRecognized(fileId, reviewedOcrMeta);
                return {
                    success: true,
                    ocrResult: ocrResult.data,
                    ocrMeta: reviewedOcrMeta,
                    pendingMatch: true,
                    matchId: pendingMatch.id,
                    candidateCount: candidates.length,
                    isDuplicate: previewFile.is_duplicate,
                };
            }

            const paymentRecord = await createPaymentRecord(projectId, userId, previewFile, ocrResult.data, reviewedOcrMeta);
            return {
                success: true,
                ocrResult: ocrResult.data,
                ocrMeta: reviewedOcrMeta,
                recordId: paymentRecord.id,
                isDuplicate: previewFile.is_duplicate,
            };
        }

        const invoiceCandidates = await findInvoiceMatchCandidates(projectId, ocrResult.data);
        if (invoiceCandidates.length === 1) {
            const mergedRecord = await mergeInvoiceIntoRecord(invoiceCandidates[0].id, ocrResult.data, {
                previewFileId: previewFile.id,
                ocrMeta: reviewedOcrMeta,
            });
            await attachPreviewFileToRecord(mergedRecord.id, previewFile, 'invoice');
            await markPreviewFileRecognized(previewFile.id, reviewedOcrMeta);

            return {
                success: true,
                ocrResult: ocrResult.data,
                ocrMeta: reviewedOcrMeta,
                recordId: mergedRecord.id,
                mergedIntoRecord: true,
                isDuplicate: previewFile.is_duplicate,
            };
        }

        const record = await createInvoiceRecord(projectId, userId, previewFile, ocrResult.data, reviewedOcrMeta);

        return {
            success: true,
            ocrResult: ocrResult.data,
            ocrMeta: reviewedOcrMeta,
            recordId: record.id,
            isDuplicate: previewFile.is_duplicate,
        };
    } catch (error) {
        await releasePreviewFileOcrClaim(fileId);
        throw error;
    }
}
/**
 * 从预览区移除文件
 * @param {string} projectId - 项目ID
 * @param {string} fileId - 文件ID
 * @returns {Promise<void>}
 */
export async function discardPreviewFile(projectId, fileId) {
    const previewFile = await knex('reimbursement_preview_files')
        .where({ id: fileId, project_id: projectId })
        .first();

    if (!previewFile) {
        throw new Error('预览文件不存在');
    }

    if (previewFile.status === 'recognized') {
        throw new Error('已识别的文件不能移除');
    }

    if (previewFile.status === PREVIEW_STATUS.OCR_PROCESSING) {
        throw new Error('该文件正在识别，完成或失败后再移除');
    }

    // 标记为已丢弃
    await knex('reimbursement_preview_files')
        .where({ id: fileId })
        .update({
            status: 'discarded',
            updated_at: knex.fn.now(),
        });

    // 删除文件系统中的文件
    if (previewFile.original_path) {
        const fileDir = path.dirname(previewFile.original_path);
        try {
            await fs.promises.rm(fileDir, { recursive: true, force: true });
        } catch (err) {
            console.error('删除预览文件失败:', err);
        }
    }
}

/**
 * 获取预览统计
 * @param {string} projectId - 项目ID
 * @returns {Promise<Object>}
 */
export async function getPreviewStats(projectId) {
    const stats = await knex('reimbursement_preview_files')
        .where({ project_id: projectId })
        .whereNot({ status: 'discarded' })
        .select('status', 'is_duplicate')
        .count('* as count')
        .groupBy('status', 'is_duplicate');

    const result = {
        total: 0,
        preview: 0,
        processing: 0,
        recognized: 0,
        duplicates: 0,
    };

    for (const stat of stats) {
        const count = Number(stat.count);
        result.total += count;
        if (stat.status === 'preview') result.preview += count;
        if (stat.status === PREVIEW_STATUS.OCR_PROCESSING) result.processing += count;
        if (stat.status === 'recognized') result.recognized += count;
        if (stat.is_duplicate) result.duplicates += count;
    }

    return result;
}

/**
 * 导出Excel和图片ZIP
 * @param {string} projectId - 项目ID
 * @param {{ includeBuffers?: boolean }} [options] - 是否读取附件文件内容
 * @returns {Promise<{ records: Object[], imagesByRecord: Map<string, Object[]> }>}
 */
export async function exportWithImages(projectId, options = {}) {
    const { includeBuffers = true } = options;

    // 获取所有记录
    const records = await knex('reimbursement_records')
        .where({ project_id: projectId })
        .orderBy('index', 'asc');

    // 获取所有附件
    const recordIds = records.map(r => r.id);
    const attachments = recordIds.length > 0
        ? await knex('reimbursement_attachments').whereIn('record_id', recordIds)
        : [];

    // 按记录ID分组图片
    const imagesByRecord = new Map();
    for (const attachment of attachments) {
        const recordId = attachment.record_id;
        if (!imagesByRecord.has(recordId)) {
            imagesByRecord.set(recordId, []);
        }

        const attachmentInfo = {
            fileName: attachment.file_name,
            originalName: attachment.original_name,
            fileType: attachment.file_type,
        };

        if (!includeBuffers) {
            imagesByRecord.get(recordId).push(attachmentInfo);
            continue;
        }

        // 读取图片文件
        if (attachment.original_path) {
            try {
                const imageBuffer = await fs.promises.readFile(attachment.original_path);
                imagesByRecord.get(recordId).push({
                    ...attachmentInfo,
                    buffer: imageBuffer,
                });
            } catch (err) {
                console.error(`读取附件失败: ${attachment.original_path}`, err);
            }
        }
    }

    return {
        records,
        imagesByRecord,
    };
}

async function buildExportWorkbookArtifacts(projectId, options = {}) {
    const { includeAttachmentBuffers = true } = options;
    const ExcelJS = (await import('exceljs')).default;

    const { records, imagesByRecord } = await exportWithImages(projectId, {
        includeBuffers: includeAttachmentBuffers,
    });

    // 获取项目简称
    const project = await knex('reimbursement_projects').where({ id: projectId }).first();
    const projectShortName = project?.short_name || project?.name || '';

    // 创建Excel工作簿
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'VLM 报销助手';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('项目支出具体明细表', {
        views: [{ showGridLines: false }],
    });

    // 设置列宽 - 新增发票代码和发票号码列
    sheet.columns = [
        { key: 'No', width: 6 },
        { key: 'PaymentDate', width: 12 },
        { key: 'InvoiceCode', width: 15 },
        { key: 'InvoiceNumber', width: 22 },
        { key: 'Category', width: 12 },
        { key: 'SubCategory', width: 12 },
        { key: 'Description', width: 20 },
        { key: 'Income', width: 12 },
        { key: 'UnitPrice', width: 12 },
        { key: 'Unit', width: 6 },
        { key: 'Quantity', width: 6 },
        { key: 'Total', width: 12 },
        { key: 'Balance', width: 12 },
        { key: 'Reporter', width: 10 },
        { key: 'HasInvoice', width: 10 },
        { key: 'Attachment', width: 20 },
        { key: 'Company', width: 30 },
        { key: 'Remarks', width: 15 },
    ];

    // 添加大标题
    const titleRow = sheet.getRow(1);
    titleRow.height = 30;
    sheet.mergeCells('A1:R1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = '项目支出具体明细表';
    titleCell.font = { name: 'Microsoft YaHei', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC00000' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

    // 添加表头 - 新增发票代码和发票号码
    const headerRow = sheet.getRow(2);
    headerRow.height = 25;
    const headers = ['序号', '支付日期', '发票代码', '发票号码', '报销类别', '报销大类', '报销明细说明', '收入金额', '支出金额', '', '', '', '结余', '报销人', '是否有发票', '附件', '开票公司主体', '备注'];
    headers.forEach((val, i) => {
        const cell = sheet.getCell(2, i + 1);
        cell.value = val;
        cell.font = { name: 'Microsoft YaHei', size: 10, bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDEDED' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    // 合并表头单元格
    sheet.mergeCells('I2:L2');

    // 辅助函数：生成导出文件名
    const normalizeFileNamePart = (value) => String(value || '')
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
        .replace(/\s+/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    const formatRecordDateForFileName = (value) => {
        if (!value) return '';
        if (value instanceof Date) {
            return value.toISOString().slice(0, 10).replace(/-/g, '');
        }

        const normalized = String(value).slice(0, 10);
        return normalized.replace(/-/g, '');
    };

    const generateExportFileName = (record, attachment, index) => {
        const parts = [];

        // 1. 类型标识
        const docType = attachment.file_type === 'payment' ? '支付记录' : '发票';
        parts.push(docType);

        // 2. 序号
        parts.push(record.index);

        // 3. 日期
        if (record.payment_date) {
            parts.push(formatRecordDateForFileName(record.payment_date));
        }

        // 4. 发票号（仅发票类型）
        if (attachment.file_type === 'invoice' && record.invoice_number) {
            parts.push(record.invoice_number);
        }

        // 5. 支付人
        if (record.reporter) {
            parts.push(record.reporter);
        }

        // 6. 项目简称
        if (projectShortName) {
            parts.push(projectShortName);
        }

        // 7. 金额
        const amount = Number(record.expense) || 0;
        if (amount > 0) {
            parts.push(`${amount}元`);
        }

        // 获取文件扩展名
        const originalName = attachment.original_name || attachment.file_name || '';
        const ext = originalName.includes('.') ? '.' + originalName.split('.').pop() : '.jpg';

        const fileName = parts
            .map(normalizeFileNamePart)
            .filter(Boolean)
            .join('-');

        return `${fileName || `附件-${index + 1}`}${ext}`;
    };

    const buildExportAttachment = (record, img) => ({
        file_type: img.fileType || (record.has_invoice ? 'invoice' : 'payment'),
        original_name: img.originalName || img.fileName,
        file_name: img.fileName,
    });

    const getExportAttachmentFileName = (record, img, index) => (
        generateExportFileName(record, buildExportAttachment(record, img), index)
    );

    const usedExportAttachmentNames = new Set();
    const reserveUniqueExportAttachmentName = (fileName) => {
        const fallbackName = fileName || '附件.jpg';
        if (!usedExportAttachmentNames.has(fallbackName)) {
            usedExportAttachmentNames.add(fallbackName);
            return fallbackName;
        }

        const ext = path.extname(fallbackName);
        const baseName = ext ? fallbackName.slice(0, -ext.length) : fallbackName;
        let suffix = 2;
        let candidate = `${baseName}-${suffix}${ext}`;

        while (usedExportAttachmentNames.has(candidate)) {
            suffix += 1;
            candidate = `${baseName}-${suffix}${ext}`;
        }

        usedExportAttachmentNames.add(candidate);
        return candidate;
    };

    // 插入数据行
    let balance = 0;
    let totalIncome = 0;
    let totalExpense = 0;
    const attachmentInfo = []; // 用于记录附件信息

    records.forEach((record, i) => {
        const income = Number(record.income) || 0;
        const expense = Number(record.expense) || 0;
        totalIncome += income;
        totalExpense += expense;
        balance += income - expense;

        const images = imagesByRecord.get(record.id) || [];
        const exportImages = images.map((img, idx) => ({
            ...img,
            exportFileName: reserveUniqueExportAttachmentName(
                getExportAttachmentFileName(record, img, idx)
            ),
        }));
        const attachmentNames = exportImages
            .map((img, idx) => `${idx + 1}. ${img.exportFileName}`)
            .join('\n');

        const dataRow = sheet.addRow({
            No: i + 1,
            PaymentDate: record.payment_date || '',
            InvoiceCode: record.invoice_code || '',
            InvoiceNumber: record.invoice_number || '',
            Category: record.category || '',
            SubCategory: record.sub_category || '',
            Description: record.description || '',
            Income: income > 0 ? income : null,
            UnitPrice: expense > 0 ? expense : null,
            Unit: expense > 0 ? '项' : '',
            Quantity: expense > 0 ? 1 : null,
            Total: expense > 0 ? expense : null,
            Balance: balance,
            Reporter: record.reporter || '',
            HasInvoice: record.has_invoice ? '是' : '否',
            Attachment: attachmentNames || '',
            Company: record.company || '',
            Remarks: record.remarks || '',
        });

        // 记录附件信息
        if (images.length > 0) {
            attachmentInfo.push({
                row: i + 3, // 数据行号（从第3行开始）
                recordId: record.id,
                record,
                images: exportImages,
            });
        }

        // 设置行样式
        dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' },
            };
            cell.font = { name: 'Microsoft YaHei', size: 10 };
            cell.alignment = { vertical: 'middle', wrapText: true };
        });
    });

    if (records.length > 0) {
        const totalRow = sheet.addRow({
            No: '费用总计',
            Income: totalIncome > 0 ? totalIncome : null,
            Total: totalExpense > 0 ? totalExpense : 0,
            Balance: balance,
        });

        totalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' },
            };
            cell.font = { name: 'Microsoft YaHei', size: 10, bold: true };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDEDED' } };
            cell.alignment = { vertical: 'middle', horizontal: colNumber === 1 ? 'center' : 'right', wrapText: true };
        });
    }

    addExportCheckWorksheet(workbook, records, imagesByRecord);

    // 生成Excel Buffer
    const rawExcelBuffer = await workbook.xlsx.writeBuffer();
    const excelBuffer = Buffer.isBuffer(rawExcelBuffer)
        ? rawExcelBuffer
        : Buffer.from(rawExcelBuffer);

    return { excelBuffer, attachmentInfo };
}

/**
 * 生成导出Excel工作簿
 * @param {string} projectId - 项目ID
 * @returns {Promise<Buffer>} Excel文件Buffer
 */
export async function generateExportWorkbook(projectId) {
    const { excelBuffer } = await buildExportWorkbookArtifacts(projectId, {
        includeAttachmentBuffers: false,
    });
    return excelBuffer;
}

/**
 * 生成导出ZIP（Excel + 图片文件夹）
 * @param {string} projectId - 项目ID
 * @param {string} projectName - 项目名称
 * @returns {Promise<Buffer>} ZIP文件Buffer
 */
export async function generateExportZip(projectId, projectName) {
    const archiver = (await import('archiver')).default;
    const { excelBuffer, attachmentInfo } = await buildExportWorkbookArtifacts(projectId, {
        includeAttachmentBuffers: true,
    });

    // 创建ZIP
    const zipBuffer = await new Promise((resolve, reject) => {
        const archive = archiver('zip', { zlib: { level: 9 } });
        const chunks = [];

        archive.on('data', (chunk) => chunks.push(chunk));
        archive.on('end', () => resolve(Buffer.concat(chunks)));
        archive.on('error', reject);

        // 添加Excel文件
        archive.append(excelBuffer, { name: `${projectName || '报销单'}_支出明细表.xlsx` });

        // 添加图片文件夹 - 使用新命名规范
        const imagesFolder = '发票图片';
        for (const info of attachmentInfo) {
            const images = info.images;
            for (let j = 0; j < images.length; j++) {
                const img = images[j];
                archive.append(img.buffer, { name: `${imagesFolder}/${img.exportFileName}` });
            }
        }

        archive.finalize();
    });

    return zipBuffer;
}
