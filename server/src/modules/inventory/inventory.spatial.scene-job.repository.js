import knex from '../../db/knex.js';

function toJsonbValue(value) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    return JSON.stringify(value);
}

function scopedProjectIdsQuery(scope) {
    const query = knex('inventory_3d_projects').select('id');
    if (scope?.orgId) return query.where({ org_id: scope.orgId });
    if (scope?.ownerUserId) return query.where({ owner_user_id: scope.ownerUserId });
    return query.whereRaw('1 = 0');
}

function scopedRecordsQuery(tableName, scope) {
    return knex(`${tableName} as records`).whereIn('records.project_id', scopedProjectIdsQuery(scope));
}

function mapGeneratedScene(row) {
    if (!row) return null;
    return {
        id: row.id,
        projectId: row.project_id,
        focusZoneId: row.focus_zone_id,
        sourceHash: row.source_hash,
        qualityPreset: row.quality_preset,
        status: row.status,
        manifestJson: row.manifest_json,
        previewFileId: row.preview_file_id,
        sceneAssetId: row.scene_asset_id,
        buildingsAssetId: row.buildings_asset_id,
        terrainAssetId: row.terrain_asset_id,
        metadata: row.metadata,
        createdBy: row.created_by,
        updatedBy: row.updated_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function mapSceneExportJob(row) {
    if (!row) return null;
    return {
        id: row.id,
        projectId: row.project_id,
        focusZoneId: row.focus_zone_id,
        generatedSceneId: row.generated_scene_id,
        jobType: row.job_type,
        targetType: row.target_type,
        qualityPreset: row.quality_preset,
        stage: row.stage,
        progress: row.progress,
        status: row.status,
        errorMessage: row.error_message,
        errorDetail: row.error_detail,
        metadata: row.metadata,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        createdBy: row.created_by,
        updatedBy: row.updated_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export async function getGeneratedSceneById(scope, sceneId) {
    const row = await scopedRecordsQuery('inventory_3d_generated_scenes', scope)
        .where('records.id', sceneId)
        .first();
    return mapGeneratedScene(row);
}

export async function getGeneratedSceneBySourceHash(scope, projectId, focusZoneId, sourceHash, qualityPreset) {
    const row = await scopedRecordsQuery('inventory_3d_generated_scenes', scope)
        .where({
            'records.project_id': projectId,
            'records.focus_zone_id': focusZoneId,
            'records.source_hash': sourceHash,
            'records.quality_preset': qualityPreset,
        })
        .first();
    return mapGeneratedScene(row);
}

export async function createGeneratedScene(data) {
    const [row] = await knex('inventory_3d_generated_scenes')
        .insert({
            project_id: data.projectId,
            focus_zone_id: data.focusZoneId,
            source_hash: data.sourceHash,
            quality_preset: data.qualityPreset ?? 'standard',
            status: data.status ?? 'pending',
            manifest_json: toJsonbValue(data.manifestJson ?? null),
            preview_file_id: data.previewFileId ?? null,
            scene_asset_id: data.sceneAssetId ?? null,
            buildings_asset_id: data.buildingsAssetId ?? null,
            terrain_asset_id: data.terrainAssetId ?? null,
            metadata: toJsonbValue(data.metadata ?? null),
            created_by: data.createdBy ?? null,
            updated_by: data.updatedBy ?? data.createdBy ?? null,
        })
        .returning('*');

    return mapGeneratedScene(row);
}

export async function updateGeneratedScene(scope, sceneId, data) {
    const payload = { updated_at: knex.fn.now() };
    if (data.sourceHash !== undefined) payload.source_hash = data.sourceHash;
    if (data.qualityPreset !== undefined) payload.quality_preset = data.qualityPreset;
    if (data.status !== undefined) payload.status = data.status;
    if (data.manifestJson !== undefined) payload.manifest_json = toJsonbValue(data.manifestJson);
    if (data.previewFileId !== undefined) payload.preview_file_id = data.previewFileId;
    if (data.sceneAssetId !== undefined) payload.scene_asset_id = data.sceneAssetId;
    if (data.buildingsAssetId !== undefined) payload.buildings_asset_id = data.buildingsAssetId;
    if (data.terrainAssetId !== undefined) payload.terrain_asset_id = data.terrainAssetId;
    if (data.metadata !== undefined) payload.metadata = toJsonbValue(data.metadata);
    if (data.updatedBy !== undefined) payload.updated_by = data.updatedBy;

    const [row] = await scopedRecordsQuery('inventory_3d_generated_scenes', scope)
        .where('records.id', sceneId)
        .update(payload)
        .returning('*');
    return mapGeneratedScene(row);
}

export async function createSceneExportJob(data) {
    const [row] = await knex('inventory_3d_scene_export_jobs')
        .insert({
            project_id: data.projectId,
            focus_zone_id: data.focusZoneId,
            generated_scene_id: data.generatedSceneId ?? null,
            job_type: data.jobType ?? 'scene-export',
            target_type: data.targetType ?? 'studio',
            quality_preset: data.qualityPreset ?? 'standard',
            stage: data.stage ?? 'queued',
            progress: data.progress ?? 0,
            status: data.status ?? 'queued',
            error_message: data.errorMessage ?? null,
            error_detail: toJsonbValue(data.errorDetail ?? null),
            metadata: toJsonbValue(data.metadata ?? null),
            started_at: data.startedAt ?? null,
            finished_at: data.finishedAt ?? null,
            created_by: data.createdBy ?? null,
            updated_by: data.updatedBy ?? data.createdBy ?? null,
        })
        .returning('*');

    return mapSceneExportJob(row);
}

export async function getSceneExportJobById(scope, jobId) {
    const row = await scopedRecordsQuery('inventory_3d_scene_export_jobs', scope)
        .where('records.id', jobId)
        .first();
    return mapSceneExportJob(row);
}

export async function updateSceneExportJob(scope, jobId, data) {
    const payload = { updated_at: knex.fn.now() };
    if (data.generatedSceneId !== undefined) payload.generated_scene_id = data.generatedSceneId;
    if (data.targetType !== undefined) payload.target_type = data.targetType;
    if (data.qualityPreset !== undefined) payload.quality_preset = data.qualityPreset;
    if (data.stage !== undefined) payload.stage = data.stage;
    if (data.progress !== undefined) payload.progress = data.progress;
    if (data.status !== undefined) payload.status = data.status;
    if (data.errorMessage !== undefined) payload.error_message = data.errorMessage;
    if (data.errorDetail !== undefined) payload.error_detail = toJsonbValue(data.errorDetail);
    if (data.metadata !== undefined) payload.metadata = toJsonbValue(data.metadata);
    if (data.startedAt !== undefined) payload.started_at = data.startedAt;
    if (data.finishedAt !== undefined) payload.finished_at = data.finishedAt;
    if (data.updatedBy !== undefined) payload.updated_by = data.updatedBy;

    const [row] = await scopedRecordsQuery('inventory_3d_scene_export_jobs', scope)
        .where('records.id', jobId)
        .update(payload)
        .returning('*');
    return mapSceneExportJob(row);
}
