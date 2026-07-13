import knex from '../../db/knex.js';
import * as studioRepo from './inventory.studio.repository.js';
import * as spatialRepo from './inventory.spatial.repository.js';
import {
    createBlankWarehouseScene,
    getStudioHierarchy,
    mergeWarehouseSceneIntoSnapshot,
    normalizeStudioSnapshot,
} from './inventory.studio.snapshot.js';
import {
    bakeSiteScene,
    bboxCenter,
    bboxToClipPolygon,
    parseSiteBakeBbox,
} from './inventory.spatial.site-bake.service.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMPTY_PROVIDER_STATUS = {
    imagery: {
        provider: 'unknown',
        status: 'failed',
        itemCount: 0,
        message: '尚未生成卫星影像瓦片清单',
        retryable: true,
    },
    terrain: {
        provider: 'unknown',
        status: 'failed',
        itemCount: 0,
        message: '尚未采样地形',
        retryable: true,
    },
    buildings: {
        provider: 'unknown',
        status: 'failed',
        itemCount: 0,
        message: '尚未获取建筑白模',
        retryable: true,
    },
};

function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function httpError(statusCode, publicCode, message, data = undefined) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = true;
    error.publicCode = publicCode;
    if (data !== undefined) error.data = data;
    return error;
}

function normalizeExpectedRevision(value) {
    if (value === undefined || value === null || value === '') {
        throw httpError(428, 'REVISION_REQUIRED', '保存前缺少 expectedRevision，请重新载入项目');
    }
    const revision = Number(value);
    if (!Number.isInteger(revision) || revision < 1) {
        throw httpError(400, 'INVALID_REVISION', 'expectedRevision 必须是大于等于 1 的整数');
    }
    return revision;
}

function normalizeOptionalUuid(value, fieldName) {
    if (value === undefined || value === null || value === '') return null;
    const normalized = String(value).trim();
    if (!UUID_PATTERN.test(normalized)) {
        throw httpError(400, 'INVALID_ID', `${fieldName} 无效`);
    }
    return normalized;
}

function revisionConflict(projectId, expectedRevision, currentProject) {
    return httpError(409, 'REVISION_CONFLICT', '项目已被其他窗口修改，请重新载入后再保存', {
        projectId,
        expectedRevision,
        currentRevision: currentProject?.revision ?? null,
        currentProjectUpdatedAt: currentProject?.updatedAt ?? null,
    });
}

function siteModeZoneConflict(projectId, existingZone, requestedFocusZoneId, sourceNodeId) {
    return httpError(409, 'SITE_MODE_ZONE_CONFLICT', '一个场地项目只能绑定一个卫星场地工作区', {
        projectId,
        existingFocusZoneId: existingZone?.id || null,
        requestedFocusZoneId: requestedFocusZoneId || null,
        requestedSourceNodeId: sourceNodeId || null,
    });
}

function assertSingleProjectSiteModeZone({
    projectId,
    existingZone,
    targetZone,
    requestedFocusZoneId,
    sourceNodeId,
}) {
    if (!existingZone || existingZone.id === targetZone?.id) return;
    throw siteModeZoneConflict(
        projectId,
        existingZone,
        requestedFocusZoneId,
        sourceNodeId,
    );
}

function ensureProject(project, projectId) {
    if (!project) throw httpError(404, 'PROJECT_NOT_FOUND', '3D 项目不存在', { projectId });
    return project;
}

function ensureProjectZone(zone, projectId, focusZoneId) {
    if (!zone || zone.projectId !== projectId) {
        throw httpError(404, 'FOCUS_ZONE_NOT_FOUND', '场地工作区不存在', {
            projectId,
            focusZoneId,
        });
    }
    return zone;
}

export function polygonToSiteBbox(polygon) {
    const ring = Array.isArray(polygon?.coordinates?.[0]) ? polygon.coordinates[0] : [];
    const points = ring
        .map((point) => [Number(point?.[0]), Number(point?.[1])])
        .filter(([longitude, latitude]) => Number.isFinite(longitude) && Number.isFinite(latitude));
    if (points.length < 3) return null;
    const longitudes = points.map(([longitude]) => longitude);
    const latitudes = points.map(([, latitude]) => latitude);
    return parseSiteBakeBbox({
        west: Math.min(...longitudes),
        south: Math.min(...latitudes),
        east: Math.max(...longitudes),
        north: Math.max(...latitudes),
    });
}

function normalizeFocusZoneDraft(value) {
    if (value === undefined || value === null) return null;
    if (!isPlainObject(value)) {
        throw httpError(400, 'INVALID_FOCUS_ZONE', 'focusZone 必须是场地工作区对象');
    }
    const terrainResolution = Number(value.terrainResolution);
    return {
        name: typeof value.name === 'string' && value.name.trim()
            ? value.name.trim().slice(0, 200)
            : null,
        clipPolygonWgs84: value.clipPolygonWgs84,
        terrainResolution: Number.isInteger(terrainResolution)
            ? Math.min(Math.max(terrainResolution, 1), 100)
            : null,
        includedObjectIds: Array.isArray(value.includedObjectIds)
            ? [...new Set(value.includedObjectIds.map((item) => String(item).trim()).filter(Boolean))]
            : null,
        publishTarget: isPlainObject(value.publishTarget) ? value.publishTarget : null,
        metadata: isPlainObject(value.metadata) ? value.metadata : null,
    };
}

export function buildSiteProviderStatus(focusZone, warnings = []) {
    const terrainPatch = focusZone?.snapshotJson?.terrainPatch || null;
    const osmBuildings = focusZone?.snapshotJson?.osmBuildings || null;
    const orthophoto = focusZone?.orthophoto || null;
    const terrainFailed = warnings.some((warning) => String(warning).startsWith('地形采样失败'));
    const buildingsFailed = warnings.some((warning) => String(warning).startsWith('OSM 建筑获取失败'));

    return {
        imagery: {
            provider: orthophoto?.provider || 'unknown',
            status: orthophoto ? 'ready' : 'failed',
            itemCount: Array.isArray(orthophoto?.tiles) ? orthophoto.tiles.length : 0,
            message: orthophoto
                ? '在线瓦片清单已生成；尚未形成离线影像包'
                : '卫星影像瓦片清单生成失败',
            retryable: !orthophoto,
        },
        terrain: {
            provider: terrainPatch?.source || 'unknown',
            status: terrainPatch ? 'ready' : 'failed',
            itemCount: terrainPatch ? 1 : 0,
            message: terrainPatch ? '地形采样已完成' : '地形采样不可用',
            retryable: terrainFailed,
        },
        buildings: {
            provider: osmBuildings?.source || 'unknown',
            status: osmBuildings?.source && osmBuildings.source !== 'none'
                ? 'ready'
                : 'failed',
            itemCount: Number(osmBuildings?.count || 0),
            message: osmBuildings?.source && osmBuildings.source !== 'none'
                ? '建筑白模数据已获取'
                : 'OSM 建筑不可用',
            retryable: buildingsFailed,
        },
    };
}

function getBakeStatus(providerStatus) {
    const statuses = Object.values(providerStatus).map((provider) => provider.status);
    if (statuses.every((status) => status === 'failed')) return 'failed';
    if (statuses.some((status) => status === 'failed')) return 'degraded';
    return 'ready';
}

function focusZoneResponse(workZone) {
    return {
        ...workZone,
        orthophoto: workZone?.snapshotJson?.orthophoto || null,
    };
}

function buildResponse({ project, workZone, sceneSnapshot = undefined, clientMutationId = null }) {
    const bake = isPlainObject(workZone?.snapshotJson?.siteBake)
        ? workZone.snapshotJson.siteBake
        : {};
    const responseZone = focusZoneResponse(workZone);
    const data = {
        project,
        workZone: responseZone,
        focusZone: responseZone,
        revision: project.revision,
        bakeStatus: bake.status || 'failed',
        providerStatus: isPlainObject(bake.providerStatus)
            ? bake.providerStatus
            : EMPTY_PROVIDER_STATUS,
        warnings: Array.isArray(bake.warnings) ? bake.warnings : [],
        clientMutationId: clientMutationId || null,
    };
    if (sceneSnapshot !== undefined) data.sceneSnapshot = sceneSnapshot;
    return data;
}

function mergeBakeSnapshot(currentSnapshot, bakedFocusZone, bakeMetadata) {
    return {
        ...(isPlainObject(currentSnapshot) ? currentSnapshot : {}),
        terrainPatch: bakedFocusZone?.snapshotJson?.terrainPatch || null,
        osmBuildings: bakedFocusZone?.snapshotJson?.osmBuildings || null,
        orthophoto: bakedFocusZone?.orthophoto || null,
        siteBake: bakeMetadata,
    };
}

function ensureEditableProjectSnapshot(project, geoAnchor) {
    const projectGeoAnchor = project.projectType === 'site'
        ? geoAnchor
        : project.geoAnchor || geoAnchor;
    const normalized = normalizeStudioSnapshot(project.snapshotJson, {
        sceneType: project.sceneType,
        projectType: project.projectType,
        name: project.name,
        geoAnchor: projectGeoAnchor,
    });
    if (getStudioHierarchy(normalized).activeWarehouse) {
        const shouldRefreshSiteAnchor = project.projectType === 'site' && geoAnchor;
        return {
            snapshotJson: shouldRefreshSiteAnchor
                ? {
                    ...normalized,
                    site: {
                        ...normalized.site,
                        geoAnchor,
                    },
                }
                : undefined,
            geoAnchor: projectGeoAnchor,
        };
    }

    return {
        snapshotJson: normalizeStudioSnapshot(createBlankWarehouseScene({
            sceneType: project.sceneType,
            name: project.name,
        }), {
            sceneType: project.sceneType,
            projectType: project.projectType,
            name: project.name,
            geoAnchor: projectGeoAnchor,
        }),
        geoAnchor: projectGeoAnchor,
    };
}

async function getScopedProjectAndZone(
    scope,
    projectId,
    focusZoneId,
    studioRepository = studioRepo,
    spatialRepository = spatialRepo,
) {
    const project = ensureProject(
        await studioRepository.getProjectById(scope, projectId),
        projectId,
    );
    const zone = focusZoneId
        ? ensureProjectZone(
            await spatialRepository.getTerrainWorkZoneById(scope, focusZoneId),
            projectId,
            focusZoneId,
        )
        : null;
    return { project, zone };
}

export async function getProjectSiteMode(
    scope,
    projectId,
    focusZoneId,
    dependencies = {},
) {
    normalizeOptionalUuid(projectId, 'projectId');
    const normalizedFocusZoneId = normalizeOptionalUuid(focusZoneId, 'focusZoneId');
    if (!normalizedFocusZoneId) {
        throw httpError(400, 'FOCUS_ZONE_REQUIRED', '缺少 focusZoneId');
    }

    const studioRepository = dependencies.studioRepo || studioRepo;
    const spatialRepository = dependencies.spatialRepo || spatialRepo;
    const runTransaction = dependencies.runTransaction
        || ((handler) => knex.transaction(handler));

    // Site-mode writers lock the project before the focus zone. Taking the
    // same locks here prevents a page from combining an old zone scene with a
    // newer project revision while a save or rebake commits.
    return runTransaction(async (trx) => {
        const project = ensureProject(
            await studioRepository.getProjectByIdForUpdate(scope, projectId, trx),
            projectId,
        );
        const workZone = ensureProjectZone(
            await spatialRepository.getTerrainWorkZoneByIdForUpdate(
                scope,
                normalizedFocusZoneId,
                trx,
            ),
            projectId,
            normalizedFocusZoneId,
        );

        return buildResponse({
            project,
            workZone,
            sceneSnapshot: workZone.snapshotJson?.warehouseScene || undefined,
        });
    });
}

export async function bakeProjectSite(
    scope,
    actorUserId,
    projectId,
    data = {},
    fetchImpl = globalThis.fetch,
    dependencies = {},
) {
    normalizeOptionalUuid(projectId, 'projectId');
    const studioRepository = dependencies.studioRepo || studioRepo;
    const spatialRepository = dependencies.spatialRepo || spatialRepo;
    const bakeScene = dependencies.bakeSiteScene || bakeSiteScene;
    const runTransaction = dependencies.runTransaction
        || ((handler) => knex.transaction(handler));
    const expectedRevision = normalizeExpectedRevision(data.expectedRevision);
    const focusZoneId = normalizeOptionalUuid(data.focusZoneId, 'focusZoneId');
    const focusZoneDraft = normalizeFocusZoneDraft(data.focusZone);
    const clientMutationId = typeof data.clientMutationId === 'string'
        ? data.clientMutationId.trim() || null
        : null;
    const scopedRecords = await getScopedProjectAndZone(
        scope,
        projectId,
        focusZoneId,
        studioRepository,
        spatialRepository,
    );
    const sourceNodeId = typeof focusZoneDraft?.metadata?.sourceNodeId === 'string'
        ? focusZoneDraft.metadata.sourceNodeId.trim() || null
        : null;
    const project = scopedRecords.project;
    const matchedZone = scopedRecords.zone || (
        !focusZoneId && typeof spatialRepository.findSiteModeTerrainWorkZone === 'function'
            ? await spatialRepository.findSiteModeTerrainWorkZone(
                scope,
                projectId,
                { clientMutationId, sourceNodeId },
            )
            : null
    );
    const existingSiteModeZone = typeof spatialRepository.findAnySiteModeTerrainWorkZone === 'function'
        ? await spatialRepository.findAnySiteModeTerrainWorkZone(scope, projectId)
        : null;
    assertSingleProjectSiteModeZone({
        projectId,
        existingZone: existingSiteModeZone,
        targetZone: matchedZone,
        requestedFocusZoneId: focusZoneId,
        sourceNodeId,
    });
    const zone = matchedZone;
    if (project.revision !== expectedRevision) {
        if (clientMutationId && zone?.snapshotJson?.siteBake?.clientMutationId === clientMutationId) {
            return buildResponse({ project, workZone: zone, clientMutationId });
        }
        throw revisionConflict(projectId, expectedRevision, project);
    }

    const bbox = focusZoneDraft?.clipPolygonWgs84
        ? polygonToSiteBbox(focusZoneDraft.clipPolygonWgs84)
        : zone
          ? polygonToSiteBbox(zone.clipPolygonWgs84)
        : parseSiteBakeBbox(data);
    if (!bbox) {
        throw httpError(
            400,
            'INVALID_BBOX',
            '场地边界无效：需提供合法 WGS84 边界，且经纬跨度均不得超过 0.25°'
        );
    }

    const orthophotoOptions = isPlainObject(data.orthophoto) ? data.orthophoto : {};
    const baked = await bakeScene(bbox, {
        id: focusZoneId || zone?.id || null,
        name: focusZoneDraft?.name
            || zone?.name
            || (typeof data.name === 'string' ? data.name : undefined),
        terrainResolution: focusZoneDraft?.terrainResolution || zone?.terrainResolution || 2,
        orthophoto: {
            ...orthophotoOptions,
            zoom: orthophotoOptions.zoom ?? data.zoom,
            maxTiles: orthophotoOptions.maxTiles ?? data.maxTiles,
        },
    }, fetchImpl);
    const warnings = Array.isArray(baked.warnings) ? baked.warnings : [];
    const providerStatus = buildSiteProviderStatus(baked.focusZone, warnings);
    const bakeStatus = getBakeStatus(providerStatus);
    const bakedAt = new Date().toISOString();

    return runTransaction(async (trx) => {
        const lockedProject = ensureProject(
            await studioRepository.getProjectByIdForUpdate(scope, projectId, trx),
            projectId,
        );
        const lockedZone = focusZoneId
            ? ensureProjectZone(
                await spatialRepository.getTerrainWorkZoneByIdForUpdate(scope, focusZoneId, trx),
                projectId,
                focusZoneId,
            )
            : typeof spatialRepository.findSiteModeTerrainWorkZone === 'function'
              ? await spatialRepository.findSiteModeTerrainWorkZone(
                  scope,
                  projectId,
                  { clientMutationId, sourceNodeId },
                  trx,
                  { forUpdate: true },
              )
              : null;
        const lockedExistingSiteModeZone = typeof spatialRepository.findAnySiteModeTerrainWorkZone === 'function'
            ? await spatialRepository.findAnySiteModeTerrainWorkZone(
                scope,
                projectId,
                trx,
                { forUpdate: true },
            )
            : null;
        assertSingleProjectSiteModeZone({
            projectId,
            existingZone: lockedExistingSiteModeZone,
            targetZone: lockedZone,
            requestedFocusZoneId: focusZoneId,
            sourceNodeId,
        });

        if (
            clientMutationId
            && lockedZone?.snapshotJson?.siteBake?.clientMutationId === clientMutationId
        ) {
            return buildResponse({
                project: lockedProject,
                workZone: lockedZone,
                clientMutationId,
            });
        }
        if (lockedProject.revision !== expectedRevision) {
            throw revisionConflict(projectId, expectedRevision, lockedProject);
        }

        const siteBake = {
            status: bakeStatus,
            providerStatus,
            warnings,
            bakedAt,
            clientMutationId,
            offlineReady: false,
        };
        const snapshotJson = mergeBakeSnapshot(lockedZone?.snapshotJson, baked.focusZone, siteBake);
        const metadata = {
            ...(isPlainObject(lockedZone?.metadata) ? lockedZone.metadata : {}),
            ...(focusZoneDraft?.metadata || {}),
            purpose: 'site-mode',
            requestedBbox: bbox,
            lastBakedAt: bakedAt,
            bakeStatus,
        };

        const updatedZone = ensureProjectZone(lockedZone
            ? await spatialRepository.updateTerrainWorkZone(scope, lockedZone.id, {
                ...(focusZoneDraft?.name ? { name: focusZoneDraft.name } : {}),
                clipPolygonWgs84: focusZoneDraft?.clipPolygonWgs84
                    || baked.focusZone?.clipPolygonWgs84
                    || bboxToClipPolygon(bbox),
                originWgs84: baked.focusZone?.originWgs84 || bboxCenter(bbox),
                terrainResolution: focusZoneDraft?.terrainResolution
                    || baked.focusZone?.terrainResolution
                    || lockedZone.terrainResolution
                    || 2,
                ...(focusZoneDraft?.includedObjectIds
                    ? { includedObjectIds: focusZoneDraft.includedObjectIds }
                    : {}),
                ...(focusZoneDraft?.publishTarget
                    ? {
                        publishTarget: {
                            ...(isPlainObject(lockedZone.publishTarget) ? lockedZone.publishTarget : {}),
                            ...focusZoneDraft.publishTarget,
                        },
                    }
                    : {}),
                snapshotJson,
                metadata,
                status: bakeStatus === 'failed' ? 'draft' : 'ready',
                updatedBy: actorUserId ?? null,
            }, trx, { allowSiteModeMutation: true })
            : await spatialRepository.createTerrainWorkZone({
                projectId,
                name: focusZoneDraft?.name
                    || (typeof data.name === 'string' && data.name.trim() ? data.name.trim() : '赛事场地'),
                zoneType: 'focus-zone',
                clipPolygonWgs84: focusZoneDraft?.clipPolygonWgs84 || bboxToClipPolygon(bbox),
                originWgs84: bboxCenter(bbox),
                terrainResolution: focusZoneDraft?.terrainResolution
                    || baked.focusZone?.terrainResolution
                    || 2,
                includedObjectIds: focusZoneDraft?.includedObjectIds || [],
                publishTarget: focusZoneDraft?.publishTarget || {},
                snapshotJson,
                metadata,
                status: bakeStatus === 'failed' ? 'draft' : 'ready',
                createdBy: actorUserId ?? null,
                updatedBy: actorUserId ?? null,
            }, trx), projectId, lockedZone?.id || focusZoneId);

        const editableProject = ensureEditableProjectSnapshot(
            lockedProject,
            baked.focusZone?.originWgs84 || bboxCenter(bbox),
        );
        const updatedProject = await studioRepository.updateProject(scope, projectId, {
            snapshotJson: editableProject.snapshotJson,
            geoAnchor: editableProject.geoAnchor,
            updatedBy: actorUserId ?? null,
        }, {
            expectedRevision,
            db: trx,
        });
        if (!updatedProject) {
            throw revisionConflict(projectId, expectedRevision, lockedProject);
        }

        return buildResponse({
            project: updatedProject,
            workZone: updatedZone,
            clientMutationId,
        });
    });
}

async function saveProjectBoundScene(
    scope,
    actorUserId,
    projectId,
    data = {},
    dependencies = {},
    { markSiteMode = true } = {},
) {
    normalizeOptionalUuid(projectId, 'projectId');
    const studioRepository = dependencies.studioRepo || studioRepo;
    const spatialRepository = dependencies.spatialRepo || spatialRepo;
    const runTransaction = dependencies.runTransaction
        || ((handler) => knex.transaction(handler));
    const expectedRevision = normalizeExpectedRevision(data.expectedRevision);
    const focusZoneId = normalizeOptionalUuid(data.focusZoneId, 'focusZoneId');
    if (!focusZoneId) {
        throw httpError(400, 'FOCUS_ZONE_REQUIRED', '缺少 focusZoneId');
    }
    if (!isPlainObject(data.snapshotJson)) {
        throw httpError(400, 'INVALID_STUDIO_SCENE', 'snapshotJson 必须是 3D 编辑器场景对象');
    }
    const clientMutationId = typeof data.clientMutationId === 'string'
        ? data.clientMutationId.trim() || null
        : null;
    const mutationSnapshotKey = markSiteMode ? 'siteMode' : 'focusZoneWorkbench';

    return runTransaction(async (trx) => {
        const project = ensureProject(
            await studioRepository.getProjectByIdForUpdate(scope, projectId, trx),
            projectId,
        );
        const workZone = ensureProjectZone(
            await spatialRepository.getTerrainWorkZoneByIdForUpdate(scope, focusZoneId, trx),
            projectId,
            focusZoneId,
        );

        if (
            clientMutationId
            && workZone?.snapshotJson?.[mutationSnapshotKey]?.clientMutationId === clientMutationId
        ) {
            return buildResponse({
                project,
                workZone,
                sceneSnapshot: workZone.snapshotJson?.warehouseScene || null,
                clientMutationId,
            });
        }
        if (project.revision !== expectedRevision) {
            throw revisionConflict(projectId, expectedRevision, project);
        }

        const normalizedProjectSnapshot = normalizeStudioSnapshot(project.snapshotJson, {
            sceneType: project.sceneType,
            projectType: project.projectType,
            name: project.name,
            geoAnchor: project.geoAnchor,
        });
        const hierarchy = getStudioHierarchy(normalizedProjectSnapshot);
        const warehouseId = String(
            data.warehouseId
            || hierarchy.activeWarehouse?.id
            || data.snapshotJson?.warehouse?.id
            || ''
        ).trim();
        const targetWarehouse = normalizedProjectSnapshot.warehouses?.find(
            (warehouse) => warehouse.id === warehouseId
        );
        if (!warehouseId || !targetWarehouse) {
            throw httpError(400, 'WAREHOUSE_NOT_FOUND', '当前项目没有可保存的 3D 场景');
        }

        const nextProjectSnapshot = mergeWarehouseSceneIntoSnapshot(
            normalizedProjectSnapshot,
            warehouseId,
            data.snapshotJson,
        );
        const savedScene = nextProjectSnapshot.warehouses?.find(
            (warehouse) => warehouse.id === warehouseId
        )?.sceneSnapshot || data.snapshotJson;
        const savedAt = new Date().toISOString();
        const nextZoneSnapshot = {
            ...(isPlainObject(workZone.snapshotJson) ? workZone.snapshotJson : {}),
            kind: 'studio-focus-zone-snapshot',
            projectId,
            focusZoneId,
            warehouseId,
            warehouseName: savedScene?.warehouse?.name || targetWarehouse.name || null,
            warehouseScene: savedScene,
            savedAt,
            [mutationSnapshotKey]: {
                ...(isPlainObject(workZone.snapshotJson?.[mutationSnapshotKey])
                    ? workZone.snapshotJson[mutationSnapshotKey]
                    : {}),
                savedAt,
                clientMutationId,
            },
        };

        const updatedProject = await studioRepository.updateProject(scope, projectId, {
            snapshotJson: nextProjectSnapshot,
            geoAnchor: nextProjectSnapshot.site?.geoAnchor || project.geoAnchor,
            updatedBy: actorUserId ?? null,
        }, {
            expectedRevision,
            db: trx,
        });
        if (!updatedProject) {
            throw revisionConflict(projectId, expectedRevision, project);
        }

        const updatedZone = ensureProjectZone(await spatialRepository.updateTerrainWorkZone(scope, focusZoneId, {
            snapshotJson: nextZoneSnapshot,
            metadata: {
                ...(isPlainObject(workZone.metadata) ? workZone.metadata : {}),
                ...(markSiteMode ? { purpose: 'site-mode' } : {}),
                lastWorkbenchSaveAt: savedAt,
            },
            status: 'ready',
            updatedBy: actorUserId ?? null,
        }, trx, { allowSiteModeMutation: true }), projectId, focusZoneId);

        return buildResponse({
            project: updatedProject,
            workZone: updatedZone,
            sceneSnapshot: savedScene,
            clientMutationId,
        });
    });
}

export async function saveProjectSiteMode(
    scope,
    actorUserId,
    projectId,
    data = {},
    dependencies = {},
) {
    return saveProjectBoundScene(
        scope,
        actorUserId,
        projectId,
        data,
        dependencies,
        { markSiteMode: true },
    );
}

export async function saveProjectFocusZoneWorkbench(
    scope,
    actorUserId,
    projectId,
    data = {},
    dependencies = {},
) {
    return saveProjectBoundScene(
        scope,
        actorUserId,
        projectId,
        data,
        dependencies,
        { markSiteMode: false },
    );
}
