/**
 * Asset Storage Service
 * 3D 资产文件存储服务
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 存储根目录
const STORAGE_ROOT = process.env.ASSET_STORAGE_PATH || path.join(__dirname, '../../../storage/assets');

// 确保目录存在
function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

/**
 * 获取资产存储路径
 * @param {Object} options
 * @param {string|null} options.orgId - 组织 ID，null 表示公共库
 * @param {string} options.assetId - 资产 ID
 * @param {string} options.fileType - 文件类型 (glb, gltf, obj, fbx)
 * @returns {string} 存储路径
 */
export function getAssetPath({ orgId, assetId, fileType }) {
    const baseDir = orgId
        ? path.join(STORAGE_ROOT, 'orgs', orgId, 'models')
        : path.join(STORAGE_ROOT, 'public', 'models');

    ensureDir(baseDir);
    return path.join(baseDir, `${assetId}.${fileType}`);
}

/**
 * 获取缩略图路径
 * @param {Object} options
 * @param {string|null} options.orgId
 * @param {string} options.assetId
 * @returns {string} 缩略图路径
 */
export function getThumbnailPath({ orgId, assetId }) {
    const baseDir = orgId
        ? path.join(STORAGE_ROOT, 'orgs', orgId, 'models')
        : path.join(STORAGE_ROOT, 'public', 'models');

    return path.join(baseDir, `${assetId}_thumb.png`);
}

/**
 * 计算文件 SHA256 哈希
 * @param {Buffer} buffer - 文件内容
 * @returns {string} 哈希值
 */
export function calculateFileHash(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * 保存资产文件
 * @param {Object} options
 * @param {string|null} options.orgId
 * @param {string} options.assetId
 * @param {Buffer} options.buffer - 文件内容
 * @param {string} options.fileType
 * @returns {Object} 存储结果
 */
export async function saveAssetFile({ orgId, assetId, buffer, fileType }) {
    const filePath = getAssetPath({ orgId, assetId, fileType });
    const fileHash = calculateFileHash(buffer);

    // 写入文件
    fs.writeFileSync(filePath, buffer);

    return {
        path: filePath,
        relativePath: path.relative(STORAGE_ROOT, filePath),
        size: buffer.length,
        hash: fileHash,
    };
}

/**
 * 读取资产文件
 * @param {Object} options
 * @param {string|null} options.orgId
 * @param {string} options.assetId
 * @param {string} options.fileType
 * @returns {Buffer|null} 文件内容
 */
export function readAssetFile({ orgId, assetId, fileType }) {
    const filePath = getAssetPath({ orgId, assetId, fileType });

    if (!fs.existsSync(filePath)) {
        return null;
    }

    return fs.readFileSync(filePath);
}

/**
 * 删除资产文件
 * @param {Object} options
 * @param {string|null} options.orgId
 * @param {string} options.assetId
 * @param {string} options.fileType
 */
export function deleteAssetFile({ orgId, assetId, fileType }) {
    const filePath = getAssetPath({ orgId, assetId, fileType });

    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }

    // 同时删除缩略图
    const thumbPath = getThumbnailPath({ orgId, assetId });
    if (fs.existsSync(thumbPath)) {
        fs.unlinkSync(thumbPath);
    }
}

/**
 * 保存缩略图
 * @param {Object} options
 * @param {string|null} options.orgId
 * @param {string} options.assetId
 * @param {Buffer} options.buffer - 图片内容
 */
export function saveThumbnail({ orgId, assetId, buffer }) {
    const filePath = getThumbnailPath({ orgId, assetId });
    fs.writeFileSync(filePath, buffer);
    return filePath;
}

/**
 * 读取缩略图
 * @param {Object} options
 * @param {string|null} options.orgId
 * @param {string} options.assetId
 * @returns {Buffer|null}
 */
export function readThumbnail({ orgId, assetId }) {
    const filePath = getThumbnailPath({ orgId, assetId });

    if (!fs.existsSync(filePath)) {
        return null;
    }

    return fs.readFileSync(filePath);
}

/**
 * 检查文件是否存在（通过哈希去重）
 * @param {Object} options
 * @param {string|null} options.orgId
 * @param {string} options.fileHash
 * @returns {Object|null} 已存在的资产信息
 */
export async function findDuplicateAsset({ orgId, fileHash }) {
    // 这个函数会在 service 层调用 repository 查询
    // 这里只提供接口定义
    return null;
}

/**
 * 获取临时上传目录
 * @param {string} uploadId
 * @returns {string}
 */
export function getTempUploadPath(uploadId) {
    const tempDir = path.join(STORAGE_ROOT, 'temp');
    ensureDir(tempDir);
    return path.join(tempDir, `${uploadId}.tmp`);
}

/**
 * 清理临时文件
 * @param {number} maxAgeMs - 最大保留时间（毫秒）
 */
export function cleanupTempFiles(maxAgeMs = 24 * 60 * 60 * 1000) {
    const tempDir = path.join(STORAGE_ROOT, 'temp');

    if (!fs.existsSync(tempDir)) {
        return;
    }

    const now = Date.now();
    const files = fs.readdirSync(tempDir);

    for (const file of files) {
        const filePath = path.join(tempDir, file);
        const stat = fs.statSync(filePath);

        if (now - stat.mtimeMs > maxAgeMs) {
            fs.unlinkSync(filePath);
        }
    }
}

export default {
    getAssetPath,
    getThumbnailPath,
    calculateFileHash,
    saveAssetFile,
    readAssetFile,
    deleteAssetFile,
    saveThumbnail,
    readThumbnail,
    getTempUploadPath,
    cleanupTempFiles,
};