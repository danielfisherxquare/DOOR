import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { buildGeometryBatchFromStudioScene, hasStudioEditorDocument } from './inventory.spatial.studio-export.js';
import { ensureArray, pickNumber, round } from './inventory.spatial.export-utils.js';
import {
    buildGlbFromBatchFile,
    buildInstancedGlbFromTemplates,
} from './inventory.spatial.glb.js';
import {
    EXPORT_COORDINATE_SYSTEMS,
    buildExportManifest,
    buildGeometryPreflight,
} from '@arcspro/studio-model/export-manifest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '../../../../');
const EXPORT_ROOT = path.join(WORKSPACE_ROOT, 'output', 'focus-zone-exports');

export { buildGlbFromBatchFile };


function sanitizeSegment(value, fallback = 'item') {
    return String(value || fallback)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-')
        .replace(/^-+|-+$/g, '') || fallback;
}

function normalizeRelativePath(relativePath) {
    return String(relativePath || '')
        .replace(/^[/\\]+/, '')
        .split(/[\\/]+/)
        .filter(Boolean)
        .join(path.sep);
}

function normalizeArtifactPath(relativePath) {
    const normalized = normalizeRelativePath(relativePath);
    if (!normalized) {
        throw new Error('artifact path is required');
    }
    return normalized;
}



function buildTemplateBatchFile(template, resource) {
    const meshes = ensureArray(template?.templateMeshes).map((mesh) => ({
        ...mesh,
        sourceObjectId: template?.templateObjectId || null,
        objectType: null,
        lodLevel: resource?.lodLevel || null,
    }));
    const totalVertices = meshes.reduce((sum, mesh) => sum + (mesh.vertices.length / 3), 0);
    const totalTriangles = meshes.reduce((sum, mesh) => sum + (mesh.indices.length / 3), 0);
    return {
        version: 'door-instancing-template-batch-v1',
        zoneId: null,
        resourceId: resource?.id || null,
        generatedAt: new Date().toISOString(),
        lodLevel: resource?.lodLevel || null,
        materialMode: resource?.materialMode || null,
        intendedOutput: resource?.path || null,
        stats: {
            objectCount: 1,
            meshCount: meshes.length,
            totalVertices,
            totalTriangles,
        },
        meshes,
    };
}

function resolveLocalArtifactPath(zone, resourcePath) {
    const normalized = String(resourcePath || '').replace(/\\/g, '/');
    const prefix = `focus-zones/${zone?.id || 'zone'}/`;
    if (normalized.startsWith(prefix)) {
        return normalized.slice(prefix.length);
    }
    return path.basename(normalized);
}

function computeBoundsFromVertices(vertices) {
    const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
    const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
    for (let index = 0; index < vertices.length; index += 3) {
        min[0] = Math.min(min[0], pickNumber(vertices[index], 0));
        min[1] = Math.min(min[1], pickNumber(vertices[index + 1], 0));
        min[2] = Math.min(min[2], pickNumber(vertices[index + 2], 0));
        max[0] = Math.max(max[0], pickNumber(vertices[index], 0));
        max[1] = Math.max(max[1], pickNumber(vertices[index + 1], 0));
        max[2] = Math.max(max[2], pickNumber(vertices[index + 2], 0));
    }

    if (!Number.isFinite(min[0])) {
        return {
            min: [0, 0, 0],
            max: [0, 0, 0],
            box: [0, 0, 0, 0.5, 0, 0, 0, 0.5, 0, 0, 0, 0.5],
        };
    }

    const center = [
        (min[0] + max[0]) / 2,
        (min[1] + max[1]) / 2,
        (min[2] + max[2]) / 2,
    ];
    const halfAxes = [
        Math.max((max[0] - min[0]) / 2, 0.01),
        Math.max((max[1] - min[1]) / 2, 0.01),
        Math.max((max[2] - min[2]) / 2, 0.01),
    ];
    return {
        min: min.map((value) => round(value, 6)),
        max: max.map((value) => round(value, 6)),
        box: [
            round(center[0], 6), round(center[1], 6), round(center[2], 6),
            round(halfAxes[0], 6), 0, 0,
            0, round(halfAxes[1], 6), 0,
            0, 0, round(halfAxes[2], 6),
        ],
    };
}

function computeBoundsFromMeshes(meshes) {
    const vertices = ensureArray(meshes).flatMap((mesh) => ensureArray(mesh.vertices));
    return computeBoundsFromVertices(vertices);
}

function splitMeshesIntoChunks(meshes, maxObjectsPerChunk = 12) {
    const grouped = new Map();
    ensureArray(meshes).forEach((mesh) => {
        const key = mesh.sourceObjectId || mesh.id;
        const existing = grouped.get(key) || [];
        existing.push(mesh);
        grouped.set(key, existing);
    });

    const objectGroups = Array.from(grouped.entries()).map(([objectId, parts]) => ({
        objectId,
        meshes: parts,
    }));

    const chunks = [];
    let current = { objectIds: [], meshes: [] };
    objectGroups.forEach((group) => {
        if (current.objectIds.length >= maxObjectsPerChunk && current.meshes.length) {
            chunks.push(current);
            current = { objectIds: [], meshes: [] };
        }
        current.objectIds.push(group.objectId);
        current.meshes.push(...group.meshes);
    });
    if (current.meshes.length) chunks.push(current);
    return chunks;
}

async function ensureParentDir(filePath) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function writeJsonFile(filePath, data) {
    await ensureParentDir(filePath);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export function resolveTerrainWorkZoneExportRoot(zone) {
    const projectSegment = sanitizeSegment(zone?.projectId, 'project');
    const zoneSegment = sanitizeSegment(zone?.id, 'zone');
    return path.join(EXPORT_ROOT, projectSegment, zoneSegment);
}

export function resolveTerrainWorkZoneArtifactAbsolutePath(zone, artifactPath) {
    const exportRoot = resolveTerrainWorkZoneExportRoot(zone);
    const normalizedArtifactPath = normalizeArtifactPath(artifactPath);
    const absolutePath = path.resolve(exportRoot, normalizedArtifactPath);
    const normalizedExportRoot = path.resolve(exportRoot);
    const scopedPrefix = `${normalizedExportRoot}${path.sep}`;

    if (absolutePath !== normalizedExportRoot && !absolutePath.startsWith(scopedPrefix)) {
        throw new Error('artifact path is outside of export root');
    }

    return {
        exportRoot: normalizedExportRoot,
        relativePath: normalizedArtifactPath.split(path.sep).join('/'),
        absolutePath,
    };
}

export async function readTerrainWorkZoneExportTask(zone) {
    const taskPath = resolveTerrainWorkZoneArtifactAbsolutePath(zone, 'metadata/export-task.json');

    try {
        const raw = await fs.readFile(taskPath.absolutePath, 'utf8');
        return JSON.parse(raw);
    } catch (error) {
        if (error?.code === 'ENOENT') return null;
        throw error;
    }
}

export async function buildTerrainWorkZoneRuntimePreview(zone) {
    const exportTask = await readTerrainWorkZoneExportTask(zone);
    if (!exportTask) {
        return {
            zoneId: zone?.id || null,
            projectId: zone?.projectId || null,
            status: 'missing_export_task',
            originWgs84: zone?.originWgs84 || null,
            exportTask: null,
            sources: [],
            summary: {
                totalSources: 0,
                byType: {},
            },
        };
    }

    const sourceCandidates = [];
    for (const descriptor of ensureArray(exportTask.resourceDescriptors)) {
        const materializedOutput = descriptor?.materializedOutput || null;
        if (!materializedOutput) continue;

        const normalizedOutput = String(materializedOutput).replace(/\\/g, '/');
        const sourceType = normalizedOutput.endsWith('.tileset.json')
            ? 'tileset'
            : (normalizedOutput.endsWith('.glb') ? 'glb' : null);
        if (!sourceType) continue;

        let stats = null;
        let detail = null;
        try {
            const descriptorResolved = resolveTerrainWorkZoneArtifactAbsolutePath(zone, descriptor.descriptorPath);
            const descriptorRaw = await fs.readFile(descriptorResolved.absolutePath, 'utf8');
            detail = JSON.parse(descriptorRaw);
            stats = detail?.detail?.stats || null;
        } catch (_error) {
            detail = null;
            stats = null;
        }

        let instancing = null;
        if (sourceType === 'glb') {
            const instancingPlanPath = ensureArray(descriptor.auxiliaryOutputs)
                .map((item) => String(item).replace(/\\/g, '/'))
                .find((item) => item.startsWith('staged-instancing/') && item.endsWith('.json'));
            if (instancingPlanPath) {
                try {
                    const instancingResolved = resolveTerrainWorkZoneArtifactAbsolutePath(zone, instancingPlanPath);
                    const instancingRaw = await fs.readFile(instancingResolved.absolutePath, 'utf8');
                    const instancingPlan = JSON.parse(instancingRaw);
                    const templates = ensureArray(instancingPlan?.templates)
                        .map((template, index) => {
                            const templateRelativePath = String(template?.templateRelativePath || '').replace(/\\/g, '/');
                            if (!templateRelativePath) return null;
                            return {
                                id: `${descriptor.resourceId || 'resource'}-inst-${index + 1}`,
                                key: template?.key || null,
                                geometryFamily: template?.geometryFamily || null,
                                appearanceKey: template?.appearanceKey || null,
                                templateObjectId: template?.templateObjectId || null,
                                templateMeshCount: pickNumber(template?.templateMeshCount, 0),
                                instanceCount: ensureArray(template?.instances).length,
                                templateRelativePath,
                                instances: ensureArray(template?.instances),
                            };
                        })
                        .filter(Boolean);
                    const totalInstances = templates.reduce((sum, template) => sum + pickNumber(template?.instanceCount, 0), 0);
                    if (templates.length && totalInstances > 1) {
                        instancing = {
                            planRelativePath: instancingPlanPath,
                            instancedRelativePath: String(instancingPlan?.instancedRelativePath || '').replace(/\\/g, '/') || null,
                            templateCount: templates.length,
                            totalInstances,
                            templates,
                        };
                    }
                } catch (_error) {
                    instancing = null;
                }
            }
        }

        sourceCandidates.push({
            id: descriptor.resourceId,
            type: instancing ? 'instancing' : sourceType,
            status: descriptor.status || null,
            relativePath: instancing?.instancedRelativePath || normalizedOutput,
            descriptorPath: descriptor.descriptorPath || null,
            stagedOutput: descriptor.stagedOutput || null,
            auxiliaryOutputs: ensureArray(descriptor.auxiliaryOutputs).map((item) => String(item).replace(/\\/g, '/')),
            category: detail?.category || detail?.detail?.category || 'geometry-batch',
            format: detail?.format || detail?.detail?.format || sourceType,
            lodLevel: detail?.detail?.lodLevel || null,
            objectIds: ensureArray(detail?.objectIds || detail?.detail?.objectIds),
            stats,
            fallbackRelativePath: instancing ? normalizedOutput : null,
            instancing,
        });
    }

    const sources = [];
    for (const source of sourceCandidates) {
        try {
            const resolved = resolveTerrainWorkZoneArtifactAbsolutePath(zone, source.relativePath);
            await fs.access(resolved.absolutePath);
            sources.push(source);
        } catch (_error) {
            // Ignore stale metadata that no longer has backing files.
        }
    }

    const summary = sources.reduce((acc, source) => {
        acc.totalSources += 1;
        acc.byType[source.type] = (acc.byType[source.type] || 0) + 1;
        return acc;
    }, {
        totalSources: 0,
        byType: {},
    });

    return {
        zoneId: zone?.id || null,
        projectId: zone?.projectId || null,
        status: exportTask.status || 'completed',
        originWgs84: zone?.originWgs84 || null,
        exportTask: {
            id: exportTask.id,
            status: exportTask.status,
            completedAt: exportTask.completedAt || null,
            relativeOutputRoot: exportTask.relativeOutputRoot || null,
        },
        sources,
        summary,
    };
}

function createBoxMesh({ id, center, size, color = '#d9d9d9' }) {
    const halfWidth = size.width / 2;
    const halfHeight = size.height / 2;
    const halfDepth = size.depth / 2;
    const vertices = [
        [-halfWidth, -halfHeight, -halfDepth],
        [halfWidth, -halfHeight, -halfDepth],
        [halfWidth, halfHeight, -halfDepth],
        [-halfWidth, halfHeight, -halfDepth],
        [-halfWidth, -halfHeight, halfDepth],
        [halfWidth, -halfHeight, halfDepth],
        [halfWidth, halfHeight, halfDepth],
        [-halfWidth, halfHeight, halfDepth],
    ].flatMap(([x, y, z]) => [
        round(center.x + x),
        round(center.y + y),
        round(center.z + z),
    ]);
    const indices = [
        0, 1, 2, 0, 2, 3,
        4, 6, 5, 4, 7, 6,
        0, 4, 5, 0, 5, 1,
        1, 5, 6, 1, 6, 2,
        2, 6, 7, 2, 7, 3,
        3, 7, 4, 3, 4, 0,
    ];
    return { id, primitive: 'box', color, vertices, indices };
}

function createPyramidRoofMesh({ id, center, size, color = '#d9d9d9' }) {
    const halfWidth = size.width / 2;
    const halfDepth = size.depth / 2;
    const baseY = center.y - size.height / 2;
    const apexY = center.y + size.height / 2;
    const vertices = [
        [center.x - halfWidth, baseY, center.z - halfDepth],
        [center.x + halfWidth, baseY, center.z - halfDepth],
        [center.x + halfWidth, baseY, center.z + halfDepth],
        [center.x - halfWidth, baseY, center.z + halfDepth],
        [center.x, apexY, center.z],
    ].flatMap(([x, y, z]) => [round(x), round(y), round(z)]);
    const indices = [
        0, 1, 4,
        1, 2, 4,
        2, 3, 4,
        3, 0, 4,
        0, 3, 2,
        0, 2, 1,
    ];
    return { id, primitive: 'pyramid-roof', color, vertices, indices };
}

function createCylinderMesh({ id, center, radius, height, segments = 10, color = '#d9d9d9' }) {
    const vertices = [];
    const indices = [];
    const bottomY = center.y - height / 2;
    const topY = center.y + height / 2;

    for (let index = 0; index < segments; index += 1) {
        const angle = (Math.PI * 2 * index) / segments;
        const x = center.x + Math.cos(angle) * radius;
        const z = center.z + Math.sin(angle) * radius;
        vertices.push(round(x), round(bottomY), round(z));
        vertices.push(round(x), round(topY), round(z));
    }

    const bottomCenterIndex = vertices.length / 3;
    vertices.push(round(center.x), round(bottomY), round(center.z));
    const topCenterIndex = vertices.length / 3;
    vertices.push(round(center.x), round(topY), round(center.z));

    for (let index = 0; index < segments; index += 1) {
        const next = (index + 1) % segments;
        const bottomCurrent = index * 2;
        const topCurrent = bottomCurrent + 1;
        const bottomNext = next * 2;
        const topNext = bottomNext + 1;
        indices.push(bottomCurrent, topCurrent, topNext, bottomCurrent, topNext, bottomNext);
        indices.push(bottomCenterIndex, bottomNext, bottomCurrent);
        indices.push(topCenterIndex, topCurrent, topNext);
    }

    return { id, primitive: 'cylinder', color, vertices, indices };
}

function createSegmentBoxMesh({ id, start, end, height, thickness, color = '#d9d9d9' }) {
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dz) || thickness;
    const nx = -(dz / length) * (thickness / 2);
    const nz = (dx / length) * (thickness / 2);
    const bottomY = Math.min(start.y, end.y);
    const topY = bottomY + height;
    const vertices = [
        [start.x + nx, bottomY, start.z + nz],
        [start.x - nx, bottomY, start.z - nz],
        [end.x - nx, bottomY, end.z - nz],
        [end.x + nx, bottomY, end.z + nz],
        [start.x + nx, topY, start.z + nz],
        [start.x - nx, topY, start.z - nz],
        [end.x - nx, topY, end.z - nz],
        [end.x + nx, topY, end.z + nz],
    ].flatMap(([x, y, z]) => [round(x), round(y), round(z)]);
    const indices = [
        0, 1, 2, 0, 2, 3,
        4, 7, 6, 4, 6, 5,
        0, 4, 5, 0, 5, 1,
        1, 5, 6, 1, 6, 2,
        2, 6, 7, 2, 7, 3,
        3, 7, 4, 3, 4, 0,
    ];
    return { id, primitive: 'segment-box', color, vertices, indices };
}

function normalizeHexColor(color, fallback = '#d9d9d9') {
    const raw = String(color || '').trim().replace('#', '');
    if (!raw) return fallback;
    const normalized = raw.length === 3
        ? raw.split('').map((char) => `${char}${char}`).join('')
        : raw.padEnd(6, '0').slice(0, 6);
    return `#${normalized.toLowerCase()}`;
}

function hexToRgb(color) {
    const normalized = normalizeHexColor(color).replace('#', '');
    return {
        red: parseInt(normalized.slice(0, 2), 16),
        green: parseInt(normalized.slice(2, 4), 16),
        blue: parseInt(normalized.slice(4, 6), 16),
    };
}

function rgbToHex(red, green, blue) {
    return `#${[red, green, blue]
        .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0'))
        .join('')}`;
}

function mixHexColors(colorA, colorB, ratio = 0.5) {
    const left = hexToRgb(colorA);
    const right = hexToRgb(colorB);
    const factor = Math.max(0, Math.min(1, pickNumber(ratio, 0.5)));
    return rgbToHex(
        left.red + (right.red - left.red) * factor,
        left.green + (right.green - left.green) * factor,
        left.blue + (right.blue - left.blue) * factor,
    );
}

function toSlug(value, fallback = 'item') {
    const nextValue = String(value || fallback)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return nextValue || fallback;
}

function rebaseMeshVertices(mesh, origin) {
    const rebasedVertices = [];
    for (let index = 0; index < ensureArray(mesh.vertices).length; index += 3) {
        rebasedVertices.push(
            round(pickNumber(mesh.vertices[index], 0) - pickNumber(origin.x, 0)),
            round(pickNumber(mesh.vertices[index + 1], 0) - pickNumber(origin.y, 0)),
            round(pickNumber(mesh.vertices[index + 2], 0) - pickNumber(origin.z, 0)),
        );
    }
    return {
        ...mesh,
        vertices: rebasedVertices,
    };
}

function buildObjectInstanceOrigin(object, terrainOffset) {
    const anchor = object?.anchorLocalMeters || { x: 0, z: 0 };
    const placement = object?.placement || {};
    const baseY = round(pickNumber(placement.baseElevationMeters, terrainOffset) - terrainOffset);
    const platformY = round(pickNumber(placement.platformElevationMeters, placement.baseElevationMeters) - terrainOffset);
    return {
        x: pickNumber(anchor.x, 0),
        y: object?.placementMode === 'level-platform' ? platformY : baseY,
        z: pickNumber(anchor.z, 0),
        platformY,
        baseY,
    };
}

function buildInstancingTemplatePlan(objects, meshes, terrainOffset, resourceOptimization = {}) {
    const groupedObjects = new Map();
    ensureArray(objects).forEach((object) => {
        if (!object?.optimizationProfile?.instancingEligible) return;
        const key = `${object.optimizationProfile.geometryFamily}::${object.optimizationProfile.appearanceKey}`;
        const existing = groupedObjects.get(key) || [];
        existing.push(object);
        groupedObjects.set(key, existing);
    });

    const meshMap = new Map();
    ensureArray(meshes).forEach((mesh) => {
        const key = mesh.sourceObjectId || mesh.id;
        const existing = meshMap.get(key) || [];
        existing.push(mesh);
        meshMap.set(key, existing);
    });

    return Array.from(groupedObjects.entries())
        .map(([groupKey, groupObjects]) => {
            if (groupObjects.length < 2) return null;
            const templateObject = groupObjects[0];
            const templateOrigin = buildObjectInstanceOrigin(templateObject, terrainOffset);
            const templateMeshes = ensureArray(meshMap.get(templateObject.id))
                .filter((mesh) => !(templateObject?.placementMode === 'level-platform' && String(mesh.id || '').endsWith('-platform')))
                .map((mesh) => ({
                    ...rebaseMeshVertices(mesh, templateOrigin),
                    id: `${toSlug(resourceOptimization.geometryFamily || templateObject.optimizationProfile?.geometryFamily || 'template')}-${toSlug(mesh.primitive || 'mesh')}`,
                    sourceObjectId: null,
                }));

            if (!templateMeshes.length) return null;

            return {
                key: groupKey,
                geometryFamily: templateObject.optimizationProfile?.geometryFamily || null,
                appearanceKey: templateObject.optimizationProfile?.appearanceKey || null,
                templateObjectId: templateObject.id,
                templateMeshCount: templateMeshes.length,
                templateMeshes,
                instances: groupObjects.map((object) => {
                    const origin = buildObjectInstanceOrigin(object, terrainOffset);
                    return {
                        objectId: object.id,
                        title: object.title || null,
                        translation: {
                            x: round(origin.x),
                            y: round(origin.y),
                            z: round(origin.z),
                        },
                        rotationDeg: pickNumber(object?.materialVariant?.rotationDeg, 0),
                        scale: {
                            x: 1,
                            y: 1,
                            z: 1,
                        },
                        platformSpec: object?.placementMode === 'level-platform'
                            ? {
                                platformHeightMeters: round(Math.max(origin.platformY - origin.baseY, 0)),
                                supportHeights: ensureArray(object?.placement?.supportHeights),
                            }
                            : null,
                    };
                }),
            };
        })
        .filter(Boolean);
}

function getBrandPalette(object) {
    const whiteModel = Boolean(object?.renderProfile?.whiteModel);
    if (whiteModel) {
        return {
            primary: '#d9d9d9',
            accent: '#f3f4f6',
            neutral: '#c7c7c7',
            dark: '#a8a8a8',
            sponsorPanel: '#ececec',
        };
    }

    const packId = String(object?.brandingPackId || 'neutral');
    const packPresets = {
        neutral: { primary: '#d9d9d9', accent: '#ffffff' },
        'race-red': { primary: '#d64141', accent: '#ffffff' },
        'sponsor-blue': { primary: '#1f6feb', accent: '#ffd54a' },
        'energy-green': { primary: '#159f6b', accent: '#efff7a' },
        custom: { primary: '#d9d9d9', accent: '#ffffff' },
    };
    const preset = packPresets[packId] || packPresets.neutral;
    const primary = normalizeHexColor(object?.renderProfile?.color || object?.materialVariant?.color || preset.primary);
    const accent = normalizeHexColor(object?.renderProfile?.accentColor || object?.materialVariant?.accentColor || preset.accent, '#ffffff');
    return {
        primary,
        accent,
        neutral: mixHexColors(primary, '#f4f4f4', 0.45),
        dark: mixHexColors(primary, '#2c2c2c', 0.28),
        sponsorPanel: mixHexColors(accent, '#ffffff', 0.25),
    };
}

function buildObjectMeshes(object, terrainOffset) {
    const dims = object?.dimensions || { width: 1, depth: 1, height: 1 };
    const anchor = object?.anchorLocalMeters || { x: 0, z: 0 };
    const placement = object?.placement || {};
    const color = object?.renderProfile?.color || '#d9d9d9';
    const accentColor = object?.renderProfile?.accentColor || object?.materialVariant?.accentColor || '#ffffff';
    const fasciaStyle = String(object?.renderProfile?.fasciaStyle || object?.materialVariant?.fasciaStyle || 'classic');
    const sponsorName = String(object?.renderProfile?.sponsorName || object?.materialVariant?.sponsorName || '').trim();
    const palette = getBrandPalette(object);
    const baseY = round(pickNumber(placement.baseElevationMeters, terrainOffset) - terrainOffset);
    const platformY = round(pickNumber(placement.platformElevationMeters, placement.baseElevationMeters) - terrainOffset);

    if (object?.objectType === 'fence_segment') {
        const pathPoints = ensureArray(object?.pathLocalMeters);
        if (pathPoints.length >= 2) {
            return pathPoints.slice(0, -1).map((start, index) => createSegmentBoxMesh({
                id: `${object.id}-segment-${index + 1}`,
                start: {
                    x: pickNumber(start.x, 0),
                    y: baseY,
                    z: pickNumber(start.z, 0),
                },
                end: {
                    x: pickNumber(pathPoints[index + 1]?.x, 0),
                    y: baseY,
                    z: pickNumber(pathPoints[index + 1]?.z, 0),
                },
                height: round(Math.max(dims.height, 1.2)),
                thickness: 0.12,
                color,
            }));
        }
    }

    const meshes = [];
    if (object?.placementMode === 'level-platform') {
        meshes.push(createBoxMesh({
            id: `${object.id}-platform`,
            center: { x: anchor.x, y: platformY / 2, z: anchor.z },
            size: { width: dims.width + 0.4, height: Math.max(platformY, 0.08), depth: dims.depth + 0.4 },
            color: palette.neutral,
        }));
    }

    if (object?.objectType === 'tent') {
        meshes.push(createBoxMesh({
            id: `${object.id}-body`,
            center: { x: anchor.x, y: platformY + 0.9, z: anchor.z },
            size: { width: dims.width, height: 1.8, depth: dims.depth },
            color: palette.primary,
        }));
        meshes.push(createPyramidRoofMesh({
            id: `${object.id}-roof`,
            center: { x: anchor.x, y: platformY + 2.2, z: anchor.z },
            size: { width: dims.width + 0.16, height: 1.2, depth: dims.depth + 0.16 },
            color: mixHexColors(palette.primary, palette.accent, 0.22),
        }));
        if (fasciaStyle === 'classic' || fasciaStyle === 'banner' || fasciaStyle === 'boxed') {
            meshes.push(createBoxMesh({
                id: `${object.id}-fascia-front`,
                center: { x: anchor.x, y: platformY + 1.78, z: anchor.z + dims.depth / 2 + 0.08 },
                size: { width: dims.width * 0.88, height: fasciaStyle === 'banner' ? 0.22 : 0.38, depth: 0.12 },
                color: fasciaStyle === 'banner' ? palette.accent : accentColor,
            }));
        }
        if (fasciaStyle === 'boxed') {
            meshes.push(createBoxMesh({
                id: `${object.id}-fascia-side`,
                center: { x: anchor.x - dims.width / 2 - 0.08, y: platformY + 1.55, z: anchor.z },
                size: { width: 0.12, height: 0.62, depth: dims.depth * 0.72 },
                color: accentColor,
            }));
        }
        if (sponsorName) {
            meshes.push(createBoxMesh({
                id: `${object.id}-sponsor-panel`,
                center: { x: anchor.x, y: platformY + 1.18, z: anchor.z + dims.depth / 2 + 0.16 },
                size: { width: dims.width * 0.52, height: 0.34, depth: 0.08 },
                color: palette.sponsorPanel,
            }));
        }
        return meshes;
    }

    if (object?.objectType === 'stage') {
        meshes.push(createBoxMesh({
            id: `${object.id}-deck`,
            center: { x: anchor.x, y: platformY + 0.35, z: anchor.z },
            size: { width: dims.width, height: 0.7, depth: dims.depth },
            color: palette.dark,
        }));
        meshes.push(createBoxMesh({
            id: `${object.id}-backdrop`,
            center: { x: anchor.x, y: platformY + 2.4, z: anchor.z - dims.depth * 0.34 },
            size: { width: dims.width * 0.92, height: 2.6, depth: 0.24 },
            color: palette.primary,
        }));
        meshes.push(createBoxMesh({
            id: `${object.id}-front-banner`,
            center: { x: anchor.x, y: platformY + 0.52, z: anchor.z + dims.depth / 2 + 0.08 },
            size: { width: dims.width * 0.82, height: fasciaStyle === 'banner' ? 0.2 : 0.34, depth: 0.12 },
            color: palette.accent,
        }));
        if (fasciaStyle === 'towered') {
            meshes.push(createBoxMesh({
                id: `${object.id}-tower-left`,
                center: { x: anchor.x - dims.width * 0.42, y: platformY + 2.9, z: anchor.z - dims.depth * 0.34 },
                size: { width: 0.42, height: 1.4, depth: 0.42 },
                color: accentColor,
            }));
            meshes.push(createBoxMesh({
                id: `${object.id}-tower-right`,
                center: { x: anchor.x + dims.width * 0.42, y: platformY + 2.9, z: anchor.z - dims.depth * 0.34 },
                size: { width: 0.42, height: 1.4, depth: 0.42 },
                color: accentColor,
            }));
        }
        return meshes;
    }

    if (object?.objectType === 'arch') {
        const legOffset = dims.width * 0.36;
        meshes.push(createBoxMesh({
            id: `${object.id}-leg-left`,
            center: { x: anchor.x - legOffset, y: platformY + dims.height * 0.35, z: anchor.z },
            size: { width: 0.42, height: dims.height * 0.7, depth: 0.42 },
            color: palette.primary,
        }));
        meshes.push(createBoxMesh({
            id: `${object.id}-leg-right`,
            center: { x: anchor.x + legOffset, y: platformY + dims.height * 0.35, z: anchor.z },
            size: { width: 0.42, height: dims.height * 0.7, depth: 0.42 },
            color: palette.primary,
        }));
        meshes.push(createBoxMesh({
            id: `${object.id}-beam`,
            center: { x: anchor.x, y: platformY + dims.height * 0.72, z: anchor.z },
            size: { width: dims.width, height: 0.52, depth: 0.52 },
            color: palette.primary,
        }));
        meshes.push(createBoxMesh({
            id: `${object.id}-beam-banner`,
            center: { x: anchor.x, y: platformY + dims.height * 0.72, z: anchor.z + 0.31 },
            size: { width: dims.width * 0.74, height: fasciaStyle === 'banner' ? 0.18 : 0.28, depth: 0.12 },
            color: palette.accent,
        }));
        if (fasciaStyle === 'towered') {
            meshes.push(createBoxMesh({
                id: `${object.id}-crown`,
                center: { x: anchor.x, y: platformY + dims.height * 0.92, z: anchor.z },
                size: { width: dims.width * 0.26, height: 0.46, depth: 0.46 },
                color: accentColor,
            }));
        }
        return meshes;
    }

    if (object?.objectType === 'light_tower') {
        meshes.push(createCylinderMesh({
            id: `${object.id}-tower`,
            center: { x: anchor.x, y: baseY + dims.height / 2, z: anchor.z },
            radius: 0.14,
            height: dims.height,
            segments: 12,
            color: palette.dark,
        }));
        meshes.push(createBoxMesh({
            id: `${object.id}-head`,
            center: { x: anchor.x, y: baseY + dims.height - 0.25, z: anchor.z },
            size: { width: 0.72, height: 0.3, depth: 0.28 },
            color: palette.accent,
        }));
        return meshes;
    }

    if (object?.objectType === 'route_sign') {
        meshes.push(createCylinderMesh({
            id: `${object.id}-pole`,
            center: { x: anchor.x, y: baseY + dims.height / 2, z: anchor.z },
            radius: 0.06,
            height: dims.height,
            segments: 10,
            color: palette.dark,
        }));
        meshes.push(createBoxMesh({
            id: `${object.id}-board`,
            center: { x: anchor.x, y: baseY + dims.height * 0.75, z: anchor.z },
            size: { width: dims.width * 2.4, height: 0.52, depth: 0.12 },
            color: palette.accent,
        }));
        return meshes;
    }

    if (object?.objectType === 'supply_station' || object?.objectType === 'medical_station') {
        meshes.push(createBoxMesh({
            id: `${object.id}-body`,
            center: { x: anchor.x, y: platformY + dims.height * 0.42, z: anchor.z },
            size: { width: dims.width, height: dims.height * 0.84, depth: dims.depth },
            color,
        }));
        meshes.push(createBoxMesh({
            id: `${object.id}-front-bar`,
            center: { x: anchor.x, y: platformY + dims.height * 0.56, z: anchor.z + dims.depth * 0.36 },
            size: { width: dims.width * 0.88, height: 0.22, depth: 0.18 },
            color: '#bcbcbc',
        }));
        return meshes;
    }

    meshes.push(createBoxMesh({
        id: `${object.id}-body`,
        center: { x: anchor.x, y: platformY + dims.height * 0.35, z: anchor.z },
        size: { width: dims.width, height: dims.height * 0.7, depth: dims.depth },
        color,
    }));
    return meshes;
}

function buildGeometryBatchFile({ resource, manifest, terrainOffset, zoneId }) {
    const objectIdSet = new Set(ensureArray(resource?.objectIds));
    const objects = ensureArray(manifest?.objects).filter((item) => objectIdSet.has(item.id));
    const meshes = objects.flatMap((object) => buildObjectMeshes(object, terrainOffset).map((mesh) => ({
        ...mesh,
        sourceObjectId: object.id,
        objectType: object.objectType,
        lodLevel: object.lodLevel,
    })));
    const totalVertices = meshes.reduce((sum, mesh) => sum + (mesh.vertices.length / 3), 0);
    const totalTriangles = meshes.reduce((sum, mesh) => sum + (mesh.indices.length / 3), 0);
    const preflight = buildGeometryPreflight(meshes);
    const instancingTemplates = buildInstancingTemplatePlan(objects, meshes, terrainOffset, resource?.optimization);
    const instancingCandidates = objects
        .filter((object) => object?.optimizationProfile?.instancingEligible)
        .reduce((acc, object) => {
            const key = `${object.optimizationProfile.geometryFamily}::${object.optimizationProfile.appearanceKey}`;
            const existing = acc.get(key) || {
                key,
                geometryFamily: object.optimizationProfile.geometryFamily,
                appearanceKey: object.optimizationProfile.appearanceKey,
                instanceCount: 0,
                objectIds: [],
            };
            existing.instanceCount += 1;
            existing.objectIds.push(object.id);
            acc.set(key, existing);
            return acc;
        }, new Map());

    return {
        version: 'door-white-model-batch-v2',
        zoneId,
        resourceId: resource.id,
        generatedAt: new Date().toISOString(),
        lodLevel: resource.lodLevel,
        materialMode: resource.materialMode,
        intendedOutput: resource.path,
        stats: {
            objectCount: objects.length,
            meshCount: meshes.length,
            totalVertices,
            totalTriangles,
        },
        optimizationPlan: {
            strategy: resource?.optimization?.strategy || 'merged-batch',
            geometryFamily: resource?.optimization?.geometryFamily || null,
            appearanceKey: resource?.optimization?.appearanceKey || null,
            instancingEligible: Boolean(resource?.optimization?.instancingEligible),
            instancingCandidates: Array.from(instancingCandidates.values()).sort((left, right) => right.instanceCount - left.instanceCount),
            instanceTemplateCount: instancingTemplates.length,
            instanceTemplates: instancingTemplates.map((template) => ({
                key: template.key,
                geometryFamily: template.geometryFamily,
                appearanceKey: template.appearanceKey,
                templateObjectId: template.templateObjectId,
                templateMeshCount: template.templateMeshCount,
                instanceCount: template.instances.length,
            })),
        },
        instancingTemplates,
        meshes,
        metadata: {
            source: 'gis-spatial-objects',
            sourceWorkZoneId: zoneId || null,
            preflight,
            export: buildExportManifest({
                kind: 'gis-white-model-batch',
                name: resource?.id || zoneId || 'gis-white-model',
                source: 'gis-spatial-objects',
                coordinateSystem: EXPORT_COORDINATE_SYSTEMS.ARCSPRO_LOCAL_Y_UP,
                input: {
                    sourceWorkZoneId: zoneId || null,
                    resourceId: resource?.id || null,
                    intendedOutput: resource?.path || null,
                },
                stats: {
                    objectCount: objects.length,
                    meshCount: meshes.length,
                    totalVertices,
                    totalTriangles,
                },
                diagnostics: {
                    geometry: preflight,
                },
            }),
        },
    };
}

function build3dTilesMetadataArtifacts({ batchFile, resource, zone, startedAt }) {
    const chunkGroups = splitMeshesIntoChunks(batchFile.meshes);
    const chunks = chunkGroups.map((group, index) => {
        const chunkId = `chunk-${String(index + 1).padStart(2, '0')}`;
        const bounds = computeBoundsFromMeshes(group.meshes);
        const totalVertices = group.meshes.reduce((sum, mesh) => sum + (mesh.vertices.length / 3), 0);
        const totalTriangles = group.meshes.reduce((sum, mesh) => sum + (mesh.indices.length / 3), 0);
        return {
            id: chunkId,
            objectIds: group.objectIds,
            meshes: group.meshes,
            boundingVolume: { box: bounds.box },
            stats: {
                objectCount: group.objectIds.length,
                meshCount: group.meshes.length,
                totalVertices,
                totalTriangles,
            },
        };
    });

    const resourceBasePath = resolveLocalArtifactPath(zone, resource.path).replace(/\\/g, '/');
    const resourceDir = path.posix.dirname(resourceBasePath);
    const resourceStem = path.posix.basename(resourceBasePath, '.json');
    const chunkDir = path.posix.join(resourceDir, `${resourceStem}-chunks`);
    const indexPath = path.posix.join(resourceDir, `${resourceStem}.content-index.json`);

    const contentIndex = {
        version: 'door-3dtiles-content-index-v1',
        generatedAt: startedAt,
        zoneId: zone?.id || null,
        resourceId: resource.id,
        lodLevel: resource.lodLevel,
        chunks: chunks.map((chunk) => ({
            id: chunk.id,
            uri: path.posix.join(`${resourceStem}-chunks`, `${chunk.id}.glb`),
            objectIds: chunk.objectIds,
            boundingVolume: chunk.boundingVolume,
            stats: chunk.stats,
        })),
    };

    const rootBounds = computeBoundsFromMeshes(batchFile.meshes);
    const tileset = {
        asset: {
            version: '1.1',
            generator: 'door-focus-zone-export',
        },
        geometricError: resource.lodLevel === 'LOD1' ? 48 : 96,
        root: {
            boundingVolume: { box: rootBounds.box },
            geometricError: resource.lodLevel === 'LOD1' ? 24 : 48,
            refine: 'ADD',
            children: chunks.map((chunk) => ({
                boundingVolume: chunk.boundingVolume,
                geometricError: 0,
                refine: 'ADD',
                content: {
                    uri: path.posix.join(`${resourceStem}-chunks`, `${chunk.id}.glb`),
                },
                extras: {
                    doorChunkId: chunk.id,
                    doorContentUri: path.posix.join(`${resourceStem}-chunks`, `${chunk.id}.glb`),
                    doorObjectIds: chunk.objectIds,
                    doorStats: chunk.stats,
                },
            })),
            extras: {
                doorContentIndexUri: path.posix.basename(indexPath),
                doorResourceId: resource.id,
                doorResourceFormat: '3dtiles-metadata',
            },
        },
    };

    return {
        tileset,
        tilesetPath: resourceBasePath,
        contentIndex,
        contentIndexPath: indexPath,
        chunkFiles: chunks.map((chunk) => ({
            glbPath: path.posix.join(chunkDir, `${chunk.id}.glb`),
            batchFile: {
                version: 'door-white-model-batch-v2',
                zoneId: zone?.id || null,
                resourceId: `${resource.id}-${chunk.id}`,
                generatedAt: startedAt,
                lodLevel: resource.lodLevel,
                materialMode: resource.materialMode,
                intendedOutput: path.posix.join(chunkDir, `${chunk.id}.glb`),
                stats: chunk.stats,
                meshes: chunk.meshes,
            },
            sidecarPath: path.posix.join(chunkDir, `${chunk.id}.json`),
            sidecarPayload: {
                version: 'door-3dtiles-chunk-v1',
                generatedAt: startedAt,
                zoneId: zone?.id || null,
                resourceId: resource.id,
                chunkId: chunk.id,
                objectIds: chunk.objectIds,
                boundingVolume: chunk.boundingVolume,
                stats: chunk.stats,
            },
        })),
    };
}

export async function executeTerrainWorkZoneExportArtifacts({ zone, manifest, exportPackage, actorUserId = null }) {
    const taskId = `export-${randomUUID()}`;
    const exportRoot = resolveTerrainWorkZoneExportRoot(zone);
    const descriptorRoot = path.join(exportRoot, 'descriptors');
    const metadataRoot = path.join(exportRoot, 'metadata');
    const stagedGeometryRoot = path.join(exportRoot, 'staged-geometry');
    const stagedInstancingRoot = path.join(exportRoot, 'staged-instancing');
    const startedAt = new Date().toISOString();

    await fs.mkdir(descriptorRoot, { recursive: true });
    await fs.mkdir(metadataRoot, { recursive: true });
    await fs.mkdir(stagedGeometryRoot, { recursive: true });
    await fs.mkdir(stagedInstancingRoot, { recursive: true });

    const resourceDescriptors = [];
    const generatedFiles = [];
    const generatedGlbFiles = [];
    const generatedBrandedGlbFiles = [];
    const generatedTilesetFiles = [];
    const terrainOffset = pickNumber(zone?.snapshotJson?.terrainPatch?.elevationOffsetMeters, 0);
    const studioScene = zone?.snapshotJson?.warehouseScene || null;
    const useStudioGeometry = hasStudioEditorDocument(zone);
    const geometrySource = useStudioGeometry ? 'studio-editor-document' : 'gis-spatial-objects';
    for (const resource of ensureArray(exportPackage?.resources)) {
        let stagedOutput = null;
        let descriptorStatus = resource.category === 'geometry-batch' ? 'pending_asset_generation' : 'materialized_metadata';
        let materializedOutput = null;
        let auxiliaryOutputs = [];

        if (resource.category === 'geometry-batch') {
            const batchFile = useStudioGeometry
                ? buildGeometryBatchFromStudioScene({
                    zone,
                    warehouseScene: studioScene,
                    resource,
                })
                : buildGeometryBatchFile({
                    resource,
                    manifest,
                    terrainOffset,
                    zoneId: zone?.id || null,
                });
            stagedOutput = path.join('staged-geometry', `${sanitizeSegment(resource.id, 'resource')}.json`);
            await writeJsonFile(path.join(exportRoot, stagedOutput), batchFile);
            descriptorStatus = 'materialized_white_model_json';
            generatedFiles.push(stagedOutput.split(path.sep).join('/'));
            if (ensureArray(batchFile.instancingTemplates).length) {
                const instancedRelativePath = path.posix.join(
                    'instanced-glb',
                    sanitizeSegment(resource.id, 'resource'),
                    `${sanitizeSegment(resource.id, 'resource')}.glb`,
                );
                const instancedGlbBuffer = buildInstancedGlbFromTemplates(batchFile.instancingTemplates, resource);
                const absoluteInstancedPath = path.join(exportRoot, normalizeRelativePath(instancedRelativePath));
                await ensureParentDir(absoluteInstancedPath);
                await fs.writeFile(absoluteInstancedPath, instancedGlbBuffer);
                auxiliaryOutputs.push(instancedRelativePath);
                generatedFiles.push(instancedRelativePath.split(path.sep).join('/'));

                const materializedTemplates = [];
                for (const [templateIndex, template] of batchFile.instancingTemplates.entries()) {
                    const templateBatchFile = buildTemplateBatchFile(template, resource);
                    const templateRelativePath = path.posix.join(
                        'instancing-templates',
                        sanitizeSegment(resource.id, 'resource'),
                        `${String(templateIndex + 1).padStart(2, '0')}-${sanitizeSegment(template.geometryFamily || template.key || 'template')}.glb`,
                    );
                    const templateGlbBuffer = buildGlbFromBatchFile(templateBatchFile);
                    const absoluteTemplatePath = path.join(exportRoot, normalizeRelativePath(templateRelativePath));
                    await ensureParentDir(absoluteTemplatePath);
                    await fs.writeFile(absoluteTemplatePath, templateGlbBuffer);
                    auxiliaryOutputs.push(templateRelativePath);
                    generatedFiles.push(templateRelativePath.split(path.sep).join('/'));
                    materializedTemplates.push({
                        ...template,
                        templateRelativePath,
                    });
                }
                const instancingOutput = path.join('staged-instancing', `${sanitizeSegment(resource.id, 'resource')}.json`);
                await writeJsonFile(path.join(exportRoot, instancingOutput), {
                    version: 'door-instancing-plan-v2',
                    zoneId: zone?.id || null,
                    resourceId: resource.id,
                    generatedAt: startedAt,
                    instancedRelativePath,
                    optimization: batchFile.optimizationPlan,
                    templates: materializedTemplates,
                });
                auxiliaryOutputs.push(instancingOutput);
                generatedFiles.push(instancingOutput.split(path.sep).join('/'));
            }

            if (resource.format === 'glb') {
                const glbBuffer = buildGlbFromBatchFile(batchFile);
                materializedOutput = resolveLocalArtifactPath(zone, resource.path);
                const absoluteGlbPath = path.join(exportRoot, normalizeRelativePath(materializedOutput));
                await ensureParentDir(absoluteGlbPath);
                await fs.writeFile(absoluteGlbPath, glbBuffer);
                descriptorStatus = 'materialized_glb_white_model';
                generatedGlbFiles.push(materializedOutput.split(path.sep).join('/'));
                if (resource.materialMode && resource.materialMode !== 'white-model') {
                    generatedBrandedGlbFiles.push(materializedOutput.split(path.sep).join('/'));
                    descriptorStatus = 'materialized_glb_branded_color';
                }
            } else if (resource.format === '3dtiles') {
                const tilesArtifacts = build3dTilesMetadataArtifacts({
                    batchFile,
                    resource,
                    zone,
                    startedAt,
                });
                materializedOutput = tilesArtifacts.tilesetPath;
                await writeJsonFile(path.join(exportRoot, normalizeRelativePath(tilesArtifacts.tilesetPath)), tilesArtifacts.tileset);
                await writeJsonFile(path.join(exportRoot, normalizeRelativePath(tilesArtifacts.contentIndexPath)), tilesArtifacts.contentIndex);
                auxiliaryOutputs.push(tilesArtifacts.contentIndexPath);
                for (const chunkFile of tilesArtifacts.chunkFiles) {
                    const chunkGlbBuffer = buildGlbFromBatchFile(chunkFile.batchFile);
                    const absoluteChunkGlbPath = path.join(exportRoot, normalizeRelativePath(chunkFile.glbPath));
                    await ensureParentDir(absoluteChunkGlbPath);
                    await fs.writeFile(absoluteChunkGlbPath, chunkGlbBuffer);
                    await writeJsonFile(path.join(exportRoot, normalizeRelativePath(chunkFile.sidecarPath)), chunkFile.sidecarPayload);
                    auxiliaryOutputs.push(chunkFile.glbPath, chunkFile.sidecarPath);
                }
                descriptorStatus = 'materialized_3dtiles_glb_tileset';
                generatedTilesetFiles.push(materializedOutput.split('/').join('/'));
                generatedFiles.push(...auxiliaryOutputs.map((item) => item.split('/').join('/')));
            }
        }

        const descriptor = {
            taskId,
            generatedAt: startedAt,
            zoneId: zone?.id || null,
            projectId: zone?.projectId || null,
            category: resource.category,
            format: resource.format,
            intendedOutput: resource.path,
            stagedOutput,
            materializedOutput,
            auxiliaryOutputs,
            status: descriptorStatus,
            objectIds: resource.objectIds || [],
            detail: resource,
            geometrySource,
        };
        const descriptorRelativePath = path.join('descriptors', `${sanitizeSegment(resource.id, 'resource')}.json`);
        const descriptorAbsolutePath = path.join(exportRoot, descriptorRelativePath);
        await writeJsonFile(descriptorAbsolutePath, descriptor);
        resourceDescriptors.push({
            resourceId: resource.id,
            descriptorPath: descriptorRelativePath.split(path.sep).join('/'),
            status: descriptor.status,
            stagedOutput: stagedOutput ? stagedOutput.split(path.sep).join('/') : null,
            materializedOutput: materializedOutput ? materializedOutput.split(path.sep).join('/') : null,
            auxiliaryOutputs: auxiliaryOutputs.map((item) => item.split('/').join('/')),
        });
    }

    const terrainPatch = zone?.snapshotJson?.terrainPatch || null;
    await writeJsonFile(path.join(metadataRoot, 'publish-manifest.json'), manifest);
    await writeJsonFile(path.join(metadataRoot, 'export-package.json'), exportPackage);
    await writeJsonFile(path.join(metadataRoot, 'object-placements.json'), {
        generatedAt: startedAt,
        zoneId: zone?.id || null,
        objects: manifest?.objects || [],
    });
    if (terrainPatch) {
        await writeJsonFile(path.join(exportRoot, 'terrain', 'terrain-patch.json'), terrainPatch);
    }

    const task = {
        id: taskId,
        status: generatedGlbFiles.length
            ? (generatedTilesetFiles.length
                ? 'completed_mixed_export_artifacts'
                : (generatedBrandedGlbFiles.length ? 'completed_glb_branded_color' : 'completed_glb_white_model'))
            : (generatedTilesetFiles.length
                ? 'completed_3dtiles_glb_tileset'
                : (generatedFiles.length ? 'completed_white_model_json' : 'completed_metadata_only')),
        startedAt,
        completedAt: new Date().toISOString(),
        actorUserId: actorUserId || null,
        outputRoot: exportRoot,
        relativeOutputRoot: path.relative(WORKSPACE_ROOT, exportRoot).split(path.sep).join('/'),
        files: {
            manifest: 'metadata/publish-manifest.json',
            exportPackage: 'metadata/export-package.json',
            placements: 'metadata/object-placements.json',
            terrainPatch: terrainPatch ? 'terrain/terrain-patch.json' : null,
            stagedGeometry: generatedFiles,
            glbArtifacts: generatedGlbFiles,
            tilesetArtifacts: generatedTilesetFiles,
        },
        geometrySource,
        studioSnapshot: useStudioGeometry
            ? {
                sceneType: studioScene?.sceneType || null,
                savedAt: zone?.snapshotJson?.savedAt || null,
                importedAt: studioScene?.editorDocument?.metadata?.importedAt || studioScene?.metadata?.importedAt || null,
                sourceHash: studioScene?.editorDocument?.metadata?.focusZoneSourceHash || studioScene?.metadata?.focusZoneSourceHash || null,
            }
            : null,
        logicalOutputs: {
            manifest: normalizeRelativePath(exportPackage?.files?.manifest || 'focus-zones/zone/metadata/publish-manifest.json').split(path.sep).join('/'),
            exportPackage: normalizeRelativePath(exportPackage?.files?.packageDescriptor || 'focus-zones/zone/metadata/export-package.json').split(path.sep).join('/'),
        },
        resourceDescriptors,
        notes: [
            useStudioGeometry
                ? '已使用 3D Studio 编辑快照生成白模导出。'
                : '已使用 GIS 空间对象生成白模导出。',
            generatedGlbFiles.length
                ? (generatedBrandedGlbFiles.length
                    ? '已输出可直接消费的品牌色 GLB，并保留 staged geometry / staged instancing JSON。'
                    : '已输出可直接消费的白模 GLB，并保留 staged geometry / staged instancing JSON。')
                : generatedTilesetFiles.length
                    ? '已输出 3D Tiles 元数据结构、分块内容索引，以及 staged instancing JSON。'
                    : generatedFiles.length
                    ? '已输出白模批次 JSON 与 instancing 计划，可作为后续 glTF / 3D Tiles 生成输入。'
                    : '当前阶段仅输出元数据和资源描述文件。',
            '3D Tiles 当前阶段使用 tileset.json + glb chunk content，不含 b3dm 或 3D Tiles Next metadata 扩展。',
        ],
    };

    await writeJsonFile(path.join(metadataRoot, 'export-task.json'), task);
    return task;
}
