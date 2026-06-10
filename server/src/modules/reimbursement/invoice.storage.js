/**
 * Invoice Storage Service
 * 发票文件存储服务 - 保存原图、缩略图到本地存储
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = path.join(__dirname, '../../../storage/invoices');

/**
 * 确保目录存在
 */
async function ensureDir(dir) {
    await fs.promises.mkdir(dir, { recursive: true });
}

/**
 * 保存发票文件
 * @param {string} projectId - 项目 ID
 * @param {string} invoiceId - 发票记录 ID
 * @param {Buffer} fileBuffer - 文件 Buffer
 * @param {string} originalName - 原始文件名
 * @param {string} mimeType - MIME 类型
 * @returns {Promise<{ originalPath: string, thumbnailPath: string|null, savedFiles: string[] }>}
 */
export async function saveInvoiceFile(projectId, invoiceId, fileBuffer, originalName, mimeType) {
    const invoiceDir = path.join(STORAGE_DIR, projectId, invoiceId);
    await ensureDir(invoiceDir);

    const isPdf = mimeType === 'application/pdf' || originalName.toLowerCase().endsWith('.pdf');
    const ext = isPdf ? '.pdf' : (mimeType === 'image/png' ? '.png' : '.jpg');
    const originalPath = path.join(invoiceDir, `original${ext}`);

    // 保存原始文件
    await fs.promises.writeFile(originalPath, fileBuffer);

    // 如果是 PDF，生成每页的图片
    const savedFiles = [originalPath];
    let thumbnailPath = null;

    if (isPdf) {
        // PDF 转图片逻辑在 ocr.service.js 中已实现，这里只保存图片引用
        // 实际图片生成由 ocr.service.js 处理后回调保存
    } else {
        // 图片文件直接生成缩略图
        thumbnailPath = path.join(invoiceDir, 'thumbnail.jpg');
        await generateThumbnail(fileBuffer, thumbnailPath);
        savedFiles.push(thumbnailPath);
    }

    return {
        originalPath,
        thumbnailPath,
        savedFiles,
        invoiceDir,
    };
}

/**
 * 从 Buffer 生成缩略图
 * @param {Buffer} imageBuffer - 图片 Buffer
 * @param {string} outputPath - 输出路径
 * @param {number} width - 缩略图宽度
 */
export async function generateThumbnail(imageBuffer, outputPath, width = 200) {
    try {
        await sharp(imageBuffer)
            .resize(width, null, {
                withoutEnlargement: true,
            })
            .jpeg({ quality: 80 })
            .toFile(outputPath);
    } catch (error) {
        console.error('生成缩略图失败:', error);
        throw error;
    }
}

/**
 * 保存渲染后的 PDF 页面图片
 * @param {string} projectId - 项目 ID
 * @param {string} invoiceId - 发票记录 ID
 * @param {Buffer[]} pageBuffers - 每页图片的 Buffer 数组
 * @returns {Promise<string[]>} 保存的文件路径数组
 */
export async function savePdfPages(projectId, invoiceId, pageBuffers) {
    const invoiceDir = path.join(STORAGE_DIR, projectId, invoiceId);
    await ensureDir(invoiceDir);

    const savedPaths = [];

    for (let i = 0; i < pageBuffers.length; i++) {
        const pageNum = i + 1;
        const imagePath = path.join(invoiceDir, `page_${pageNum}.jpg`);
        const thumbnailPath = path.join(invoiceDir, `thumbnail_${pageNum}.jpg`);

        // 保存原图
        await fs.promises.writeFile(imagePath, pageBuffers[i]);
        savedPaths.push(imagePath);

        // 生成缩略图
        await generateThumbnail(pageBuffers[i], thumbnailPath, 150);
        savedPaths.push(thumbnailPath);
    }

    return savedPaths;
}

/**
 * 获取发票图片
 * @param {string} projectId - 项目 ID
 * @param {string} invoiceId - 发票记录 ID
 * @param {string} type - 图片类型：'original' | 'thumbnail' | 'page'
 * @param {number} pageNum - 页码（当 type 为 'page' 时使用）
 * @returns {Promise<{ path: string, mimeType: string }>}
 */
export async function getInvoiceImage(projectId, invoiceId, type = 'thumbnail', pageNum) {
    const invoiceDir = path.join(STORAGE_DIR, projectId, invoiceId);

    let filename;
    let mimeType = 'image/jpeg';

    switch (type) {
        case 'original':
            // 检查是 PDF 还是图片
            const pdfPath = path.join(invoiceDir, 'original.pdf');
            const jpgPath = path.join(invoiceDir, 'original.jpg');
            const pngPath = path.join(invoiceDir, 'original.png');

            if (await fileExists(pdfPath)) {
                return { path: pdfPath, mimeType: 'application/pdf' };
            } else if (await fileExists(pngPath)) {
                return { path: pngPath, mimeType: 'image/png' };
            } else {
                return { path: jpgPath, mimeType: 'image/jpeg' };
            }
        case 'page':
            filename = `page_${pageNum}.jpg`;
            break;
        case 'thumbnail':
        default:
            // 检查是否有分页缩略图
            const thumb1Path = path.join(invoiceDir, 'thumbnail_1.jpg');
            if (await fileExists(thumb1Path)) {
                filename = 'thumbnail_1.jpg';
            } else {
                filename = 'thumbnail.jpg';
            }
            break;
    }

    const filePath = path.join(invoiceDir, filename);
    return { path: filePath, mimeType };
}

/**
 * 检查文件是否存在
 */
async function fileExists(filePath) {
    try {
        await fs.promises.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * 删除发票文件
 * @param {string} projectId - 项目 ID
 * @param {string} invoiceId - 发票记录 ID
 */
export async function deleteInvoiceFiles(projectId, invoiceId) {
    const invoiceDir = path.join(STORAGE_DIR, projectId, invoiceId);

    try {
        await fs.promises.rm(invoiceDir, { recursive: true, force: true });
    } catch (error) {
        console.error(`删除发票文件失败 (${projectId}/${invoiceId}):`, error);
    }
}

/**
 * 保存 OCR 结果
 * @param {string} projectId - 项目 ID
 * @param {string} invoiceId - 发票记录 ID
 * @param {Object} ocrResult - OCR 识别结果
 */
export async function saveOcrResult(projectId, invoiceId, ocrResult) {
    const invoiceDir = path.join(STORAGE_DIR, projectId, invoiceId);
    await ensureDir(invoiceDir);

    const ocrPath = path.join(invoiceDir, 'ocr_result.json');
    await fs.promises.writeFile(ocrPath, JSON.stringify(ocrResult, null, 2));
}

/**
 * 加载 OCR 结果
 * @param {string} projectId - 项目 ID
 * @param {string} invoiceId - 发票记录 ID
 */
export async function loadOcrResult(projectId, invoiceId) {
    const ocrPath = path.join(STORAGE_DIR, projectId, invoiceId, 'ocr_result.json');

    try {
        const content = await fs.promises.readFile(ocrPath, 'utf-8');
        return JSON.parse(content);
    } catch {
        return null;
    }
}
