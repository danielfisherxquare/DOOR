function ensureArray(value) {
    return Array.isArray(value) ? value : [];
}

function pickNumber(value, fallback = 0) {
    const nextValue = Number(value);
    return Number.isFinite(nextValue) ? nextValue : fallback;
}

function pickOptionalNumber(value, fallback = Number.NaN) {
    if (value === null || value === undefined || value === '') return fallback;
    return pickNumber(value, fallback);
}

function round(value, digits = 4) {
    return Number(pickNumber(value, 0).toFixed(digits));
}

function inferTerrainGrid(rawVertices, terrainMesh) {
    const count = rawVertices.length;
    const rows = Math.max(Math.floor(pickNumber(terrainMesh?.rows ?? terrainMesh?.metadata?.rows, 0)), 0);
    const cols = Math.max(Math.floor(pickNumber(terrainMesh?.cols ?? terrainMesh?.metadata?.cols, 0)), 0);
    if (rows >= 2 && cols >= 2 && rows * cols === count) return { rows, cols };
    const square = Math.sqrt(count);
    if (Number.isInteger(square) && square >= 2) return { rows: square, cols: square };
    return { rows, cols };
}

function terrainBounds(terrainMesh) {
    const bounds = terrainMesh?.boundsMeters || terrainMesh?.metadata?.boundsMeters || {};
    const width = Math.max(pickNumber(bounds.width, pickNumber(bounds.maxX, 0) - pickNumber(bounds.minX, 0)), 1);
    const depth = Math.max(pickNumber(bounds.depth, pickNumber(bounds.maxZ, 0) - pickNumber(bounds.minZ, 0)), 1);
    return {
        minX: pickNumber(bounds.minX, -width / 2),
        maxX: pickNumber(bounds.maxX, width / 2),
        minZ: pickNumber(bounds.minZ, -depth / 2),
        maxZ: pickNumber(bounds.maxZ, depth / 2),
    };
}

function normalizeTerrainVertices(terrainMesh) {
    const rawVertices = ensureArray(terrainMesh?.vertices);
    if (rawVertices.every((item) => typeof item === 'number' || typeof item === 'string')) {
        return rawVertices.map((value) => round(value, 6));
    }

    const { rows, cols } = inferTerrainGrid(rawVertices, terrainMesh);
    const bounds = terrainBounds(terrainMesh);
    const stepX = (bounds.maxX - bounds.minX) / Math.max(cols - 1, 1);
    const stepZ = (bounds.maxZ - bounds.minZ) / Math.max(rows - 1, 1);
    const vertices = [];

    rawVertices.forEach((rawVertex, index) => {
        const tuple = Array.isArray(rawVertex) ? rawVertex : null;
        let x = pickOptionalNumber(tuple ? tuple[0] : rawVertex?.x, Number.NaN);
        const y = pickOptionalNumber(tuple ? tuple[1] : rawVertex?.y ?? rawVertex?.height, 0);
        let z = pickOptionalNumber(tuple ? tuple[2] : rawVertex?.z, Number.NaN);
        if ((!Number.isFinite(x) || !Number.isFinite(z)) && rows >= 2 && cols >= 2) {
            const row = Math.floor(index / cols);
            const col = index % cols;
            x = bounds.minX + stepX * col;
            z = bounds.minZ + stepZ * row;
        }
        vertices.push(round(x, 6), round(y, 6), round(z, 6));
    });

    return vertices;
}

function normalizeTerrainIndices(terrainMesh) {
    const indices = [];
    ensureArray(terrainMesh?.indices).forEach((value) => {
        if (Array.isArray(value)) {
            value.forEach((item) => indices.push(Math.max(0, Math.round(pickNumber(item, 0)))));
            return;
        }
        indices.push(Math.max(0, Math.round(pickNumber(value, 0))));
    });
    return indices;
}

function getStudioScene(zone) {
    return zone?.snapshotJson?.warehouseScene || zone?.snapshotJson?.sceneSnapshot || zone?.snapshotJson?.snapshotJson || null;
}

export function hasStudioEditorDocument(zone) {
    return Boolean(getStudioScene(zone)?.editorDocument?.version === 2);
}

function buildVertexLookup(document) {
    return new Map(ensureArray(document?.vertices).map((vertex) => [vertex.id, vertex]));
}

function getProfilePoints(document, profile) {
    const lookup = buildVertexLookup(document);
    const points = ensureArray(profile?.vertexIds)
        .map((vertexId) => lookup.get(vertexId))
        .filter(Boolean)
        .map((vertex) => ({
            x: round(vertex.x),
            y: round(vertex.y),
            z: round(vertex.z),
        }));
    if (points.length >= 3) return points;

    const segmentById = new Map(ensureArray(document?.segments).map((segment) => [segment.id, segment]));
    const segmentPoints = [];
    for (const segmentId of ensureArray(profile?.segmentIds)) {
        const segment = segmentById.get(segmentId);
        const vertex = lookup.get(segment?.startVertexId);
        if (vertex) segmentPoints.push({ x: round(vertex.x), y: round(vertex.y), z: round(vertex.z) });
    }
    return segmentPoints.length >= 3 ? segmentPoints : [];
}

function buildBoxMesh({ id, center, size, color = '#d8dee8', extras = {} }) {
    const cx = pickNumber(center?.[0] ?? center?.x, 0);
    const cy = pickNumber(center?.[1] ?? center?.y, 0);
    const cz = pickNumber(center?.[2] ?? center?.z, 0);
    const sx = Math.max(pickNumber(size?.[0] ?? size?.width, 1), 0.01) / 2;
    const sy = Math.max(pickNumber(size?.[1] ?? size?.height, 1), 0.01) / 2;
    const sz = Math.max(pickNumber(size?.[2] ?? size?.depth, 1), 0.01) / 2;
    const corners = [
        [cx - sx, cy - sy, cz - sz],
        [cx + sx, cy - sy, cz - sz],
        [cx + sx, cy - sy, cz + sz],
        [cx - sx, cy - sy, cz + sz],
        [cx - sx, cy + sy, cz - sz],
        [cx + sx, cy + sy, cz - sz],
        [cx + sx, cy + sy, cz + sz],
        [cx - sx, cy + sy, cz + sz],
    ];
    return {
        id,
        color,
        vertices: corners.flat().map((value) => round(value, 6)),
        indices: [
            0, 2, 1, 0, 3, 2,
            4, 5, 6, 4, 6, 7,
            0, 1, 5, 0, 5, 4,
            1, 2, 6, 1, 6, 5,
            2, 3, 7, 2, 7, 6,
            3, 0, 4, 3, 4, 7,
        ],
        ...extras,
    };
}

function buildExtrudedProfileMesh({ document, profile, solid, zoneId }) {
    const basePoints = getProfilePoints(document, profile);
    if (basePoints.length < 3) return null;

    const baseElevation = pickNumber(solid?.baseElevation, Math.min(...basePoints.map((point) => point.y)));
    const height = Math.max(pickNumber(solid?.height, 0), 0.01);
    const bottom = basePoints.map((point) => [point.x, baseElevation, point.z]);
    const top = basePoints.map((point) => [point.x, baseElevation + height, point.z]);
    const vertices = [...bottom, ...top].flat().map((value) => round(value, 6));
    const count = bottom.length;
    const indices = [];

    for (let index = 1; index < count - 1; index += 1) {
        indices.push(0, index + 1, index);
    }
    for (let index = 1; index < count - 1; index += 1) {
        indices.push(count, count + index, count + index + 1);
    }
    for (let index = 0; index < count; index += 1) {
        const next = (index + 1) % count;
        indices.push(index, next, count + next);
        indices.push(index, count + next, count + index);
    }

    const metadata = {
        ...(profile?.metadata || {}),
        ...(solid?.metadata || {}),
    };

    return {
        id: solid?.id || profile?.id,
        color: solid?.color || profile?.color || '#d8dee8',
        vertices,
        indices,
        sourceObjectId: metadata.sourceObjectId || null,
        objectType: metadata.objectType || metadata.compatType || 'studio-solid',
        lodLevel: null,
        primitive: metadata.studioPrimitive || 'profile-extrude',
        studioSolidId: solid?.id || null,
        studioProfileId: profile?.id || null,
        sourceWorkZoneId: zoneId || null,
    };
}

function buildFallbackMeshFromSolidMetadata({ solid, profile, zoneId }) {
    const metadata = {
        ...(profile?.metadata || {}),
        ...(solid?.metadata || {}),
    };
    const center = metadata.studioPrimitiveCenter;
    const size = metadata.studioPrimitiveSize;
    if (!Array.isArray(center) || !Array.isArray(size)) return null;
    return buildBoxMesh({
        id: solid?.id || profile?.id,
        center,
        size,
        color: solid?.color || profile?.color || '#d8dee8',
        extras: {
            sourceObjectId: metadata.sourceObjectId || null,
            objectType: metadata.objectType || metadata.compatType || 'studio-solid',
            lodLevel: null,
            primitive: metadata.studioPrimitive || 'metadata-box',
            studioSolidId: solid?.id || null,
            studioProfileId: profile?.id || null,
            sourceWorkZoneId: zoneId || null,
        },
    });
}

function buildMeshesFromEditorDocument(document, zoneId) {
    const profileById = new Map(ensureArray(document?.profiles).map((profile) => [profile.id, profile]));
    const warnings = [];
    const meshes = [];

    for (const solid of ensureArray(document?.solids)) {
        const profile = profileById.get(solid?.profileId);
        if (!profile) {
            warnings.push(`Studio solid ${solid?.id || 'unknown'} has no profile and was skipped.`);
            continue;
        }

        const mesh = buildExtrudedProfileMesh({ document, profile, solid, zoneId })
            || buildFallbackMeshFromSolidMetadata({ solid, profile, zoneId });
        if (!mesh) {
            warnings.push(`Studio solid ${solid?.id || profile?.id || 'unknown'} could not be converted to mesh.`);
            continue;
        }
        meshes.push(mesh);
    }

    for (const terrainMesh of ensureArray(document?.terrainMeshes)) {
        const vertices = normalizeTerrainVertices(terrainMesh);
        const indices = normalizeTerrainIndices(terrainMesh);
        if (vertices.length < 9 || indices.length < 3) {
            warnings.push(`Terrain mesh ${terrainMesh?.id || 'unknown'} is empty and was skipped.`);
            continue;
        }
        meshes.push({
            id: terrainMesh.id || `terrain-mesh-${meshes.length + 1}`,
            color: terrainMesh.color || '#d9e4d0',
            vertices,
            indices,
            sourceObjectId: null,
            objectType: terrainMesh?.metadata?.objectType || 'terrain_patch',
            lodLevel: null,
            primitive: terrainMesh.kind || 'terrain-grid',
            studioSolidId: null,
            studioProfileId: null,
            sourceWorkZoneId: zoneId || null,
            metadata: {
                source: terrainMesh?.metadata?.source || 'terrain-patch',
                sampledAt: terrainMesh?.metadata?.sampledAt || null,
            },
        });
    }

    return { meshes, warnings };
}

export function buildGeometryBatchFromStudioScene({
    zone,
    warehouseScene,
    resource = {},
    exportOptions = {},
} = {}) {
    const scene = warehouseScene || getStudioScene(zone);
    const document = scene?.editorDocument || {};
    const { meshes, warnings } = buildMeshesFromEditorDocument(document, zone?.id || null);
    const totalVertices = meshes.reduce((sum, mesh) => sum + (ensureArray(mesh.vertices).length / 3), 0);
    const totalTriangles = meshes.reduce((sum, mesh) => sum + (ensureArray(mesh.indices).length / 3), 0);
    const sourceObjectIds = [...new Set(meshes.map((mesh) => mesh.sourceObjectId).filter(Boolean))];

    return {
        version: 'door-white-model-batch-v2',
        source: 'studio-editor-document',
        zoneId: zone?.id || null,
        resourceId: resource?.id || 'studio-editor-document',
        generatedAt: new Date().toISOString(),
        lodLevel: resource?.lodLevel || exportOptions?.lodLevel || null,
        materialMode: resource?.materialMode || 'white-model',
        intendedOutput: resource?.path || null,
        stats: {
            objectCount: sourceObjectIds.length || meshes.length,
            meshCount: meshes.length,
            totalVertices,
            totalTriangles,
        },
        optimizationPlan: {
            strategy: 'studio-editor-document',
            geometryFamily: null,
            appearanceKey: null,
            instancingEligible: false,
            instancingCandidates: [],
            instanceTemplateCount: 0,
            instanceTemplates: [],
        },
        instancingTemplates: [],
        meshes,
        warnings,
        metadata: {
            source: 'studio-editor-document',
            sourceWorkZoneId: zone?.id || null,
            studioSceneType: scene?.sceneType || null,
            studioImportedAt: document?.metadata?.importedAt || scene?.metadata?.importedAt || null,
            studioSnapshotSavedAt: zone?.snapshotJson?.savedAt || null,
            focusZoneSourceHash: document?.metadata?.focusZoneSourceHash || scene?.metadata?.focusZoneSourceHash || null,
        },
    };
}
