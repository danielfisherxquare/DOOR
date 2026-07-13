import * as repo from './inventory.spatial.repository.js';
import { assertGenericWorkZoneMutationAllowed } from './inventory.spatial.site-mode-guard.js';

const DEFAULT_OVERPASS_URLS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
];
const DEFAULT_TIMEOUT_MS = 18000;
const DEFAULT_MAX_BUILDINGS = 450;
const DEFAULT_MAX_BUILDING_MAJOR_METERS = 240;
const DEFAULT_MAX_BUILDING_AREA_SQM = 20000;
const DEFAULT_MAX_RIBBON_MAJOR_METERS = 120;
const DEFAULT_MAX_RIBBON_ASPECT_RATIO = 12;
const DEFAULT_BUILDING_PART_MIN_COVERAGE = 0.35;
const DEFAULT_PIPELINE_VERSION = 'osm-normalize-v2-diagnostics';
const DEFAULT_MAX_DIAGNOSTIC_SAMPLES = 24;

const ensureArray = (value) => (Array.isArray(value) ? value : []);

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

function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergePlainObjects(baseValue, extraValue) {
    return {
        ...(isPlainObject(baseValue) ? baseValue : {}),
        ...(isPlainObject(extraValue) ? extraValue : {}),
    };
}

function pickNumber(value, fallback = 0) {
    const nextValue = Number(value);
    return Number.isFinite(nextValue) ? nextValue : fallback;
}

function getPolygonRing(polygon) {
    const ring = ensureArray(polygon?.coordinates?.[0]);
    if (ring.length < 3) return [];
    const closed = ring[0]?.[0] === ring[ring.length - 1]?.[0] && ring[0]?.[1] === ring[ring.length - 1]?.[1];
    return closed ? ring.slice(0, -1) : ring;
}

function sameCoordinate(left, right) {
    return pickNumber(left?.[0], null) === pickNumber(right?.[0], null)
        && pickNumber(left?.[1], null) === pickNumber(right?.[1], null);
}

function normalizeCoordinateRing(ring) {
    const normalized = [];
    for (const point of ensureArray(ring)) {
        const longitude = pickNumber(point?.[0], null);
        const latitude = pickNumber(point?.[1], null);
        if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;
        const nextPoint = [longitude, latitude];
        if (normalized.length && sameCoordinate(normalized[normalized.length - 1], nextPoint)) continue;
        normalized.push(nextPoint);
    }
    while (normalized.length > 1 && sameCoordinate(normalized[0], normalized[normalized.length - 1])) {
        normalized.pop();
    }
    return normalized;
}

function pointInPolygon(point, ring) {
    let inside = false;
    for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current, current += 1) {
        const xi = pickNumber(ring[current]?.[0], 0);
        const yi = pickNumber(ring[current]?.[1], 0);
        const xj = pickNumber(ring[previous]?.[0], 0);
        const yj = pickNumber(ring[previous]?.[1], 0);
        const intersects = ((yi > point.latitude) !== (yj > point.latitude))
            && (point.longitude < ((xj - xi) * (point.latitude - yi)) / ((yj - yi) || 1e-9) + xi);
        if (intersects) inside = !inside;
    }
    return inside;
}

function centroidOfRing(ring) {
    if (!ring.length) return null;
    const sum = ring.reduce((acc, coord) => ({
        longitude: acc.longitude + pickNumber(coord?.[0], 0),
        latitude: acc.latitude + pickNumber(coord?.[1], 0),
    }), { longitude: 0, latitude: 0 });
    return {
        longitude: sum.longitude / ring.length,
        latitude: sum.latitude / ring.length,
    };
}

function footprintTouchesRing(footprint, ring) {
    if (ring.length < 3) return true;
    const centroid = centroidOfRing(footprint);
    if (centroid && pointInPolygon(centroid, ring)) return true;
    return footprint.some(([longitude, latitude]) => pointInPolygon({ longitude, latitude }, ring));
}

function parseMeters(value, fallback = null) {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
    const normalized = String(value).trim().toLowerCase().replace(',', '.');
    const feet = normalized.match(/^(-?\d+(?:\.\d+)?)\s*(?:ft|feet|')$/);
    if (feet) return pickNumber(feet[1], 0) * 0.3048;
    const meters = normalized.match(/-?\d+(?:\.\d+)?/);
    return meters ? pickNumber(meters[0], fallback) : fallback;
}

function parseLevels(value) {
    const levels = Number.parseFloat(String(value || '').replace(',', '.'));
    return Number.isFinite(levels) && levels > 0 ? levels : null;
}

function coordinateRingToLocalMeters(ring, origin) {
    const metersPerDegreeLat = 111320;
    const metersPerDegreeLng = metersPerDegreeLat * Math.cos((pickNumber(origin?.latitude, 0) * Math.PI) / 180) || 1;
    return ring.map(([longitude, latitude]) => ({
        x: (pickNumber(longitude, 0) - pickNumber(origin?.longitude, 0)) * metersPerDegreeLng,
        z: (pickNumber(latitude, 0) - pickNumber(origin?.latitude, 0)) * metersPerDegreeLat,
    }));
}

function polygonAreaSqm(points) {
    let area = 0;
    for (let index = 0; index < points.length; index += 1) {
        const current = points[index];
        const next = points[(index + 1) % points.length];
        area += current.x * next.z - next.x * current.z;
    }
    return Math.abs(area) / 2;
}

function boundsFromLocalPoints(points) {
    if (!points.length) return { width: 0, depth: 0 };
    const xs = points.map((point) => point.x);
    const zs = points.map((point) => point.z);
    return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minZ: Math.min(...zs),
        maxZ: Math.max(...zs),
        width: Math.max(...xs) - Math.min(...xs),
        depth: Math.max(...zs) - Math.min(...zs),
    };
}

function validateBuildingFootprint(footprint, ring, options = {}) {
    return !getBuildingFootprintRejection(footprint, ring, options);
}

function getBuildingFootprintRejection(footprint, ring, options = {}) {
    if (footprint.length < 3) return { reason: 'tooFewPoints', areaSqm: 0, majorMeters: 0, aspectRatio: 0 };
    const origin = centroidOfRing(ring) || centroidOfRing(footprint) || { longitude: 0, latitude: 0 };
    const local = coordinateRingToLocalMeters(footprint, origin);
    const bounds = boundsFromLocalPoints(local);
    const area = polygonAreaSqm(local);
    const major = Math.max(bounds.width, bounds.depth);
    const minor = Math.max(Math.min(bounds.width, bounds.depth), 0.01);
    const aspectRatio = major / minor;
    const maxMajor = Math.max(pickNumber(options.maxBuildingMajorMeters, DEFAULT_MAX_BUILDING_MAJOR_METERS), 20);
    const maxArea = Math.max(pickNumber(options.maxBuildingAreaSqm, DEFAULT_MAX_BUILDING_AREA_SQM), 100);
    const maxRibbonMajor = Math.max(pickNumber(options.maxRibbonMajorMeters, DEFAULT_MAX_RIBBON_MAJOR_METERS), 20);
    const maxRibbonAspect = Math.max(pickNumber(options.maxRibbonAspectRatio, DEFAULT_MAX_RIBBON_ASPECT_RATIO), 2);

    if (major > maxMajor) return { reason: 'majorTooLong', areaSqm: area, majorMeters: major, aspectRatio };
    if (area > maxArea) return { reason: 'areaTooLarge', areaSqm: area, majorMeters: major, aspectRatio };
    if (major > maxRibbonMajor && aspectRatio > maxRibbonAspect) {
        return { reason: 'ribbonLike', areaSqm: area, majorMeters: major, aspectRatio };
    }
    return null;
}

function normalizeTagValue(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isRenderableBuildingTag(tags = {}) {
    const partType = normalizeTagValue(tags['building:part']);
    if (partType) return partType !== 'no' && partType !== 'roof';
    const buildingType = normalizeTagValue(tags.building);
    return Boolean(buildingType) && buildingType !== 'no' && buildingType !== 'roof';
}

function getBuildingRenderKind(tags = {}) {
    return normalizeTagValue(tags['building:part']) ? 'building-part' : 'building-outline';
}

function boundingBoxesOverlap(left, right) {
    return left.minX <= right.maxX
        && left.maxX >= right.minX
        && left.minZ <= right.maxZ
        && left.maxZ >= right.minZ;
}

function footprintMetrics(footprint, ring) {
    const origin = centroidOfRing(ring) || centroidOfRing(footprint) || { longitude: 0, latitude: 0 };
    const local = coordinateRingToLocalMeters(footprint, origin);
    const bounds = boundsFromLocalPoints(local);
    const areaSqm = polygonAreaSqm(local);
    return {
        centroid: centroidOfRing(footprint),
        areaSqm,
        bounds,
        major: Math.max(bounds.width, bounds.depth),
        minor: Math.max(Math.min(bounds.width, bounds.depth), 0.01),
    };
}

function isSameBuildingGeometry(left, right) {
    const leftCentroid = left?.metrics?.centroid;
    const rightCentroid = right?.metrics?.centroid;
    if (!leftCentroid || !rightCentroid) return false;
    const centroidDistance = Math.hypot(
        pickNumber(leftCentroid.longitude, 0) - pickNumber(rightCentroid.longitude, 0),
        pickNumber(leftCentroid.latitude, 0) - pickNumber(rightCentroid.latitude, 0),
    );
    const leftArea = Math.max(left?.metrics?.areaSqm || 0, 1);
    const rightArea = Math.max(right?.metrics?.areaSqm || 0, 1);
    const areaRatio = Math.min(leftArea, rightArea) / Math.max(leftArea, rightArea);
    return centroidDistance < 0.00001 && areaRatio >= 0.82;
}

function shouldSuppressBuildingOutline(candidate, buildingParts, options = {}) {
    if (candidate.renderKind !== 'building-outline') return false;
    if (!candidate.metrics?.centroid) return false;
    const containedParts = buildingParts.filter((part) => {
        if (part.osmType === candidate.osmType && part.osmId === candidate.osmId) return true;
        if (!boundingBoxesOverlap(candidate.metrics.bounds, part.metrics.bounds)) return false;
        if (isSameBuildingGeometry(candidate, part)) return true;
        return Boolean(part.metrics.centroid) && pointInPolygon(part.metrics.centroid, candidate.footprint);
    });

    if (!containedParts.length) return false;
    if (containedParts.some((part) => isSameBuildingGeometry(candidate, part))) return true;

    const coverage = containedParts.reduce((sum, part) => sum + (part.metrics.areaSqm || 0), 0) / Math.max(candidate.metrics.areaSqm || 0, 1);
    const minCoverage = Math.max(pickNumber(options.buildingPartMinCoverage, DEFAULT_BUILDING_PART_MIN_COVERAGE), 0.05);
    return containedParts.length >= 2 || coverage >= minCoverage;
}

function inferBuildingHeight(tags = {}) {
    const explicitHeight = parseMeters(tags.height || tags['building:height'] || tags['roof:height'], null);
    if (explicitHeight && explicitHeight > 0) return Math.min(Math.max(explicitHeight, 2.8), 260);
    const levels = parseLevels(tags['building:levels'] || tags.levels);
    if (levels) return Math.min(Math.max(levels * 3.2, 2.8), 260);
    return 9.6;
}

function reverseRing(ring) {
    return [...ring].reverse();
}

function stitchCoordinateRings(rings) {
    const pending = rings.map((ring) => normalizeCoordinateRing(ring)).filter((ring) => ring.length >= 2);
    if (!pending.length) return [];
    let stitched = pending.shift();
    let changed = true;

    while (pending.length && changed) {
        changed = false;
        for (let index = 0; index < pending.length; index += 1) {
            const ring = pending[index];
            const stitchedStart = stitched[0];
            const stitchedEnd = stitched[stitched.length - 1];
            const ringStart = ring[0];
            const ringEnd = ring[ring.length - 1];

            if (sameCoordinate(stitchedEnd, ringStart)) {
                stitched = [...stitched, ...ring.slice(1)];
            } else if (sameCoordinate(stitchedEnd, ringEnd)) {
                stitched = [...stitched, ...reverseRing(ring).slice(1)];
            } else if (sameCoordinate(stitchedStart, ringEnd)) {
                stitched = [...ring.slice(0, -1), ...stitched];
            } else if (sameCoordinate(stitchedStart, ringStart)) {
                stitched = [...reverseRing(ring).slice(0, -1), ...stitched];
            } else {
                continue;
            }

            pending.splice(index, 1);
            changed = true;
            break;
        }
    }

    return normalizeCoordinateRing(stitched);
}

function normalizeFootprintsFromElement(element) {
    const geometry = ensureArray(element?.geometry);
    if (geometry.length >= 3) {
        return [normalizeCoordinateRing(geometry
            .map((point) => [pickNumber(point.lon, null), pickNumber(point.lat, null)])
            .filter(([longitude, latitude]) => Number.isFinite(longitude) && Number.isFinite(latitude)))];
    }
    if (element?.type !== 'relation') return [];

    const outerRings = ensureArray(element?.members)
        .filter((member) => member?.role === 'outer' && ensureArray(member?.geometry).length >= 2)
        .map((member) => normalizeCoordinateRing(member.geometry
            .map((point) => [pickNumber(point.lon, null), pickNumber(point.lat, null)])
            .filter(([longitude, latitude]) => Number.isFinite(longitude) && Number.isFinite(latitude))))
        .filter((ring) => ring.length >= 2);

    if (!outerRings.length) return [];
    if (outerRings.length === 1 && outerRings[0].length >= 3) return [outerRings[0]];

    const stitched = stitchCoordinateRings(outerRings);
    if (stitched.length >= 3) return [stitched];

    return outerRings.filter((ring) => ring.length >= 3);
}

function buildOverpassPolygonString(ring) {
    return ring
        .map(([longitude, latitude]) => `${pickNumber(latitude, 0)} ${pickNumber(longitude, 0)}`)
        .join(' ');
}

function getBoundingBoxFromRing(ring) {
    const longitudes = ring.map((point) => pickNumber(point?.[0], null)).filter(Number.isFinite);
    const latitudes = ring.map((point) => pickNumber(point?.[1], null)).filter(Number.isFinite);
    if (!longitudes.length || !latitudes.length) {
        throw buildBadRequestError('选区缺少有效 Polygon，无法请求 OSM 建筑');
    }
    return {
        south: Math.min(...latitudes),
        west: Math.min(...longitudes),
        north: Math.max(...latitudes),
        east: Math.max(...longitudes),
    };
}

function normalizeFetchOptions(options = {}) {
    const candidateUrls = ensureArray(options.overpassUrls).filter(Boolean);
    if (options.overpassUrl) candidateUrls.unshift(options.overpassUrl);
    return {
        overpassUrls: candidateUrls.length ? candidateUrls : DEFAULT_OVERPASS_URLS,
        timeoutMs: Math.max(pickNumber(options.timeoutMs, DEFAULT_TIMEOUT_MS), 1000),
        maxBuildings: Math.max(Math.floor(pickNumber(options.maxBuildings, DEFAULT_MAX_BUILDINGS)), 1),
        maxBuildingMajorMeters: Math.max(pickNumber(options.maxBuildingMajorMeters, DEFAULT_MAX_BUILDING_MAJOR_METERS), 20),
        maxBuildingAreaSqm: Math.max(pickNumber(options.maxBuildingAreaSqm, DEFAULT_MAX_BUILDING_AREA_SQM), 100),
        maxRibbonMajorMeters: Math.max(pickNumber(options.maxRibbonMajorMeters, DEFAULT_MAX_RIBBON_MAJOR_METERS), 20),
        maxRibbonAspectRatio: Math.max(pickNumber(options.maxRibbonAspectRatio, DEFAULT_MAX_RIBBON_ASPECT_RATIO), 2),
        buildingPartMinCoverage: Math.max(pickNumber(options.buildingPartMinCoverage, DEFAULT_BUILDING_PART_MIN_COVERAGE), 0.05),
    };
}

export function buildOverpassBuildingQuery(clipPolygonWgs84) {
    const ring = getPolygonRing(clipPolygonWgs84);
    if (ring.length < 3) throw buildBadRequestError('选区缺少有效 Polygon，无法请求 OSM 建筑');
    const { south, west, north, east } = getBoundingBoxFromRing(ring);
    return `[out:json][timeout:25];
(
  way["building"](${south},${west},${north},${east});
  relation["building"](${south},${west},${north},${east});
  way["building:part"](${south},${west},${north},${east});
  relation["building:part"](${south},${west},${north},${east});
);
out body geom;`;
}

function createOsmDiagnostics(overpassJson, options = {}) {
    return {
        rawElementCount: ensureArray(overpassJson?.elements).length,
        rawWayCount: 0,
        rawRelationCount: 0,
        renderableElementCount: 0,
        footprintCount: 0,
        acceptedBeforePartSuppression: 0,
        suppressedByBuildingParts: 0,
        returnedCount: 0,
        truncatedByMaxBuildings: false,
        limits: {
            maxBuildings: options.maxBuildings,
            maxBuildingMajorMeters: options.maxBuildingMajorMeters,
            maxBuildingAreaSqm: options.maxBuildingAreaSqm,
            maxRibbonMajorMeters: options.maxRibbonMajorMeters,
            maxRibbonAspectRatio: options.maxRibbonAspectRatio,
            buildingPartMinCoverage: options.buildingPartMinCoverage,
        },
        filters: {
            unsupportedElement: 0,
            nonRenderableTag: 0,
            noFootprint: 0,
            tooFewPoints: 0,
            outsideSelection: 0,
            majorTooLong: 0,
            areaTooLarge: 0,
            ribbonLike: 0,
            suppressedByBuildingParts: 0,
            truncatedByMaxBuildings: 0,
        },
        samples: [],
    };
}

function pushDiagnosticSample(diagnostics, reason, element, extra = {}) {
    if (!diagnostics || diagnostics.samples.length >= DEFAULT_MAX_DIAGNOSTIC_SAMPLES) return;
    diagnostics.samples.push({
        reason,
        osmType: element?.type || element?.osmType || null,
        osmId: element?.id || element?.osmId || null,
        name: element?.tags?.name || element?.tags?.['addr:housename'] || element?.name || null,
        building: element?.tags?.building || element?.tags?.buildingType || null,
        buildingPart: element?.tags?.['building:part'] || element?.tags?.buildingPart || null,
        ...extra,
    });
}

export function normalizeOverpassBuildingsWithDiagnostics(overpassJson, focusZone, options = {}) {
    const ring = getPolygonRing(focusZone?.clipPolygonWgs84);
    const normalizedOptions = normalizeFetchOptions(options);
    const maxBuildings = normalizedOptions.maxBuildings;
    const candidates = [];
    const diagnostics = createOsmDiagnostics(overpassJson, normalizedOptions);

    for (const element of ensureArray(overpassJson?.elements)) {
        if (element?.type === 'way') diagnostics.rawWayCount += 1;
        if (element?.type === 'relation') diagnostics.rawRelationCount += 1;
        if (element?.type !== 'way' && element?.type !== 'relation') {
            diagnostics.filters.unsupportedElement += 1;
            continue;
        }
        const tags = element.tags || {};
        if (!isRenderableBuildingTag(tags)) {
            diagnostics.filters.nonRenderableTag += 1;
            continue;
        }
        diagnostics.renderableElementCount += 1;

        const footprints = normalizeFootprintsFromElement(element);
        if (!footprints.length) {
            diagnostics.filters.noFootprint += 1;
            pushDiagnosticSample(diagnostics, 'noFootprint', element);
            continue;
        }
        diagnostics.footprintCount += footprints.length;

        for (const [footprintIndex, footprint] of footprints.entries()) {
            if (footprint.length < 3) {
                diagnostics.filters.tooFewPoints += 1;
                pushDiagnosticSample(diagnostics, 'tooFewPoints', element, { footprintIndex });
                continue;
            }
            if (!footprintTouchesRing(footprint, ring)) {
                diagnostics.filters.outsideSelection += 1;
                continue;
            }
            const footprintRejection = getBuildingFootprintRejection(footprint, ring, normalizedOptions);
            if (footprintRejection) {
                diagnostics.filters[footprintRejection.reason] = (diagnostics.filters[footprintRejection.reason] || 0) + 1;
                pushDiagnosticSample(diagnostics, footprintRejection.reason, element, {
                    footprintIndex,
                    areaSqm: Number((footprintRejection.areaSqm || 0).toFixed(2)),
                    majorMeters: Number((footprintRejection.majorMeters || 0).toFixed(2)),
                    aspectRatio: Number((footprintRejection.aspectRatio || 0).toFixed(2)),
                });
                continue;
            }
            const metrics = footprintMetrics(footprint, ring);
            candidates.push({
                id: `osm-${element.id}${footprintIndex > 0 ? `-${footprintIndex + 1}` : ''}`,
                osmType: element.type,
                osmId: element.id,
                renderKind: getBuildingRenderKind(tags),
                isBuildingPart: getBuildingRenderKind(tags) === 'building-part',
                name: tags.name || tags['addr:housename'] || `OSM 建筑 ${element.id}`,
                buildingType: tags['building:part'] || tags.building || 'yes',
                heightMeters: Number(inferBuildingHeight(tags).toFixed(3)),
                levels: parseLevels(tags['building:levels'] || tags.levels),
                minHeightMeters: parseMeters(tags.min_height || tags['building:min_level'], 0) || 0,
                footprint,
                metrics,
                footprintWgs84: {
                    type: 'Polygon',
                    coordinates: [[...footprint, footprint[0]]],
                },
                tags: {
                    building: tags.building || null,
                    buildingPart: tags['building:part'] || null,
                    height: tags.height || null,
                    buildingLevels: tags['building:levels'] || null,
                },
            });
        }
    }

    const buildingParts = candidates.filter((candidate) => candidate.isBuildingPart);
    diagnostics.acceptedBeforePartSuppression = candidates.length;
    const afterSuppression = candidates
        .filter((candidate) => {
            const suppressed = shouldSuppressBuildingOutline(candidate, buildingParts, normalizedOptions);
            if (suppressed) {
                diagnostics.suppressedByBuildingParts += 1;
                diagnostics.filters.suppressedByBuildingParts += 1;
                pushDiagnosticSample(diagnostics, 'suppressedByBuildingParts', candidate, {
                    areaSqm: Number((candidate.metrics?.areaSqm || 0).toFixed(2)),
                    majorMeters: Number((candidate.metrics?.major || 0).toFixed(2)),
                });
            }
            return !suppressed;
        });
    diagnostics.truncatedByMaxBuildings = afterSuppression.length > maxBuildings;
    diagnostics.filters.truncatedByMaxBuildings = diagnostics.truncatedByMaxBuildings
        ? afterSuppression.length - maxBuildings
        : 0;
    const buildings = afterSuppression
        .slice(0, maxBuildings)
        .map((candidate) => ({
            id: candidate.id,
            osmType: candidate.osmType,
            osmId: candidate.osmId,
            renderKind: candidate.renderKind,
            isBuildingPart: candidate.isBuildingPart,
            name: candidate.name,
            buildingType: candidate.buildingType,
            heightMeters: candidate.heightMeters,
            levels: candidate.levels,
            minHeightMeters: candidate.minHeightMeters,
            footprintWgs84: candidate.footprintWgs84,
            tags: candidate.tags,
        }));
    diagnostics.returnedCount = buildings.length;
    return { buildings, diagnostics };
}

export function normalizeOverpassBuildings(overpassJson, focusZone, options = {}) {
    return normalizeOverpassBuildingsWithDiagnostics(overpassJson, focusZone, options).buildings;
}

async function ensureScopedTerrainWorkZone(scope, zoneId) {
    const zone = await repo.getTerrainWorkZoneById(scope, zoneId);
    if (!zone) throw buildNotFoundError('地形工作区不存在');
    assertGenericWorkZoneMutationAllowed(zone);
    return zone;
}

export async function fetchOsmBuildingsForFocusZone(focusZone, options = {}) {
    const normalizedOptions = normalizeFetchOptions(options);
    const query = buildOverpassBuildingQuery(focusZone?.clipPolygonWgs84);
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), normalizedOptions.timeoutMs);
    const attemptErrors = [];

    try {
        for (const overpassUrl of normalizedOptions.overpassUrls) {
            const response = await fetch(overpassUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                    Accept: 'application/json,text/plain,*/*',
                    'User-Agent': 'door-gis-export/1.0',
                },
                body: new URLSearchParams({ data: query }),
                signal: controller.signal,
            });
            if (!response.ok) {
                attemptErrors.push(`${overpassUrl} -> ${response.status}`);
                continue;
            }
            const json = await response.json();
            const { buildings, diagnostics } = normalizeOverpassBuildingsWithDiagnostics(json, focusZone, normalizedOptions);
            return {
                kind: 'osm-building-footprints',
                source: 'overpass-api',
                overpassUrl,
                fetchedAt: new Date().toISOString(),
                query,
                count: buildings.length,
                pipelineVersion: DEFAULT_PIPELINE_VERSION,
                diagnostics,
                buildings,
            };
        }
        throw new Error(`OSM Overpass 请求失败：${attemptErrors.join('; ')}`);
    } finally {
        globalThis.clearTimeout(timeout);
    }
}

export async function syncTerrainWorkZoneOsmBuildings(scope, actorUserId, zoneId, options = {}) {
    const zone = await ensureScopedTerrainWorkZone(scope, zoneId);
    const osmBuildings = await fetchOsmBuildingsForFocusZone(zone, options);

    const snapshotJson = mergePlainObjects(zone.snapshotJson, {
        osmBuildings,
    });
    const metadata = mergePlainObjects(zone.metadata, {
        osmBuildingCount: osmBuildings.count,
        osmBuildingsFetchedAt: osmBuildings.fetchedAt,
        osmPipelineVersion: osmBuildings.pipelineVersion,
        osmDiagnostics: osmBuildings.diagnostics || null,
    });

    const updatedZone = await repo.updateTerrainWorkZone(scope, zone.id, {
        snapshotJson,
        metadata,
        updatedBy: actorUserId ?? null,
    });

    return {
        zone: updatedZone,
        osmBuildings,
    };
}
