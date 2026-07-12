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
    .map((building) => ({
      footprint: footprintToLocal(building, origin),
      height: resolveBuildingHeight(building),
      baseY: 0,
    }))
    .filter((building) => building.footprint.length >= 3)

  const terrain = buildDrapedTerrain(
    focusZone?.snapshotJson?.terrainPatch,
    focusZone?.orthophoto?.coverBounds,
    origin
  )

  return { origin, tiles, buildings, terrain }
}
