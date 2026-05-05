import crypto from 'crypto';
import * as spatialRepo from './inventory.spatial.repository.js';
import * as studioRepo from './inventory.studio.repository.js';
import * as sceneJobRepo from './inventory.spatial.scene-job.repository.js';
import * as osmService from './inventory.spatial.osm.service.js';
import * as terrainService from './inventory.spatial.terrain.service.js';
import * as generatedSceneService from './inventory.spatial.generated-scene.service.js';

const QUALITY_PRESETS = new Set(['fast', 'standard', 'precise']);
const TARGET_TYPES = new Set(['studio', 'file']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PIPELINE_VERSION = 'scene-export-v2-osm-diagnostics';

function buildNotFoundError(message) {
    const error = new Error(message);
    error.statusCode = 404;
    return error;
}

function buildBadRequestError(message) {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
}

function normalizeQualityPreset(value) {
    const nextValue = String(value || 'standard').trim() || 'standard';
    if (!QUALITY_PRESETS.has(nextValue)) {
        throw buildBadRequestError(`qualityPreset must be one of ${Array.from(QUALITY_PRESETS).join(', ')}`);
    }
    return nextValue;
}

function normalizeTargetType(value) {
    const nextValue = String(value || 'studio').trim() || 'studio';
    if (!TARGET_TYPES.has(nextValue)) {
        throw buildBadRequestError(`targetType must be one of ${Array.from(TARGET_TYPES).join(', ')}`);
    }
    return nextValue;
}

async function ensureScopedProject(scope, projectId) {
    if (!UUID_PATTERN.test(String(projectId || ''))) {
        throw buildBadRequestError('3D 项目 ID 无效');
    }
    const project = await studioRepo.getProjectById(scope, projectId);
    if (!project) throw buildNotFoundError('3D 项目不存在');
    return project;
}

async function ensureScopedTerrainWorkZone(scope, projectId, zoneId) {
    if (!UUID_PATTERN.test(String(zoneId || ''))) {
        throw buildBadRequestError('工作区 ID 无效');
    }
    const zone = await spatialRepo.getTerrainWorkZoneById(scope, zoneId);
    if (!zone || zone.projectId !== projectId) {
        throw buildNotFoundError('工作区不存在');
    }
    return zone;
}

function buildSourceHash(project, zone, qualityPreset) {
    const osmBuildings = zone?.snapshotJson?.osmBuildings || null;
    const terrainPatch = zone?.snapshotJson?.terrainPatch || null;
    const terrainMesh = zone?.snapshotJson?.terrainMesh || null;
    const payload = {
        pipelineVersion: PIPELINE_VERSION,
        projectId: project.id,
        zoneId: zone.id,
        zoneType: zone.zoneType,
        clipPolygonWgs84: zone.clipPolygonWgs84,
        originWgs84: zone.originWgs84,
        terrainResolution: zone.terrainResolution,
        osmFingerprint: {
            fetchedAt: osmBuildings?.fetchedAt || null,
            count: osmBuildings?.count || 0,
            ids: Array.isArray(osmBuildings?.buildings)
                ? osmBuildings.buildings.slice(0, 32).map((item) => item?.id || item?.osmId || null)
                : [],
        },
        terrainFingerprint: {
            sampledAt: terrainPatch?.sampledAt || null,
            resolutionMeters: terrainPatch?.resolutionMeters || null,
            meshId: terrainMesh?.id || null,
        },
        qualityPreset,
    };
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function getCachedOsmBuildings(zone) {
    const osmBuildings = zone?.snapshotJson?.osmBuildings || null;
    if (!osmBuildings || !Array.isArray(osmBuildings?.buildings) || !osmBuildings.buildings.length) return null;
    if (!osmBuildings.diagnostics || osmBuildings.pipelineVersion !== 'osm-normalize-v2-diagnostics') return null;
    return osmBuildings;
}

function getCachedTerrainMesh(zone) {
    const terrainMesh = zone?.snapshotJson?.terrainMesh || null;
    if (!terrainMesh?.id || !Array.isArray(terrainMesh?.vertices) || !Array.isArray(terrainMesh?.indices)) return null;
    return terrainMesh;
}

function buildQueuedJobResponse(job, generatedScene) {
    return {
        ...job,
        generatedSceneId: generatedScene?.id ?? job.generatedSceneId ?? null,
        generatedScene,
    };
}

function buildSceneManifest({ project, zone, generatedScene, sourceHash, qualityPreset, targetType, osmBuildings, terrainMesh }) {
    return {
        sceneId: generatedScene.id,
        projectId: project.id,
        focusZoneId: zone.id,
        sourceHash,
        qualityPreset,
        targetType,
        pipelineVersion: PIPELINE_VERSION,
        stage: 'osm-ready',
        createdAt: new Date().toISOString(),
        osm: {
            source: osmBuildings.source,
            fetchedAt: osmBuildings.fetchedAt,
            count: osmBuildings.count,
            overpassUrl: osmBuildings.overpassUrl,
            pipelineVersion: osmBuildings.pipelineVersion,
            diagnostics: osmBuildings.diagnostics || null,
        },
        terrain: {
            source: terrainMesh?.metadata?.source || zone.snapshotJson?.terrainPatch?.source || 'terrain-patch',
            meshId: terrainMesh?.id || null,
            vertexCount: terrainMesh ? Math.floor((terrainMesh.vertices?.length || 0) / 3) : 0,
            triangleCount: terrainMesh ? Math.floor((terrainMesh.indices?.length || 0) / 3) : 0,
            sampledAt: terrainMesh?.metadata?.sampledAt || zone.snapshotJson?.terrainPatch?.sampledAt || null,
        },
    };
}

async function completeJobFromGeneratedScene(scope, actorUserId, job, generatedScene, extraMetadata = {}) {
    const completedJob = await sceneJobRepo.updateSceneExportJob(scope, job.id, {
        stage: 'completed',
        progress: 100,
        status: 'completed',
        startedAt: job.startedAt ?? new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        metadata: {
            ...(job.metadata || {}),
            ...extraMetadata,
        },
        updatedBy: actorUserId ?? null,
    });

    return buildQueuedJobResponse(completedJob, generatedScene);
}

async function failJobAndScene(scope, actorUserId, job, generatedScene, error) {
    const finishedAt = new Date().toISOString();
    const message = error?.message || 'scene export failed';
    const detail = {
        name: error?.name || 'Error',
        message,
    };

    const failedJob = await sceneJobRepo.updateSceneExportJob(scope, job.id, {
        stage: 'failed',
        progress: Math.max(Number(job.progress) || 0, 10),
        status: 'failed',
        errorMessage: message,
        errorDetail: detail,
        startedAt: job.startedAt ?? new Date().toISOString(),
        finishedAt,
        metadata: {
            ...(job.metadata || {}),
            failedAt: finishedAt,
        },
        updatedBy: actorUserId ?? null,
    });

    const failedScene = generatedScene
        ? await sceneJobRepo.updateGeneratedScene(scope, generatedScene.id, {
            status: 'failed',
            metadata: {
                ...(generatedScene.metadata || {}),
                lastError: detail,
                failedAt: finishedAt,
            },
            updatedBy: actorUserId ?? null,
        })
        : null;

    return buildQueuedJobResponse(failedJob, failedScene);
}

export async function createTerrainWorkZoneSceneExportJob(scope, actorUserId, projectId, zoneId, payload = {}) {
    const project = await ensureScopedProject(scope, projectId);
    const zone = await ensureScopedTerrainWorkZone(scope, project.id, zoneId);
    const qualityPreset = normalizeQualityPreset(payload.qualityPreset);
    const targetType = normalizeTargetType(payload.targetType);
    const sourceHash = buildSourceHash(project, zone, qualityPreset);

    let generatedScene = await sceneJobRepo.getGeneratedSceneBySourceHash(
        scope,
        project.id,
        zone.id,
        sourceHash,
        qualityPreset,
    );

    if (!generatedScene) {
        generatedScene = await sceneJobRepo.createGeneratedScene({
            projectId: project.id,
            focusZoneId: zone.id,
            sourceHash,
            qualityPreset,
            status: 'pending',
            metadata: {
                pipelineVersion: PIPELINE_VERSION,
                targetType,
                phase: 'phase-2-osm-sync',
                source: 'terrain-work-zone',
            },
            createdBy: actorUserId ?? null,
            updatedBy: actorUserId ?? null,
        });
    }

    const job = await sceneJobRepo.createSceneExportJob({
        projectId: project.id,
        focusZoneId: zone.id,
        generatedSceneId: generatedScene.id,
        targetType,
        qualityPreset,
        stage: 'queued',
        progress: 0,
        status: 'queued',
        metadata: {
            pipelineVersion: PIPELINE_VERSION,
            phase: 'phase-2-osm-sync',
            sourceHash,
        },
        createdBy: actorUserId ?? null,
        updatedBy: actorUserId ?? null,
    });

    if (generatedScene.status === 'ready' && generatedScene.manifestJson?.sourceHash === sourceHash) {
        return completeJobFromGeneratedScene(scope, actorUserId, job, generatedScene, {
            cacheHit: true,
            sourceHash,
        });
    }

    const runningJob = await sceneJobRepo.updateSceneExportJob(scope, job.id, {
        stage: 'fetch-osm',
        progress: 15,
        status: 'running',
        startedAt: new Date().toISOString(),
        metadata: {
            ...(job.metadata || {}),
            sourceHash,
            targetType,
        },
        updatedBy: actorUserId ?? null,
    });

    try {
        const cachedOsmBuildings = !payload.forceRefreshOsm ? getCachedOsmBuildings(zone) : null;
        const osmSyncResult = cachedOsmBuildings
            ? { zone, osmBuildings: cachedOsmBuildings }
            : await osmService.syncTerrainWorkZoneOsmBuildings(scope, actorUserId, zone.id, payload);
        const zoneAfterOsm = osmSyncResult.zone || zone;
        const terrainJob = await sceneJobRepo.updateSceneExportJob(scope, runningJob.id, {
            stage: 'fetch-terrain',
            progress: 45,
            status: 'running',
            metadata: {
                ...(runningJob.metadata || {}),
                sourceHash,
                targetType,
                reusedCachedOsm: Boolean(cachedOsmBuildings),
            },
            updatedBy: actorUserId ?? null,
        });
        const cachedTerrainMesh = !payload.forceRefreshTerrain ? getCachedTerrainMesh(zoneAfterOsm) : null;
        const terrainSyncResult = cachedTerrainMesh
            ? {
                zone: zoneAfterOsm,
                terrainPatch: zoneAfterOsm?.snapshotJson?.terrainPatch || null,
                terrainMesh: cachedTerrainMesh,
            }
            : await terrainService.syncTerrainWorkZoneTerrainMesh(scope, actorUserId, zone.id);
        const manifestJson = buildSceneManifest({
            project,
            zone: terrainSyncResult.zone,
            generatedScene,
            sourceHash,
            qualityPreset,
            targetType,
            osmBuildings: osmSyncResult.osmBuildings,
            terrainMesh: terrainSyncResult.terrainMesh,
        });

        const readyScene = await sceneJobRepo.updateGeneratedScene(scope, generatedScene.id, {
            status: 'ready',
            manifestJson,
            metadata: {
                ...(generatedScene.metadata || {}),
                targetType,
                sourceHash,
                pipelineVersion: PIPELINE_VERSION,
                osmBuildingCount: osmSyncResult.osmBuildings.count,
                osmFetchedAt: osmSyncResult.osmBuildings.fetchedAt,
                osmDiagnostics: osmSyncResult.osmBuildings.diagnostics || null,
                terrainMeshId: terrainSyncResult.terrainMesh.id,
                terrainVertexCount: Math.floor((terrainSyncResult.terrainMesh.vertices?.length || 0) / 3),
                terrainTriangleCount: Math.floor((terrainSyncResult.terrainMesh.indices?.length || 0) / 3),
                snapshotLinkedAt: terrainSyncResult.zone.updatedAt,
            },
            updatedBy: actorUserId ?? null,
        });

        const materializedScene = await generatedSceneService.materializeGeneratedScenePackage(
            scope,
            actorUserId,
            readyScene.id,
        );

        return completeJobFromGeneratedScene(scope, actorUserId, terrainJob, materializedScene.generatedScene, {
            cacheHit: false,
            sourceHash,
            osmBuildingCount: osmSyncResult.osmBuildings.count,
            terrainMeshId: terrainSyncResult.terrainMesh.id,
            packageRoot: materializedScene.packageRoot,
            reusedCachedOsm: Boolean(cachedOsmBuildings),
            reusedCachedTerrain: Boolean(cachedTerrainMesh),
        });
    } catch (error) {
        return failJobAndScene(scope, actorUserId, runningJob, generatedScene, error);
    }
}

export async function getSceneExportJob(scope, jobId) {
    if (!UUID_PATTERN.test(String(jobId || ''))) {
        throw buildBadRequestError('导出任务 ID 无效');
    }

    const job = await sceneJobRepo.getSceneExportJobById(scope, jobId);
    if (!job) throw buildNotFoundError('导出任务不存在');

    const generatedScene = job.generatedSceneId
        ? await sceneJobRepo.getGeneratedSceneById(scope, job.generatedSceneId)
        : null;

    return buildQueuedJobResponse(job, generatedScene);
}
