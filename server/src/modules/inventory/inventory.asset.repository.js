/**
 * Asset Repository
 * 3D 资产数据库操作
 */

import knex from '../../db/knex.js';

const ASSET_FIELDS = [
    'id', 'org_id', 'creator_user_id',
    'name', 'description', 'kind', 'category', 'tags',
    'visibility', 'file_type', 'file_size', 'file_hash', 'storage_path',
    'thumbnail_data_url', 'parameters_schema', 'default_parameters',
    'bounding_box', 'metadata', 'status',
    'created_at', 'updated_at'
];

function mapAsset(row) {
    if (!row) return null;
    return {
        id: row.id,
        orgId: row.org_id,
        creatorUserId: row.creator_user_id,
        name: row.name,
        description: row.description,
        kind: row.kind,
        category: row.category,
        tags: row.tags || [],
        visibility: row.visibility,
        fileType: row.file_type,
        fileSize: row.file_size,
        fileHash: row.file_hash,
        storagePath: row.storage_path,
        thumbnailDataUrl: row.thumbnail_data_url,
        parametersSchema: row.parameters_schema,
        defaultParameters: row.default_parameters,
        boundingBox: row.bounding_box,
        metadata: row.metadata,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function mapInstance(row) {
    if (!row) return null;
    return {
        id: row.id,
        projectId: row.project_id,
        assetId: row.asset_id,
        position: row.position,
        rotation: row.rotation,
        scale: row.scale,
        parameters: row.parameters,
        boundInventoryAssetId: row.bound_inventory_asset_id,
        boundWarehouseLocationId: row.bound_warehouse_location_id,
        status: row.status,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

/**
 * 列出可见的资产（组织 + 公共）
 */
export async function listVisibleAssets(orgId, filters = {}) {
    let query = knex('inventory_3d_assets')
        .select(ASSET_FIELDS)
        .where(function() {
            this.where('visibility', 'public')
                .orWhere(function() {
                    this.where('org_id', orgId).where('visibility', 'org');
                });
        })
        .where('status', 'active');

    if (filters.category) {
        query = query.where('category', filters.category);
    }
    if (filters.kind) {
        query = query.where('kind', filters.kind);
    }
    if (filters.search) {
        query = query.where('name', 'ilike', `%${filters.search}%`);
    }

    const rows = await query.orderBy('updated_at', 'desc');
    return rows.map(mapAsset);
}

/**
 * 获取资产详情
 */
export async function getAssetById(assetId, orgId = null) {
    const query = knex('inventory_3d_assets')
        .select(ASSET_FIELDS)
        .where('id', assetId);

    if (orgId) {
        query.where(function() {
            this.where('visibility', 'public')
                .orWhere('org_id', orgId);
        });
    }

    const row = await query.first();
    return mapAsset(row);
}

/**
 * 创建资产
 */
export async function createAsset(data) {
    const [row] = await knex('inventory_3d_assets')
        .insert({
            org_id: data.orgId ?? null,
            creator_user_id: data.creatorUserId ?? null,
            name: data.name,
            description: data.description ?? null,
            kind: data.kind ?? 'model',
            category: data.category,
            tags: data.tags ?? [],
            visibility: data.visibility ?? 'org',
            file_type: data.fileType ?? null,
            file_size: data.fileSize ?? null,
            file_hash: data.fileHash ?? null,
            storage_path: data.storagePath ?? null,
            thumbnail_data_url: data.thumbnailDataUrl ?? null,
            parameters_schema: data.parametersSchema ?? null,
            default_parameters: data.defaultParameters ?? null,
            bounding_box: data.boundingBox ?? null,
            metadata: data.metadata ?? null,
            status: data.status ?? 'active',
        })
        .returning('*');

    return mapAsset(row);
}

/**
 * 更新资产
 */
export async function updateAsset(assetId, data, orgId = null) {
    const payload = { updated_at: knex.fn.now() };

    if (data.name !== undefined) payload.name = data.name;
    if (data.description !== undefined) payload.description = data.description;
    if (data.category !== undefined) payload.category = data.category;
    if (data.tags !== undefined) payload.tags = data.tags;
    if (data.visibility !== undefined) payload.visibility = data.visibility;
    if (data.fileType !== undefined) payload.file_type = data.fileType;
    if (data.fileSize !== undefined) payload.file_size = data.fileSize;
    if (data.fileHash !== undefined) payload.file_hash = data.fileHash;
    if (data.storagePath !== undefined) payload.storage_path = data.storagePath;
    if (data.thumbnailDataUrl !== undefined) payload.thumbnail_data_url = data.thumbnailDataUrl;
    if (data.parametersSchema !== undefined) payload.parameters_schema = data.parametersSchema;
    if (data.defaultParameters !== undefined) payload.default_parameters = data.defaultParameters;
    if (data.boundingBox !== undefined) payload.bounding_box = data.boundingBox;
    if (data.metadata !== undefined) payload.metadata = data.metadata;
    if (data.status !== undefined) payload.status = data.status;

    const query = knex('inventory_3d_assets').where('id', assetId);
    if (orgId) {
        query.where('org_id', orgId);
    }

    const [row] = await query.update(payload).returning('*');
    return mapAsset(row);
}

/**
 * 删除资产
 */
export async function deleteAsset(assetId, orgId = null) {
    const query = knex('inventory_3d_assets').where('id', assetId);
    if (orgId) {
        query.where('org_id', orgId);
    }

    const deleted = await query.del();
    return deleted > 0;
}

/**
 * 通过文件哈希查找资产（去重）
 */
export async function findAssetByHash(fileHash, orgId) {
    const row = await knex('inventory_3d_assets')
        .select(ASSET_FIELDS)
        .where('file_hash', fileHash)
        .where(function() {
            this.where('org_id', orgId).orWhere('visibility', 'public');
        })
        .first();

    return mapAsset(row);
}

// ============ 资产实例 ============

/**
 * 列出项目中的资产实例
 */
export async function listProjectInstances(projectId) {
    const rows = await knex('inventory_3d_project_asset_instances')
        .where('project_id', projectId)
        .orderBy('created_at', 'asc');

    return rows.map(mapInstance);
}

/**
 * 创建资产实例
 */
export async function createInstance(data) {
    const [row] = await knex('inventory_3d_project_asset_instances')
        .insert({
            project_id: data.projectId,
            asset_id: data.assetId,
            position: data.position,
            rotation: data.rotation ?? { x: 0, y: 0, z: 0 },
            scale: data.scale ?? { x: 1, y: 1, z: 1 },
            parameters: data.parameters ?? null,
            status: data.status ?? 'placed',
            metadata: data.metadata ?? null,
        })
        .returning('*');

    return mapInstance(row);
}

/**
 * 更新资产实例
 */
export async function updateInstance(instanceId, data, projectId = null) {
    const payload = { updated_at: knex.fn.now() };

    if (data.position !== undefined) payload.position = data.position;
    if (data.rotation !== undefined) payload.rotation = data.rotation;
    if (data.scale !== undefined) payload.scale = data.scale;
    if (data.parameters !== undefined) payload.parameters = data.parameters;
    if (data.boundInventoryAssetId !== undefined) payload.bound_inventory_asset_id = data.boundInventoryAssetId;
    if (data.boundWarehouseLocationId !== undefined) payload.bound_warehouse_location_id = data.boundWarehouseLocationId;
    if (data.status !== undefined) payload.status = data.status;
    if (data.metadata !== undefined) payload.metadata = data.metadata;

    const query = knex('inventory_3d_project_asset_instances').where('id', instanceId);
    if (projectId) {
        query.where('project_id', projectId);
    }

    const [row] = await query.update(payload).returning('*');
    return mapInstance(row);
}

/**
 * 删除资产实例
 */
export async function deleteInstance(instanceId, projectId = null) {
    const query = knex('inventory_3d_project_asset_instances').where('id', instanceId);
    if (projectId) {
        query.where('project_id', projectId);
    }

    const deleted = await query.del();
    return deleted > 0;
}

export default {
    listVisibleAssets,
    getAssetById,
    createAsset,
    updateAsset,
    deleteAsset,
    findAssetByHash,
    listProjectInstances,
    createInstance,
    updateInstance,
    deleteInstance,
};