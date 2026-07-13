/**
 * 场地底图数据构造
 *
 * 把 site-bake 返回的 focusZone（正射卫星瓦片 + OSM 白模 + originWgs84）转换为
 * 3D 渲染用的本地米制底图数据：每片瓦片的本地矩形，以及每栋建筑的本地 footprint + 高度。
 *
 * 与 focusZoneStudioScene 的 toLocalMeters 使用同一等距矩形投影，保证底图层与
 * 可编辑文档（地形/选区）坐标一致。纯函数，无 three.js 依赖，便于单测。
 */

const METERS_PER_DEGREE_LAT = 111320
const DEFAULT_BUILDING_HEIGHT_METERS = 10
const PROVIDER_STATUS_PRIORITY = {
  ready: 0,
  loading: 1,
  degraded: 2,
  unavailable: 3,
  failed: 4,
}

function pickNumber(value, fallback = 0) {
  const next = Number(value)
  return Number.isFinite(next) ? next : fallback
}

function toLocalMeters(longitude, latitude, origin) {
  const originLat = pickNumber(origin?.latitude, 0)
  const originLng = pickNumber(origin?.longitude, 0)
  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos((originLat * Math.PI) / 180) || 1
  return {
    x: (longitude - originLng) * metersPerDegreeLng,
    z: (latitude - originLat) * METERS_PER_DEGREE_LAT,
  }
}

function resolveBuildingHeight(building) {
  const explicit = pickNumber(building?.heightMeters, NaN)
  if (Number.isFinite(explicit) && explicit > 0) return explicit
  const height = pickNumber(building?.height, NaN)
  if (Number.isFinite(height) && height > 0) return height
  const levels = pickNumber(building?.levels ?? building?.buildingLevels, NaN)
  if (Number.isFinite(levels) && levels > 0) return levels * 3
  return DEFAULT_BUILDING_HEIGHT_METERS
}

function footprintToLocal(building, origin) {
  const ring = building?.footprintWgs84?.coordinates?.[0]
  const footprint = []
  if (!Array.isArray(ring)) return footprint
  for (const point of ring) {
    const longitude = pickNumber(point?.[0], null)
    const latitude = pickNumber(point?.[1], null)
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue
    const local = toLocalMeters(longitude, latitude, origin)
    const last = footprint[footprint.length - 1]
    if (last && last[0] === local.x && last[1] === local.z) continue
    footprint.push([local.x, local.z])
  }
  while (
    footprint.length > 1 &&
    footprint[0][0] === footprint[footprint.length - 1][0] &&
    footprint[0][1] === footprint[footprint.length - 1][1]
  ) {
    footprint.pop()
  }
  return footprint
}

function getFootprintCentroid(footprint) {
  if (!Array.isArray(footprint) || footprint.length === 0) return null

  let twiceArea = 0
  let weightedX = 0
  let weightedZ = 0
  for (let index = 0; index < footprint.length; index += 1) {
    const current = footprint[index]
    const next = footprint[(index + 1) % footprint.length]
    const cross = current[0] * next[1] - next[0] * current[1]
    twiceArea += cross
    weightedX += (current[0] + next[0]) * cross
    weightedZ += (current[1] + next[1]) * cross
  }

  if (Math.abs(twiceArea) > Number.EPSILON) {
    return {
      x: weightedX / (3 * twiceArea),
      z: weightedZ / (3 * twiceArea),
    }
  }

  const sum = footprint.reduce(
    (result, point) => ({ x: result.x + point[0], z: result.z + point[1] }),
    { x: 0, z: 0 }
  )
  return { x: sum.x / footprint.length, z: sum.z / footprint.length }
}

/**
 * 从 terrainPatch 的规则网格双线性采样相对高程。
 * 超出网格范围的点贴到最近边界；缺失或退化网格回退为 0。
 */
export function sampleTerrainHeightAtLocalPoint(terrainPatch, x, z) {
  const rows = Math.floor(pickNumber(terrainPatch?.rows, 0))
  const cols = Math.floor(pickNumber(terrainPatch?.cols, 0))
  const heights = Array.isArray(terrainPatch?.heightsRelative) ? terrainPatch.heightsRelative : []
  const bounds = terrainPatch?.boundsMeters
  if (rows < 2 || cols < 2 || !bounds || heights.length < rows * cols) return 0

  const minX = pickNumber(bounds.minX)
  const maxX = pickNumber(bounds.maxX)
  const minZ = pickNumber(bounds.minZ)
  const maxZ = pickNumber(bounds.maxZ)
  const width = maxX - minX
  const depth = maxZ - minZ
  if (!Number.isFinite(width) || !Number.isFinite(depth) || width === 0 || depth === 0) return 0

  const sampleX = Math.min(Math.max(pickNumber(x), Math.min(minX, maxX)), Math.max(minX, maxX))
  const sampleZ = Math.min(Math.max(pickNumber(z), Math.min(minZ, maxZ)), Math.max(minZ, maxZ))
  const gridX = ((sampleX - minX) / width) * (cols - 1)
  const gridZ = ((sampleZ - minZ) / depth) * (rows - 1)
  const col0 = Math.max(0, Math.min(cols - 1, Math.floor(gridX)))
  const row0 = Math.max(0, Math.min(rows - 1, Math.floor(gridZ)))
  const col1 = Math.min(col0 + 1, cols - 1)
  const row1 = Math.min(row0 + 1, rows - 1)
  const mixX = gridX - col0
  const mixZ = gridZ - row0

  const topLeft = pickNumber(heights[row0 * cols + col0], 0)
  const topRight = pickNumber(heights[row0 * cols + col1], 0)
  const bottomLeft = pickNumber(heights[row1 * cols + col0], 0)
  const bottomRight = pickNumber(heights[row1 * cols + col1], 0)
  const top = topLeft + (topRight - topLeft) * mixX
  const bottom = bottomLeft + (bottomRight - bottomLeft) * mixX
  return top + (bottom - top) * mixZ
}

/**
 * 地形 patch → 贴卫星 UV 的网格（drape）：顶点用相对高程，UV 按卫星覆盖范围线性映射，
 * 这样卫星纹理会随地形起伏铺在地表上，而非一张平面。
 */
function buildDrapedTerrain(terrainPatch, coverBoundsWgs84, origin) {
  const rows = Math.floor(pickNumber(terrainPatch?.rows, 0))
  const cols = Math.floor(pickNumber(terrainPatch?.cols, 0))
  const heights = Array.isArray(terrainPatch?.heightsRelative) ? terrainPatch.heightsRelative : []
  const bounds = terrainPatch?.boundsMeters
  if (rows < 2 || cols < 2 || !bounds || heights.length < rows * cols) return null

  const minX = pickNumber(bounds.minX)
  const maxX = pickNumber(bounds.maxX)
  const minZ = pickNumber(bounds.minZ)
  const maxZ = pickNumber(bounds.maxZ)

  let coverMinX = minX
  let coverMaxX = maxX
  let coverMinZ = minZ
  let coverMaxZ = maxZ
  if (coverBoundsWgs84) {
    const sw = toLocalMeters(
      pickNumber(coverBoundsWgs84.west),
      pickNumber(coverBoundsWgs84.south),
      origin
    )
    const ne = toLocalMeters(
      pickNumber(coverBoundsWgs84.east),
      pickNumber(coverBoundsWgs84.north),
      origin
    )
    coverMinX = Math.min(sw.x, ne.x)
    coverMaxX = Math.max(sw.x, ne.x)
    coverMinZ = Math.min(sw.z, ne.z)
    coverMaxZ = Math.max(sw.z, ne.z)
  }
  const coverWidth = coverMaxX - coverMinX || 1
  const coverDepth = coverMaxZ - coverMinZ || 1

  const positions = new Float32Array(rows * cols * 3)
  const uvs = new Float32Array(rows * cols * 2)
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col
      const x = minX + (maxX - minX) * (col / (cols - 1))
      const z = minZ + (maxZ - minZ) * (row / (rows - 1))
      positions[index * 3] = x
      positions[index * 3 + 1] = pickNumber(heights[index], 0)
      positions[index * 3 + 2] = z
      uvs[index * 2] = (x - coverMinX) / coverWidth
      uvs[index * 2 + 1] = (z - coverMinZ) / coverDepth
    }
  }

  const indices = []
  for (let row = 0; row < rows - 1; row += 1) {
    for (let col = 0; col < cols - 1; col += 1) {
      const a = row * cols + col
      const b = a + 1
      const c = (row + 1) * cols + col
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }

  return { positions, uvs, indices, rows, cols }
}

export function buildSiteBackdropData(focusZone) {
  const origin = focusZone?.originWgs84 || { longitude: 0, latitude: 0 }
  const terrainPatch = focusZone?.snapshotJson?.terrainPatch

  const tilesIn = Array.isArray(focusZone?.orthophoto?.tiles) ? focusZone.orthophoto.tiles : []
  const tiles = tilesIn
    .filter((tile) => tile && typeof tile.url === 'string')
    .map((tile) => {
      const corner1 = toLocalMeters(pickNumber(tile.west), pickNumber(tile.south), origin)
      const corner2 = toLocalMeters(pickNumber(tile.east), pickNumber(tile.north), origin)
      return {
        url: tile.url,
        rect: {
          minX: Math.min(corner1.x, corner2.x),
          maxX: Math.max(corner1.x, corner2.x),
          minZ: Math.min(corner1.z, corner2.z),
          maxZ: Math.max(corner1.z, corner2.z),
        },
      }
    })

  const buildingsIn = Array.isArray(focusZone?.snapshotJson?.osmBuildings?.buildings)
    ? focusZone.snapshotJson.osmBuildings.buildings
    : []
  const buildings = buildingsIn
    .map((building) => {
      const footprint = footprintToLocal(building, origin)
      const centroid = getFootprintCentroid(footprint)
      const terrainHeight = centroid
        ? sampleTerrainHeightAtLocalPoint(terrainPatch, centroid.x, centroid.z)
        : 0
      const minHeight = Math.max(pickNumber(building?.minHeightMeters, 0), 0)
      return {
        footprint,
        height: resolveBuildingHeight(building),
        baseY: terrainHeight + minHeight,
      }
    })
    .filter((building) => building.footprint.length >= 3)

  const terrain = buildDrapedTerrain(
    terrainPatch,
    focusZone?.orthophoto?.coverBounds,
    origin
  )

  return { origin, tiles, buildings, terrain }
}

export function summarizeSiteImageryRuntime({
  loaded = 0,
  failed = 0,
  total = 0,
  terminalFailure = false,
} = {}) {
  const safeTotal = Math.max(0, Math.floor(Number(total) || 0))
  let safeLoaded = Math.max(0, Math.min(safeTotal, Math.floor(Number(loaded) || 0)))
  let safeFailed = Math.max(
    0,
    Math.min(safeTotal - safeLoaded, Math.floor(Number(failed) || 0))
  )

  if (terminalFailure && safeTotal > 0) {
    safeLoaded = 0
    safeFailed = safeTotal
  }

  const completed = safeLoaded + safeFailed
  const status = safeTotal === 0
    ? 'unavailable'
    : safeFailed >= safeTotal
      ? 'failed'
      : safeFailed > 0
        ? 'degraded'
        : completed < safeTotal
          ? 'loading'
          : 'ready'
  const message = status === 'loading'
    ? `正在加载卫星纹理 ${completed}/${safeTotal}`
    : status === 'ready'
      ? `卫星纹理已显示 ${safeLoaded}/${safeTotal}`
      : status === 'degraded'
        ? `卫星纹理部分失败：成功 ${safeLoaded}，失败 ${safeFailed}`
        : status === 'failed'
          ? `卫星纹理加载失败 ${safeFailed}/${safeTotal}`
          : '场地没有可加载的卫星纹理'

  return {
    loaded: safeLoaded,
    failed: safeFailed,
    total: safeTotal,
    status,
    message,
    retryable: safeTotal > 0 && safeFailed > 0,
  }
}

export function mergeSiteImageryRuntime(providerStatus, imageryRuntime) {
  if (!providerStatus || !imageryRuntime) return providerStatus
  const serverImagery = providerStatus.imagery || {
    provider: 'unknown',
    status: 'unavailable',
    retryable: false,
  }
  const serverPriority = PROVIDER_STATUS_PRIORITY[serverImagery.status] ?? 0
  const runtimePriority = PROVIDER_STATUS_PRIORITY[imageryRuntime.status] ?? 0
  const status = serverPriority >= runtimePriority
    ? serverImagery.status
    : imageryRuntime.status

  return {
    ...providerStatus,
    imagery: {
      ...serverImagery,
      status,
      itemCount: imageryRuntime.total,
      message: status === imageryRuntime.status
        ? imageryRuntime.message
        : serverImagery.message,
      retryable: Boolean(serverImagery.retryable || imageryRuntime.retryable),
    },
  }
}

export function buildSiteImageryReloadKey(tiles, reloadToken = 0) {
  let hash = 2166136261
  for (const tile of Array.isArray(tiles) ? tiles : []) {
    const url = typeof tile?.url === 'string' ? tile.url : ''
    for (let index = 0; index < url.length; index += 1) {
      hash ^= url.charCodeAt(index)
      hash = Math.imul(hash, 16777619)
    }
  }
  return `${Number(reloadToken) || 0}:${Array.isArray(tiles) ? tiles.length : 0}:${(hash >>> 0).toString(36)}`
}
