import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import * as spatialRepo from './inventory.spatial.repository.js';
import * as studioRepo from './inventory.studio.repository.js';
import * as sceneJobRepo from './inventory.spatial.scene-job.repository.js';
import * as studioService from './inventory.studio.service.js';
import { normalizeStudioSnapshot } from './inventory.studio.snapshot.js';
import { buildGlbFromBatchFile } from './inventory.spatial.export.js';
import { buildGeometryBatchFromStudioScene } from './inventory.spatial.studio-export.js';
import { createEmptyEditorDocument, normalizeEditorDocument } from '../../../../src/3d-studio/model/editorDocument.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '../../../../');
const GENERATED_SCENE_ROOT = path.join(WORKSPACE_ROOT, 'output', 'generated-scenes');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function ensureArray(value) {
    return Array.isArray(value) ? value : [];
}

function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergePlainObjects(baseValue, extraValue) {
    return {
        ...(isPlainObject(baseValue) ? baseValue : {}),
        ...(isPlainObject(extraValue) ? extraValue : {}),
    };
}

function sanitizeSegment(value, fallback = 'item') {
    return String(value || fallback)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-')
        .replace(/^-+|-+$/g, '') || fallback;
}

function pickNumber(value, fallback = 0) {
    const nextValue = Number(value);
    return Number.isFinite(nextValue) ? nextValue : fallback;
}

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

async function ensureScopedProject(scope, projectId) {
    if (!UUID_PATTERN.test(String(projectId || ''))) {
        throw buildBadRequestError('3D 项目 ID 无效');
    }
    const project = await studioRepo.getProjectById(scope, projectId);
    if (!project) throw buildNotFoundError('3D 项目不存在');
    return project;
}

async function ensureScopedTerrainWorkZone(scope, zoneId) {
    if (!UUID_PATTERN.test(String(zoneId || ''))) {
        throw buildBadRequestError('工作区 ID 无效');
    }
    const zone = await spatialRepo.getTerrainWorkZoneById(scope, zoneId);
    if (!zone) throw buildNotFoundError('工作区不存在');
    return zone;
}

async function ensureScopedGeneratedScene(scope, sceneId) {
    if (!UUID_PATTERN.test(String(sceneId || ''))) {
        throw buildBadRequestError('generated scene ID 无效');
    }
    const scene = await sceneJobRepo.getGeneratedSceneById(scope, sceneId);
    if (!scene) throw buildNotFoundError('generated scene 不存在');
    return scene;
}

async function listFocusZoneSpatialObjects(scope, zone) {
    const scopedObjects = await spatialRepo.listSpatialObjects(scope, zone.projectId, {
        focusZoneId: zone.id,
    });
    const knownIds = new Set(scopedObjects.map((item) => item.id));
    const extraObjects = [];

    for (const objectId of ensureArray(zone.includedObjectIds)) {
        if (knownIds.has(objectId)) continue;
        const object = await spatialRepo.getSpatialObjectById(scope, objectId);
        if (!object || object.projectId !== zone.projectId) continue;
        extraObjects.push(object);
        knownIds.add(object.id);
    }

    return [...scopedObjects, ...extraObjects];
}

function inferBoundsFromZone(zone) {
    const bounds = zone?.snapshotJson?.terrainPatch?.boundsMeters || {};
    const width = Math.max(
        pickNumber(bounds.width, pickNumber(bounds.maxX, 0) - pickNumber(bounds.minX, 0)),
        8,
    );
    const depth = Math.max(
        pickNumber(bounds.depth, pickNumber(bounds.maxZ, 0) - pickNumber(bounds.minZ, 0)),
        8,
    );
    return { width, depth };
}

function getZoneOsmBuildings(zone) {
    const records = zone?.snapshotJson?.osmBuildings?.buildings || zone?.snapshotJson?.osmBuildings;
    return ensureArray(records).filter((item) => item?.footprintWgs84?.coordinates?.[0]?.length >= 4);
}

function buildFastFocusZoneStudioScene({ generatedScene, zone, project, objects = [] }) {
    const osmBuildings = getZoneOsmBuildings(zone);
    const terrainMesh = zone?.snapshotJson?.terrainMesh || null;
    const warnings = [];
    const bounds = inferBoundsFromZone(zone);

    const legacySolids = osmBuildings.map((building, index) => ({
        id: building?.id || building?.osmId || `osm-building-${index + 1}`,
        kind: 'extrude',
        name: building?.name || `OSM 建筑 ${index + 1}`,
        height: Math.max(pickNumber(building?.heightMeters, 9.6), 2.8),
        baseElevation: Math.max(pickNumber(building?.minHeightMeters, 0), 0),
        color: '#d8dee8',
        footprintWgs84: building?.footprintWgs84,
        metadata: {
            importedFrom: 'osm-building',
            sourceObjectId: building?.id || null,
            osmId: building?.osmId || null,
            osmType: building?.osmType || 'way',
            objectType: 'osm_building',
            renderKind: building?.renderKind || 'building-outline',
            isBuildingPart: Boolean(building?.isBuildingPart),
            buildingType: building?.buildingType || 'yes',
            heightMeters: Math.max(pickNumber(building?.heightMeters, 9.6), 2.8),
            levels: building?.levels || null,
            compatType: 'osm-building',
        },
    }));

    const editorDocument = normalizeEditorDocument({
        ...createEmptyEditorDocument(),
        solids: legacySolids,
        terrainMeshes: terrainMesh ? [terrainMesh] : [],
        metadata: {
            source: 'gis-focus-zone',
            sourceWorkZoneId: zone?.id || null,
            sourceProjectId: zone?.projectId || project?.id || null,
            sourceObjectIds: ensureArray(objects).map((item) => item?.id).filter(Boolean),
            sourceObjectCount: ensureArray(objects).length,
            osmBuildingCount: legacySolids.length,
            osmSkippedBuildingCount: 0,
            focusZoneSourceHash: generatedScene?.sourceHash || null,
            spatialObjectHash: generatedScene?.sourceHash || null,
            terrainPatchHash: zone?.snapshotJson?.terrainPatch?.sampledAt || null,
            importedAt: new Date().toISOString(),
            originWgs84: zone?.originWgs84 || null,
            warnings,
        },
    });

    return {
        id: `focus-zone-scene-${zone?.id || 'draft'}`,
        sceneType: 'focus-zone-studio-scene',
        name: zone?.name || 'GIS 固定区域白模',
        warehouse: {
            id: `focus-zone-warehouse-${zone?.id || 'draft'}`,
            name: zone?.name || 'GIS 固定区域白模',
            dimensions_mm: {
                width_mm: Math.round(bounds.width * 1000),
                depth_mm: Math.round(bounds.depth * 1000),
                height_mm: 120000,
            },
        },
        activeLevelId: 'focus-zone-ground',
        editorDocument,
        metadata: {
            source: 'gis-focus-zone',
            sourceWorkZoneId: zone?.id || null,
            sourceProjectId: zone?.projectId || project?.id || null,
            sourceObjectCount: ensureArray(objects).length,
            osmBuildingCount: legacySolids.length,
            osmSkippedBuildingCount: 0,
            focusZoneSourceHash: generatedScene?.sourceHash || null,
            importedAt: new Date().toISOString(),
            warnings,
        },
    };
}

async function ensureParentDir(filePath) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function writeJsonFile(filePath, data) {
    await ensureParentDir(filePath);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function buildPackageRoot(scene) {
    return path.join(
        GENERATED_SCENE_ROOT,
        sanitizeSegment(scene.projectId, 'project'),
        sanitizeSegment(scene.focusZoneId, 'zone'),
        sanitizeSegment(scene.id, 'scene'),
    );
}

function normalizeOutputPaths(packageRoot, absolutePath) {
    const relativePath = path.relative(packageRoot, absolutePath).split(path.sep).join('/');
    return {
        absolutePath,
        relativePath,
    };
}

function buildPackageManifest({ generatedScene, project, zone, studioScene, geometryBatch, packageFiles }) {
    const osmBuildings = zone?.snapshotJson?.osmBuildings || null;
    return {
        sceneId: generatedScene.id,
        projectId: project.id,
        focusZoneId: zone.id,
        status: generatedScene.status,
        sourceHash: generatedScene.sourceHash,
        qualityPreset: generatedScene.qualityPreset,
        createdAt: new Date().toISOString(),
        assets: {
            sceneJson: packageFiles.sceneJson.relativePath,
            geometryBatchJson: packageFiles.geometryBatch.relativePath,
            whiteModelGlb: packageFiles.whiteModelGlb.relativePath,
        },
        stats: {
            objectCount: geometryBatch?.stats?.objectCount || 0,
            meshCount: geometryBatch?.stats?.meshCount || 0,
            totalVertices: geometryBatch?.stats?.totalVertices || 0,
            totalTriangles: geometryBatch?.stats?.totalTriangles || 0,
            osmBuildingCount: studioScene?.metadata?.osmBuildingCount || 0,
            terrainMeshCount: ensureArray(studioScene?.editorDocument?.terrainMeshes).length,
        },
        osm: {
            source: osmBuildings?.source || null,
            fetchedAt: osmBuildings?.fetchedAt || null,
            count: osmBuildings?.count || 0,
            overpassUrl: osmBuildings?.overpassUrl || null,
            pipelineVersion: osmBuildings?.pipelineVersion || null,
            diagnostics: osmBuildings?.diagnostics || null,
        },
        studio: {
            sceneType: studioScene?.sceneType || null,
            sourceObjectCount: studioScene?.metadata?.sourceObjectCount || 0,
            warnings: studioScene?.metadata?.warnings || [],
        },
    };
}

export async function materializeGeneratedScenePackage(scope, actorUserId, sceneId) {
    const generatedScene = await ensureScopedGeneratedScene(scope, sceneId);
    const project = await ensureScopedProject(scope, generatedScene.projectId);
    const zone = await ensureScopedTerrainWorkZone(scope, generatedScene.focusZoneId);
    const objects = await listFocusZoneSpatialObjects(scope, zone);

    const studioScene = buildFastFocusZoneStudioScene({
        generatedScene,
        zone,
        objects,
        project,
    });

    const packageZone = {
        ...zone,
        snapshotJson: mergePlainObjects(zone.snapshotJson, {
            warehouseScene: studioScene,
        }),
    };

    const geometryBatch = buildGeometryBatchFromStudioScene({
        zone: packageZone,
        warehouseScene: studioScene,
        resource: {
            id: `generated-scene-${generatedScene.id}`,
            lodLevel: null,
            materialMode: 'white-model',
        },
    });

    const glbBuffer = buildGlbFromBatchFile(geometryBatch);
    const packageRoot = buildPackageRoot(generatedScene);
    const sceneJsonPath = path.join(packageRoot, 'scene.json');
    const geometryBatchPath = path.join(packageRoot, 'geometry-batch.json');
    const whiteModelGlbPath = path.join(packageRoot, 'white-model.glb');

    await writeJsonFile(sceneJsonPath, studioScene);
    await writeJsonFile(geometryBatchPath, geometryBatch);
    await ensureParentDir(whiteModelGlbPath);
    await fs.writeFile(whiteModelGlbPath, glbBuffer);

    const packageFiles = {
        sceneJson: normalizeOutputPaths(packageRoot, sceneJsonPath),
        geometryBatch: normalizeOutputPaths(packageRoot, geometryBatchPath),
        whiteModelGlb: normalizeOutputPaths(packageRoot, whiteModelGlbPath),
    };

    const packageManifest = buildPackageManifest({
        generatedScene,
        project,
        zone,
        studioScene,
        geometryBatch,
        packageFiles,
    });
    const manifestPath = path.join(packageRoot, 'manifest.json');
    await writeJsonFile(manifestPath, packageManifest);

    const updatedScene = await sceneJobRepo.updateGeneratedScene(scope, generatedScene.id, {
        status: 'ready',
        manifestJson: packageManifest,
        metadata: {
            ...(generatedScene.metadata || {}),
            packageRoot,
            packageFiles: {
                manifest: normalizeOutputPaths(packageRoot, manifestPath),
                sceneJson: packageFiles.sceneJson,
                geometryBatch: packageFiles.geometryBatch,
                whiteModelGlb: packageFiles.whiteModelGlb,
            },
            studioSceneType: studioScene.sceneType,
            studioObjectCount: studioScene.metadata?.sourceObjectCount || 0,
        },
        updatedBy: actorUserId ?? null,
    });

    await spatialRepo.updateTerrainWorkZone(scope, zone.id, {
        snapshotJson: mergePlainObjects(zone.snapshotJson, {
            warehouseScene: studioScene,
        }),
        metadata: mergePlainObjects(zone.metadata, {
            generatedSceneId: updatedScene.id,
            generatedScenePackageRoot: packageRoot,
            generatedSceneMaterializedAt: new Date().toISOString(),
        }),
        updatedBy: actorUserId ?? null,
    });

    return {
        generatedScene: updatedScene,
        project,
        zoneId: zone.id,
        packageRoot,
        packageManifest,
        packageFiles: {
            manifest: normalizeOutputPaths(packageRoot, manifestPath),
            sceneJson: packageFiles.sceneJson,
            geometryBatch: packageFiles.geometryBatch,
            whiteModelGlb: packageFiles.whiteModelGlb,
        },
    };
}

export async function getGeneratedScene(scope, sceneId) {
    const generatedScene = await ensureScopedGeneratedScene(scope, sceneId);
    return generatedScene;
}

function resolvePackageFileEntry(generatedScene, asset = 'glb') {
    const packageFiles = generatedScene?.metadata?.packageFiles || {};
    if (asset === 'manifest') return packageFiles.manifest || null;
    if (asset === 'scene') return packageFiles.sceneJson || null;
    if (asset === 'geometry-batch') return packageFiles.geometryBatch || null;
    return packageFiles.whiteModelGlb || null;
}

export async function resolveGeneratedSceneDownload(scope, sceneId, asset = 'glb') {
    const generatedScene = await ensureScopedGeneratedScene(scope, sceneId);
    const packageRoot = generatedScene?.metadata?.packageRoot;
    const fileEntry = resolvePackageFileEntry(generatedScene, asset);
    if (!packageRoot || !fileEntry?.relativePath) {
        throw buildNotFoundError('generated scene 产物尚未准备完成');
    }

    const absolutePath = path.resolve(packageRoot, fileEntry.relativePath);
    const scopedPrefix = `${path.resolve(packageRoot)}${path.sep}`;
    if (absolutePath !== path.resolve(packageRoot) && !absolutePath.startsWith(scopedPrefix)) {
        throw buildBadRequestError('generated scene 下载路径非法');
    }

    const stat = await fs.stat(absolutePath);
    return {
        generatedScene,
        asset,
        absolutePath,
        relativePath: fileEntry.relativePath,
        filename: path.basename(absolutePath),
        size: stat.size,
        contentType: absolutePath.endsWith('.glb')
            ? 'model/gltf-binary'
            : 'application/json',
    };
}

export function buildGeneratedSceneStudioSnapshot(studioScene, { projectName = 'GIS Studio 导入', geoAnchor = null } = {}) {
    if (!isPlainObject(studioScene) || !isPlainObject(studioScene.editorDocument)) {
        throw buildBadRequestError('generated scene 内容无效，无法转换为 Studio 快照');
    }

    const normalizedGeoAnchor = isPlainObject(geoAnchor) ? geoAnchor : null;
    return normalizeStudioSnapshot({
        ...studioScene,
        sceneType: 'outdoor-event',
        projectType: 'site',
        focusZoneName: projectName,
        site: {
            ...(isPlainObject(studioScene.site) ? studioScene.site : {}),
            id: studioScene?.site?.id || 'site-root',
            name: projectName,
            projectType: 'site',
            geoAnchor: normalizedGeoAnchor,
        },
        metadata: {
            ...(isPlainObject(studioScene.metadata) ? studioScene.metadata : {}),
            importedFrom: 'generated-scene',
            generatedSceneImportMode: 'focus-zone',
        },
    }, {
        sceneType: 'outdoor-event',
        projectType: 'site',
        name: projectName,
        geoAnchor: normalizedGeoAnchor,
    });
}

export async function importGeneratedSceneToStudio(scope, actorUserId, sceneId, payload = {}) {
    const generatedScene = await ensureScopedGeneratedScene(scope, sceneId);
    const sceneEntry = resolvePackageFileEntry(generatedScene, 'scene');
    const packageRoot = generatedScene?.metadata?.packageRoot;
    if (!packageRoot || !sceneEntry?.relativePath) {
        throw buildNotFoundError('generated scene 缺少 scene.json，无法导入 Studio');
    }

    const absoluteScenePath = path.resolve(packageRoot, sceneEntry.relativePath);
    const rawScene = await fs.readFile(absoluteScenePath, 'utf8');
    const studioScene = JSON.parse(rawScene);
    const zone = await ensureScopedTerrainWorkZone(scope, generatedScene.focusZoneId);
    const project = await ensureScopedProject(scope, generatedScene.projectId);
    const projectName = String(payload.name || `${zone.name || project.name || 'GIS'} Studio 导入`).trim();
    const geoAnchor = zone.originWgs84 || project.geoAnchor || null;
    const snapshotJson = buildGeneratedSceneStudioSnapshot(studioScene, {
        projectName,
        geoAnchor,
    });
    const importedProject = await studioService.createStudioProject(scope, actorUserId, {
        name: projectName,
        sceneType: 'outdoor-event',
        projectType: 'site',
        status: 'draft',
        geoAnchor,
        sourceType: 'generated-scene-import',
        sourceOrgId: project.orgId || scope.orgId || null,
        snapshotJson,
    });

    const nextSceneMetadata = mergePlainObjects(generatedScene.metadata, {
        importedStudioProjectId: importedProject.id,
        importedStudioAt: new Date().toISOString(),
    });
    await sceneJobRepo.updateGeneratedScene(scope, generatedScene.id, {
        metadata: nextSceneMetadata,
        updatedBy: actorUserId ?? null,
    });

    return {
        generatedSceneId: generatedScene.id,
        studioProject: importedProject,
    };
}
