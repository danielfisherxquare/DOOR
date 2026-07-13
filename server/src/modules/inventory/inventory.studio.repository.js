import knex from '../../db/knex.js';

function applyProjectScope(query, { orgId, ownerUserId }) {
    if (orgId) {
        return query.where({ org_id: orgId });
    }
    if (ownerUserId) {
        return query.where({ owner_user_id: ownerUserId });
    }
    return query.whereRaw('1 = 0');
}

function mapProject(row) {
    if (!row) return null;
    return {
        id: row.id,
        orgId: row.org_id,
        ownerUserId: row.owner_user_id,
        name: row.name,
        sceneType: row.scene_type,
        projectType: row.project_type,
        status: row.status,
        geoAnchor: row.geo_anchor,
        snapshotJson: row.snapshot_json,
        sourceType: row.source_type,
        sourceWarehouseId: row.source_warehouse_id,
        sourceOrgId: row.source_org_id,
        primaryAssetId: row.primary_asset_id,
        revision: Number(row.revision || 1),
        thumbnailDataUrl: row.thumbnail_data_url,
        lastOpenedAt: row.last_opened_at,
        createdBy: row.created_by,
        updatedBy: row.updated_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function mapAssetTemplate(row) {
    if (!row) return null;
    return {
        id: row.id,
        orgId: row.org_id,
        kind: row.kind,
        category: row.category,
        name: row.name,
        thumbnailUrl: row.thumbnail_url,
        parametersSchema: row.parameters_schema,
        defaultParameters: row.default_parameters,
        modelUrl: row.model_url,
        createdBy: row.created_by,
        updatedBy: row.updated_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        source: 'custom',
    };
}

export async function listProjectsByScope(scope) {
    const rows = await applyProjectScope(
        knex('inventory_3d_projects'),
        scope,
    )
        .orderBy([{ column: 'updated_at', order: 'desc' }, { column: 'created_at', order: 'desc' }]);

    return rows.map(mapProject);
}

export async function getProjectById(scope, projectId, db = knex) {
    const row = await applyProjectScope(
        db('inventory_3d_projects'),
        scope,
    )
        .andWhere({ id: projectId })
        .first();

    return mapProject(row);
}

export async function getProjectByIdForUpdate(scope, projectId, trx) {
    const row = await applyProjectScope(
        trx('inventory_3d_projects'),
        scope,
    )
        .andWhere({ id: projectId })
        .forUpdate()
        .first();

    return mapProject(row);
}

export async function createProject(data) {
    const [row] = await knex('inventory_3d_projects')
        .insert({
            org_id: data.orgId ?? null,
            owner_user_id: data.ownerUserId ?? data.createdBy ?? null,
            name: data.name,
            scene_type: data.sceneType,
            project_type: data.projectType,
            status: data.status ?? 'draft',
            geo_anchor: data.geoAnchor ?? null,
            snapshot_json: data.snapshotJson,
            source_type: data.sourceType,
            source_warehouse_id: data.sourceWarehouseId ?? null,
            source_org_id: data.sourceOrgId ?? null,
            primary_asset_id: data.primaryAssetId ?? null,
            thumbnail_data_url: data.thumbnailDataUrl ?? null,
            last_opened_at: data.lastOpenedAt ?? knex.fn.now(),
            created_by: data.createdBy ?? null,
            updated_by: data.updatedBy ?? data.createdBy ?? null,
        })
        .returning('*');

    return mapProject(row);
}

export async function updateProject(
    scope,
    projectId,
    data,
    { expectedRevision = null, db = knex, incrementRevision = true } = {},
) {
    const payload = {
        updated_at: knex.fn.now(),
    };

    if (incrementRevision) payload.revision = db.raw('revision + 1');

    if (data.name !== undefined) payload.name = data.name;
    if (data.sceneType !== undefined) payload.scene_type = data.sceneType;
    if (data.projectType !== undefined) payload.project_type = data.projectType;
    if (data.status !== undefined) payload.status = data.status;
    if (data.geoAnchor !== undefined) payload.geo_anchor = data.geoAnchor;
    if (data.snapshotJson !== undefined) payload.snapshot_json = data.snapshotJson;
    if (data.thumbnailDataUrl !== undefined) payload.thumbnail_data_url = data.thumbnailDataUrl;
    if (data.sourceType !== undefined) payload.source_type = data.sourceType;
    if (data.sourceWarehouseId !== undefined) payload.source_warehouse_id = data.sourceWarehouseId;
    if (data.sourceOrgId !== undefined) payload.source_org_id = data.sourceOrgId;
    if (data.primaryAssetId !== undefined) payload.primary_asset_id = data.primaryAssetId;
    if (data.lastOpenedAt !== undefined) payload.last_opened_at = data.lastOpenedAt;
    if (data.updatedBy !== undefined) payload.updated_by = data.updatedBy;

    const [row] = await applyProjectScope(
        db('inventory_3d_projects'),
        scope,
    )
        .andWhere({ id: projectId })
        .modify((query) => {
            if (expectedRevision !== null && expectedRevision !== undefined) {
                query.andWhere('revision', expectedRevision);
            }
        })
        .update(payload)
        .returning('*');

    return mapProject(row);
}

export async function touchProjectLastOpened(scope, projectId, actorUserId = null) {
    const payload = {
        last_opened_at: knex.fn.now(),
    };
    if (actorUserId) payload.updated_by = actorUserId;

    const [row] = await applyProjectScope(
        knex('inventory_3d_projects'),
        scope,
    )
        .andWhere({ id: projectId })
        .update(payload)
        .returning('*');

    return mapProject(row);
}

export async function deleteProject(scope, projectId) {
    const deleted = await applyProjectScope(
        knex('inventory_3d_projects'),
        scope,
    )
        .andWhere({ id: projectId })
        .del();

    return deleted > 0;
}

export async function listAssetTemplates(orgId) {
    const rows = await knex('inventory_3d_asset_templates')
        .where({ org_id: orgId })
        .orderBy([{ column: 'category', order: 'asc' }, { column: 'updated_at', order: 'desc' }]);

    return rows.map(mapAssetTemplate);
}

export async function createAssetTemplate(data) {
    const [row] = await knex('inventory_3d_asset_templates')
        .insert({
            org_id: data.orgId,
            kind: data.kind,
            category: data.category,
            name: data.name,
            thumbnail_url: data.thumbnailUrl ?? null,
            parameters_schema: data.parametersSchema ?? null,
            default_parameters: data.defaultParameters ?? null,
            model_url: data.modelUrl ?? null,
            created_by: data.createdBy ?? null,
            updated_by: data.updatedBy ?? data.createdBy ?? null,
        })
        .returning('*');

    return mapAssetTemplate(row);
}
