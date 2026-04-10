function ensureArray(value) {
  return Array.isArray(value) ? value : []
}

function pickNumber(value, fallback = 0) {
  const nextValue = Number(value)
  return Number.isFinite(nextValue) ? nextValue : fallback
}

const OBJECT_LABELS = {
  tent: '帐篷',
  stage: '舞台',
  arch: '赛事拱门',
  light_tower: '灯光塔',
  supply_station: '补给站',
  medical_station: '医疗站',
  fence_segment: '围栏段',
  route_sign: '路标',
  generic: '通用对象',
}

function toLocalPoint(origin, longitude, latitude) {
  const metersPerDegreeLat = 111320
  const metersPerDegreeLng = metersPerDegreeLat * Math.cos((pickNumber(origin?.latitude, 0) * Math.PI) / 180) || 1
  return {
    x: (pickNumber(longitude, 0) - pickNumber(origin?.longitude, 0)) * metersPerDegreeLng,
    z: (pickNumber(latitude, 0) - pickNumber(origin?.latitude, 0)) * metersPerDegreeLat,
  }
}

function getPolygonRing(geometry) {
  const ring = ensureArray(geometry?.coordinates?.[0])
  if (ring.length < 3) return []
  const isClosed = ring[0]?.[0] === ring[ring.length - 1]?.[0] && ring[0]?.[1] === ring[ring.length - 1]?.[1]
  return isClosed ? ring.slice(0, -1) : ring
}

function geometryToLocalPoints(geometry, origin) {
  if (!geometry || !origin) return []

  if (geometry.type === 'Polygon') {
    return getPolygonRing(geometry).map(([longitude, latitude]) => toLocalPoint(origin, longitude, latitude))
  }

  if (geometry.type === 'LineString') {
    return ensureArray(geometry.coordinates).map(([longitude, latitude]) => toLocalPoint(origin, longitude, latitude))
  }

  if (geometry.type === 'Point') {
    const [longitude, latitude] = geometry.coordinates || []
    return [toLocalPoint(origin, longitude, latitude)]
  }

  return []
}

function boundsFromPoints(points) {
  if (!points.length) return { minX: -1, maxX: 1, minZ: -1, maxZ: 1, width: 2, depth: 2 }

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
    width: Math.max(maxX - minX, 1),
    depth: Math.max(maxZ - minZ, 1),
  }
}

function centroidFromPoints(points) {
  if (!points.length) return { x: 0, z: 0 }
  return points.reduce((acc, point) => ({
    x: acc.x + point.x / points.length,
    z: acc.z + point.z / points.length,
  }), { x: 0, z: 0 })
}

function sampleTerrainPatchHeight(terrainPatch, x, z) {
  if (!terrainPatch?.rows || !terrainPatch?.cols || !Array.isArray(terrainPatch.heightsRelative)) return 0

  const rows = Number(terrainPatch.rows)
  const cols = Number(terrainPatch.cols)
  const bounds = terrainPatch.boundsMeters || {}
  const width = Math.max(pickNumber(bounds.width, 0), 1)
  const depth = Math.max(pickNumber(bounds.depth, 0), 1)
  const minX = pickNumber(bounds.minX, -width / 2)
  const minZ = pickNumber(bounds.minZ, -depth / 2)

  const u = Math.min(Math.max((x - minX) / width, 0), 1)
  const v = Math.min(Math.max((z - minZ) / depth, 0), 1)
  const gx = u * Math.max(cols - 1, 1)
  const gz = v * Math.max(rows - 1, 1)
  const x0 = Math.floor(gx)
  const z0 = Math.floor(gz)
  const x1 = Math.min(x0 + 1, cols - 1)
  const z1 = Math.min(z0 + 1, rows - 1)
  const tx = gx - x0
  const tz = gz - z0

  const h00 = pickNumber(terrainPatch.heightsRelative[z0 * cols + x0], 0)
  const h10 = pickNumber(terrainPatch.heightsRelative[z0 * cols + x1], 0)
  const h01 = pickNumber(terrainPatch.heightsRelative[z1 * cols + x0], 0)
  const h11 = pickNumber(terrainPatch.heightsRelative[z1 * cols + x1], 0)

  const top = h00 * (1 - tx) + h10 * tx
  const bottom = h01 * (1 - tx) + h11 * tx
  return top * (1 - tz) + bottom * tz
}

function buildDimensions(objectType, bounds) {
  const width = Math.max(bounds?.width || 0, objectType === 'fence_segment' ? 3 : 2)
  const depth = Math.max(bounds?.depth || 0, objectType === 'fence_segment' ? 0.35 : 2)

  if (objectType === 'light_tower') return { width: 0.6, depth: 0.6, height: 5.5 }
  if (objectType === 'route_sign') return { width: 0.5, depth: 0.2, height: 2.4 }
  if (objectType === 'arch') return { width: Math.max(width, 5), depth: Math.max(depth, 1.6), height: 4.2 }
  if (objectType === 'stage') return { width: Math.max(width, 6), depth: Math.max(depth, 4), height: 2.8 }
  if (objectType === 'tent') return { width: Math.max(width, 3), depth: Math.max(depth, 3), height: 2.8 }
  if (objectType === 'supply_station' || objectType === 'medical_station') {
    return { width: Math.max(width, 4), depth: Math.max(depth, 3), height: 2.8 }
  }
  if (objectType === 'fence_segment') return { width, depth, height: 1.2 }
  return { width, depth, height: 2.2 }
}

export function buildFocusZoneObjectContext(objects, focusZoneContext) {
  const origin = focusZoneContext?.originWgs84
  const terrainPatch = focusZoneContext?.terrainPatch || null
  if (!origin) return []

  return ensureArray(objects).map((object) => {
    const geometry = object?.metadata?.geometry || object?.footprint || null
    const footprintPoints = geometry?.type === 'Polygon' ? geometryToLocalPoints(geometry, origin) : []
    const pathPoints = geometry?.type === 'LineString' ? geometryToLocalPoints(geometry, origin) : []
    const anchor = object?.anchorWgs84
      ? toLocalPoint(origin, object.anchorWgs84.longitude, object.anchorWgs84.latitude)
      : centroidFromPoints(footprintPoints.length ? footprintPoints : pathPoints)
    const footprintBounds = boundsFromPoints(footprintPoints.length ? footprintPoints : [anchor])
    const dimensions = buildDimensions(object?.objectType, footprintBounds)

    const terrainSamples = (footprintPoints.length ? footprintPoints : [anchor]).map((point) => (
      sampleTerrainPatchHeight(terrainPatch, point.x, point.z)
    ))
    const minTerrain = terrainSamples.length ? Math.min(...terrainSamples) : 0
    const maxTerrain = terrainSamples.length ? Math.max(...terrainSamples) : 0
    const avgTerrain = terrainSamples.length
      ? terrainSamples.reduce((sum, value) => sum + value, 0) / terrainSamples.length
      : 0

    return {
      id: object?.id || null,
      title: object?.title || OBJECT_LABELS[object?.objectType] || '空间对象',
      objectType: object?.objectType || 'generic',
      placementMode: object?.placementMode || 'follow-terrain',
      renderColor: object?.materialVariant?.color || '#3388ff',
      anchor,
      footprintPoints,
      pathPoints,
      bounds: footprintBounds,
      dimensions,
      terrain: {
        min: minTerrain,
        max: maxTerrain,
        avg: avgTerrain,
        delta: Math.max(maxTerrain - minTerrain, 0),
      },
    }
  })
}

export function summarizeFocusZoneObjects(items) {
  const summary = {
    total: ensureArray(items).length,
    byPlacementMode: {
      'follow-terrain': 0,
      'level-platform': 0,
      'vertical-keep': 0,
    },
  }

  ensureArray(items).forEach((item) => {
    if (summary.byPlacementMode[item.placementMode] !== undefined) {
      summary.byPlacementMode[item.placementMode] += 1
    }
  })

  return summary
}
