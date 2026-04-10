const OBJECT_LABELS = {
    arch: '赛事拱门',
    stage: '舞台',
    tent: '帐篷',
    light_tower: '灯光塔',
    supply_station: '补给站',
    medical_station: '医疗站',
    fence_segment: '围栏段',
    route_sign: '路标',
    generator: '发电机',
    toilet: '卫生间',
    media_zone: '媒体区',
    generic: '通用对象',
};

function ensureArray(value) {
    return Array.isArray(value) ? value : [];
}

function pickNumber(value, fallback = 0) {
    const nextValue = Number(value);
    return Number.isFinite(nextValue) ? nextValue : fallback;
}

function pickString(value, fallback = '') {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function round(value, digits = 3) {
    return Number(pickNumber(value, 0).toFixed(digits));
}

function toLocalPoint(origin, longitude, latitude) {
    const metersPerDegreeLat = 111320;
    const metersPerDegreeLng = metersPerDegreeLat * Math.cos((pickNumber(origin?.latitude, 0) * Math.PI) / 180) || 1;
    return {
        x: (pickNumber(longitude, 0) - pickNumber(origin?.longitude, 0)) * metersPerDegreeLng,
        z: (pickNumber(latitude, 0) - pickNumber(origin?.latitude, 0)) * metersPerDegreeLat,
    };
}

function getPolygonRing(geometry) {
    const ring = ensureArray(geometry?.coordinates?.[0]);
    if (ring.length < 3) return [];
    const isClosed = ring[0]?.[0] === ring[ring.length - 1]?.[0] && ring[0]?.[1] === ring[ring.length - 1]?.[1];
    return isClosed ? ring.slice(0, -1) : ring;
}

function geometryToLocalPoints(geometry, origin) {
    if (!geometry || !origin) return [];

    if (geometry.type === 'Polygon') {
        return getPolygonRing(geometry).map(([longitude, latitude]) => toLocalPoint(origin, longitude, latitude));
    }

    if (geometry.type === 'LineString') {
        return ensureArray(geometry.coordinates).map(([longitude, latitude]) => toLocalPoint(origin, longitude, latitude));
    }

    if (geometry.type === 'Point') {
        const [longitude, latitude] = geometry.coordinates || [];
        return [toLocalPoint(origin, longitude, latitude)];
    }

    return [];
}

function boundsFromPoints(points) {
    if (!points.length) {
        return {
            minX: -1,
            maxX: 1,
            minZ: -1,
            maxZ: 1,
            width: 2,
            depth: 2,
        };
    }

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;

    points.forEach((point) => {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minZ = Math.min(minZ, point.z);
        maxZ = Math.max(maxZ, point.z);
    });

    return {
        minX,
        maxX,
        minZ,
        maxZ,
        width: Math.max(maxX - minX, 1),
        depth: Math.max(maxZ - minZ, 1),
    };
}

function centroidFromPoints(points) {
    if (!points.length) return { x: 0, z: 0 };
    return points.reduce((acc, point) => ({
        x: acc.x + point.x / points.length,
        z: acc.z + point.z / points.length,
    }), { x: 0, z: 0 });
}

function sampleTerrainPatchHeight(terrainPatch, x, z) {
    if (!terrainPatch?.rows || !terrainPatch?.cols || !Array.isArray(terrainPatch.heightsRelative)) return 0;

    const rows = Number(terrainPatch.rows);
    const cols = Number(terrainPatch.cols);
    const bounds = terrainPatch.boundsMeters || {};
    const width = Math.max(pickNumber(bounds.width, 0), 1);
    const depth = Math.max(pickNumber(bounds.depth, 0), 1);
    const minX = pickNumber(bounds.minX, -width / 2);
    const minZ = pickNumber(bounds.minZ, -depth / 2);

    const u = Math.min(Math.max((x - minX) / width, 0), 1);
    const v = Math.min(Math.max((z - minZ) / depth, 0), 1);
    const gx = u * Math.max(cols - 1, 1);
    const gz = v * Math.max(rows - 1, 1);
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const x1 = Math.min(x0 + 1, cols - 1);
    const z1 = Math.min(z0 + 1, rows - 1);
    const tx = gx - x0;
    const tz = gz - z0;

    const h00 = pickNumber(terrainPatch.heightsRelative[z0 * cols + x0], 0);
    const h10 = pickNumber(terrainPatch.heightsRelative[z0 * cols + x1], 0);
    const h01 = pickNumber(terrainPatch.heightsRelative[z1 * cols + x0], 0);
    const h11 = pickNumber(terrainPatch.heightsRelative[z1 * cols + x1], 0);

    const top = h00 * (1 - tx) + h10 * tx;
    const bottom = h01 * (1 - tx) + h11 * tx;
    return top * (1 - tz) + bottom * tz;
}

function sampleTerrainNormalAndSlope(terrainPatch, x, z) {
    const step = Math.max(pickNumber(terrainPatch?.resolutionMeters, 2), 0.5);
    const left = sampleTerrainPatchHeight(terrainPatch, x - step, z);
    const right = sampleTerrainPatchHeight(terrainPatch, x + step, z);
    const down = sampleTerrainPatchHeight(terrainPatch, x, z - step);
    const up = sampleTerrainPatchHeight(terrainPatch, x, z + step);
    const dx = (right - left) / Math.max(step * 2, 0.001);
    const dz = (up - down) / Math.max(step * 2, 0.001);
    const length = Math.hypot(dx, 1, dz) || 1;
    const normal = {
        x: round(-dx / length),
        y: round(1 / length),
        z: round(-dz / length),
    };
    const slopeDeg = round(Math.atan(Math.hypot(dx, dz)) * (180 / Math.PI), 2);
    return { normal, slopeDeg };
}

function buildDimensions(objectType, bounds) {
    const width = Math.max(bounds?.width || 0, objectType === 'fence_segment' ? 3 : 2);
    const depth = Math.max(bounds?.depth || 0, objectType === 'fence_segment' ? 0.35 : 2);

    if (objectType === 'light_tower') return { width: 0.6, depth: 0.6, height: 5.5 };
    if (objectType === 'route_sign') return { width: 0.5, depth: 0.2, height: 2.4 };
    if (objectType === 'arch') return { width: Math.max(width, 5), depth: Math.max(depth, 1.6), height: 4.2 };
    if (objectType === 'stage') return { width: Math.max(width, 6), depth: Math.max(depth, 4), height: 2.8 };
    if (objectType === 'tent') return { width: Math.max(width, 3), depth: Math.max(depth, 3), height: 2.8 };
    if (objectType === 'supply_station' || objectType === 'medical_station') {
        return { width: Math.max(width, 4), depth: Math.max(depth, 3), height: 2.8 };
    }
    if (objectType === 'generator') return { width: Math.max(width, 2.8), depth: Math.max(depth, 1.8), height: 1.8 };
    if (objectType === 'toilet') return { width: Math.max(width, 1.2), depth: Math.max(depth, 1.2), height: 2.4 };
    if (objectType === 'fence_segment') return { width, depth, height: 1.2 };
    return { width, depth, height: 2.2 };
}

function inferLodLevel(zoneType, objectType, placementMode, terrainDelta) {
    if (zoneType === 'focus-zone') {
        if (objectType === 'stage' || objectType === 'arch') return 'LOD0';
        if (placementMode === 'level-platform' && terrainDelta > 0.6) return 'LOD0';
        if (objectType === 'tent' || objectType === 'supply_station' || objectType === 'medical_station' || objectType === 'light_tower') {
            return 'LOD1';
        }
        return 'LOD2';
    }

    if (zoneType === 'corridor-zone') {
        if (objectType === 'supply_station' || objectType === 'medical_station') return 'LOD1';
        return 'LOD2';
    }

    return placementMode === 'level-platform' ? 'LOD1' : 'LOD2';
}

function inferRenderMode(lodLevel) {
    if (lodLevel === 'LOD0') return 'hero-detailed';
    if (lodLevel === 'LOD1') return 'focus-detailed';
    return 'corridor-white-model';
}

function bucketDimension(value, step = 0.5) {
    const nextValue = pickNumber(value, 0);
    return round(Math.max(Math.round(nextValue / step) * step, step), 2);
}

function buildGeometryFamily(item) {
    return [
        item.objectType,
        `w${bucketDimension(item.dimensions?.width, 0.5)}`,
        `d${bucketDimension(item.dimensions?.depth, 0.5)}`,
        `h${bucketDimension(item.dimensions?.height, 0.5)}`,
        pickString(item.renderProfile?.fasciaStyle, 'classic'),
        item.renderProfile?.platformRequired ? 'platform' : 'free',
    ].join(':');
}

function buildAppearanceKey(item) {
    return [
        pickString(item.brandingPackId, 'neutral'),
        pickString(item.renderProfile?.color, '#d9d9d9'),
        pickString(item.renderProfile?.accentColor, '#ffffff'),
        pickString(item.renderProfile?.sponsorName, 'plain').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    ].join(':');
}

function isInstancingEligible(item) {
    return [
        'tent',
        'arch',
        'stage',
        'light_tower',
        'supply_station',
        'medical_station',
        'route_sign',
        'toilet',
        'generator',
    ].includes(item.objectType);
}

function buildBatchKey(item) {
    return [
        item.lodLevel,
        item.geometryFamily,
        item.appearanceKey,
        item.placementMode,
    ].join(':');
}

function buildPlatformSupportHeights(anchor, dimensions, platformHeightRelative, terrainPatch) {
    const halfWidth = dimensions.width / 2;
    const halfDepth = dimensions.depth / 2;
    const corners = [
        { x: anchor.x - halfWidth, z: anchor.z - halfDepth, position: 'nw' },
        { x: anchor.x + halfWidth, z: anchor.z - halfDepth, position: 'ne' },
        { x: anchor.x + halfWidth, z: anchor.z + halfDepth, position: 'se' },
        { x: anchor.x - halfWidth, z: anchor.z + halfDepth, position: 'sw' },
    ];

    return corners.map((corner) => {
        const terrainRelative = sampleTerrainPatchHeight(terrainPatch, corner.x, corner.z);
        return {
            position: corner.position,
            heightMeters: round(Math.max(platformHeightRelative - terrainRelative, 0)),
        };
    });
}

function buildObjectPlacement(zone, object) {
    const origin = zone?.originWgs84 || zone?.snapshotJson?.terrainPatch?.originWgs84;
    const terrainPatch = zone?.snapshotJson?.terrainPatch || null;
    const geometry = object?.metadata?.geometry || object?.footprint || null;
    const footprintPoints = geometry?.type === 'Polygon' ? geometryToLocalPoints(geometry, origin) : [];
    const pathPoints = geometry?.type === 'LineString' ? geometryToLocalPoints(geometry, origin) : [];
    const anchor = object?.anchorWgs84
        ? toLocalPoint(origin, object.anchorWgs84.longitude, object.anchorWgs84.latitude)
        : centroidFromPoints(footprintPoints.length ? footprintPoints : pathPoints);
    const samplePoints = footprintPoints.length ? footprintPoints : pathPoints.length ? pathPoints : [anchor];
    const bounds = boundsFromPoints(footprintPoints.length ? footprintPoints : [anchor]);
    const dimensions = buildDimensions(object?.objectType, bounds);
    const terrainSamples = samplePoints.map((point) => sampleTerrainPatchHeight(terrainPatch, point.x, point.z));
    const minRelative = terrainSamples.length ? Math.min(...terrainSamples) : 0;
    const maxRelative = terrainSamples.length ? Math.max(...terrainSamples) : 0;
    const avgRelative = terrainSamples.length
        ? terrainSamples.reduce((sum, value) => sum + value, 0) / terrainSamples.length
        : 0;
    const { normal, slopeDeg } = sampleTerrainNormalAndSlope(terrainPatch, anchor.x, anchor.z);
    const platformHeightRelative = object?.placementMode === 'level-platform' ? maxRelative + 0.08 : avgRelative;
    const elevationOffsetMeters = pickNumber(terrainPatch?.elevationOffsetMeters, 0);
    const baseElevationMeters = elevationOffsetMeters + avgRelative;
    const platformElevationMeters = elevationOffsetMeters + platformHeightRelative;
    const lodLevel = inferLodLevel(zone?.zoneType, object?.objectType, object?.placementMode, maxRelative - minRelative);
    const renderMode = inferRenderMode(lodLevel);

    const renderProfile = {
        mode: renderMode,
        proxyKind: object?.placementMode === 'level-platform' ? 'platform-proxy' : 'terrain-proxy',
        color: pickString(object?.materialVariant?.color, '#d9d9d9'),
        accentColor: pickString(object?.materialVariant?.accentColor, '#ffffff'),
        fasciaStyle: pickString(object?.materialVariant?.fasciaStyle, 'classic'),
        sponsorName: pickString(object?.materialVariant?.sponsorName, ''),
        platformRequired: object?.placementMode === 'level-platform',
        keepVertical: object?.placementMode === 'vertical-keep',
        whiteModel: lodLevel === 'LOD2',
    };

    const placement = {
        terrainRelative: {
            min: round(minRelative),
            max: round(maxRelative),
            avg: round(avgRelative),
            delta: round(maxRelative - minRelative),
        },
        terrainNormal: normal,
        slopeDeg,
        baseElevationMeters: round(baseElevationMeters),
        platformElevationMeters: round(platformElevationMeters),
        supportHeights: object?.placementMode === 'level-platform'
            ? buildPlatformSupportHeights(anchor, dimensions, platformHeightRelative, terrainPatch)
            : [],
    };

    const item = {
        id: object?.id || null,
        title: pickString(object?.title, OBJECT_LABELS[object?.objectType] || '空间对象'),
        objectType: pickString(object?.objectType, 'generic'),
        placementMode: pickString(object?.placementMode, 'follow-terrain'),
        anchorLocalMeters: {
            x: round(anchor.x),
            z: round(anchor.z),
        },
        footprintLocalMeters: footprintPoints.map((point) => ({ x: round(point.x), z: round(point.z) })),
        pathLocalMeters: pathPoints.map((point) => ({ x: round(point.x), z: round(point.z) })),
        dimensions: {
            width: round(dimensions.width),
            depth: round(dimensions.depth),
            height: round(dimensions.height),
        },
        placement,
        lodLevel,
        renderProfile,
        materialVariant: object?.materialVariant || {},
        brandingPackId: object?.brandingPackId || null,
    };

    item.geometryFamily = buildGeometryFamily(item);
    item.appearanceKey = buildAppearanceKey(item);
    item.optimizationProfile = {
        geometryFamily: item.geometryFamily,
        appearanceKey: item.appearanceKey,
        instancingEligible: isInstancingEligible(item),
        strategyHint: item.lodLevel === 'LOD2' ? 'cluster-or-instancing' : 'instancing-ready',
    };

    return {
        ...item,
        batchKey: buildBatchKey(item),
    };
}

export function buildTerrainWorkZonePublishManifest(zone, spatialObjects = []) {
    const terrainPatch = zone?.snapshotJson?.terrainPatch || null;
    if (!terrainPatch) {
        throw new Error('当前工作区缺少 terrain patch，无法生成发布清单');
    }

    const generatedAt = new Date().toISOString();
    const objects = ensureArray(spatialObjects).map((object) => buildObjectPlacement(zone, object));
    const summary = {
        totalObjects: objects.length,
        byObjectType: {},
        byPlacementMode: {
            'follow-terrain': 0,
            'level-platform': 0,
            'vertical-keep': 0,
        },
        byLodLevel: {
            LOD0: 0,
            LOD1: 0,
            LOD2: 0,
        },
        optimization: {
            instancingEligibleCount: 0,
            geometryFamilyCount: 0,
            appearanceKeyCount: 0,
            topInstancingFamilies: [],
        },
        batchCount: 0,
        averageSlopeDeg: 0,
    };

    let slopeSum = 0;
    const geometryFamilyCounts = new Map();
    const appearanceKeyCounts = new Map();
    objects.forEach((item) => {
        summary.byObjectType[item.objectType] = (summary.byObjectType[item.objectType] || 0) + 1;
        if (summary.byPlacementMode[item.placementMode] !== undefined) {
            summary.byPlacementMode[item.placementMode] += 1;
        }
        if (summary.byLodLevel[item.lodLevel] !== undefined) {
            summary.byLodLevel[item.lodLevel] += 1;
        }
        if (item.optimizationProfile?.instancingEligible) {
            summary.optimization.instancingEligibleCount += 1;
        }
        geometryFamilyCounts.set(item.geometryFamily, (geometryFamilyCounts.get(item.geometryFamily) || 0) + 1);
        appearanceKeyCounts.set(item.appearanceKey, (appearanceKeyCounts.get(item.appearanceKey) || 0) + 1);
        slopeSum += pickNumber(item.placement?.slopeDeg, 0);
    });
    summary.averageSlopeDeg = objects.length ? round(slopeSum / objects.length, 2) : 0;
    summary.optimization.geometryFamilyCount = geometryFamilyCounts.size;
    summary.optimization.appearanceKeyCount = appearanceKeyCounts.size;
    summary.optimization.topInstancingFamilies = Array.from(geometryFamilyCounts.entries())
        .map(([geometryFamily, count]) => ({ geometryFamily, count }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 5);

    const batchMap = new Map();
    objects.forEach((item) => {
        const existing = batchMap.get(item.batchKey) || {
            key: item.batchKey,
            lodLevel: item.lodLevel,
            objectType: item.objectType,
            placementMode: item.placementMode,
            color: item.renderProfile?.color || '#d9d9d9',
            accentColor: item.renderProfile?.accentColor || '#ffffff',
            fasciaStyle: item.renderProfile?.fasciaStyle || 'classic',
            brandingPackId: item.brandingPackId || 'neutral',
            geometryFamily: item.geometryFamily,
            appearanceKey: item.appearanceKey,
            instancingEligible: Boolean(item.optimizationProfile?.instancingEligible),
            count: 0,
            objectIds: [],
        };
        existing.count += 1;
        existing.objectIds.push(item.id);
        batchMap.set(item.batchKey, existing);
    });

    const batches = Array.from(batchMap.values()).sort((left, right) => right.count - left.count);
    summary.batchCount = batches.length;

    return {
        generatedAt,
        zone: {
            id: zone?.id || null,
            projectId: zone?.projectId || null,
            name: pickString(zone?.name, '重点区工作区'),
            zoneType: pickString(zone?.zoneType, 'focus-zone'),
        },
        terrain: {
            source: pickString(terrainPatch?.source, 'unknown'),
            resolutionMeters: pickNumber(terrainPatch?.resolutionMeters, pickNumber(zone?.terrainResolution, 2)),
            rows: pickNumber(terrainPatch?.rows, 0),
            cols: pickNumber(terrainPatch?.cols, 0),
            minElevationMeters: round(terrainPatch?.minElevationMeters, 2),
            maxElevationMeters: round(terrainPatch?.maxElevationMeters, 2),
            heightDeltaMeters: round(terrainPatch?.heightDeltaMeters, 2),
        },
        summary,
        batches,
        objects,
    };
}

function slugify(value, fallback = 'resource') {
    const nextValue = pickString(value, fallback)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return nextValue || fallback;
}

function inferExportFormat(batch) {
    if (batch.lodLevel === 'LOD0') return 'glb';
    if (batch.lodLevel === 'LOD1') return batch.count >= 24 ? '3dtiles' : 'glb';
    return batch.count >= 40 ? '3dtiles' : 'glb';
}

function inferMaterialMode(batch) {
    if (batch.lodLevel === 'LOD2') return 'white-model';
    return batch.color && batch.color !== '#d9d9d9' ? 'branded-color' : 'neutral-color';
}

export function buildTerrainWorkZoneExportPackage(zone, manifest) {
    const generatedAt = new Date().toISOString();
    const baseDir = `focus-zones/${zone.id}`;
    const resources = [];
    const byLod = {
        LOD0: 0,
        LOD1: 0,
        LOD2: 0,
    };
    const optimizationSummary = {
        instancingReadyResources: 0,
        instancingReadyObjects: 0,
        mergedResources: 0,
        uniqueGeometryFamilies: manifest?.summary?.optimization?.geometryFamilyCount || 0,
    };

    resources.push({
        id: `${zone.id}-terrain-patch`,
        category: 'terrain',
        lodLevel: 'shared',
        format: 'json',
        path: `${baseDir}/terrain/terrain-patch.json`,
        source: manifest.terrain.source,
        rows: manifest.terrain.rows,
        cols: manifest.terrain.cols,
        resolutionMeters: manifest.terrain.resolutionMeters,
    });

    resources.push({
        id: `${zone.id}-placements`,
        category: 'placements',
        lodLevel: 'shared',
        format: 'json',
        path: `${baseDir}/metadata/object-placements.json`,
        objectCount: manifest.summary.totalObjects,
    });

    manifest.batches.forEach((batch, index) => {
        const resourceId = `${slugify(batch.lodLevel, 'lod')}-${slugify(batch.objectType)}-${String(index + 1).padStart(2, '0')}`;
        const format = inferExportFormat(batch);
        const optimization = {
            geometryFamily: batch.geometryFamily,
            appearanceKey: batch.appearanceKey,
            instancingEligible: Boolean(batch.instancingEligible),
            strategy: batch.instancingEligible && batch.count >= 8
                ? 'instancing-ready'
                : (batch.count >= 2 ? 'merged-batch' : 'single-asset'),
            instanceCount: batch.count,
        };
        resources.push({
            id: resourceId,
            category: 'geometry-batch',
            lodLevel: batch.lodLevel,
            format,
            path: `${baseDir}/${batch.lodLevel.toLowerCase()}/${resourceId}.${format === 'glb' ? 'glb' : 'tileset.json'}`,
            objectType: batch.objectType,
            placementMode: batch.placementMode,
            materialMode: inferMaterialMode(batch),
            count: batch.count,
            objectIds: batch.objectIds,
            optimization,
        });

        if (byLod[batch.lodLevel] !== undefined) {
            byLod[batch.lodLevel] += 1;
        }
        if (optimization.strategy === 'instancing-ready') {
            optimizationSummary.instancingReadyResources += 1;
            optimizationSummary.instancingReadyObjects += batch.count;
        } else if (optimization.strategy === 'merged-batch') {
            optimizationSummary.mergedResources += 1;
        }
    });

    return {
        generatedAt,
        zone: {
            id: zone.id,
            name: zone.name,
            zoneType: zone.zoneType,
        },
        outputRoot: baseDir,
        summary: {
            totalResources: resources.length,
            totalObjects: manifest.summary.totalObjects,
            totalBatches: manifest.summary.batchCount,
            byLod,
            optimization: optimizationSummary,
        },
        resources,
        files: {
            manifest: `${baseDir}/metadata/publish-manifest.json`,
            packageDescriptor: `${baseDir}/metadata/export-package.json`,
        },
    };
}
