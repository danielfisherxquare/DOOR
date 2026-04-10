import * as repo from './inventory.spatial.repository.js';
import * as studioRepo from './inventory.studio.repository.js';
import {
    buildTerrainWorkZoneRuntimePreview,
    executeTerrainWorkZoneExportArtifacts,
    resolveTerrainWorkZoneArtifactAbsolutePath,
} from './inventory.spatial.export.js';
import { buildTerrainWorkZoneExportPackage, buildTerrainWorkZonePublishManifest } from './inventory.spatial.publish.js';

const SPATIAL_OBJECT_TYPES = new Set([
    'arch',
    'stage',
    'tent',
    'light_tower',
    'supply_station',
    'medical_station',
    'fence_segment',
    'route_sign',
    'generator',
    'toilet',
    'media_zone',
    'generic',
]);

const PLACEMENT_MODES = new Set(['follow-terrain', 'level-platform', 'vertical-keep']);
const SPATIAL_OBJECT_STATUSES = new Set(['draft', 'active', 'archived']);
const WORK_ZONE_TYPES = new Set(['focus-zone', 'terrain-clip', 'corridor-zone']);
const WORK_ZONE_STATUSES = new Set(['draft', 'ready', 'published', 'archived']);

function normalizeString(value, fieldName, { required = false, fallback = undefined } = {}) {
    if (value === undefined) {
        if (required) throw new Error(`${fieldName} is required`);
        return fallback;
    }
    const nextValue = String(value || '').trim();
    if (!nextValue) {
        if (required) throw new Error(`${fieldName} is required`);
        return fallback ?? null;
    }
    return nextValue;
}

function normalizeNumber(value, fieldName, { fallback = null, min = null, max = null, integer = false } = {}) {
    if (value === undefined || value === null || value === '') return fallback;
    const nextValue = Number(value);
    if (!Number.isFinite(nextValue)) throw new Error(`${fieldName} must be a number`);
    let normalized = integer ? Math.round(nextValue) : nextValue;
    if (min !== null) normalized = Math.max(min, normalized);
    if (max !== null) normalized = Math.min(max, normalized);
    return normalized;
}

function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ensureArray(value) {
    return Array.isArray(value) ? value : [];
}

function ensureUniqueStringArray(value) {
    const seen = new Set();
    return ensureArray(value)
        .map((item) => String(item || '').trim())
        .filter((item) => {
            if (!item || seen.has(item)) return false;
            seen.add(item);
            return true;
        });
}

function mergePlainObjects(baseValue, extraValue) {
    return {
        ...(isPlainObject(baseValue) ? baseValue : {}),
        ...(isPlainObject(extraValue) ? extraValue : {}),
    };
}

function buildNotFoundError(message) {
    const error = new Error(message);
    error.statusCode = 404;
    return error;
}

async function ensureScopedProject(scope, projectId) {
    const project = await studioRepo.getProjectById(scope, projectId);
    if (!project) throw buildNotFoundError('3D 项目不存在');
    return project;
}

async function ensureScopedTerrainWorkZone(scope, projectId, zoneId) {
    if (!zoneId) return null;
    const zone = await repo.getTerrainWorkZoneById(scope, zoneId);
    if (!zone || zone.projectId !== projectId) {
        throw buildNotFoundError('focusZoneId 对应工作区不存在');
    }
    return zone;
}

function stringArraysEqual(left, right) {
    const leftArray = ensureUniqueStringArray(left);
    const rightArray = ensureUniqueStringArray(right);
    if (leftArray.length !== rightArray.length) return false;
    return leftArray.every((item, index) => item === rightArray[index]);
}

function normalizeObjectType(value, fallback = 'generic') {
    const nextValue = normalizeString(value, 'objectType', { fallback }) || fallback;
    if (!SPATIAL_OBJECT_TYPES.has(nextValue)) {
        throw new Error(`objectType must be one of ${Array.from(SPATIAL_OBJECT_TYPES).join(', ')}`);
    }
    return nextValue;
}

function normalizePlacementMode(value, fallback = 'follow-terrain') {
    const nextValue = normalizeString(value, 'placementMode', { fallback }) || fallback;
    if (!PLACEMENT_MODES.has(nextValue)) {
        throw new Error(`placementMode must be one of ${Array.from(PLACEMENT_MODES).join(', ')}`);
    }
    return nextValue;
}

function normalizeObjectStatus(value, fallback = 'draft') {
    const nextValue = normalizeString(value, 'status', { fallback }) || fallback;
    if (!SPATIAL_OBJECT_STATUSES.has(nextValue)) {
        throw new Error(`status must be one of ${Array.from(SPATIAL_OBJECT_STATUSES).join(', ')}`);
    }
    return nextValue;
}

function normalizeWorkZoneType(value, fallback = 'focus-zone') {
    const nextValue = normalizeString(value, 'zoneType', { fallback }) || fallback;
    if (!WORK_ZONE_TYPES.has(nextValue)) {
        throw new Error(`zoneType must be one of ${Array.from(WORK_ZONE_TYPES).join(', ')}`);
    }
    return nextValue;
}

function normalizeWorkZoneStatus(value, fallback = 'draft') {
    const nextValue = normalizeString(value, 'status', { fallback }) || fallback;
    if (!WORK_ZONE_STATUSES.has(nextValue)) {
        throw new Error(`status must be one of ${Array.from(WORK_ZONE_STATUSES).join(', ')}`);
    }
    return nextValue;
}

function normalizeCoordinatePair(value, fieldName, { required = false } = {}) {
    if (!isPlainObject(value)) {
        if (required) throw new Error(`${fieldName} must be an object`);
        return null;
    }
    const latitude = normalizeNumber(value.latitude, `${fieldName}.latitude`);
    const longitude = normalizeNumber(value.longitude, `${fieldName}.longitude`);
    if (latitude === null || longitude === null) {
        if (required) throw new Error(`${fieldName} must include latitude and longitude`);
        return null;
    }
    return {
        latitude,
        longitude,
        height: normalizeNumber(value.height, `${fieldName}.height`, { fallback: null }),
    };
}

function normalizeAnchorWgs84(value) {
    return normalizeCoordinatePair(value, 'anchorWgs84', { required: true });
}

function normalizePolygon(value, fieldName) {
    if (!isPlainObject(value) || value.type !== 'Polygon' || !Array.isArray(value.coordinates?.[0])) {
        throw new Error(`${fieldName} must be a GeoJSON Polygon`);
    }
    return value;
}

function deriveOriginFromPolygon(polygon) {
    const ring = ensureArray(polygon.coordinates?.[0]);
    const uniquePoints = ring.length > 1 && ring[0]?.[0] === ring[ring.length - 1]?.[0] && ring[0]?.[1] === ring[ring.length - 1]?.[1]
        ? ring.slice(0, -1)
        : ring;

    if (!uniquePoints.length) {
        throw new Error('clipPolygonWgs84 must contain at least one coordinate');
    }

    const sums = uniquePoints.reduce((acc, point) => {
        acc.longitude += Number(point?.[0] || 0);
        acc.latitude += Number(point?.[1] || 0);
        return acc;
    }, { longitude: 0, latitude: 0 });

    return {
        longitude: sums.longitude / uniquePoints.length,
        latitude: sums.latitude / uniquePoints.length,
        height: 0,
    };
}

function normalizeSpatialObjectPayload(data, actorUserId, current = null) {
    return {
        focusZoneId: data.focusZoneId !== undefined ? normalizeString(data.focusZoneId, 'focusZoneId', { fallback: null }) : current?.focusZoneId,
        objectType: data.objectType !== undefined ? normalizeObjectType(data.objectType) : current?.objectType,
        templateId: data.templateId !== undefined ? normalizeString(data.templateId, 'templateId', { fallback: null }) : current?.templateId,
        variantId: data.variantId !== undefined ? normalizeString(data.variantId, 'variantId', { fallback: null }) : current?.variantId,
        title: normalizeString(data.title !== undefined ? data.title : current?.title, 'title', { required: true }),
        placementMode: data.placementMode !== undefined ? normalizePlacementMode(data.placementMode) : (current?.placementMode || 'follow-terrain'),
        anchorWgs84: data.anchorWgs84 !== undefined ? normalizeAnchorWgs84(data.anchorWgs84) : current?.anchorWgs84,
        localTransform: data.localTransform !== undefined ? (isPlainObject(data.localTransform) ? data.localTransform : {}) : (current?.localTransform || {}),
        footprint: data.footprint !== undefined ? (data.footprint === null ? null : normalizePolygon(data.footprint, 'footprint')) : current?.footprint,
        baseElevation: data.baseElevation !== undefined ? normalizeNumber(data.baseElevation, 'baseElevation') : current?.baseElevation,
        terrainNormal: data.terrainNormal !== undefined ? (isPlainObject(data.terrainNormal) ? data.terrainNormal : null) : current?.terrainNormal,
        slopeDeg: data.slopeDeg !== undefined ? normalizeNumber(data.slopeDeg, 'slopeDeg') : current?.slopeDeg,
        lodProfile: data.lodProfile !== undefined ? (isPlainObject(data.lodProfile) ? data.lodProfile : {}) : (current?.lodProfile || {}),
        materialVariant: data.materialVariant !== undefined ? (isPlainObject(data.materialVariant) ? data.materialVariant : {}) : (current?.materialVariant || {}),
        brandingPackId: data.brandingPackId !== undefined ? normalizeString(data.brandingPackId, 'brandingPackId', { fallback: null }) : current?.brandingPackId,
        renderProfile: data.renderProfile !== undefined ? (isPlainObject(data.renderProfile) ? data.renderProfile : {}) : (current?.renderProfile || {}),
        metadata: data.metadata !== undefined ? (isPlainObject(data.metadata) ? data.metadata : null) : current?.metadata,
        status: data.status !== undefined ? normalizeObjectStatus(data.status) : (current?.status || 'draft'),
        updatedBy: actorUserId ?? null,
    };
}

async function syncTerrainWorkZoneIncludedObjects(scope, actorUserId, zone, includedObjectIds) {
    const desiredIds = ensureUniqueStringArray(includedObjectIds);
    const synchronizedIds = [];
    const synchronizedIdSet = new Set();

    for (const objectId of desiredIds) {
        const object = await repo.getSpatialObjectById(scope, objectId);
        if (!object || object.projectId !== zone.projectId) continue;

        synchronizedIds.push(object.id);
        synchronizedIdSet.add(object.id);

        if (object.focusZoneId !== zone.id) {
            await repo.updateSpatialObject(scope, object.id, {
                focusZoneId: zone.id,
                updatedBy: actorUserId ?? null,
            });
        }
    }

    const currentlyLinkedObjects = await repo.listSpatialObjects(scope, zone.projectId, {
        focusZoneId: zone.id,
    });

    for (const object of currentlyLinkedObjects) {
        if (synchronizedIdSet.has(object.id)) continue;
        await repo.updateSpatialObject(scope, object.id, {
            focusZoneId: null,
            updatedBy: actorUserId ?? null,
        });
    }

    if (stringArraysEqual(zone.includedObjectIds, synchronizedIds)) {
        return {
            ...zone,
            includedObjectIds: synchronizedIds,
        };
    }

    return repo.updateTerrainWorkZone(scope, zone.id, {
        includedObjectIds: synchronizedIds,
        updatedBy: actorUserId ?? null,
    });
}

async function syncSpatialObjectFocusZoneMembership(scope, actorUserId, spatialObject, previousFocusZoneId, nextFocusZoneId) {
    const objectId = spatialObject?.id;
    const projectId = spatialObject?.projectId;
    if (!objectId || !projectId) return;

    if (previousFocusZoneId && previousFocusZoneId !== nextFocusZoneId) {
        const previousZone = await repo.getTerrainWorkZoneById(scope, previousFocusZoneId);
        if (previousZone && previousZone.projectId === projectId) {
            const previousIds = ensureUniqueStringArray(previousZone.includedObjectIds);
            const nextIds = previousIds.filter((item) => item !== objectId);
            if (!stringArraysEqual(previousIds, nextIds)) {
                await repo.updateTerrainWorkZone(scope, previousZone.id, {
                    includedObjectIds: nextIds,
                    updatedBy: actorUserId ?? null,
                });
            }
        }
    }

    if (!nextFocusZoneId) return;

    const nextZone = await ensureScopedTerrainWorkZone(scope, projectId, nextFocusZoneId);
    const zoneIds = ensureUniqueStringArray(nextZone.includedObjectIds);
    if (zoneIds.includes(objectId)) return;

    await repo.updateTerrainWorkZone(scope, nextZone.id, {
        includedObjectIds: [...zoneIds, objectId],
        updatedBy: actorUserId ?? null,
    });
}

function normalizeTerrainWorkZonePayload(data, actorUserId, current = null) {
    const clipPolygonWgs84 = data.clipPolygonWgs84 !== undefined
        ? normalizePolygon(data.clipPolygonWgs84, 'clipPolygonWgs84')
        : current?.clipPolygonWgs84;
    const originWgs84 = data.originWgs84 !== undefined
        ? normalizeCoordinatePair(data.originWgs84, 'originWgs84', { required: true })
        : (current?.originWgs84 || (clipPolygonWgs84 ? deriveOriginFromPolygon(clipPolygonWgs84) : null));

    return {
        name: normalizeString(data.name !== undefined ? data.name : current?.name, 'name', { required: true }),
        zoneType: data.zoneType !== undefined ? normalizeWorkZoneType(data.zoneType) : (current?.zoneType || 'focus-zone'),
        clipPolygonWgs84,
        originWgs84,
        enuTransform: data.enuTransform !== undefined ? (isPlainObject(data.enuTransform) ? data.enuTransform : null) : current?.enuTransform,
        terrainResolution: data.terrainResolution !== undefined
            ? normalizeNumber(data.terrainResolution, 'terrainResolution', { fallback: 2, min: 1, max: 100, integer: true })
            : (current?.terrainResolution || 2),
        terrainMeshAssetId: data.terrainMeshAssetId !== undefined
            ? normalizeString(data.terrainMeshAssetId, 'terrainMeshAssetId', { fallback: null })
            : current?.terrainMeshAssetId,
        includedObjectIds: data.includedObjectIds !== undefined
            ? ensureArray(data.includedObjectIds).map((item) => String(item)).filter(Boolean)
            : (current?.includedObjectIds || []),
        publishTarget: data.publishTarget !== undefined ? (isPlainObject(data.publishTarget) ? data.publishTarget : {}) : (current?.publishTarget || {}),
        snapshotJson: data.snapshotJson !== undefined ? (isPlainObject(data.snapshotJson) ? data.snapshotJson : null) : current?.snapshotJson,
        metadata: data.metadata !== undefined ? (isPlainObject(data.metadata) ? data.metadata : null) : current?.metadata,
        status: data.status !== undefined ? normalizeWorkZoneStatus(data.status) : (current?.status || 'draft'),
        updatedBy: actorUserId ?? null,
    };
}

export async function listProjectSpatialObjects(scope, projectId, filters = {}) {
    await ensureScopedProject(scope, projectId);
    return repo.listSpatialObjects(scope, projectId, {
        objectType: filters.objectType ? normalizeObjectType(filters.objectType) : undefined,
        focusZoneId: filters.focusZoneId ? normalizeString(filters.focusZoneId, 'focusZoneId', { fallback: null }) : undefined,
        status: filters.status ? normalizeObjectStatus(filters.status) : undefined,
    });
}

export async function createProjectSpatialObject(scope, actorUserId, projectId, data = {}) {
    await ensureScopedProject(scope, projectId);
    await ensureScopedTerrainWorkZone(scope, projectId, data.focusZoneId);
    const payload = normalizeSpatialObjectPayload(data, actorUserId);
    const created = await repo.createSpatialObject({
        ...payload,
        projectId,
        createdBy: actorUserId ?? null,
    });
    await syncSpatialObjectFocusZoneMembership(scope, actorUserId, created, null, created.focusZoneId);
    return created;
}

export async function updateProjectSpatialObject(scope, actorUserId, objectId, data = {}) {
    const current = await repo.getSpatialObjectById(scope, objectId);
    if (!current) throw buildNotFoundError('空间对象不存在');
    await ensureScopedTerrainWorkZone(scope, current.projectId, data.focusZoneId);
    const payload = normalizeSpatialObjectPayload(data, actorUserId, current);
    const updated = await repo.updateSpatialObject(scope, objectId, payload);
    await syncSpatialObjectFocusZoneMembership(scope, actorUserId, updated, current.focusZoneId, updated.focusZoneId);
    return updated;
}

export async function deleteProjectSpatialObject(scope, objectId) {
    const current = await repo.getSpatialObjectById(scope, objectId);
    if (!current) throw buildNotFoundError('空间对象不存在');
    await syncSpatialObjectFocusZoneMembership(scope, null, current, current.focusZoneId, null);
    await repo.deleteSpatialObject(scope, objectId);
    return { id: objectId };
}

export async function listProjectTerrainWorkZones(scope, projectId, filters = {}) {
    await ensureScopedProject(scope, projectId);
    return repo.listTerrainWorkZones(scope, projectId, {
        zoneType: filters.zoneType ? normalizeWorkZoneType(filters.zoneType) : undefined,
        status: filters.status ? normalizeWorkZoneStatus(filters.status) : undefined,
    });
}

export async function createProjectTerrainWorkZone(scope, actorUserId, projectId, data = {}) {
    await ensureScopedProject(scope, projectId);
    const payload = normalizeTerrainWorkZonePayload(data, actorUserId);
    const created = await repo.createTerrainWorkZone({
        ...payload,
        projectId,
        createdBy: actorUserId ?? null,
    });
    return syncTerrainWorkZoneIncludedObjects(scope, actorUserId, created, created.includedObjectIds);
}

export async function getProjectTerrainWorkZone(scope, zoneId) {
    const zone = await repo.getTerrainWorkZoneById(scope, zoneId);
    if (!zone) throw buildNotFoundError('地形工作区不存在');
    return zone;
}

export async function updateProjectTerrainWorkZone(scope, actorUserId, zoneId, data = {}) {
    const current = await repo.getTerrainWorkZoneById(scope, zoneId);
    if (!current) throw buildNotFoundError('地形工作区不存在');
    const payload = normalizeTerrainWorkZonePayload(data, actorUserId, current);
    const updated = await repo.updateTerrainWorkZone(scope, zoneId, payload);
    return syncTerrainWorkZoneIncludedObjects(scope, actorUserId, updated, updated.includedObjectIds);
}

export async function deleteProjectTerrainWorkZone(scope, zoneId) {
    const current = await repo.getTerrainWorkZoneById(scope, zoneId);
    if (!current) throw buildNotFoundError('地形工作区不存在');
    const linkedObjects = await repo.listSpatialObjects(scope, current.projectId, { focusZoneId: zoneId });
    for (const object of linkedObjects) {
        await repo.updateSpatialObject(scope, object.id, {
            focusZoneId: null,
            updatedBy: null,
        });
    }
    await repo.deleteTerrainWorkZone(scope, zoneId);
    return { id: zoneId };
}

async function listFocusZoneSpatialObjects(scope, zone) {
    const scopedObjects = await repo.listSpatialObjects(scope, zone.projectId, {
        focusZoneId: zone.id,
    });
    const knownIds = new Set(scopedObjects.map((item) => item.id));
    const extraObjects = [];

    for (const objectId of ensureArray(zone.includedObjectIds)) {
        if (knownIds.has(objectId)) continue;
        const object = await repo.getSpatialObjectById(scope, objectId);
        if (!object || object.projectId !== zone.projectId) continue;
        extraObjects.push(object);
        knownIds.add(object.id);
    }

    return [...scopedObjects, ...extraObjects];
}

export async function generateTerrainWorkZonePublishManifest(scope, actorUserId, zoneId) {
    const zone = await repo.getTerrainWorkZoneById(scope, zoneId);
    if (!zone) throw buildNotFoundError('地形工作区不存在');

    const spatialObjects = await listFocusZoneSpatialObjects(scope, zone);
    const manifest = buildTerrainWorkZonePublishManifest(zone, spatialObjects);

    for (const item of manifest.objects) {
        const current = spatialObjects.find((object) => object.id === item.id);
        if (!current) continue;

        await repo.updateSpatialObject(scope, item.id, {
            baseElevation: item.placement?.baseElevationMeters ?? current.baseElevation,
            terrainNormal: item.placement?.terrainNormal ?? current.terrainNormal,
            slopeDeg: item.placement?.slopeDeg ?? current.slopeDeg,
            lodProfile: mergePlainObjects(current.lodProfile, {
                suggestedLevel: item.lodLevel,
                focusZoneId: zone.id,
                manifestBatchKey: item.batchKey,
                generatedAt: manifest.generatedAt,
            }),
            renderProfile: mergePlainObjects(current.renderProfile, {
                ...item.renderProfile,
                batchKey: item.batchKey,
                generatedAt: manifest.generatedAt,
            }),
            metadata: mergePlainObjects(current.metadata, {
                publishPlacement: item.placement,
                focusZoneLocalAnchor: item.anchorLocalMeters,
                publishManifestGeneratedAt: manifest.generatedAt,
            }),
            updatedBy: actorUserId ?? null,
        });
    }

    const updatedZone = await repo.updateTerrainWorkZone(scope, zoneId, {
        publishTarget: mergePlainObjects(zone.publishTarget, {
            lastManifestGeneratedAt: manifest.generatedAt,
            manifestSummary: manifest.summary,
            manifestTerrain: manifest.terrain,
            manifestBatches: manifest.batches,
        }),
        metadata: mergePlainObjects(zone.metadata, {
            publishManifestGeneratedAt: manifest.generatedAt,
            publishManifestObjectCount: manifest.summary.totalObjects,
        }),
        status: zone.status === 'draft' ? 'ready' : zone.status,
        updatedBy: actorUserId ?? null,
    });

    return {
        zone: updatedZone,
        manifest,
    };
}

export async function generateTerrainWorkZoneExportPackage(scope, actorUserId, zoneId) {
    const manifestResult = await generateTerrainWorkZonePublishManifest(scope, actorUserId, zoneId);
    const zone = manifestResult.zone;
    const manifest = manifestResult.manifest;
    const exportPackage = buildTerrainWorkZoneExportPackage(zone, manifest);

    const updatedZone = await repo.updateTerrainWorkZone(scope, zoneId, {
        publishTarget: mergePlainObjects(zone.publishTarget, {
            exportPackage,
            exportPackageGeneratedAt: exportPackage.generatedAt,
            exportPackageSummary: exportPackage.summary,
        }),
        metadata: mergePlainObjects(zone.metadata, {
            exportPackageGeneratedAt: exportPackage.generatedAt,
            exportPackageResourceCount: exportPackage.summary.totalResources,
        }),
        updatedBy: actorUserId ?? null,
    });

    return {
        zone: updatedZone,
        manifest,
        exportPackage,
    };
}

export async function executeTerrainWorkZoneExport(scope, actorUserId, zoneId) {
    const packageResult = await generateTerrainWorkZoneExportPackage(scope, actorUserId, zoneId);
    const task = await executeTerrainWorkZoneExportArtifacts({
        zone: packageResult.zone,
        manifest: packageResult.manifest,
        exportPackage: packageResult.exportPackage,
        actorUserId,
    });

    const updatedZone = await repo.updateTerrainWorkZone(scope, zoneId, {
        publishTarget: mergePlainObjects(packageResult.zone.publishTarget, {
            exportTask: task,
            exportTaskId: task.id,
            exportTaskStatus: task.status,
            exportOutputRoot: task.relativeOutputRoot,
            exportTaskCompletedAt: task.completedAt,
        }),
        metadata: mergePlainObjects(packageResult.zone.metadata, {
            exportTaskId: task.id,
            exportTaskStatus: task.status,
            exportOutputRoot: task.relativeOutputRoot,
        }),
        status: packageResult.zone.status === 'draft' ? 'ready' : packageResult.zone.status,
        updatedBy: actorUserId ?? null,
    });

    return {
        zone: updatedZone,
        manifest: packageResult.manifest,
        exportPackage: packageResult.exportPackage,
        task,
    };
}

export async function getTerrainWorkZoneRuntimePreview(scope, zoneId) {
    const zone = await repo.getTerrainWorkZoneById(scope, zoneId);
    if (!zone) throw buildNotFoundError('地形工作区不存在');

    const preview = await buildTerrainWorkZoneRuntimePreview(zone);
    return {
        zone,
        preview,
    };
}

export async function resolveTerrainWorkZoneExportArtifact(scope, zoneId, artifactPath) {
    const zone = await repo.getTerrainWorkZoneById(scope, zoneId);
    if (!zone) throw buildNotFoundError('地形工作区不存在');

    try {
        return {
            zone,
            ...resolveTerrainWorkZoneArtifactAbsolutePath(zone, artifactPath),
        };
    } catch (_error) {
        const error = new Error('导出产物路径无效');
        error.statusCode = 400;
        throw error;
    }
}
