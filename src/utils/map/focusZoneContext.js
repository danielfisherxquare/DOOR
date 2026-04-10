function ensureArray(value) {
  return Array.isArray(value) ? value : []
}

function pickNumber(value, fallback = 0) {
  const nextValue = Number(value)
  return Number.isFinite(nextValue) ? nextValue : fallback
}

function pickString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function getPolygonRing(polygon) {
  const ring = ensureArray(polygon?.coordinates?.[0])
  if (ring.length < 3) return []
  const isClosed = ring[0]?.[0] === ring[ring.length - 1]?.[0] && ring[0]?.[1] === ring[ring.length - 1]?.[1]
  return isClosed ? ring.slice(0, -1) : ring
}

function polygonCentroid(points) {
  if (!points.length) return null
  const sums = points.reduce((acc, point) => ({
    longitude: acc.longitude + pickNumber(point?.[0], 0),
    latitude: acc.latitude + pickNumber(point?.[1], 0),
  }), { longitude: 0, latitude: 0 })
  return {
    longitude: sums.longitude / points.length,
    latitude: sums.latitude / points.length,
  }
}

function polygonAreaSqm(localPoints) {
  if (localPoints.length < 3) return 0
  let areaTwice = 0
  for (let index = 0; index < localPoints.length; index += 1) {
    const current = localPoints[index]
    const next = localPoints[(index + 1) % localPoints.length]
    areaTwice += current.x * next.z - next.x * current.z
  }
  return Math.abs(areaTwice) / 2
}

function buildBounds(points) {
  if (!points.length) {
    return {
      minX: -12,
      maxX: 12,
      minZ: -9,
      maxZ: 9,
      width: 24,
      depth: 18,
    }
  }

  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY

  points.forEach((point) => {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minZ = Math.min(minZ, point.z)
    maxZ = Math.max(maxZ, point.z)
  })

  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width: Math.max(maxX - minX, 4),
    depth: Math.max(maxZ - minZ, 4),
  }
}

export function extractFocusZoneWorkbenchScene(focusZone) {
  const snapshot = focusZone?.snapshotJson
  if (!snapshot || typeof snapshot !== 'object') return null
  return snapshot.warehouseScene || snapshot.sceneSnapshot || snapshot.snapshotJson || null
}

export function extractFocusZoneTerrainPatch(focusZone) {
  const snapshot = focusZone?.snapshotJson
  if (!snapshot || typeof snapshot !== 'object') return null
  return snapshot.terrainPatch || null
}

export function buildFocusZoneWorkbenchContext(focusZone) {
  const ring = getPolygonRing(focusZone?.clipPolygonWgs84)
  const centroid = polygonCentroid(ring)
  const origin = focusZone?.originWgs84 || centroid || null

  const metersPerDegreeLat = 111320
  const metersPerDegreeLng = metersPerDegreeLat * Math.cos((pickNumber(origin?.latitude, 0) * Math.PI) / 180) || 1
  const polygonLocalMeters = ring.map(([longitude, latitude]) => ({
    x: (pickNumber(longitude, 0) - pickNumber(origin?.longitude, 0)) * metersPerDegreeLng,
    z: (pickNumber(latitude, 0) - pickNumber(origin?.latitude, 0)) * metersPerDegreeLat,
  }))
  const boundsMeters = buildBounds(polygonLocalMeters)

  return {
    id: focusZone?.id || null,
    name: pickString(focusZone?.name, '重点区工作区'),
    zoneType: pickString(focusZone?.zoneType, 'focus-zone'),
    terrainResolution: pickNumber(focusZone?.terrainResolution, 2),
    includedObjectCount: ensureArray(focusZone?.includedObjectIds).length,
    originWgs84: origin
      ? {
          latitude: pickNumber(origin.latitude, 0),
          longitude: pickNumber(origin.longitude, 0),
          height: pickNumber(origin.height, 0),
        }
      : null,
    polygonLocalMeters,
    boundsMeters,
    approximateAreaSqm: polygonAreaSqm(polygonLocalMeters),
    hasSnapshot: Boolean(extractFocusZoneWorkbenchScene(focusZone)),
    terrainPatch: extractFocusZoneTerrainPatch(focusZone),
    hasTerrainPatch: Boolean(extractFocusZoneTerrainPatch(focusZone)),
    publishTarget: focusZone?.publishTarget || {},
    updatedAt: focusZone?.updatedAt || null,
    metadata: focusZone?.metadata || {},
  }
}
