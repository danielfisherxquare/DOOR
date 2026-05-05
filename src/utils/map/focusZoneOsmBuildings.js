const DEFAULT_OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const DEFAULT_TIMEOUT_MS = 18000
const DEFAULT_MAX_BUILDINGS = 450
const DEFAULT_MAX_BUILDING_MAJOR_METERS = 240
const DEFAULT_MAX_BUILDING_AREA_SQM = 20000
const DEFAULT_MAX_RIBBON_MAJOR_METERS = 120
const DEFAULT_MAX_RIBBON_ASPECT_RATIO = 12
const DEFAULT_BUILDING_PART_MIN_COVERAGE = 0.35

const ensureArray = (value) => (Array.isArray(value) ? value : [])

function pickNumber(value, fallback = 0) {
  const nextValue = Number(value)
  return Number.isFinite(nextValue) ? nextValue : fallback
}

function getPolygonRing(polygon) {
  const ring = ensureArray(polygon?.coordinates?.[0])
  if (ring.length < 3) return []
  const closed = ring[0]?.[0] === ring[ring.length - 1]?.[0] && ring[0]?.[1] === ring[ring.length - 1]?.[1]
  return closed ? ring.slice(0, -1) : ring
}

function sameCoordinate(left, right) {
  return pickNumber(left?.[0], null) === pickNumber(right?.[0], null)
    && pickNumber(left?.[1], null) === pickNumber(right?.[1], null)
}

function normalizeCoordinateRing(ring) {
  const normalized = []
  for (const point of ensureArray(ring)) {
    const longitude = pickNumber(point?.[0], null)
    const latitude = pickNumber(point?.[1], null)
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue
    const nextPoint = [longitude, latitude]
    if (normalized.length && sameCoordinate(normalized[normalized.length - 1], nextPoint)) continue
    normalized.push(nextPoint)
  }
  while (normalized.length > 1 && sameCoordinate(normalized[0], normalized[normalized.length - 1])) {
    normalized.pop()
  }
  return normalized
}

function pointInPolygon(point, ring) {
  let inside = false
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current, current += 1) {
    const xi = pickNumber(ring[current]?.[0], 0)
    const yi = pickNumber(ring[current]?.[1], 0)
    const xj = pickNumber(ring[previous]?.[0], 0)
    const yj = pickNumber(ring[previous]?.[1], 0)
    const intersects = ((yi > point.latitude) !== (yj > point.latitude))
      && (point.longitude < ((xj - xi) * (point.latitude - yi)) / ((yj - yi) || 1e-9) + xi)
    if (intersects) inside = !inside
  }
  return inside
}

function footprintTouchesRing(footprint, ring) {
  if (ring.length < 3) return true
  const centroid = centroidOfRing(footprint)
  if (centroid && pointInPolygon(centroid, ring)) return true
  return footprint.some(([longitude, latitude]) => pointInPolygon({ longitude, latitude }, ring))
}

function centroidOfRing(ring) {
  if (!ring.length) return null
  const sum = ring.reduce((acc, coord) => ({
    longitude: acc.longitude + pickNumber(coord?.[0], 0),
    latitude: acc.latitude + pickNumber(coord?.[1], 0),
  }), { longitude: 0, latitude: 0 })
  return {
    longitude: sum.longitude / ring.length,
    latitude: sum.latitude / ring.length,
  }
}

function parseMeters(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  const normalized = String(value).trim().toLowerCase().replace(',', '.')
  const feet = normalized.match(/^(-?\d+(?:\.\d+)?)\s*(?:ft|feet|')$/)
  if (feet) return pickNumber(feet[1], 0) * 0.3048
  const meters = normalized.match(/-?\d+(?:\.\d+)?/)
  return meters ? pickNumber(meters[0], fallback) : fallback
}

function parseLevels(value) {
  const levels = Number.parseFloat(String(value || '').replace(',', '.'))
  return Number.isFinite(levels) && levels > 0 ? levels : null
}

function coordinateRingToLocalMeters(ring, origin) {
  const metersPerDegreeLat = 111320
  const metersPerDegreeLng = metersPerDegreeLat * Math.cos((pickNumber(origin?.latitude, 0) * Math.PI) / 180) || 1
  return ring.map(([longitude, latitude]) => ({
    x: (pickNumber(longitude, 0) - pickNumber(origin?.longitude, 0)) * metersPerDegreeLng,
    z: (pickNumber(latitude, 0) - pickNumber(origin?.latitude, 0)) * metersPerDegreeLat,
  }))
}

function polygonAreaSqm(points) {
  let area = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    area += current.x * next.z - next.x * current.z
  }
  return Math.abs(area) / 2
}

function boundsFromLocalPoints(points) {
  if (!points.length) return { width: 0, depth: 0 }
  const xs = points.map((point) => point.x)
  const zs = points.map((point) => point.z)
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
    width: Math.max(...xs) - Math.min(...xs),
    depth: Math.max(...zs) - Math.min(...zs),
  }
}

function validateBuildingFootprint(footprint, ring, options = {}) {
  if (footprint.length < 3) return false
  const origin = centroidOfRing(ring) || centroidOfRing(footprint) || { longitude: 0, latitude: 0 }
  const local = coordinateRingToLocalMeters(footprint, origin)
  const bounds = boundsFromLocalPoints(local)
  const area = polygonAreaSqm(local)
  const major = Math.max(bounds.width, bounds.depth)
  const minor = Math.max(Math.min(bounds.width, bounds.depth), 0.01)
  const aspectRatio = major / minor
  const maxMajor = Math.max(pickNumber(options.maxBuildingMajorMeters, DEFAULT_MAX_BUILDING_MAJOR_METERS), 20)
  const maxArea = Math.max(pickNumber(options.maxBuildingAreaSqm, DEFAULT_MAX_BUILDING_AREA_SQM), 100)
  const maxRibbonMajor = Math.max(pickNumber(options.maxRibbonMajorMeters, DEFAULT_MAX_RIBBON_MAJOR_METERS), 20)
  const maxRibbonAspect = Math.max(pickNumber(options.maxRibbonAspectRatio, DEFAULT_MAX_RIBBON_ASPECT_RATIO), 2)

  if (major > maxMajor) return false
  if (area > maxArea) return false
  if (major > maxRibbonMajor && aspectRatio > maxRibbonAspect) return false
  return true
}

function normalizeTagValue(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function isRenderableBuildingTag(tags = {}) {
  const partType = normalizeTagValue(tags['building:part'])
  if (partType) {
    return partType !== 'no' && partType !== 'roof'
  }
  const buildingType = normalizeTagValue(tags.building)
  return Boolean(buildingType) && buildingType !== 'no' && buildingType !== 'roof'
}

function getBuildingRenderKind(tags = {}) {
  return normalizeTagValue(tags['building:part']) ? 'building-part' : 'building-outline'
}

function boundingBoxesOverlap(left, right) {
  return left.minX <= right.maxX
    && left.maxX >= right.minX
    && left.minZ <= right.maxZ
    && left.maxZ >= right.minZ
}

function footprintMetrics(footprint, ring) {
  const origin = centroidOfRing(ring) || centroidOfRing(footprint) || { longitude: 0, latitude: 0 }
  const local = coordinateRingToLocalMeters(footprint, origin)
  const bounds = boundsFromLocalPoints(local)
  const areaSqm = polygonAreaSqm(local)
  return {
    centroid: centroidOfRing(footprint),
    areaSqm,
    bounds,
    major: Math.max(bounds.width, bounds.depth),
    minor: Math.max(Math.min(bounds.width, bounds.depth), 0.01),
  }
}

function isSameBuildingGeometry(left, right) {
  const leftCentroid = left?.metrics?.centroid
  const rightCentroid = right?.metrics?.centroid
  if (!leftCentroid || !rightCentroid) return false
  const centroidDistance = Math.hypot(
    pickNumber(leftCentroid.longitude, 0) - pickNumber(rightCentroid.longitude, 0),
    pickNumber(leftCentroid.latitude, 0) - pickNumber(rightCentroid.latitude, 0),
  )
  const leftArea = Math.max(left?.metrics?.areaSqm || 0, 1)
  const rightArea = Math.max(right?.metrics?.areaSqm || 0, 1)
  const areaRatio = Math.min(leftArea, rightArea) / Math.max(leftArea, rightArea)
  return centroidDistance < 0.00001 && areaRatio >= 0.82
}

function shouldSuppressBuildingOutline(candidate, buildingParts, options = {}) {
  if (candidate.renderKind !== 'building-outline') return false
  if (!candidate.metrics?.centroid) return false
  const containedParts = buildingParts.filter((part) => {
    if (part.osmType === candidate.osmType && part.osmId === candidate.osmId) return true
    if (!boundingBoxesOverlap(candidate.metrics.bounds, part.metrics.bounds)) return false
    if (isSameBuildingGeometry(candidate, part)) return true
    return Boolean(part.metrics.centroid) && pointInPolygon(part.metrics.centroid, candidate.footprint)
  })

  if (!containedParts.length) return false
  if (containedParts.some((part) => isSameBuildingGeometry(candidate, part))) return true

  const coverage = containedParts.reduce((sum, part) => sum + (part.metrics.areaSqm || 0), 0) / Math.max(candidate.metrics.areaSqm || 0, 1)
  const minCoverage = Math.max(pickNumber(options.buildingPartMinCoverage, DEFAULT_BUILDING_PART_MIN_COVERAGE), 0.05)
  return containedParts.length >= 2 || coverage >= minCoverage
}

function inferBuildingHeight(tags = {}) {
  const explicitHeight = parseMeters(tags.height || tags['building:height'] || tags['roof:height'], null)
  if (explicitHeight && explicitHeight > 0) return Math.min(Math.max(explicitHeight, 2.8), 260)
  const levels = parseLevels(tags['building:levels'] || tags.levels)
  if (levels) return Math.min(Math.max(levels * 3.2, 2.8), 260)
  return 9.6
}

function reverseRing(ring) {
  return [...ring].reverse()
}

function stitchCoordinateRings(rings) {
  const pending = rings.map((ring) => normalizeCoordinateRing(ring)).filter((ring) => ring.length >= 2)
  if (!pending.length) return []
  let stitched = pending.shift()
  let changed = true

  while (pending.length && changed) {
    changed = false
    for (let index = 0; index < pending.length; index += 1) {
      const ring = pending[index]
      const stitchedStart = stitched[0]
      const stitchedEnd = stitched[stitched.length - 1]
      const ringStart = ring[0]
      const ringEnd = ring[ring.length - 1]

      if (sameCoordinate(stitchedEnd, ringStart)) {
        stitched = [...stitched, ...ring.slice(1)]
      } else if (sameCoordinate(stitchedEnd, ringEnd)) {
        stitched = [...stitched, ...reverseRing(ring).slice(1)]
      } else if (sameCoordinate(stitchedStart, ringEnd)) {
        stitched = [...ring.slice(0, -1), ...stitched]
      } else if (sameCoordinate(stitchedStart, ringStart)) {
        stitched = [...reverseRing(ring).slice(0, -1), ...stitched]
      } else {
        continue
      }

      pending.splice(index, 1)
      changed = true
      break
    }
  }

  return normalizeCoordinateRing(stitched)
}

function normalizeFootprintsFromElement(element) {
  const geometry = ensureArray(element?.geometry)
  if (geometry.length >= 3) {
    return [normalizeCoordinateRing(geometry
      .map((point) => [pickNumber(point.lon, null), pickNumber(point.lat, null)])
      .filter(([longitude, latitude]) => Number.isFinite(longitude) && Number.isFinite(latitude)))]
  }
  if (element?.type !== 'relation') return []

  const outerRings = ensureArray(element?.members)
    .filter((member) => member?.role === 'outer' && ensureArray(member?.geometry).length >= 2)
    .map((member) => normalizeCoordinateRing(member.geometry
      .map((point) => [pickNumber(point.lon, null), pickNumber(point.lat, null)])
      .filter(([longitude, latitude]) => Number.isFinite(longitude) && Number.isFinite(latitude))))
    .filter((ring) => ring.length >= 2)

  if (!outerRings.length) return []
  if (outerRings.length === 1 && outerRings[0].length >= 3) return [outerRings[0]]

  const stitched = stitchCoordinateRings(outerRings)
  if (stitched.length >= 3) return [stitched]

  return outerRings.filter((ring) => ring.length >= 3)
}

function buildOverpassPolygonString(ring) {
  return ring
    .map(([longitude, latitude]) => `${pickNumber(latitude, 0)} ${pickNumber(longitude, 0)}`)
    .join(' ')
}

export function buildOverpassBuildingQuery(clipPolygonWgs84) {
  const ring = getPolygonRing(clipPolygonWgs84)
  if (ring.length < 3) throw new Error('选区缺少有效 Polygon，无法请求 OSM 建筑')
  const poly = buildOverpassPolygonString(ring)
return `[out:json][timeout:25];
(
  way["building"](poly:"${poly}");
  relation["building"](poly:"${poly}");
  way["building:part"](poly:"${poly}");
  relation["building:part"](poly:"${poly}");
);
out body geom;`
}

export function normalizeOverpassBuildings(overpassJson, focusZone, options = {}) {
  const ring = getPolygonRing(focusZone?.clipPolygonWgs84)
  const maxBuildings = Math.max(Math.floor(pickNumber(options.maxBuildings, DEFAULT_MAX_BUILDINGS)), 1)
  const candidates = []
  for (const element of ensureArray(overpassJson?.elements)) {
    if (candidates.length >= maxBuildings * 2) break
    if (element?.type !== 'way' && element?.type !== 'relation') continue
    const tags = element.tags || {}
    if (!isRenderableBuildingTag(tags)) continue
    for (const [footprintIndex, footprint] of normalizeFootprintsFromElement(element).entries()) {
      if (candidates.length >= maxBuildings * 2) break
      if (footprint.length < 3) continue
      if (!footprintTouchesRing(footprint, ring)) continue
      if (!validateBuildingFootprint(footprint, ring, options)) continue
      const metrics = footprintMetrics(footprint, ring)
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
      })
    }
  }

  const buildingParts = candidates.filter((candidate) => candidate.isBuildingPart)
  return candidates
    .filter((candidate) => !shouldSuppressBuildingOutline(candidate, buildingParts, options))
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
    }))
}

export async function fetchOsmBuildingsForFocusZone(focusZone, options = {}) {
  const overpassUrl = options.overpassUrl || DEFAULT_OVERPASS_URL
  const timeoutMs = Math.max(pickNumber(options.timeoutMs, DEFAULT_TIMEOUT_MS), 1000)
  const query = buildOverpassBuildingQuery(focusZone?.clipPolygonWgs84)
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(overpassUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ data: query }),
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`OSM Overpass 请求失败：${response.status}`)
    }
    const json = await response.json()
    const buildings = normalizeOverpassBuildings(json, focusZone, options)
    return {
      kind: 'osm-building-footprints',
      source: 'overpass-api',
      overpassUrl,
      fetchedAt: new Date().toISOString(),
      query,
      count: buildings.length,
      buildings,
    }
  } finally {
    globalThis.clearTimeout(timeout)
  }
}
