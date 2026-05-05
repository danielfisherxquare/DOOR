import * as repo from './inventory.studio.repository.js';
import * as assetRepo from './inventory.asset.repository.js';
import * as inventoryRepo from './inventory.repository.js';
import * as twinService from './inventory.twin.service.js';
import * as raceRepo from '../races/race.repository.js';
import { BUILTIN_STUDIO_ASSET_TEMPLATES } from './inventory.studio.catalog.js';
import {
    buildImportedWarehouseSnapshot,
    createStudioBuildingDraft,
    createStudioLevelDraft,
    createStudioWarehouseDraft,
    getStudioHierarchy,
    isPlainObject,
    mergeWarehouseSceneIntoSnapshot,
    normalizeStudioSnapshot,
    normalizeWarehouseSceneSnapshot,
    setStudioSelection,
} from './inventory.studio.snapshot.js';
import { getTwinScenePayload } from './inventory.twin.scene.js';

const SCENE_TYPES = new Set(['warehouse', 'outdoor-event']);
const PROJECT_TYPES = new Set(['warehouse', 'venue', 'site', 'mixed', 'asset']);
const PROJECT_STATUSES = new Set(['draft', 'active', 'archived']);
const SOURCE_TYPES = new Set(['blank', 'warehouse-import', 'generated-scene-import']);
const PLACEMENT_STATUSES = new Set(['in-stock', 'reserved', 'deployed', 'returned']);
const MAP_LAYER_TYPES = new Set(['basemap', 'geojson', 'floorplan', 'scan', 'route', 'note']);
const RACE_BINDING_MODES = new Set(['reference']);
const RACE_BINDING_STATUSES = new Set(['active', 'archived']);

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

function normalizeSceneType(value, fieldName = 'sceneType', fallback = 'warehouse') {
    const nextValue = normalizeString(value, fieldName, { fallback }) || fallback;
    if (!SCENE_TYPES.has(nextValue)) throw new Error(`${fieldName} must be one of ${Array.from(SCENE_TYPES).join(', ')}`);
    return nextValue;
}

function normalizeProjectType(value, fallback = 'warehouse') {
    const nextValue = normalizeString(value, 'projectType', { fallback }) || fallback;
    if (!PROJECT_TYPES.has(nextValue)) throw new Error(`projectType must be one of ${Array.from(PROJECT_TYPES).join(', ')}`);
    return nextValue;
}

function normalizeStatus(value, fallback = 'draft') {
    const nextValue = normalizeString(value, 'status', { fallback }) || fallback;
    if (!PROJECT_STATUSES.has(nextValue)) throw new Error(`status must be one of ${Array.from(PROJECT_STATUSES).join(', ')}`);
    return nextValue;
}

function normalizeSourceType(value, fallback = 'blank') {
    const nextValue = normalizeString(value, 'sourceType', { fallback }) || fallback;
    if (!SOURCE_TYPES.has(nextValue)) throw new Error(`sourceType must be one of ${Array.from(SOURCE_TYPES).join(', ')}`);
    return nextValue;
}

function normalizeInteger(value, fieldName, { required = false, min = 1 } = {}) {
    if (value === undefined || value === null || value === '') {
        if (required) throw new Error(`${fieldName} is required`);
        return null;
    }
    const nextValue = Number(value);
    if (!Number.isFinite(nextValue)) throw new Error(`${fieldName} must be a number`);
    return Math.max(min, Math.round(nextValue));
}

function inferProjectTypeFromSceneType(sceneType) {
    return sceneType === 'warehouse' ? 'warehouse' : 'site';
}

function inferSceneTypeFromProjectType(projectType) {
    if (projectType === 'asset') return 'outdoor-event';
    return projectType === 'warehouse' ? 'warehouse' : 'outdoor-event';
}

function inferAssetCategory(value, fallback = 'structure') {
    const text = String(value || '').trim().toLowerCase();
    if (!text) return fallback;
    if (text.includes('帐篷') || text.includes('篷')) return 'tent';
    if (text.includes('舞台')) return 'stage';
    if (text.includes('拱门')) return 'arch';
    if (text.includes('灯')) return 'light_tower';
    if (text.includes('补给')) return 'supply_station';
    if (text.includes('医疗')) return 'medical_station';
    if (text.includes('围栏') || text.includes('护栏')) return 'control';
    if (text.includes('路标') || text.includes('标识')) return 'route_sign';
    return fallback;
}

function ensureProject(project) {
    if (!project) {
        const error = new Error('3D 项目不存在');
        error.statusCode = 404;
        throw error;
    }
    return project;
}

function normalizeSnapshot(snapshotJson, { sceneType, projectType, name, geoAnchor }) {
    if (!isPlainObject(snapshotJson)) throw new Error('snapshotJson must be an object');
    return normalizeStudioSnapshot(snapshotJson, { sceneType, projectType, name, geoAnchor });
}

async function getScopedProject(scope, projectId) {
    return ensureProject(await repo.getProjectById(scope, projectId));
}

function findBuildingIndex(snapshot, buildingId) {
    return (snapshot?.buildings || []).findIndex((building) => building.id === buildingId);
}

function findLevelIndex(building, levelId) {
    return (building?.levels || []).findIndex((level) => level.id === levelId);
}

function findWarehouseLocation(snapshot, warehouseId) {
    const buildings = snapshot?.buildings || [];
    for (let buildingIndex = 0; buildingIndex < buildings.length; buildingIndex += 1) {
        const building = buildings[buildingIndex];
        const levels = building?.levels || [];
        for (let levelIndex = 0; levelIndex < levels.length; levelIndex += 1) {
            const level = levels[levelIndex];
            const warehouseIndex = (level?.warehouses || []).findIndex((warehouse) => warehouse.id === warehouseId);
            if (warehouseIndex >= 0) {
                return {
                    buildingIndex,
                    levelIndex,
                    warehouseIndex,
                    building,
                    level,
                    warehouse: level.warehouses[warehouseIndex],
                };
            }
        }
    }
    return null;
}

function buildNotFoundError(message) {
    const error = new Error(message);
    error.statusCode = 404;
    return error;
}

function normalizeMeters(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    const nextValue = Number(value);
    if (!Number.isFinite(nextValue)) throw new Error('meters value must be a number');
    return nextValue;
}

function normalizeCoordinate(value, fieldName, fallback = null) {
    if (value === undefined || value === null || value === '') return fallback;
    const nextValue = Number(value);
    if (!Number.isFinite(nextValue)) throw new Error(`${fieldName} must be a number`);
    return nextValue;
}

function normalizeRaceBindingStatus(value, fallback = 'active') {
    const nextValue = normalizeString(value, 'status', { fallback }) || fallback;
    if (!RACE_BINDING_STATUSES.has(nextValue)) throw new Error(`binding status must be one of ${Array.from(RACE_BINDING_STATUSES).join(', ')}`);
    return nextValue;
}

function normalizeRaceBindingMode(value, fallback = 'reference') {
    const nextValue = normalizeString(value, 'mode', { fallback }) || fallback;
    if (!RACE_BINDING_MODES.has(nextValue)) throw new Error(`binding mode must be one of ${Array.from(RACE_BINDING_MODES).join(', ')}`);
    return nextValue;
}

function normalizeHierarchySnapshot(project) {
    return normalizeStudioSnapshot(project.snapshotJson, {
        sceneType: project.sceneType,
        projectType: project.projectType,
        name: project.name,
        geoAnchor: project.geoAnchor,
    });
}

async function updateProjectWithSnapshot(scope, actorUserId, project, snapshotJson, extra = {}) {
    return updateStudioProject(scope, actorUserId, project.id, {
        name: extra.name ?? project.name,
        sceneType: extra.sceneType ?? project.sceneType,
        projectType: extra.projectType ?? project.projectType,
        geoAnchor: extra.geoAnchor !== undefined ? extra.geoAnchor : project.geoAnchor,
        status: extra.status ?? project.status,
        sourceType: extra.sourceType ?? project.sourceType,
        sourceWarehouseId: extra.sourceWarehouseId !== undefined ? extra.sourceWarehouseId : project.sourceWarehouseId,
        sourceOrgId: extra.sourceOrgId !== undefined ? extra.sourceOrgId : project.sourceOrgId,
        primaryAssetId: extra.primaryAssetId !== undefined ? extra.primaryAssetId : project.primaryAssetId,
        thumbnailDataUrl: extra.thumbnailDataUrl !== undefined ? extra.thumbnailDataUrl : project.thumbnailDataUrl,
        snapshotJson,
    });
}

function listVisibleRacesForScope(scope, authContext) {
    return raceRepo.findAllAllowed(scope?.orgId || null, authContext?.userId || null, authContext?.role || 'member', {
        orgId: scope?.orgId || undefined,
    });
}

function buildProjectPayload(scope, actorUserId, data = {}, current = null) {
    const sceneType = normalizeSceneType(data.sceneType !== undefined ? data.sceneType : current?.sceneType);
    const projectType = normalizeProjectType(data.projectType !== undefined ? data.projectType : current?.projectType || inferProjectTypeFromSceneType(sceneType));
    const name = normalizeString(data.name !== undefined ? data.name : current?.name, 'name', { required: true });
    const geoAnchor = data.geoAnchor !== undefined
        ? (isPlainObject(data.geoAnchor) ? data.geoAnchor : null)
        : current?.geoAnchor || null;

    return {
        orgId: scope.orgId || current?.orgId || null,
        ownerUserId: scope.ownerUserId || current?.ownerUserId || actorUserId || null,
        name,
        sceneType,
        projectType,
        status: normalizeStatus(data.status !== undefined ? data.status : current?.status, current?.status || 'draft'),
        geoAnchor,
        snapshotJson: data.snapshotJson !== undefined
            ? normalizeSnapshot(data.snapshotJson, { sceneType, projectType, name, geoAnchor })
            : undefined,
        sourceType: data.sourceType !== undefined
            ? normalizeSourceType(data.sourceType)
            : (current?.sourceType || 'blank'),
        sourceWarehouseId: data.sourceWarehouseId !== undefined
            ? normalizeInteger(data.sourceWarehouseId, 'sourceWarehouseId')
            : current?.sourceWarehouseId,
        sourceOrgId: data.sourceOrgId !== undefined
            ? normalizeString(data.sourceOrgId, 'sourceOrgId', { fallback: null })
            : (current?.sourceOrgId || scope.orgId || null),
        primaryAssetId: data.primaryAssetId !== undefined
            ? normalizeString(data.primaryAssetId, 'primaryAssetId', { fallback: null })
            : current?.primaryAssetId,
        thumbnailDataUrl: data.thumbnailDataUrl !== undefined
            ? normalizeString(data.thumbnailDataUrl, 'thumbnailDataUrl', { fallback: null })
            : current?.thumbnailDataUrl,
        lastOpenedAt: new Date(),
        createdBy: current?.createdBy || actorUserId || null,
        updatedBy: actorUserId || null,
    };
}

export async function listStudioProjects(scope) {
    return repo.listProjectsByScope(scope);
}

export async function createStudioProject(scope, actorUserId, data) {
    const payload = buildProjectPayload(scope, actorUserId, data);
    if (!payload.snapshotJson) throw new Error('snapshotJson is required');
    return repo.createProject(payload);
}

export async function getStudioProject(scope, projectId, actorUserId = null) {
    ensureProject(await repo.getProjectById(scope, projectId));
    return ensureProject(await repo.updateProject(scope, projectId, {
        lastOpenedAt: new Date(),
        updatedBy: actorUserId,
    }));
}

export async function updateStudioProject(scope, actorUserId, projectId, data) {
    const current = await getScopedProject(scope, projectId);
    const payload = buildProjectPayload(scope, actorUserId, data, current);
    return ensureProject(await repo.updateProject(scope, projectId, payload));
}

export async function deleteStudioProject(scope, projectId) {
    ensureProject(await repo.getProjectById(scope, projectId));
    await repo.deleteProject(scope, projectId);
    return { id: projectId };
}

export async function duplicateStudioProject(scope, actorUserId, projectId) {
    const current = await getScopedProject(scope, projectId);
    return repo.createProject({
        ...current,
        id: undefined,
        name: `${current.name} 副本`,
        status: 'draft',
        snapshotJson: normalizeStudioSnapshot(current.snapshotJson, {
            sceneType: current.sceneType,
            projectType: current.projectType,
            name: `${current.name} 副本`,
            geoAnchor: current.geoAnchor,
        }),
        primaryAssetId: null,
        createdBy: actorUserId,
        updatedBy: actorUserId,
        lastOpenedAt: new Date(),
    });
}

export async function getStudioProjectSnapshot(scope, projectId) {
    const project = await getScopedProject(scope, projectId);
    return normalizeStudioSnapshot(project.snapshotJson, {
        sceneType: project.sceneType,
        projectType: project.projectType,
        name: project.name,
        geoAnchor: project.geoAnchor,
    });
}

export async function updateStudioProjectSnapshot(scope, actorUserId, projectId, snapshotJson) {
    const current = await getScopedProject(scope, projectId);
    return updateStudioProject(scope, actorUserId, projectId, {
        name: current.name,
        sceneType: current.sceneType,
        projectType: current.projectType,
        geoAnchor: current.geoAnchor,
        snapshotJson,
    });
}

export async function listProjectBuildings(scope, projectId) {
    const project = await getScopedProject(scope, projectId);
    return normalizeHierarchySnapshot(project).buildings || [];
}

export async function createProjectBuilding(scope, actorUserId, projectId, data) {
    const project = await getScopedProject(scope, projectId);
    const snapshot = normalizeHierarchySnapshot(project);
    const buildingDraft = createStudioBuildingDraft({
        name: normalizeString(data?.name, 'name', { required: true }),
        address: normalizeString(data?.address, 'address', { fallback: '' }) || '',
        latitude: normalizeCoordinate(data?.latitude ?? data?.geoAnchor?.latitude, 'latitude', undefined),
        longitude: normalizeCoordinate(data?.longitude ?? data?.geoAnchor?.longitude, 'longitude', undefined),
        widthMeters: normalizeMeters(data?.widthMeters, 36),
        depthMeters: normalizeMeters(data?.depthMeters, 24),
        headingDeg: normalizeMeters(data?.headingDeg, 0),
        floorCount: normalizeMeters(data?.floorCount, 3),
        floorHeight: normalizeMeters(data?.floorHeight, 4.5),
        sceneType: project.sceneType,
    });

    const nextSnapshot = setStudioSelection({
        ...snapshot,
        buildings: [...(snapshot.buildings || []), buildingDraft],
        site: {
            ...snapshot.site,
            geoAnchor: snapshot.site?.geoAnchor || buildingDraft.geoAnchor || null,
        },
    }, {
        activeBuildingId: buildingDraft.id,
        activeLevelId: buildingDraft.levels?.[0]?.id || null,
        activeWarehouseId: buildingDraft.levels?.[0]?.warehouses?.[0]?.id || null,
        activeWorkspaceMode: 'building',
    });

    return updateProjectWithSnapshot(scope, actorUserId, project, nextSnapshot, {
        geoAnchor: nextSnapshot.site?.geoAnchor || project.geoAnchor,
    });
}

export async function updateProjectBuilding(scope, actorUserId, projectId, buildingId, data) {
    const project = await getScopedProject(scope, projectId);
    const snapshot = normalizeHierarchySnapshot(project);
    const buildingIndex = findBuildingIndex(snapshot, buildingId);
    if (buildingIndex < 0) throw buildNotFoundError('建筑不存在');

    const currentBuilding = snapshot.buildings[buildingIndex];
    const draft = createStudioBuildingDraft({
        name: normalizeString(data?.name, 'name', { fallback: currentBuilding.name }),
        address: normalizeString(data?.address, 'address', { fallback: currentBuilding.address || '' }) || '',
        latitude: normalizeCoordinate(data?.latitude ?? data?.geoAnchor?.latitude, 'latitude', currentBuilding.geoAnchor?.latitude),
        longitude: normalizeCoordinate(data?.longitude ?? data?.geoAnchor?.longitude, 'longitude', currentBuilding.geoAnchor?.longitude),
        widthMeters: normalizeMeters(data?.widthMeters, currentBuilding.dimensionsMeters?.width || 36),
        depthMeters: normalizeMeters(data?.depthMeters, currentBuilding.dimensionsMeters?.depth || 24),
        headingDeg: normalizeMeters(data?.headingDeg, currentBuilding.headingDeg || 0),
        floorCount: currentBuilding.levels?.length || 1,
        floorHeight: currentBuilding.levels?.[0]?.height || 4.5,
        sceneType: project.sceneType,
    });

    const buildings = [...snapshot.buildings];
    buildings[buildingIndex] = {
        ...currentBuilding,
        name: draft.name,
        address: draft.address,
        geoAnchor: draft.geoAnchor,
        footprint: draft.footprint,
        dimensionsMeters: {
            ...currentBuilding.dimensionsMeters,
            width: draft.dimensionsMeters?.width,
            depth: draft.dimensionsMeters?.depth,
            height: currentBuilding.dimensionsMeters?.height ?? draft.dimensionsMeters?.height,
        },
        headingDeg: draft.headingDeg,
    };

    return updateProjectWithSnapshot(scope, actorUserId, project, {
        ...snapshot,
        buildings,
        site: {
            ...snapshot.site,
            geoAnchor: snapshot.site?.geoAnchor || draft.geoAnchor || null,
        },
    }, {
        geoAnchor: snapshot.site?.geoAnchor || draft.geoAnchor || project.geoAnchor,
    });
}

export async function createProjectLevel(scope, actorUserId, projectId, buildingId, data) {
    const project = await getScopedProject(scope, projectId);
    const snapshot = normalizeHierarchySnapshot(project);
    const buildingIndex = findBuildingIndex(snapshot, buildingId);
    if (buildingIndex < 0) throw buildNotFoundError('建筑不存在');

    const building = snapshot.buildings[buildingIndex];
    const nextSortOrder = (building.levels || []).length;
    const previousLevel = building.levels?.[building.levels.length - 1];
    const height = normalizeMeters(data?.height, previousLevel?.height || 4.5);
    const levelDraft = createStudioLevelDraft({
        name: normalizeString(data?.name, 'name', { fallback: `${nextSortOrder + 1}层` }),
        elevation: normalizeMeters(data?.elevation, previousLevel ? previousLevel.elevation + previousLevel.height : 0),
        height,
        sortOrder: nextSortOrder,
    });

    const buildings = [...snapshot.buildings];
    buildings[buildingIndex] = {
        ...building,
        levels: [...(building.levels || []), levelDraft],
    };

    const nextSnapshot = setStudioSelection({
        ...snapshot,
        buildings,
    }, {
        activeBuildingId: buildingId,
        activeLevelId: levelDraft.id,
        activeWarehouseId: null,
        activeWorkspaceMode: 'building',
    });

    return updateProjectWithSnapshot(scope, actorUserId, project, nextSnapshot);
}

export async function updateProjectLevel(scope, actorUserId, projectId, buildingId, levelId, data) {
    const project = await getScopedProject(scope, projectId);
    const snapshot = normalizeHierarchySnapshot(project);
    const buildingIndex = findBuildingIndex(snapshot, buildingId);
    if (buildingIndex < 0) throw buildNotFoundError('建筑不存在');

    const building = snapshot.buildings[buildingIndex];
    const levelIndex = findLevelIndex(building, levelId);
    if (levelIndex < 0) throw buildNotFoundError('楼层不存在');

    const currentLevel = building.levels[levelIndex];
    const buildings = [...snapshot.buildings];
    buildings[buildingIndex] = {
        ...building,
        levels: building.levels.map((level) => (
            level.id === levelId
                ? {
                    ...level,
                    name: normalizeString(data?.name, 'name', { fallback: currentLevel.name }),
                    elevation: normalizeMeters(data?.elevation, currentLevel.elevation),
                    height: normalizeMeters(data?.height, currentLevel.height),
                }
                : level
        )),
    };

    return updateProjectWithSnapshot(scope, actorUserId, project, {
        ...snapshot,
        buildings,
    });
}

export async function createProjectWarehouse(scope, actorUserId, projectId, buildingId, levelId, data) {
    const project = await getScopedProject(scope, projectId);
    const snapshot = normalizeHierarchySnapshot(project);
    const buildingIndex = findBuildingIndex(snapshot, buildingId);
    if (buildingIndex < 0) throw buildNotFoundError('建筑不存在');
    const building = snapshot.buildings[buildingIndex];
    const levelIndex = findLevelIndex(building, levelId);
    if (levelIndex < 0) throw buildNotFoundError('楼层不存在');

    const level = building.levels[levelIndex];
    const warehouseDraft = createStudioWarehouseDraft({
        name: normalizeString(data?.name, 'name', { required: true }),
        code: normalizeString(data?.code, 'code', { fallback: '' }) || '',
        sceneType: project.sceneType,
        levelId,
        buildingId,
        dimensionsMm: {
            width_mm: Math.round((building.dimensionsMeters?.width || 36) * 1000),
            depth_mm: Math.round((building.dimensionsMeters?.depth || 24) * 1000),
            height_mm: Math.round((level.height || 4.5) * 1000),
        },
    });

    const buildings = [...snapshot.buildings];
    buildings[buildingIndex] = {
        ...building,
        levels: building.levels.map((item) => (
            item.id === levelId
                ? { ...item, warehouses: [...(item.warehouses || []), warehouseDraft] }
                : item
        )),
    };

    const nextSnapshot = setStudioSelection({
        ...snapshot,
        buildings,
    }, {
        activeBuildingId: buildingId,
        activeLevelId: levelId,
        activeWarehouseId: warehouseDraft.id,
        activeWorkspaceMode: 'warehouse',
    });

    return updateProjectWithSnapshot(scope, actorUserId, project, nextSnapshot);
}

export async function updateProjectWarehouse(scope, actorUserId, projectId, warehouseId, data) {
    const project = await getScopedProject(scope, projectId);
    const snapshot = normalizeHierarchySnapshot(project);
    const location = findWarehouseLocation(snapshot, warehouseId);
    if (!location) throw buildNotFoundError('仓库不存在');

    const buildings = [...snapshot.buildings];
    const building = buildings[location.buildingIndex];
    const level = building.levels[location.levelIndex];
    const currentWarehouse = level.warehouses[location.warehouseIndex];
    const nextScene = normalizeWarehouseSceneSnapshot(currentWarehouse.sceneSnapshot, currentWarehouse.sceneType || project.sceneType, {
        id: currentWarehouse.id,
        name: normalizeString(data?.name, 'name', { fallback: currentWarehouse.name }),
        levelId: currentWarehouse.levelId,
        dimensionsMm: currentWarehouse.dimensionsMm,
        sceneType: currentWarehouse.sceneType || project.sceneType,
    });

    const nextWarehouse = {
        ...currentWarehouse,
        name: normalizeString(data?.name, 'name', { fallback: currentWarehouse.name }),
        code: normalizeString(data?.code, 'code', { fallback: currentWarehouse.code || '' }) || '',
        sceneSnapshot: nextScene,
    };

    building.levels = building.levels.map((item) => (
        item.id === level.id
            ? {
                ...item,
                warehouses: item.warehouses.map((warehouse) => (
                    warehouse.id === warehouseId ? nextWarehouse : warehouse
                )),
            }
            : item
    ));

    return updateProjectWithSnapshot(scope, actorUserId, project, {
        ...snapshot,
        buildings,
    });
}

export async function getProjectWarehouseScene(scope, projectId, warehouseId) {
    const project = await getScopedProject(scope, projectId);
    const snapshot = normalizeHierarchySnapshot(project);
    const location = findWarehouseLocation(snapshot, warehouseId);
    if (!location) throw buildNotFoundError('仓库不存在');
    return {
        warehouse: location.warehouse,
        sceneSnapshot: normalizeWarehouseSceneSnapshot(location.warehouse.sceneSnapshot, location.warehouse.sceneType || project.sceneType, {
            id: location.warehouse.id,
            name: location.warehouse.name,
            levelId: location.level.id,
            dimensionsMm: location.warehouse.dimensionsMm,
            sceneType: location.warehouse.sceneType || project.sceneType,
        }),
    };
}

export async function updateProjectWarehouseScene(scope, actorUserId, projectId, warehouseId, sceneSnapshot) {
    const project = await getScopedProject(scope, projectId);
    const snapshot = normalizeHierarchySnapshot(project);
    const location = findWarehouseLocation(snapshot, warehouseId);
    if (!location) throw buildNotFoundError('仓库不存在');
    const nextSnapshot = mergeWarehouseSceneIntoSnapshot(snapshot, warehouseId, sceneSnapshot);
    const updated = await updateProjectWithSnapshot(scope, actorUserId, project, nextSnapshot);
    const refreshed = normalizeHierarchySnapshot(updated);
    const refreshedLocation = findWarehouseLocation(refreshed, warehouseId);
    return {
        warehouse: refreshedLocation?.warehouse || null,
        sceneSnapshot: refreshedLocation?.warehouse?.sceneSnapshot || null,
    };
}

export async function listProjectMapLayers(scope, projectId) {
    const snapshot = await getStudioProjectSnapshot(scope, projectId);
    return snapshot.mapLayers || [];
}

export async function createProjectMapLayer(scope, actorUserId, projectId, data) {
    const current = await getScopedProject(scope, projectId);
    const snapshot = normalizeStudioSnapshot(current.snapshotJson, {
        sceneType: current.sceneType,
        projectType: current.projectType,
        name: current.name,
        geoAnchor: current.geoAnchor,
    });
    const layerType = normalizeString(data?.layerType, 'layerType', { fallback: 'geojson' }) || 'geojson';
    if (!MAP_LAYER_TYPES.has(layerType)) throw new Error(`layerType must be one of ${Array.from(MAP_LAYER_TYPES).join(', ')}`);
    const layer = {
        id: normalizeString(data?.id, 'id', { fallback: `layer-${Date.now()}` }),
        layerType,
        sourceType: normalizeString(data?.sourceType, 'sourceType', { fallback: 'manual' }),
        name: normalizeString(data?.name, 'name', { required: true }),
        visible: data?.visible !== false,
        opacity: typeof data?.opacity === 'number' ? data.opacity : 1,
        geoReference: isPlainObject(data?.geoReference) ? data.geoReference : null,
        payload: data?.payload ?? null,
    };
    const layers = Array.isArray(snapshot.mapLayers) ? [...snapshot.mapLayers] : [];
    const index = layers.findIndex((item) => item.id === layer.id);
    if (index >= 0) layers[index] = layer;
    else layers.push(layer);

    const updated = await updateStudioProject(scope, actorUserId, projectId, {
        name: current.name,
        sceneType: current.sceneType,
        projectType: current.projectType,
        geoAnchor: current.geoAnchor,
        snapshotJson: { ...snapshot, mapLayers: layers },
    });
    return updated.snapshotJson.mapLayers || [];
}

export async function listProjectRaceBindings(scope, projectId) {
    const project = await getScopedProject(scope, projectId);
    const snapshot = normalizeHierarchySnapshot(project);
    return snapshot.raceBindings || [];
}

export async function upsertProjectRaceBinding(scope, actorUserId, authContext, projectId, data) {
    const project = await getScopedProject(scope, projectId);
    const snapshot = normalizeHierarchySnapshot(project);
    const buildingId = normalizeString(data?.buildingId, 'buildingId', { required: true });
    const building = (snapshot.buildings || []).find((item) => item.id === buildingId);
    if (!building) throw buildNotFoundError('建筑不存在');

    const raceId = normalizeInteger(data?.raceId, 'raceId', { required: true });
    const availableRaces = await listVisibleRacesForScope(scope, authContext);
    const race = availableRaces.find((item) => Number(item.id) === raceId);
    if (!race) throw buildNotFoundError('赛事不存在或当前机构无权访问');

    const buildingWarehouseIds = new Set(
        (building.levels || []).flatMap((level) => (level.warehouses || []).map((warehouse) => warehouse.id)),
    );
    const warehouseIds = Array.isArray(data?.warehouseIds)
        ? data.warehouseIds.filter((warehouseId) => buildingWarehouseIds.has(String(warehouseId)))
        : [];

    const mode = normalizeRaceBindingMode(data?.mode, 'reference');
    const status = normalizeRaceBindingStatus(data?.status, 'active');
    const bindings = Array.isArray(snapshot.raceBindings) ? [...snapshot.raceBindings] : [];
    const index = bindings.findIndex((binding) => Number(binding.raceId) === raceId && binding.buildingId === buildingId);
    const record = {
        id: bindings[index]?.id || `binding-${Date.now()}`,
        raceId,
        buildingId,
        warehouseIds,
        mode,
        status,
        createdAt: bindings[index]?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: actorUserId,
    };

    if (index >= 0) bindings[index] = record;
    else bindings.push(record);

    const updated = await updateProjectWithSnapshot(scope, actorUserId, project, {
        ...snapshot,
        raceBindings: bindings,
    });

    return normalizeHierarchySnapshot(updated).raceBindings || [];
}

export async function listAvailableRaces(scope, authContext) {
    if (!scope?.orgId && authContext?.role !== 'super_admin') return [];
    return listVisibleRacesForScope(scope, authContext);
}

export async function listStudioAssetTemplates(orgId) {
    const customTemplates = orgId ? await repo.listAssetTemplates(orgId) : [];
    return [...BUILTIN_STUDIO_ASSET_TEMPLATES, ...customTemplates];
}

export async function createStudioAssetTemplate(orgId, actorUserId, data) {
    const kind = normalizeString(data?.kind, 'kind', { fallback: 'parametric' }) || 'parametric';
    if (!['parametric', 'model'].includes(kind)) throw new Error('kind must be parametric or model');
    return repo.createAssetTemplate({
        orgId,
        kind,
        category: normalizeString(data?.category, 'category', { required: true }),
        name: normalizeString(data?.name, 'name', { required: true }),
        thumbnailUrl: normalizeString(data?.thumbnailUrl, 'thumbnailUrl', { fallback: null }),
        parametersSchema: isPlainObject(data?.parametersSchema) ? data.parametersSchema : null,
        defaultParameters: isPlainObject(data?.defaultParameters) ? data.defaultParameters : null,
        modelUrl: normalizeString(data?.modelUrl, 'modelUrl', { fallback: null }),
        createdBy: actorUserId,
        updatedBy: actorUserId,
    });
}

export async function saveStudioProjectPrimaryAsset(scope, actorUserId, projectId, data = {}) {
    const project = await getScopedProject(scope, projectId);
    const snapshot = normalizeHierarchySnapshot(project);
    const name = normalizeString(data?.name, 'name', {
        fallback: `${project.name || '未命名项目'} 3D 资产`,
    });
    const category = normalizeString(data?.category, 'category', {
        fallback: inferAssetCategory(data?.category || data?.name || project.name),
    });
    const description = normalizeString(data?.description, 'description', { fallback: null });
    const kind = normalizeString(data?.kind, 'kind', { fallback: 'prefab' }) || 'prefab';
    const visibility = normalizeString(data?.visibility, 'visibility', { fallback: 'org' }) || 'org';

    const assetPayload = {
        orgId: scope.orgId || project.orgId || null,
        creatorUserId: project.createdBy || actorUserId || null,
        name,
        description,
        kind,
        category,
        visibility,
        thumbnailDataUrl: data?.thumbnailDataUrl ?? project.thumbnailDataUrl ?? null,
        parametersSchema: {
            objectType: { type: 'string' },
            placementMode: { type: 'string' },
            brandingPackId: { type: 'string' },
            sponsorName: { type: 'string' },
            sceneSnapshot: { type: 'object' },
        },
        defaultParameters: {
            objectType: inferAssetCategory(category, 'generic'),
            placementMode: data?.placementMode || 'level-platform',
            sceneSnapshot: snapshot,
            warehouseScene: snapshot?.editorState?.legacyScene || snapshot?.warehouses?.[0]?.sceneSnapshot || null,
            sourceProjectId: project.id,
            sourceProjectType: project.projectType,
            renderChannel: 'studio-project-snapshot',
        },
        metadata: {
            source: 'studio-project',
            sourceProjectId: project.id,
            sourceProjectType: project.projectType,
            sceneType: project.sceneType,
            renderChannel: 'studio-project-snapshot',
        },
        status: 'active',
    };

    const asset = project.primaryAssetId
        ? await assetRepo.updateAsset(project.primaryAssetId, assetPayload, scope.orgId || null)
        : await assetRepo.createAsset(assetPayload);

    const updatedProject = await updateStudioProject(scope, actorUserId, projectId, {
        primaryAssetId: asset.id,
    });

    return {
        project: updatedProject,
        asset,
    };
}

export async function listBindableInventoryUnits(scope, filters = {}) {
    if (!scope?.orgId) return [];
    return inventoryRepo.getUnits(scope.orgId, filters);
}

export async function listBindableWarehouseLocations(scope, filters = {}) {
    if (!scope?.orgId) return [];
    return twinService.getTwinLocations(scope.orgId, filters);
}

export async function bindInventoryToPlacement(scope, actorUserId, placementId, data) {
    const projectId = normalizeString(data?.projectId, 'projectId', { required: true });
    const current = await getScopedProject(scope, projectId);
    const snapshot = normalizeHierarchySnapshot(current);

    const status = normalizeString(data?.status, 'status', { fallback: 'reserved' }) || 'reserved';
    if (!PLACEMENT_STATUSES.has(status)) throw new Error(`status must be one of ${Array.from(PLACEMENT_STATUSES).join(', ')}`);

    const inventoryAssetId = normalizeInteger(data?.inventoryAssetId, 'inventoryAssetId');
    const warehouseLocationId = normalizeInteger(data?.warehouseLocationId, 'warehouseLocationId');
    if (inventoryAssetId) {
        const asset = await inventoryRepo.getUnitById(scope.orgId, inventoryAssetId);
        if (!asset) throw Object.assign(new Error('绑定的物资不存在'), { statusCode: 404 });
    }
    if (warehouseLocationId) {
        const location = await inventoryRepo.getLocationById(scope.orgId, warehouseLocationId);
        if (!location) throw Object.assign(new Error('绑定的库位不存在'), { statusCode: 404 });
    }

    const requestedWarehouseId = normalizeString(data?.warehouseId, 'warehouseId', { fallback: null });
    const warehouses = snapshot.warehouses || [];
    const targetWarehouse = (requestedWarehouseId
        ? warehouses.find((warehouse) => warehouse.id === requestedWarehouseId)
        : warehouses.find((warehouse) => (warehouse.sceneSnapshot?.assetPlacements || []).some((placement) => placement.id === placementId))) || null;
    if (!targetWarehouse) throw Object.assign(new Error('资产实例不存在'), { statusCode: 404 });

    const placements = Array.isArray(targetWarehouse.sceneSnapshot?.assetPlacements)
        ? [...targetWarehouse.sceneSnapshot.assetPlacements]
        : [];
    const index = placements.findIndex((item) => item.id === placementId);
    if (index < 0) throw Object.assign(new Error('资产实例不存在'), { statusCode: 404 });

    const updatedPlacement = {
        ...placements[index],
        status,
        inventoryAssetId: inventoryAssetId ?? null,
        warehouseLocationId: warehouseLocationId ?? null,
        metadata: {
            ...(placements[index].metadata || {}),
            boundBy: actorUserId,
            boundAt: new Date().toISOString(),
            note: normalizeString(data?.note, 'note', { fallback: null }),
        },
    };
    placements[index] = updatedPlacement;

    const nextSceneSnapshot = {
        ...targetWarehouse.sceneSnapshot,
        assetPlacements: placements,
    };
    const nextSnapshot = mergeWarehouseSceneIntoSnapshot(snapshot, targetWarehouse.id, nextSceneSnapshot);

    const updated = await updateProjectWithSnapshot(scope, actorUserId, current, nextSnapshot);
    const refreshed = normalizeHierarchySnapshot(updated);
    const refreshedWarehouse = (refreshed.warehouses || []).find((warehouse) => warehouse.id === targetWarehouse.id);

    return refreshedWarehouse?.sceneSnapshot?.assetPlacements?.find((item) => item.id === placementId) || null;
}

export async function importWarehouseScene(targetOrgId, warehouseId, options = {}) {
    const projectType = normalizeProjectType(options?.projectType || 'warehouse');
    const sceneType = normalizeSceneType(options?.sceneType || inferSceneTypeFromProjectType(projectType));
    const payload = await getTwinScenePayload(targetOrgId, warehouseId);
    return {
        sceneType,
        projectType,
        sourceType: 'warehouse-import',
        sourceWarehouseId: warehouseId,
        sourceOrgId: targetOrgId,
        snapshotJson: buildImportedWarehouseSnapshot({ warehouseId, projectType, sceneType, payload }),
    };
}
