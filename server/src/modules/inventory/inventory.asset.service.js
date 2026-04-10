/**
 * Asset Service
 * 3D 资产业务逻辑
 */

import * as repo from './inventory.asset.repository.js';
import * as storage from './inventory.asset.storage.js';
import multer from 'multer';

// 支持的文件类型
const ALLOWED_FILE_TYPES = ['glb', 'gltf', 'obj', 'fbx'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Multer 配置
export const assetUploadMiddleware = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
        // 修复文件名编码
        if (file.originalname) {
            try {
                file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf-8');
            } catch (e) {
                // ignore
            }
        }

        const ext = file.originalname.split('.').pop()?.toLowerCase();
        if (!ext || !ALLOWED_FILE_TYPES.includes(ext)) {
            return cb(new Error(`不支持的文件类型: ${ext}。支持: ${ALLOWED_FILE_TYPES.join(', ')}`));
        }

        cb(null, true);
    },
});

// 标准化函数
function normalizeString(value, fallback = null) {
    if (value === undefined || value === null) return fallback;
    const str = String(value).trim();
    return str || fallback;
}

function normalizeKind(value) {
    const kind = normalizeString(value, 'model');
    if (!['model', 'parametric', 'prefab'].includes(kind)) {
        return 'model';
    }
    return kind;
}

function normalizeVisibility(value) {
    const vis = normalizeString(value, 'org');
    if (!['org', 'public'].includes(vis)) {
        return 'org';
    }
    return vis;
}

function normalizeCategory(value, required = false) {
    const cat = normalizeString(value, null);
    if (!cat && required) {
        throw new Error('category 是必填字段');
    }
    return cat || 'uncategorized';
}

/**
 * 列出可见的资产
 */
export async function listAssets(orgId, filters = {}) {
    return repo.listVisibleAssets(orgId, filters);
}

/**
 * 获取资产详情
 */
export async function getAsset(assetId, orgId = null) {
    const asset = await repo.getAssetById(assetId, orgId);
    if (!asset) {
        const error = new Error('资产不存在');
        error.statusCode = 404;
        throw error;
    }
    return asset;
}

/**
 * 更新缩略图
 * @param {string} assetId - 资产 ID
 * @param {string|null} orgId - 组织 ID
 * @param {Buffer|string} thumbnailData - 缩略图数据（Buffer 或 base64 data URL）
 */
export async function updateThumbnail(assetId, orgId, thumbnailData) {
    const asset = await repo.getAssetById(assetId, orgId);
    if (!asset) {
        const error = new Error('资产不存在');
        error.statusCode = 404;
        throw error;
    }

    // 处理 base64 data URL
    let buffer;
    if (typeof thumbnailData === 'string') {
        // 提取 base64 数据
        const matches = thumbnailData.match(/^data:image\/(\w+);base64,(.+)$/);
        if (!matches) {
            throw new Error('无效的缩略图数据格式');
        }
        buffer = Buffer.from(matches[2], 'base64');
    } else {
        buffer = thumbnailData;
    }

    // 保存缩略图
    const thumbnailPath = storage.saveThumbnail({
        orgId: asset.orgId,
        assetId: asset.id,
        buffer,
    });

    // 更新数据库记录
    const thumbnailUrl = `/api/app/3d-studio/assets/${assetId}/thumbnail`;
    return repo.updateAsset(assetId, { thumbnailDataUrl: thumbnailUrl }, orgId);
}

/**
 * 获取缩略图
 */
export async function getThumbnail(assetId, orgId) {
    const asset = await repo.getAssetById(assetId, orgId);
    if (!asset) {
        return null;
    }

    return storage.readThumbnail({
        orgId: asset.orgId,
        assetId: asset.id,
    });
}

/**
 * 创建资产（含文件上传）
 */
export async function createAsset(orgId, userId, data, file) {
    const name = normalizeString(data.name, file?.originalname?.replace(/\.[^.]+$/, '') || '未命名资产');
    const category = normalizeCategory(data.category, true);
    const kind = normalizeKind(data.kind);
    const visibility = normalizeVisibility(data.visibility);

    // 检查文件
    if (!file) {
        throw new Error('需要上传模型文件');
    }

    const fileType = file.originalname.split('.').pop()?.toLowerCase();
    const fileHash = storage.calculateFileHash(file.buffer);

    // 检查重复
    const existing = await repo.findAssetByHash(fileHash, orgId);
    if (existing) {
        // 返回已存在的资产，不重复存储
        return { ...existing, isDuplicate: true };
    }

    // 创建资产记录（先获取 ID）
    const tempAsset = await repo.createAsset({
        orgId,
        creatorUserId: userId,
        name,
        description: normalizeString(data.description),
        kind,
        category,
        tags: Array.isArray(data.tags) ? data.tags : [],
        visibility,
        fileType,
        fileSize: file.size,
        fileHash,
        status: 'active',
    });

    // 保存文件
    const storageResult = await storage.saveAssetFile({
        orgId,
        assetId: tempAsset.id,
        buffer: file.buffer,
        fileType,
    });

    // 处理缩略图（如果提供）
    let thumbnailDataUrl = null;
    if (data.thumbnail) {
        try {
            const thumbBuffer = typeof data.thumbnail === 'string'
                ? Buffer.from(data.thumbnail.replace(/^data:image\/\w+;base64,/, ''), 'base64')
                : data.thumbnail;

            storage.saveThumbnail({
                orgId,
                assetId: tempAsset.id,
                buffer: thumbBuffer,
            });

            thumbnailDataUrl = `/api/app/3d-studio/assets/${tempAsset.id}/thumbnail`;
        } catch (e) {
            console.error('缩略图保存失败:', e);
        }
    }

    // 更新存储路径
    const asset = await repo.updateAsset(tempAsset.id, {
        storagePath: storageResult.relativePath,
        thumbnailDataUrl,
    });

    return { ...asset, isDuplicate: false };
}

/**
 * 更新资产信息
 */
export async function updateAsset(assetId, orgId, userId, data) {
    const existing = await repo.getAssetById(assetId, orgId);
    if (!existing) {
        const error = new Error('资产不存在');
        error.statusCode = 404;
        throw error;
    }

    const payload = {};

    if (data.name !== undefined) payload.name = normalizeString(data.name);
    if (data.description !== undefined) payload.description = normalizeString(data.description);
    if (data.category !== undefined) payload.category = normalizeCategory(data.category);
    if (data.tags !== undefined) payload.tags = Array.isArray(data.tags) ? data.tags : [];
    if (data.visibility !== undefined) payload.visibility = normalizeVisibility(data.visibility);
    if (data.status !== undefined) payload.status = normalizeString(data.status);

    return repo.updateAsset(assetId, payload, orgId);
}

/**
 * 删除资产
 */
export async function deleteAsset(assetId, orgId) {
    const asset = await repo.getAssetById(assetId, orgId);
    if (!asset) {
        const error = new Error('资产不存在');
        error.statusCode = 404;
        throw error;
    }

    // 删除文件
    if (asset.storagePath && asset.fileType) {
        storage.deleteAssetFile({
            orgId: asset.orgId,
            assetId: asset.id,
            fileType: asset.fileType,
        });
    }

    // 删除数据库记录
    await repo.deleteAsset(assetId, orgId);

    return { id: assetId };
}

/**
 * 获取资产文件
 */
export async function getAssetFile(assetId, orgId) {
    const asset = await repo.getAssetById(assetId, orgId);
    if (!asset || !asset.storagePath || !asset.fileType) {
        return null;
    }

    const buffer = storage.readAssetFile({
        orgId: asset.orgId,
        assetId: asset.id,
        fileType: asset.fileType,
    });

    if (!buffer) {
        return null;
    }

    return {
        buffer,
        fileType: asset.fileType,
        fileName: `${asset.name}.${asset.fileType}`,
        mimeType: getMimeType(asset.fileType),
    };
}

function getMimeType(fileType) {
    const mimeTypes = {
        glb: 'model/gltf-binary',
        gltf: 'model/gltf+json',
        obj: 'model/obj',
        fbx: 'application/octet-stream',
    };
    return mimeTypes[fileType] || 'application/octet-stream';
}

// ============ 资产实例 ============

/**
 * 列出项目中的资产实例
 */
export async function listInstances(projectId) {
    return repo.listProjectInstances(projectId);
}

/**
 * 创建资产实例
 */
export async function createInstance(projectId, data) {
    // 验证资产存在
    const asset = await repo.getAssetById(data.assetId);
    if (!asset) {
        const error = new Error('资产不存在');
        error.statusCode = 404;
        throw error;
    }

    // 验证位置数据
    if (!data.position || typeof data.position.x !== 'number') {
        throw new Error('position 必须包含 x, y, z 坐标');
    }

    return repo.createInstance({
        projectId,
        assetId: data.assetId,
        position: data.position,
        rotation: data.rotation,
        scale: data.scale,
        parameters: data.parameters,
        metadata: data.metadata,
    });
}

/**
 * 更新资产实例
 */
export async function updateInstance(instanceId, projectId, data) {
    const instance = await repo.updateInstance(instanceId, data, projectId);
    if (!instance) {
        const error = new Error('资产实例不存在');
        error.statusCode = 404;
        throw error;
    }
    return instance;
}

/**
 * 删除资产实例
 */
export async function deleteInstance(instanceId, projectId) {
    const deleted = await repo.deleteInstance(instanceId, projectId);
    if (!deleted) {
        const error = new Error('资产实例不存在');
        error.statusCode = 404;
        throw error;
    }
    return { id: instanceId };
}

export default {
    assetUploadMiddleware,
    listAssets,
    getAsset,
    createAsset,
    updateAsset,
    deleteAsset,
    getAssetFile,
    updateThumbnail,
    getThumbnail,
    listInstances,
    createInstance,
    updateInstance,
    deleteInstance,
};