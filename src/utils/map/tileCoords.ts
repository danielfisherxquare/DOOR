/**
 * 瓦片坐标计算工具
 */

/**
 * 经纬度转瓦片坐标
 */
export function latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return {
    x: Math.max(0, Math.min(x, n - 1)),
    y: Math.max(0, Math.min(y, n - 1)),
  };
}

/**
 * 瓦片坐标转经纬度 (左上角)
 */
export function tileToLatLng(z: number, x: number, y: number): { lat: number; lng: number } {
  const n = Math.pow(2, z);
  const lng = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const lat = (latRad * 180) / Math.PI;
  return { lat, lng };
}

/**
 * 瓦片坐标转经纬度 (中心点)
 */
export function tileToLatLngCenter(z: number, x: number, y: number): { lat: number; lng: number } {
  const n = Math.pow(2, z);
  const lng = ((x + 0.5) / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / n)));
  const lat = (latRad * 180) / Math.PI;
  return { lat, lng };
}

/**
 * 计算边界框内所有瓦片
 */
export function computeTilesInBounds(
  south: number,
  west: number,
  north: number,
  east: number,
  minZoom: number,
  maxZoom: number
): { tiles: Array<{ z: number; x: number; y: number }>; total: number } {
  const tiles: Array<{ z: number; x: number; y: number }> = [];

  for (let z = minZoom; z <= maxZoom; z++) {
    const tl = latLngToTile(north, west, z);
    const br = latLngToTile(south, east, z);
    const xMin = Math.min(tl.x, br.x);
    const xMax = Math.max(tl.x, br.x);
    const yMin = Math.min(tl.y, br.y);
    const yMax = Math.max(tl.y, br.y);

    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        tiles.push({ z, x, y });
      }
    }
  }

  return { tiles, total: tiles.length };
}

/**
 * 估算下载量
 */
export function estimateDownload(
  south: number,
  west: number,
  north: number,
  east: number,
  minZoom: number,
  maxZoom: number
): { total: number; perZoom: Array<{ zoom: number; count: number }>; estimatedSizeMB: number } {
  let total = 0;
  const perZoom: Array<{ zoom: number; count: number }> = [];

  for (let z = minZoom; z <= maxZoom; z++) {
    const tl = latLngToTile(north, west, z);
    const br = latLngToTile(south, east, z);
    const xMin = Math.min(tl.x, br.x);
    const xMax = Math.max(tl.x, br.x);
    const yMin = Math.min(tl.y, br.y);
    const yMax = Math.max(tl.y, br.y);
    const count = (xMax - xMin + 1) * (yMax - yMin + 1);
    perZoom.push({ zoom: z, count });
    total += count;
  }

  // 平均每张瓦片 ~30KB
  const estimatedSizeMB = (total * 30) / 1024;

  return { total, perZoom, estimatedSizeMB };
}

/**
 * 获取瓦片范围
 */
export function getTileBounds(
  south: number,
  west: number,
  north: number,
  east: number,
  zoom: number
): { xMin: number; xMax: number; yMin: number; yMax: number; count: number } {
  const tl = latLngToTile(north, west, zoom);
  const br = latLngToTile(south, east, zoom);
  const xMin = Math.min(tl.x, br.x);
  const xMax = Math.max(tl.x, br.x);
  const yMin = Math.min(tl.y, br.y);
  const yMax = Math.max(tl.y, br.y);

  return {
    xMin,
    xMax,
    yMin,
    yMax,
    count: (xMax - xMin + 1) * (yMax - yMin + 1),
  };
}

/**
 * 计算两点之间的瓦片数量
 */
export function countTilesBetweenZooms(
  south: number,
  west: number,
  north: number,
  east: number,
  minZoom: number,
  maxZoom: number
): number {
  let total = 0;
  for (let z = minZoom; z <= maxZoom; z++) {
    const bounds = getTileBounds(south, west, north, east, z);
    total += bounds.count;
  }
  return total;
}