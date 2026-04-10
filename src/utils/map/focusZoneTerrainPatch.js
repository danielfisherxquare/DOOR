import * as Cesium from 'cesium'

const ARCGIS_TERRAIN_URL = 'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer'

let terrainProviderPromise = null

function ensureArray(value) {
  return Array.isArray(value) ? value : []
}

function pickNumber(value, fallback = 0) {
  const nextValue = Number(value)
  return Number.isFinite(nextValue) ? nextValue : fallback
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
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

function pointInPolygon(point, polygon) {
  let inside = false
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const xi = polygon[current].x
    const zi = polygon[current].z
    const xj = polygon[previous].x
    const zj = polygon[previous].z
    const intersects = ((zi > point.z) !== (zj > point.z))
      && (point.x < ((xj - xi) * (point.z - zi)) / ((zj - zi) || 1e-7) + xi)
    if (intersects) inside = !inside
  }
  return inside
}

async function getArcGisTerrainProvider() {
  if (!terrainProviderPromise) {
    terrainProviderPromise = Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(ARCGIS_TERRAIN_URL)
  }
  return terrainProviderPromise
}

export async function generateTerrainPatchForZone(zone, options = {}) {
  const polygon = zone?.clipPolygonWgs84
  const ring = getPolygonRing(polygon)
  if (!ring.length) {
    throw new Error('工作区缺少有效 Polygon，无法生成 terrain patch')
  }

  const origin = zone?.originWgs84 || polygonCentroid(ring)
  if (!origin) {
    throw new Error('工作区缺少 originWgs84，无法生成 terrain patch')
  }

  const terrainResolution = clamp(
    pickNumber(options.terrainResolution ?? zone?.terrainResolution, 2),
    1,
    12,
  )

  const metersPerDegreeLat = 111320
  const metersPerDegreeLng = metersPerDegreeLat * Math.cos((pickNumber(origin.latitude, 0) * Math.PI) / 180) || 1
  const polygonLocalMeters = ring.map(([longitude, latitude]) => ({
    x: (pickNumber(longitude, 0) - pickNumber(origin.longitude, 0)) * metersPerDegreeLng,
    z: (pickNumber(latitude, 0) - pickNumber(origin.latitude, 0)) * metersPerDegreeLat,
  }))

  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  polygonLocalMeters.forEach((point) => {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minZ = Math.min(minZ, point.z)
    maxZ = Math.max(maxZ, point.z)
  })

  const width = Math.max(maxX - minX, terrainResolution * 2, 4)
  const depth = Math.max(maxZ - minZ, terrainResolution * 2, 4)
  const cols = clamp(Math.ceil(width / terrainResolution) + 1, 4, 96)
  const rows = clamp(Math.ceil(depth / terrainResolution) + 1, 4, 96)
  const stepX = width / Math.max(cols - 1, 1)
  const stepZ = depth / Math.max(rows - 1, 1)

  const cartographics = []
  const localPoints = []
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = minX + stepX * col
      const z = minZ + stepZ * row
      const longitude = pickNumber(origin.longitude, 0) + x / metersPerDegreeLng
      const latitude = pickNumber(origin.latitude, 0) + z / metersPerDegreeLat
      localPoints.push({ x, z })
      cartographics.push(Cesium.Cartographic.fromDegrees(longitude, latitude))
    }
  }

  const terrainProvider = await getArcGisTerrainProvider()
  const sampled = await Cesium.sampleTerrainMostDetailed(terrainProvider, cartographics)
  const absoluteHeights = sampled.map((item) => pickNumber(item.height, 0))
  const minElevationMeters = Math.min(...absoluteHeights)
  const maxElevationMeters = Math.max(...absoluteHeights)
  const heightDeltaMeters = Math.max(maxElevationMeters - minElevationMeters, 0)
  const heightsRelative = absoluteHeights.map((height) => Number((height - minElevationMeters).toFixed(3)))

  const cellMask = []
  for (let row = 0; row < rows - 1; row += 1) {
    for (let col = 0; col < cols - 1; col += 1) {
      const center = {
        x: minX + stepX * (col + 0.5),
        z: minZ + stepZ * (row + 0.5),
      }
      cellMask.push(pointInPolygon(center, polygonLocalMeters) ? 1 : 0)
    }
  }

  return {
    kind: 'terrain-grid-patch',
    source: 'arcgis-terrain',
    sampledAt: new Date().toISOString(),
    rows,
    cols,
    resolutionMeters: terrainResolution,
    boundsMeters: {
      minX: Number(minX.toFixed(3)),
      maxX: Number(maxX.toFixed(3)),
      minZ: Number(minZ.toFixed(3)),
      maxZ: Number(maxZ.toFixed(3)),
      width: Number(width.toFixed(3)),
      depth: Number(depth.toFixed(3)),
    },
    originWgs84: {
      latitude: pickNumber(origin.latitude, 0),
      longitude: pickNumber(origin.longitude, 0),
      height: pickNumber(origin.height, 0),
    },
    polygonLocalMeters: polygonLocalMeters.map((point) => ({
      x: Number(point.x.toFixed(3)),
      z: Number(point.z.toFixed(3)),
    })),
    heightsRelative,
    cellMask,
    elevationOffsetMeters: Number(minElevationMeters.toFixed(3)),
    minElevationMeters: Number(minElevationMeters.toFixed(3)),
    maxElevationMeters: Number(maxElevationMeters.toFixed(3)),
    heightDeltaMeters: Number(heightDeltaMeters.toFixed(3)),
  }
}
