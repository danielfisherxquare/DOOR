/**
 * Invoice Processor Service
 * 发票处理服务 - 带进度更新的 OCR 处理
 */

import knex from '../../db/knex.js';
import { processInvoice as ocrProcessInvoice, processPayment as ocrProcessPayment } from './ocr.service.js';
import {
    saveInvoiceFile,
    savePdfPages,
    saveOcrResult,
} from './invoice.storage.js';
import {
    attachProcessedPayment,
    createPendingMatch,
    createStandalonePaymentRecord,
    findMatchingRecords,
} from './reimbursement.service.js';

/**
 * 处理步骤枚举
 */
export const ProcessingStep = {
    PENDING: 'pending',
    UPLOAD_COMPLETE: 'upload_complete',
    PDF_RENDERING: 'pdf_rendering',
    OCR_PROCESSING: 'ocr_processing',
    SAVING_RESULT: 'saving_result',
    COMPLETED: 'completed',
    ERROR: 'error',
};

/**
 * 记录处理日志
 * @param {string} invoiceId - 发票记录 ID
 * @param {string} step - 处理步骤
 * @param {string} message - 日志消息
 * @param {Object} metadata - 附加元数据
 */
async function logProcessingStep(invoiceId, step, message, metadata = {}) {
    const logEntry = {
        step,
        message,
        timestamp: new Date().toISOString(),
        ...metadata,
    };

    // 获取现有日志
    const record = await knex('reimbursement_processed_files')
        .where({ id: invoiceId })
        .first();

    let logs = [];
    if (record?.processing_log) {
        logs = Array.isArray(record.processing_log) ? record.processing_log : [];
    }

    logs.push(logEntry);

    // 更新日志
    await knex('reimbursement_processed_files')
        .where({ id: invoiceId })
        .update({
            processing_log: logs,
            updated_at: knex.fn.now(),
        });

    // 同时通过 SSE 或其他方式通知前端（预留接口）
    // 当前通过轮询获取最新状态
}

/**
 * 更新处理状态
 * @param {string} invoiceId - 发票记录 ID
 * @param {string} status - 状态
 * @param {Object} extra - 额外字段
 */
async function updateProcessingStatus(invoiceId, status, extra = {}) {
    const updateData = {
        status,
        processed_at: status === 'completed' || status === 'error' ? knex.fn.now() : undefined,
        ...extra,
    };

    await knex('reimbursement_processed_files')
        .where({ id: invoiceId })
        .update(updateData);
}

/**
 * 处理发票（带进度追踪）
 * @param {Object} params
 * @param {string} params.projectId - 项目 ID
 * @param {string} params.invoiceId - 发票记录 ID（reimbursement_processed_files 的 ID）
 * @param {Buffer} params.fileBuffer - 文件 Buffer
 * @param {string} params.mimeType - MIME 类型
 * @param {string} params.originalName - 原始文件名
 * @param {Object} params.config - LLM 配置
 * @returns {Promise<Object>} OCR 识别结果
 */
export async function processInvoiceWithProgress({
    projectId,
    invoiceId,
    fileBuffer,
    mimeType,
    originalName,
    config,
}) {
    try {
        // Step 1: 上传完成
        await logProcessingStep(invoiceId, ProcessingStep.UPLOAD_COMPLETE, '文件上传完成，开始处理...');

        const isPdf = mimeType === 'application/pdf' || originalName.toLowerCase().endsWith('.pdf');

        // Step 2: 保存原始文件
        const { invoiceDir } = await saveInvoiceFile(projectId, invoiceId, fileBuffer, originalName, mimeType);

        let pageBuffers = [];
        let savedPaths = [];

        // Step 3: PDF 渲染或缩略图生成
        if (isPdf) {
            await logProcessingStep(invoiceId, ProcessingStep.PDF_RENDERING, '正在渲染 PDF 为图片...');

            // 使用 ocr.service.js 中的 PDF 渲染逻辑
            const { renderPdfToImageBuffers } = await import('./ocr.service.js');
            pageBuffers = await renderPdfToImageBuffers(fileBuffer);

            // 保存渲染后的页面图片
            savedPaths = await savePdfPages(projectId, invoiceId, pageBuffers);

            await logProcessingStep(invoiceId, ProcessingStep.PDF_RENDERING, `PDF 渲染完成，共 ${pageBuffers.length} 页`, {
                pageCount: pageBuffers.length,
            });
        }

        // Step 4: OCR 识别
        await logProcessingStep(invoiceId, ProcessingStep.OCR_PROCESSING, '正在进行 OCR 识别...');

        const ocrResult = await ocrProcessInvoice({
            fileBuffer,
            mimeType,
            config,
        });

        if (!ocrResult.success) {
            throw new Error('OCR 识别失败：' + JSON.stringify(ocrResult));
        }

        await logProcessingStep(invoiceId, ProcessingStep.OCR_PROCESSING, 'OCR 识别完成', {
            amount: ocrResult.data?.amount,
            date: ocrResult.data?.date,
            buyer: ocrResult.data?.buyer,
        });

        // Step 5: 保存结果
        await logProcessingStep(invoiceId, ProcessingStep.SAVING_RESULT, '正在保存识别结果...');

        await saveOcrResult(projectId, invoiceId, ocrResult.data);

        // 更新数据库记录
        await updateProcessingStatus(invoiceId, 'completed', {
            ocr_result: ocrResult.data,
            thumbnail_path: isPdf
                ? `${invoiceDir}/thumbnail_1.jpg`
                : `${invoiceDir}/thumbnail.jpg`,
            original_path: `${invoiceDir}/original${isPdf ? '.pdf' : '.jpg'}`,
        });

        await logProcessingStep(invoiceId, ProcessingStep.COMPLETED, '处理完成');

        return ocrResult;
    } catch (error) {
        console.error('发票处理失败:', error);

        // 记录错误
        await logProcessingStep(invoiceId, ProcessingStep.ERROR, `处理失败：${error.message}`, {
            error: error.stack,
        });

        await updateProcessingStatus(invoiceId, 'error', {
            error_message: error.message,
        });

        throw error;
    }
}

/**
 * 处理付款凭证（带进度追踪）
 * @param {Object} params
 * @param {string} params.projectId - 项目 ID
 * @param {string} params.paymentId - 付款凭证记录 ID
 * @param {Buffer} params.fileBuffer - 文件 Buffer
 * @param {string} params.mimeType - MIME 类型
 * @param {string} params.originalName - 原始文件名
 * @param {Object} params.config - LLM 配置
 * @returns {Promise<Object>} OCR 识别结果
 */
export async function processPaymentWithProgress({
    projectId,
    userId,
    paymentId,
    fileBuffer,
    mimeType,
    originalName,
    config,
}) {
    try {
        // Step 1: 上传完成
        await logProcessingStep(paymentId, ProcessingStep.UPLOAD_COMPLETE, '文件上传完成，开始处理...');

        const isPdf = mimeType === 'application/pdf' || originalName.toLowerCase().endsWith('.pdf');

        // Step 2: 保存原始文件
        const { invoiceDir } = await saveInvoiceFile(projectId, paymentId, fileBuffer, originalName, mimeType);

        let pageBuffers = [];

        // Step 3: PDF 渲染或缩略图生成
        if (isPdf) {
            await logProcessingStep(paymentId, ProcessingStep.PDF_RENDERING, '正在渲染 PDF 为图片...');

            const { renderPdfToImageBuffers } = await import('./ocr.service.js');
            pageBuffers = await renderPdfToImageBuffers(fileBuffer);
            await savePdfPages(projectId, paymentId, pageBuffers);

            await logProcessingStep(paymentId, ProcessingStep.PDF_RENDERING, `PDF 渲染完成，共 ${pageBuffers.length} 页`, {
                pageCount: pageBuffers.length,
            });
        }

        // Step 4: OCR 识别
        await logProcessingStep(paymentId, ProcessingStep.OCR_PROCESSING, '正在进行 OCR 识别...');

        const ocrResult = await ocrProcessPayment({
            fileBuffer,
            mimeType,
            config,
        });

        if (!ocrResult.success) {
            throw new Error('OCR 识别失败：' + JSON.stringify(ocrResult));
        }

        await logProcessingStep(paymentId, ProcessingStep.OCR_PROCESSING, 'OCR 识别完成', {
            amount: ocrResult.data?.amount,
            date: ocrResult.data?.date,
            payee: ocrResult.data?.payee,
        });

        // Step 5: 保存结果
        await logProcessingStep(paymentId, ProcessingStep.SAVING_RESULT, '正在保存识别结果...');

        await saveOcrResult(projectId, paymentId, ocrResult.data);

        // 更新数据库记录
        await updateProcessingStatus(paymentId, 'completed', {
            ocr_result: ocrResult.data,
            thumbnail_path: isPdf
                ? `${invoiceDir}/thumbnail_1.jpg`
                : `${invoiceDir}/thumbnail.jpg`,
            original_path: `${invoiceDir}/original${isPdf ? '.pdf' : '.jpg'}`,
        });

        if (projectId && userId && ocrResult.data) {
            const candidates = await findMatchingRecords(projectId, ocrResult.data.amount);
            const paymentFile = {
                processedFileId: paymentId,
                fileName: originalName,
                originalName,
                mimeType,
                fileSize: fileBuffer.length,
            };

            if (candidates.length === 1) {
                await attachProcessedPayment(candidates[0].id, paymentFile);
                await logProcessingStep(paymentId, ProcessingStep.SAVING_RESULT, '付款凭证已自动匹配到已有报销记录', {
                    matchedRecordId: candidates[0].id,
                });
            } else if (candidates.length > 1) {
                const pendingMatch = await createPendingMatch(projectId, userId, {
                    paymentData: {
                        ...ocrResult.data,
                        ...paymentFile,
                    },
                    candidateIds: candidates.map((candidate) => candidate.id),
                });
                await logProcessingStep(paymentId, ProcessingStep.SAVING_RESULT, '付款凭证已进入待匹配列表', {
                    pendingMatchId: pendingMatch.id,
                    candidateCount: candidates.length,
                });
            } else {
                const record = await createStandalonePaymentRecord(projectId, userId, ocrResult.data);
                await attachProcessedPayment(record.id, paymentFile);
                await logProcessingStep(paymentId, ProcessingStep.SAVING_RESULT, '付款凭证已写入独立报销记录', {
                    createdRecordId: record.id,
                });
            }
        }

        await logProcessingStep(paymentId, ProcessingStep.COMPLETED, '处理完成');

        return ocrResult;
    } catch (error) {
        console.error('付款凭证处理失败:', error);

        await logProcessingStep(paymentId, ProcessingStep.ERROR, `处理失败：${error.message}`, {
            error: error.stack,
        });

        await updateProcessingStatus(paymentId, 'error', {
            error_message: error.message,
        });

        throw error;
    }
}

/**
 * 获取处理队列状态
 * @param {string} projectId - 项目 ID
 * @returns {Promise<Array>}
 */
export async function getProcessingQueue(projectId) {
    const records = await knex('reimbursement_processed_files')
        .where({ project_id: projectId })
        .orderBy('processed_at', 'desc')
        .limit(100);

    return records.map(record => ({
        id: record.id,
        fileName: record.file_name,
        fileType: record.file_type,
        status: record.status,
        thumbnailPath: record.thumbnail_path,
        ocrResult: record.ocr_result,
        errorMessage: record.error_message,
        processingLog: record.processing_log || [],
        processedAt: record.processed_at,
        startedAt: record.started_at,
    }));
}

/**
 * 获取单张发票详情
 * @param {string} projectId - 项目 ID
 * @param {string} invoiceId - 发票记录 ID
 * @returns {Promise<Object>}
 */
export async function getInvoiceDetail(projectId, invoiceId) {
    const record = await knex('reimbursement_processed_files')
        .where({ id: invoiceId, project_id: projectId })
        .first();

    if (!record) {
        return null;
    }

    return {
        id: record.id,
        fileName: record.file_name,
        fileType: record.file_type,
        status: record.status,
        thumbnailPath: record.thumbnail_path,
        originalPath: record.original_path,
        ocrResult: record.ocr_result,
        errorMessage: record.error_message,
        processingLog: record.processing_log || [],
        processedAt: record.processed_at,
        startedAt: record.started_at,
    };
}

/**
 * 更新 OCR 识别结果（人工校对后）
 * @param {string} invoiceId - 发票记录 ID
 * @param {Object} ocrResult - 更新后的 OCR 结果
 */
export async function updateInvoiceOCR(invoiceId, ocrResult) {
    await knex('reimbursement_processed_files')
        .where({ id: invoiceId })
        .update({
            ocr_result: ocrResult,
        });

    return { success: true };
}

/**
 * 获取处理统计
 * @param {string} projectId - 项目 ID
 * @returns {Promise<Object>}
 */
export async function getInvoiceProcessingStats(projectId) {
    const stats = await knex('reimbursement_processed_files')
        .where({ project_id: projectId })
        .select('status')
        .count('* as count')
        .groupBy('status');

    const result = {
        total: 0,
        pending: 0,
        processing: 0,
        completed: 0,
        error: 0,
    };

    for (const stat of stats) {
        const count = Number(stat.count);
        result.total += count;
        if (stat.status === 'pending') result.pending = count;
        else if (stat.status === 'processing') result.processing = count;
        else if (stat.status === 'completed') result.completed = count;
        else if (stat.status === 'error') result.error = count;
    }

    return result;
}
