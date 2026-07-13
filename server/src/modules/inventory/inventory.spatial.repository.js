import knex from '../../db/knex.js';
import { assertGenericWorkZoneMutationAllowed } from './inventory.spatial.site-mode-guard.js';

function toJsonbValue(value) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    return JSON.stringify(value);
}

function scopedProjectIdsQuery(scope, db = knex) {
    const query = db('inventory_3d_projects').select('id');
    if (scope?.orgId) return query.where({ org_id: scope.orgId });
    if (scope?.ownerUserId) return query.where({ owner_user_id: scope.ownerUserId });
    return query.whereRaw('1 = 0');
}

function scopedRecordsQuery(tableName, scope, db = knex) {
    return db(`${tableName} as records`).whereIn('records.project_id', scopedProjectIdsQuery(scope, db));
}

function applySiteModeTerrainWorkZonePredicate(query) {
    return query.where((builder) => {
        builder
            .whereRaw("records.metadata->>'purpose' = 'site-mode'")
            .orWhereRaw(
                "jsonb_exists(COALESCE(records.snapshot_json, '{}'::jsonb), 'siteBake')"
            );
    });
}

function mapSpatialObject(row) {
    if (!row) return null;
    return {
        id: row.id,
        projectId: row.project_id,
        focusZoneId: row.focus_zone_id,
        objectType: row.object_type,
        templateId: row.template_id,
        variantId: row.variant_id,
        title: row.title,
        placementMode: row.placement_mode,
        anchorWgs84: row.anchor_wgs84,
        localTransform: row.local_transform,
        footprint: row.footprint,
        baseElevation: row.base_elevation,
        terrainNormal: row.terrain_normal,
        slopeDeg: row.slope_deg,
        lodProfile: row.lod_profile,
        materialVariant: row.material_variant,
        brandingPackId: row.branding_pack_id,
        renderProfile: row.render_profile,
        metadata: row.metadata,
        status: row.status,
        createdBy: row.created_by,
        updatedBy: row.updated_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function mapTerrainWorkZone(row) {
    if (!row) return null;
    return {
        id: row.id,
        projectId: row.project_id,
        name: row.name,
        zoneType: row.zone_type,
        clipPolygonWgs84: row.clip_polygon_wgs84,
        originWgs84: row.origin_wgs84,
        enuTransform: row.enu_transform,
        terrainResolution: row.terrain_resolution,
        terrainMeshAssetId: row.terrain_mesh_asset_id,
        includedObjectIds: row.included_object_ids,
        publishTarget: row.publish_target,
        snapshotJson: row.snapshot_json,
        // site-bake persists the imagery descriptor with the zone snapshot.
        // Surface it on the work-zone record as well so a normal GET can
        // reconstruct the same satellite backdrop as the bake response.
        orthophoto: row.snapshot_json?.orthophoto || null,
        metadata: row.metadata,
        status: row.status,
        createdBy: row.created_by,
        updatedBy: row.updated_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export async function listSpatialObjects(scope, projectId, filters = {}, db = knex) {
    let query = scopedRecordsQuery('inventory_3d_event_spatial_objects', scope, db)
        .where('records.project_id', projectId);

    if (filters.objectType) query = query.where('records.object_type', filters.objectType);
    if (filters.focusZoneId) query = query.where('records.focus_zone_id', filters.focusZoneId);
    if (filters.status) query = query.where('records.status', filters.status);

    const rows = await query.orderBy([{ column: 'records.updated_at', order: 'desc' }, { column: 'records.created_at', order: 'desc' }]);
    return rows.map(mapSpatialObject);
}

export async function getSpatialObjectById(scope, objectId, db = knex) {
    const row = await scopedRecordsQuery('inventory_3d_event_spatial_objects', scope, db)
        .where('records.id', objectId)
        .first();

    return mapSpatialObject(row);
}

export async function getSpatialObjectByIdForUpdate(scope, objectId, trx) {
    const row = await scopedRecordsQuery('inventory_3d_event_spatial_objects', scope, trx)
        .where('records.id', objectId)
        .forUpdate()
        .first();

    return mapSpatialObject(row);
}

export async function createSpatialObject(data, db = knex) {
    const [row] = await db('inventory_3d_event_spatial_objects')
        .insert({
            project_id: data.projectId,
            focus_zone_id: data.focusZoneId ?? null,
            object_type: data.objectType,
            template_id: data.templateId ?? null,
            variant_id: data.variantId ?? null,
            title: data.title,
            placement_mode: data.placementMode,
            anchor_wgs84: toJsonbValue(data.anchorWgs84),
            local_transform: toJsonbValue(data.localTransform ?? {}),
            footprint: toJsonbValue(data.footprint ?? null),
            base_elevation: data.baseElevation ?? null,
            terrain_normal: toJsonbValue(data.terrainNormal ?? null),
            slope_deg: data.slopeDeg ?? null,
            lod_profile: toJsonbValue(data.lodProfile ?? {}),
            material_variant: toJsonbValue(data.materialVariant ?? {}),
            branding_pack_id: data.brandingPackId ?? null,
            render_profile: toJsonbValue(data.renderProfile ?? {}),
            metadata: toJsonbValue(data.metadata ?? null),
            status: data.status ?? 'draft',
            created_by: data.createdBy ?? null,
            updated_by: data.updatedBy ?? data.createdBy ?? null,
        })
        .returning('*');

    return mapSpatialObject(row);
}

export async function updateSpatialObject(scope, objectId, data, db = knex) {
    const payload = { updated_at: knex.fn.now() };

    if (data.focusZoneId !== undefined) payload.focus_zone_id = data.focusZoneId;
    if (data.objectType !== undefined) payload.object_type = data.objectType;
    if (data.templateId !== undefined) payload.template_id = data.templateId;
    if (data.variantId !== undefined) payload.variant_id = data.variantId;
    if (data.title !== undefined) payload.title = data.title;
    if (data.placementMode !== undefined) payload.placement_mode = data.placementMode;
    if (data.anchorWgs84 !== undefined) payload.anchor_wgs84 = toJsonbValue(data.anchorWgs84);
    if (data.localTransform !== undefined) payload.local_transform = toJsonbValue(data.localTransform);
    if (data.footprint !== undefined) payload.footprint = toJsonbValue(data.footprint);
    if (data.baseElevation !== undefined) payload.base_elevation = data.baseElevation;
    if (data.terrainNormal !== undefined) payload.terrain_normal = toJsonbValue(data.terrainNormal);
    if (data.slopeDeg !== undefined) payload.slope_deg = data.slopeDeg;
    if (data.lodProfile !== undefined) payload.lod_profile = toJsonbValue(data.lodProfile);
    if (data.materialVariant !== undefined) payload.material_variant = toJsonbValue(data.materialVariant);
    if (data.brandingPackId !== undefined) payload.branding_pack_id = data.brandingPackId;
    if (data.renderProfile !== undefined) payload.render_profile = toJsonbValue(data.renderProfile);
    if (data.metadata !== undefined) payload.metadata = toJsonbValue(data.metadata);
    if (data.status !== undefined) payload.status = data.status;
    if (data.updatedBy !== undefined) payload.updated_by = data.updatedBy;

    const [row] = await scopedRecordsQuery('inventory_3d_event_spatial_objects', scope, db)
        .where('records.id', objectId)
        .update(payload)
        .returning('*');

    return mapSpatialObject(row);
}

export async function deleteSpatialObject(scope, objectId, db = knex) {
    const deleted = await scopedRecordsQuery('inventory_3d_event_spatial_objects', scope, db)
        .where('records.id', objectId)
        .del();

    return deleted > 0;
}

export async function listTerrainWorkZones(scope, projectId, filters = {}) {
    let query = scopedRecordsQuery('inventory_3d_terrain_work_zones', scope)
        .where('records.project_id', projectId);

    if (filters.zoneType) query = query.where('records.zone_type', filters.zoneType);
    if (filters.status) query = query.where('records.status', filters.status);

    const rows = await query.orderBy([{ column: 'records.updated_at', order: 'desc' }, { column: 'records.created_at', order: 'desc' }]);
    return rows.map(mapTerrainWorkZone);
}

export async function getTerrainWorkZoneById(scope, zoneId, db = knex) {
    const row = await scopedRecordsQuery('inventory_3d_terrain_work_zones', scope, db)
        .where('records.id', zoneId)
        .first();

    return mapTerrainWorkZone(row);
}

export async function getTerrainWorkZoneByIdForUpdate(scope, zoneId, trx) {
    const row = await scopedRecordsQuery('inventory_3d_terrain_work_zones', scope, trx)
        .where('records.id', zoneId)
        .forUpdate()
        .first();

    return mapTerrainWorkZone(row);
}

export async function findSiteModeTerrainWorkZone(
    scope,
    projectId,
    { clientMutationId = null, sourceNodeId = null } = {},
    db = knex,
    { forUpdate = false } = {},
) {
    if (!clientMutationId && !sourceNodeId) return null;

    const query = applySiteModeTerrainWorkZonePredicate(
        scopedRecordsQuery('inventory_3d_terrain_work_zones', scope, db)
            .where('records.project_id', projectId)
    )
        .where((builder) => {
            if (clientMutationId) {
                builder.orWhereRaw(
                    "records.snapshot_json #>> '{siteBake,clientMutationId}' = ?",
                    [clientMutationId],
                );
            }
            if (sourceNodeId) {
                builder.orWhereRaw("records.metadata->>'sourceNodeId' = ?", [sourceNodeId]);
            }
        })
        .orderBy('records.updated_at', 'desc');
    if (forUpdate) query.forUpdate();

    return mapTerrainWorkZone(await query.first());
}

export async function findAnySiteModeTerrainWorkZone(
    scope,
    projectId,
    db = knex,
    { forUpdate = false } = {},
) {
    const query = applySiteModeTerrainWorkZonePredicate(
        scopedRecordsQuery('inventory_3d_terrain_work_zones', scope, db)
            .where('records.project_id', projectId)
    ).orderBy('records.updated_at', 'desc');
    if (forUpdate) query.forUpdate();
    return mapTerrainWorkZone(await query.first());
}

export async function listSiteModeTerrainWorkZonesForProjects(
    scope,
    projectIds,
    db = knex,
) {
    const normalizedProjectIds = [...new Set((projectIds || []).filter(Boolean))];
    if (!normalizedProjectIds.length) return [];

    const rows = await applySiteModeTerrainWorkZonePredicate(
        scopedRecordsQuery('inventory_3d_terrain_work_zones', scope, db)
            .whereIn('records.project_id', normalizedProjectIds)
    )
        .distinctOn('records.project_id')
        .orderBy('records.project_id', 'asc')
        .orderBy('records.updated_at', 'desc');
    return rows.map(mapTerrainWorkZone);
}

export async function createTerrainWorkZone(data, db = knex) {
    const [row] = await db('inventory_3d_terrain_work_zones')
        .insert({
            project_id: data.projectId,
            name: data.name,
            zone_type: data.zoneType,
            clip_polygon_wgs84: toJsonbValue(data.clipPolygonWgs84),
            origin_wgs84: toJsonbValue(data.originWgs84),
            enu_transform: toJsonbValue(data.enuTransform ?? null),
            terrain_resolution: data.terrainResolution ?? 2,
            terrain_mesh_asset_id: data.terrainMeshAssetId ?? null,
            included_object_ids: toJsonbValue(data.includedObjectIds ?? []),
            publish_target: toJsonbValue(data.publishTarget ?? {}),
            snapshot_json: toJsonbValue(data.snapshotJson ?? null),
            metadata: toJsonbValue(data.metadata ?? null),
            status: data.status ?? 'draft',
            created_by: data.createdBy ?? null,
            updated_by: data.updatedBy ?? data.createdBy ?? null,
        })
        .returning('*');

    return mapTerrainWorkZone(row);
}

export async function updateTerrainWorkZone(
    scope,
    zoneId,
    data,
    db = knex,
    { allowSiteModeMutation = false } = {},
) {
    const payload = { updated_at: knex.fn.now() };

    if (data.name !== undefined) payload.name = data.name;
    if (data.zoneType !== undefined) payload.zone_type = data.zoneType;
    if (data.clipPolygonWgs84 !== undefined) payload.clip_polygon_wgs84 = toJsonbValue(data.clipPolygonWgs84);
    if (data.originWgs84 !== undefined) payload.origin_wgs84 = toJsonbValue(data.originWgs84);
    if (data.enuTransform !== undefined) payload.enu_transform = toJsonbValue(data.enuTransform);
    if (data.terrainResolution !== undefined) payload.terrain_resolution = data.terrainResolution;
    if (data.terrainMeshAssetId !== undefined) payload.terrain_mesh_asset_id = data.terrainMeshAssetId;
    if (data.includedObjectIds !== undefined) payload.included_object_ids = toJsonbValue(data.includedObjectIds);
    if (data.publishTarget !== undefined) payload.publish_target = toJsonbValue(data.publishTarget);
    if (data.snapshotJson !== undefined) payload.snapshot_json = toJsonbValue(data.snapshotJson);
    if (data.metadata !== undefined) payload.metadata = toJsonbValue(data.metadata);
    if (data.status !== undefined) payload.status = data.status;
    if (data.updatedBy !== undefined) payload.updated_by = data.updatedBy;

    const query = scopedRecordsQuery('inventory_3d_terrain_work_zones', scope, db)
        .where('records.id', zoneId);
    if (!allowSiteModeMutation) {
        query
            .whereRaw("COALESCE(records.metadata->>'purpose', '') <> 'site-mode'")
            .whereRaw(
                "NOT jsonb_exists(COALESCE(records.snapshot_json, '{}'::jsonb), 'siteBake')"
            );
    }

    const [row] = await query
        .update(payload)
        .returning('*');

    if (!row && !allowSiteModeMutation) {
        const latest = await getTerrainWorkZoneById(scope, zoneId, db);
        if (latest) assertGenericWorkZoneMutationAllowed(latest);
    }

    return mapTerrainWorkZone(row);
}

export async function deleteTerrainWorkZone(
    scope,
    zoneId,
    db = knex,
    { allowSiteModeMutation = false } = {},
) {
    const query = scopedRecordsQuery('inventory_3d_terrain_work_zones', scope, db)
        .where('records.id', zoneId);
    if (!allowSiteModeMutation) {
        query
            .whereRaw("COALESCE(records.metadata->>'purpose', '') <> 'site-mode'")
            .whereRaw(
                "NOT jsonb_exists(COALESCE(records.snapshot_json, '{}'::jsonb), 'siteBake')"
            );
    }
    const deleted = await query
        .del();

    if (deleted === 0 && !allowSiteModeMutation) {
        const latest = await getTerrainWorkZoneById(scope, zoneId, db);
        if (latest) assertGenericWorkZoneMutationAllowed(latest);
    }

    return deleted > 0;
}
