/**
 * 从 GeoJSON 几何（WGS84）计算地理 bbox。
 * 用于「地图框选 → 生成场地」：把选中的矩形/面域转成 site-bake 需要的 bbox。
 */

function ringFromPolygon(geometry) {
  if (!geometry || geometry.type !== 'Polygon') return null
  const ring = geometry.coordinates && geometry.coordinates[0]
  return Array.isArray(ring) ? ring : null
}

/**
 * @returns {{west:number,south:number,east:number,north:number}|null}
 *   非多边形、点数不足或零面积时返回 null。
 */
export function geometryToBbox(geometry) {
  const ring = ringFromPolygon(geometry)
  if (!ring || ring.length < 3) return null

  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const point of ring) {
    const lng = Number(point && point[0])
    const lat = Number(point && point[1])
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
    west = Math.min(west, lng)
    east = Math.max(east, lng)
    south = Math.min(south, lat)
    north = Math.max(north, lat)
  }

  if (
    !Number.isFinite(west) ||
    !Number.isFinite(south) ||
    !Number.isFinite(east) ||
    !Number.isFinite(north)
  ) {
    return null
  }
  if (east <= west || north <= south) return null
  return { west, south, east, north }
}
