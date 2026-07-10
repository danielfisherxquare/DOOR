/**
 * Invoice Controller
 * 发票可视化处理 API 控制器
 */

import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as processor from './invoice.processor.js';
import * as storage from './invoice.storage.js';
import * as reimbursementService from './reimbursement.service.js';
import { resolveOcrConfig, normalizeOcrError } from './reimbursement.controller.js';
import { processPayment } from './ocr.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = path.join(__dirname, '../../../storage/invoices');

// 临时上传存储（内存）
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
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

/**
 * GET /api/reimbursement/invoices/processing-queue/:projectId
 * 获取处理队列状态
 */
async function getProcessingQueue(req, res, next) {
    try {
        const { projectId } = req.params;
        const queue = await processor.getProcessingQueue(projectId);
        res.json({ queue });
    } catch (error) {
        next(error);
    }
}

/**
 * GET /api/reimbursement/invoices/stats/:projectId
 * 获取处理统计
 */
async function getInvoiceStats(req, res, next) {
    try {
        const { projectId } = req.params;
        const stats = await processor.getInvoiceProcessingStats(projectId);
        res.json({ stats });
    } catch (error) {
        next(error);
    }
}

/**
 * GET /api/reimbursement/invoices/:id
 * 获取发票详情
 */
async function getInvoiceDetail(req, res, next) {
    try {
        const { projectId, id } = req.params;
        const invoice = await processor.getInvoiceDetail(projectId, id);

        if (!invoice) {
            return res.status(404).json({ error: '发票不存在' });
        }

        res.json({ invoice });
    } catch (error) {
        next(error);
    }
}

/**
 * GET /api/reimbursement/invoices/:id/image
 * 获取发票图片
 */
async function getInvoiceImage(req, res, next) {
    try {
        const { projectId, id } = req.params;
        const { type = 'thumbnail', page } = req.query;

        const imageInfo = await storage.getInvoiceImage(projectId, id, type, page ? parseInt(page) : undefined);

        if (!imageInfo || !(await fileExists(imageInfo.path))) {
            // 返回占位图
            return res.status(404).json({ error: '图片不存在' });
        }

        res.setHeader('Content-Type', imageInfo.mimeType);
        res.setHeader('Cache-Control', 'public, max-age=31536000');

        const stream = fs.createReadStream(imageInfo.path);
        stream.pipe(res);
    } catch (error) {
        next(error);
    }
}

/**
 * PUT /api/reimbursement/invoices/:id/ocr
 * 更新 OCR 识别结果（人工校对）
 */
async function updateInvoiceOCR(req, res, next) {
    try {
        const { projectId, id } = req.params;
        const { ocrResult } = req.body;

        if (!ocrResult) {
            return res.status(400).json({ error: 'OCR 结果不能为空' });
        }

        const invoice = await reimbursementService.getProcessedFile(projectId, id);

        if (!invoice) {
            return res.status(404).json({ error: '发票不存在' });
        }

        const result = await processor.updateInvoiceOCR(id, ocrResult);
        res.json(result);
    } catch (error) {
        next(error);
    }
}

/**
 * POST /api/reimbursement/invoices/:id/reprocess
 * 重新处理发票
 */
async function reprocessInvoice(req, res, next) {
    let processingRecord = null;

    try {
        const { projectId, id } = req.params;

        // 获取原始文件
        const record = await reimbursementService.getProcessedFile(projectId, id);

        if (!record) {
            return res.status(404).json({ error: '发票记录不存在' });
        }

        // 读取原始文件
        const invoiceDir = path.join(STORAGE_DIR, projectId, id);
        let originalPath;

        // 检查是 PDF 还是图片
        const possiblePaths = [
            path.join(invoiceDir, 'original.pdf'),
            path.join(invoiceDir, 'original.jpg'),
            path.join(invoiceDir, 'original.png'),
        ];

        for (const p of possiblePaths) {
            if (await fileExists(p)) {
                originalPath = p;
                break;
            }
        }

        if (!originalPath) {
            return res.status(404).json({ error: '原始文件不存在' });
        }

        const fileBuffer = await fs.promises.readFile(originalPath);
        const mimeType = originalPath.endsWith('.pdf')
            ? 'application/pdf'
            : originalPath.endsWith('.png')
            ? 'image/png'
            : 'image/jpeg';

        // 获取 OCR 配置
        const config = await resolveOcrConfig(req);
        if (!config.baseUrl || !config.apiKey) {
            const error = new Error('缺少 OCR 模型配置');
            error.status = 400;
            throw error;
        }

        // 重新处理
        const result = await processor.processInvoiceWithProgress({
            projectId,
            invoiceId: id,
            fileBuffer,
            mimeType,
            originalName: record.file_name,
            config,
        });

        res.json(result);
    } catch (error) {
        console.error('重新处理发票失败:', error);

        if (processingRecord) {
            await reimbursementService.updateProcessingStatus(processingRecord.id, 'error', {
                errorMessage: error.message,
            });
        }

        next(normalizeOcrError(error, '发票识别'));
    }
}

/**
 * DELETE /api/reimbursement/invoices/:id
 * 删除发票记录
 */
async function deleteInvoice(req, res, next) {
    try {
        const { projectId, id } = req.params;

        const deleted = await reimbursementService.deleteProcessedFile(projectId, id);
        if (!deleted) {
            return res.status(404).json({ error: '发票不存在' });
        }
        await storage.deleteInvoiceFiles(projectId, id);

        res.json({ success: true });
    } catch (error) {
        next(error);
    }
}

/**
 * POST /api/reimbursement/invoices/upload/:projectId
 * 上传并处理发票
 */
async function uploadAndProcessInvoice(req, res, next) {
    let processingRecord = null;

    try {
        if (!req.file) {
            return res.status(400).json({ error: '未上传文件' });
        }

        const { projectId } = req.params;
        const userId = req.authContext?.userId;

        // 计算文件哈希
        const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

        const { skipped, record, existing } = await reimbursementService.startProcessingFile(
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
                existingInvoiceId: existing.id,
                status: existing.status,
                message: '文件已处理过，跳过重复处理',
            });
        }

        processingRecord = record;

        // 获取 OCR 配置
        const config = await resolveOcrConfig(req);
        if (!config.baseUrl || !config.apiKey) {
            const error = new Error('缺少 OCR 模型配置');
            error.status = 400;
            throw error;
        }

        // 异步处理（不阻塞响应）
        // 前端通过轮询获取进度
        processor.processInvoiceWithProgress({
            projectId,
            invoiceId: record.id,
            fileBuffer: req.file.buffer,
            mimeType: req.file.mimetype || 'application/octet-stream',
            originalName: req.file.originalname,
            config,
        }).catch(err => {
            console.error('异步处理发票失败:', err);
            // 错误已通过 processInvoiceWithProgress 内部处理记录
        });

        // 立即返回记录 ID，前端轮询进度
        res.json({
            success: true,
            invoiceId: record.id,
            status: 'processing',
            message: '发票已开始处理，请稍后查看进度',
        });
    } catch (error) {
        console.error('上传发票失败:', error);

        if (processingRecord) {
            await reimbursementService.updateProcessingStatus(processingRecord.id, 'error', {
                errorMessage: error.message,
            });
        }

        next(error);
    }
}

/**
 * POST /api/reimbursement/invoices/upload-payment/:projectId
 * 上传并处理付款凭证
 */
async function uploadAndProcessPayment(req, res, next) {
    let processingRecord = null;

    try {
        if (!req.file) {
            return res.status(400).json({ error: '未上传文件' });
        }

        const { projectId } = req.params;
        const userId = req.authContext?.userId;

        // 计算文件哈希
        const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

        const { skipped, record, existing } = await reimbursementService.startProcessingFile(
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
                existingPaymentId: existing.id,
                status: existing.status,
                message: '文件已处理过，跳过重复处理',
            });
        }

        processingRecord = record;

        // 获取 OCR 配置
        const config = await resolveOcrConfig(req);
        if (!config.baseUrl || !config.apiKey) {
            const error = new Error('缺少 OCR 模型配置');
            error.status = 400;
            throw error;
        }

        // 异步处理付款凭证
        processor.processPaymentWithProgress({
            projectId,
            userId,
            paymentId: record.id,
            fileBuffer: req.file.buffer,
            mimeType: req.file.mimetype || 'application/octet-stream',
            originalName: req.file.originalname,
            config,
        }).catch(err => {
            console.error('异步处理付款凭证失败:', err);
        });

        // 立即返回记录 ID，前端轮询进度
        res.json({
            success: true,
            paymentId: record.id,
            status: 'processing',
            message: '付款凭证已开始处理，请稍后查看进度',
        });
    } catch (error) {
        console.error('上传付款凭证失败:', error);

        if (processingRecord) {
            await reimbursementService.updateProcessingStatus(processingRecord.id, 'error', {
                errorMessage: error.message,
            });
        }

        next(error);
    }
}

// 辅助函数：检查文件是否存在
async function fileExists(filePath) {
    try {
        await fs.promises.access(filePath);
        return true;
    } catch {
        return false;
    }
}

// 导出 upload 中间件
export const uploadMiddleware = upload;

// 导出函数
export {
    getProcessingQueue,
    getInvoiceStats,
    getInvoiceDetail,
    getInvoiceImage,
    updateInvoiceOCR,
    reprocessInvoice,
    deleteInvoice,
    uploadAndProcessInvoice,
    uploadAndProcessPayment,
};
