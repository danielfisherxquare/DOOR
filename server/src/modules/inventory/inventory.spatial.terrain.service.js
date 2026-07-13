import * as repo from './inventory.spatial.repository.js';
import { assertGenericWorkZoneMutationAllowed } from './inventory.spatial.site-mode-guard.js';

const OPEN_TOPO_DATA_API_URL = process.env.OPEN_TOPO_DATA_API_URL || 'https://api.opentopodata.org/v1/srtm90m';
const OPEN_TOPO_DATA_INTERPOLATION = process.env.OPEN_TOPO_DATA_INTERPOLATION || 'bilinear';
const OPEN_TOPO_DATA_BATCH_SIZE = Math.min(Math.max(Number(process.env.OPEN_TOPO_DATA_BATCH_SIZE) || 100, 16), 100);
const OPEN_TOPO_DATA_MAX_SAMPLES = Math.max(Number(process.env.OPEN_TOPO_DATA_MAX_SAMPLES) || 144, 64);
const OPEN_TOPO_DATA_MAX_GRID_DIMENSION = Math.max(Number(process.env.OPEN_TOPO_DATA_MAX_GRID_DIMENSION) || 32, 8);
const OPEN_TOPO_DATA_RETRY_COUNT = Math.max(Number(process.env.OPEN_TOPO_DATA_RETRY_COUNT) || 2, 0);
const OPEN_TOPO_DATA_RETRY_DELAY_MS = Math.max(Number(process.env.OPEN_TOPO_DATA_RETRY_DELAY_MS) || 800, 100);
const OPEN_TOPO_DATA_TIMEOUT_MS = Math.min(
    Math.max(Number(process.env.OPEN_TOPO_DATA_TIMEOUT_MS) || 25000, 100),
    60000,
);

const ensureArray = (value) => (Array.isArray(value) ? value : []);

function pickNumber(value, fallback = 0) {
    const nextValue = Number(value);
    return Number.isFinite(nextValue) ? nextValue : fallback;
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

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function round(value, digits = 4) {
    return Number(pickNumber(value, 0).toFixed(digits));
}

function buildAbortError() {
    const error = new Error('The operation was aborted');
    error.name = 'AbortError';
    return error;
}

function withAbortSignal(promise, signal) {
    if (signal?.aborted) return Promise.reject(buildAbortError());
    if (!signal) return promise;

    return new Promise((resolve, reject) => {
        const abort = () => reject(buildAbortError());
        signal.addEventListener('abort', abort, { once: true });
        Promise.resolve(promise).then(resolve, reject).finally(() => {
            signal.removeEventListener('abort', abort);
        });
    });
}

function sleep(ms, signal) {
    if (signal?.aborted) return Promise.reject(buildAbortError());
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            signal?.removeEventListener?.('abort', abort);
            resolve();
        }, Math.max(0, ms));
        const abort = () => {
            clearTimeout(timeoutId);
            reject(buildAbortError());
        };
        signal?.addEventListener?.('abort', abort, { once: true });
    });
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

function getPolygonRing(polygon) {
    const ring = ensureArray(polygon?.coordinates?.[0]);
    if (ring.length < 3) return [];
    const isClosed = ring[0]?.[0] === ring[ring.length - 1]?.[0] && ring[0]?.[1] === ring[ring.length - 1]?.[1];
    return isClosed ? ring.slice(0, -1) : ring;
}

function polygonCentroid(points) {
    if (!points.length) return null;
    const sums = points.reduce((acc, point) => ({
        longitude: acc.longitude + pickNumber(point?.[0], 0),
        latitude: acc.latitude + pickNumber(point?.[1], 0),
    }), { longitude: 0, latitude: 0 });
    return {
        longitude: sums.longitude / points.length,
        latitude: sums.latitude / points.length,
    };
}

function pointInPolygon(point, polygon) {
    let inside = false;
    for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
        const xi = polygon[current].x;
        const zi = polygon[current].z;
        const xj = polygon[previous].x;
        const zj = polygon[previous].z;
        const intersects = ((zi > point.z) !== (zj > point.z))
            && (point.x < ((xj - xi) * (point.z - zi)) / ((zj - zi) || 1e-7) + xi);
        if (intersects) inside = !inside;
    }
    return inside;
}

function normalizeTerrainResolution(value) {
    return clamp(pickNumber(value, 2), 1, 12);
}

function buildTerrainGridSpec(zone, options = {}) {
    const polygon = zone?.clipPolygonWgs84;
    const ring = getPolygonRing(polygon);
    if (!ring.length) {
        throw buildBadRequestError('工作区缺少有效 Polygon，无法生成 terrain patch');
    }

    const origin = zone?.originWgs84 || polygonCentroid(ring);
    if (!origin) {
        throw buildBadRequestError('工作区缺少 originWgs84，无法生成 terrain patch');
    }

    const requestedResolutionMeters = normalizeTerrainResolution(options.terrainResolution ?? zone?.terrainResolution);
    const metersPerDegreeLat = 111320;
    const metersPerDegreeLng = metersPerDegreeLat * Math.cos((pickNumber(origin.latitude, 0) * Math.PI) / 180) || 1;
    const polygonLocalMeters = ring.map(([longitude, latitude]) => ({
        x: (pickNumber(longitude, 0) - pickNumber(origin.longitude, 0)) * metersPerDegreeLng,
        z: (pickNumber(latitude, 0) - pickNumber(origin.latitude, 0)) * metersPerDegreeLat,
    }));

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    polygonLocalMeters.forEach((point) => {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minZ = Math.min(minZ, point.z);
        maxZ = Math.max(maxZ, point.z);
    });

    const width = Math.max(maxX - minX, requestedResolutionMeters * 2, 4);
    const depth = Math.max(maxZ - minZ, requestedResolutionMeters * 2, 4);
    let cols = clamp(Math.ceil(width / requestedResolutionMeters) + 1, 4, OPEN_TOPO_DATA_MAX_GRID_DIMENSION);
    let rows = clamp(Math.ceil(depth / requestedResolutionMeters) + 1, 4, OPEN_TOPO_DATA_MAX_GRID_DIMENSION);
    const sampleCount = rows * cols;
    if (sampleCount > OPEN_TOPO_DATA_MAX_SAMPLES) {
        const scale = Math.sqrt(sampleCount / OPEN_TOPO_DATA_MAX_SAMPLES);
        cols = clamp(Math.ceil((cols - 1) / scale) + 1, 4, OPEN_TOPO_DATA_MAX_GRID_DIMENSION);
        rows = clamp(Math.ceil((rows - 1) / scale) + 1, 4, OPEN_TOPO_DATA_MAX_GRID_DIMENSION);
    }
    const stepX = width / Math.max(cols - 1, 1);
    const stepZ = depth / Math.max(rows - 1, 1);
    const effectiveResolutionMeters = Math.max(stepX, stepZ, requestedResolutionMeters);

    const samplePoints = [];
    for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
            const x = minX + stepX * col;
            const z = minZ + stepZ * row;
            const longitude = pickNumber(origin.longitude, 0) + x / metersPerDegreeLng;
            const latitude = pickNumber(origin.latitude, 0) + z / metersPerDegreeLat;
            samplePoints.push({
                x,
                z,
                longitude,
                latitude,
            });
        }
    }

    const cellMask = [];
    for (let row = 0; row < rows - 1; row += 1) {
        for (let col = 0; col < cols - 1; col += 1) {
            const center = {
                x: minX + stepX * (col + 0.5),
                z: minZ + stepZ * (row + 0.5),
            };
            cellMask.push(pointInPolygon(center, polygonLocalMeters) ? 1 : 0);
        }
    }

    return {
        origin,
        requestedResolutionMeters,
        effectiveResolutionMeters: round(effectiveResolutionMeters, 3),
        polygonLocalMeters,
        boundsMeters: {
            minX: round(minX, 3),
            maxX: round(maxX, 3),
            minZ: round(minZ, 3),
            maxZ: round(maxZ, 3),
            width: round(width, 3),
            depth: round(depth, 3),
        },
        rows,
        cols,
        samplePoints,
        cellMask,
    };
}

function chunkArray(values, size) {
    const chunks = [];
    for (let index = 0; index < values.length; index += size) {
        chunks.push(values.slice(index, index + size));
    }
    return chunks;
}

async function sampleElevationsFromOpenTopoData(samplePoints, options = {}, fetchImpl = globalThis.fetch) {
    if (typeof fetchImpl !== 'function') {
        throw new Error('当前运行环境缺少 fetch，无法请求公开 DEM 服务');
    }

    const timeoutMs = clamp(
        pickNumber(options.timeoutMs, OPEN_TOPO_DATA_TIMEOUT_MS),
        100,
        60000,
    );
    const controller = new AbortController();
    const deadlineAt = Date.now() + timeoutMs;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const externalSignal = options.signal;
    const abortFromExternal = () => controller.abort();
    if (externalSignal?.aborted) controller.abort();
    externalSignal?.addEventListener?.('abort', abortFromExternal, { once: true });

    const heights = [];
    const chunks = chunkArray(samplePoints, OPEN_TOPO_DATA_BATCH_SIZE);
    try {
      for (const chunk of chunks) {
        let lastStatus = 0;
        let response = null;
        for (let attempt = 0; attempt <= OPEN_TOPO_DATA_RETRY_COUNT; attempt += 1) {
            response = await withAbortSignal(fetchImpl(OPEN_TOPO_DATA_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    locations: chunk.map((point) => `${round(point.latitude, 6)},${round(point.longitude, 6)}`).join('|'),
                    interpolation: options.interpolation || OPEN_TOPO_DATA_INTERPOLATION,
                    nodata_value: -9999,
                }),
                signal: controller.signal,
            }), controller.signal);
            lastStatus = response.status;
            if (response.ok) break;
            if (attempt >= OPEN_TOPO_DATA_RETRY_COUNT || ![429, 500, 502, 503, 504].includes(response.status)) {
                throw new Error(`公开 DEM 服务请求失败：HTTP ${response.status}`);
            }
            const retryAfterSeconds = pickNumber(response.headers?.get?.('retry-after'), 0);
            const retryDelayMs = retryAfterSeconds > 0
                ? retryAfterSeconds * 1000
                : OPEN_TOPO_DATA_RETRY_DELAY_MS * (attempt + 1);
            const remainingMs = Math.max(0, deadlineAt - Date.now());
            await sleep(Math.min(retryDelayMs, remainingMs), controller.signal);
        }
        if (!response?.ok) {
            throw new Error(`公开 DEM 服务请求失败：HTTP ${lastStatus || 'unknown'}`);
        }
        const payload = await withAbortSignal(
            Promise.resolve().then(() => response.json()),
            controller.signal,
        );
        if (payload?.status !== 'OK' || !Array.isArray(payload?.results)) {
            throw new Error(`公开 DEM 服务返回异常：${payload?.error || payload?.status || 'unknown error'}`);
        }
        payload.results.forEach((item) => {
            const elevation = pickNumber(item?.elevation, Number.NaN);
            heights.push(Number.isFinite(elevation) && elevation !== -9999 ? elevation : null);
        });
      }
    } catch (error) {
        if (controller.signal.aborted && !externalSignal?.aborted) {
            throw new Error(`公开 DEM 服务请求超时（${timeoutMs}ms）`);
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
        externalSignal?.removeEventListener?.('abort', abortFromExternal);
    }
    return heights;
}

function fillMissingHeights(absoluteHeights) {
    const numericHeights = absoluteHeights.filter((value) => Number.isFinite(value));
    if (!numericHeights.length) {
        throw buildBadRequestError('公开 DEM 服务未返回任何有效高程');
    }
    const fallback = numericHeights.reduce((sum, value) => sum + value, 0) / numericHeights.length;
    return absoluteHeights.map((value) => (Number.isFinite(value) ? value : fallback));
}

export async function buildTerrainPatchForZone(zone, options = {}, fetchImpl = globalThis.fetch) {
    const grid = buildTerrainGridSpec(zone, options);
    const sampledHeights = await sampleElevationsFromOpenTopoData(grid.samplePoints, options, fetchImpl);
    if (sampledHeights.length !== grid.samplePoints.length) {
        throw new Error('公开 DEM 服务返回的高程点数量与采样网格不一致');
    }

    const absoluteHeights = fillMissingHeights(sampledHeights);
    const minElevationMeters = Math.min(...absoluteHeights);
    const maxElevationMeters = Math.max(...absoluteHeights);
    const heightDeltaMeters = Math.max(maxElevationMeters - minElevationMeters, 0);
    const heightsRelative = absoluteHeights.map((height) => round(height - minElevationMeters, 3));

    return {
        kind: 'terrain-grid-patch',
        source: 'opentopodata-srtm90m',
        sampledAt: new Date().toISOString(),
        rows: grid.rows,
        cols: grid.cols,
        requestedResolutionMeters: grid.requestedResolutionMeters,
        resolutionMeters: grid.effectiveResolutionMeters,
        boundsMeters: grid.boundsMeters,
        originWgs84: {
            latitude: pickNumber(grid.origin.latitude, 0),
            longitude: pickNumber(grid.origin.longitude, 0),
            height: pickNumber(grid.origin.height, 0),
        },
        polygonLocalMeters: grid.polygonLocalMeters.map((point) => ({
            x: round(point.x, 3),
            z: round(point.z, 3),
        })),
        heightsRelative,
        cellMask: grid.cellMask,
        elevationOffsetMeters: round(minElevationMeters, 3),
        minElevationMeters: round(minElevationMeters, 3),
        maxElevationMeters: round(maxElevationMeters, 3),
        heightDeltaMeters: round(heightDeltaMeters, 3),
        metadata: {
            apiUrl: OPEN_TOPO_DATA_API_URL,
            interpolation: options.interpolation || OPEN_TOPO_DATA_INTERPOLATION,
            sampleCount: grid.samplePoints.length,
        },
    };
}

function normalizeTerrainPatchRecord(terrainPatch) {
    const rows = Math.max(Math.floor(pickNumber(terrainPatch?.rows, 0)), 0);
    const cols = Math.max(Math.floor(pickNumber(terrainPatch?.cols, 0)), 0);
    const heightsRelative = ensureArray(terrainPatch?.heightsRelative)
        .slice(0, rows * cols)
        .map((value) => round(value, 4));

    if (rows < 2 || cols < 2) {
        throw buildBadRequestError('terrainPatch rows/cols 无效');
    }
    if (heightsRelative.length < rows * cols) {
        throw buildBadRequestError('terrainPatch heightsRelative 数据不足');
    }

    const cellCount = Math.max((rows - 1) * (cols - 1), 0);
    const cellMask = ensureArray(terrainPatch?.cellMask)
        .slice(0, cellCount)
        .map((value) => (pickNumber(value, 0) ? 1 : 0));

    return {
        kind: terrainPatch?.kind || 'terrain-grid-patch',
        source: terrainPatch?.source || 'terrain-patch',
        sampledAt: terrainPatch?.sampledAt || null,
        rows,
        cols,
        resolutionMeters: Math.max(pickNumber(terrainPatch?.resolutionMeters, 2), 0.1),
        boundsMeters: {
            minX: round(terrainPatch?.boundsMeters?.minX ?? -5, 4),
            maxX: round(terrainPatch?.boundsMeters?.maxX ?? 5, 4),
            minZ: round(terrainPatch?.boundsMeters?.minZ ?? -5, 4),
            maxZ: round(terrainPatch?.boundsMeters?.maxZ ?? 5, 4),
            width: round(terrainPatch?.boundsMeters?.width ?? 10, 4),
            depth: round(terrainPatch?.boundsMeters?.depth ?? 10, 4),
        },
        originWgs84: terrainPatch?.originWgs84 || null,
        polygonLocalMeters: ensureArray(terrainPatch?.polygonLocalMeters),
        heightsRelative,
        cellMask,
        elevationOffsetMeters: round(terrainPatch?.elevationOffsetMeters, 4),
        minElevationMeters: round(terrainPatch?.minElevationMeters ?? terrainPatch?.elevationOffsetMeters ?? 0, 4),
        maxElevationMeters: round(terrainPatch?.maxElevationMeters ?? terrainPatch?.elevationOffsetMeters ?? 0, 4),
        heightDeltaMeters: round(terrainPatch?.heightDeltaMeters, 4),
    };
}

export function terrainPatchToTerrainMesh(terrainPatch) {
    const normalized = normalizeTerrainPatchRecord(terrainPatch);
    const rows = normalized.rows;
    const cols = normalized.cols;
    const bounds = normalized.boundsMeters;
    const stepX = (bounds.maxX - bounds.minX) / Math.max(cols - 1, 1);
    const stepZ = (bounds.maxZ - bounds.minZ) / Math.max(rows - 1, 1);

    const vertices = [];
    for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
            const index = row * cols + col;
            vertices.push(
                round(bounds.minX + stepX * col, 4),
                normalized.heightsRelative[index],
                round(bounds.minZ + stepZ * row, 4),
            );
        }
    }

    const indices = [];
    for (let row = 0; row < rows - 1; row += 1) {
        for (let col = 0; col < cols - 1; col += 1) {
            const cellIndex = row * (cols - 1) + col;
            if (normalized.cellMask.length && !normalized.cellMask[cellIndex]) continue;
            const a = row * cols + col;
            const b = a + 1;
            const c = (row + 1) * cols + col;
            const d = c + 1;
            indices.push(a, c, b, b, c, d);
        }
    }

    if (!indices.length) {
        throw buildBadRequestError('terrainPatch 未生成任何有效地形网格面');
    }

    return {
        id: `terrain-mesh-${normalized.sampledAt || 'patch'}`.replace(/[^a-zA-Z0-9:_-]+/g, '-'),
        kind: 'terrain-grid',
        name: 'GIS 地形网格',
        vertices,
        indices,
        metadata: {
            source: normalized.source,
            sampledAt: normalized.sampledAt,
            rows,
            cols,
            resolutionMeters: normalized.resolutionMeters,
            elevationOffsetMeters: normalized.elevationOffsetMeters,
            minElevationMeters: normalized.minElevationMeters,
            maxElevationMeters: normalized.maxElevationMeters,
            heightDeltaMeters: normalized.heightDeltaMeters,
            boundsMeters: normalized.boundsMeters,
        },
    };
}

async function ensureScopedTerrainWorkZone(scope, zoneId) {
    const zone = await repo.getTerrainWorkZoneById(scope, zoneId);
    if (!zone) throw buildNotFoundError('地形工作区不存在');
    assertGenericWorkZoneMutationAllowed(zone);
    return zone;
}

export async function syncTerrainWorkZoneTerrainPatch(scope, actorUserId, zoneId, options = {}) {
    const zone = await ensureScopedTerrainWorkZone(scope, zoneId);
    const terrainPatch = await buildTerrainPatchForZone(zone, options, options.fetchImpl);
    const requestedResolution = Math.max(
        Math.round(pickNumber(terrainPatch.requestedResolutionMeters, zone.terrainResolution || 2)),
        1,
    );
    const snapshotJson = mergePlainObjects(zone.snapshotJson, {
        terrainPatch,
    });
    const metadata = mergePlainObjects(zone.metadata, {
        terrainPatchGeneratedAt: terrainPatch.sampledAt,
        terrainHeightDeltaMeters: terrainPatch.heightDeltaMeters,
        terrainElevationOffsetMeters: terrainPatch.elevationOffsetMeters,
        terrainPatchSource: terrainPatch.source,
        terrainRequestedResolutionMeters: requestedResolution,
        terrainActualResolutionMeters: terrainPatch.resolutionMeters,
    });

    const updatedZone = await repo.updateTerrainWorkZone(scope, zone.id, {
        snapshotJson,
        terrainResolution: requestedResolution,
        metadata,
        updatedBy: actorUserId ?? null,
    });

    return {
        zone: updatedZone,
        terrainPatch,
    };
}

export async function syncTerrainWorkZoneTerrainMesh(scope, actorUserId, zoneId, options = {}) {
    let zone = await ensureScopedTerrainWorkZone(scope, zoneId);
    let terrainPatch = zone?.snapshotJson?.terrainPatch;

    if (!terrainPatch || options.forceTerrainPatch) {
        const patchResult = await syncTerrainWorkZoneTerrainPatch(scope, actorUserId, zoneId, options);
        zone = patchResult.zone;
        terrainPatch = patchResult.terrainPatch;
    }

    const terrainMesh = terrainPatchToTerrainMesh(terrainPatch);
    const snapshotJson = mergePlainObjects(zone.snapshotJson, {
        terrainPatch,
        terrainMesh,
    });
    const metadata = mergePlainObjects(zone.metadata, {
        terrainPatchGeneratedAt: terrainPatch.sampledAt || zone.metadata?.terrainPatchGeneratedAt || null,
        terrainHeightDeltaMeters: terrainPatch.heightDeltaMeters || zone.metadata?.terrainHeightDeltaMeters || 0,
        terrainMeshId: terrainMesh.id,
        terrainVertexCount: Math.floor(terrainMesh.vertices.length / 3),
        terrainTriangleCount: Math.floor(terrainMesh.indices.length / 3),
        terrainMeshSampledAt: terrainMesh.metadata.sampledAt || null,
    });

    const updatedZone = await repo.updateTerrainWorkZone(scope, zone.id, {
        snapshotJson,
        metadata,
        updatedBy: actorUserId ?? null,
    });

    return {
        zone: updatedZone,
        terrainPatch,
        terrainMesh,
    };
}
