/**
 * 瓦片 URL 解析器
 * 从瓦片 URL 中提取坐标、图源等信息
 */

export interface TileUrlInfo {
  sourceId: string;
  sourceName: string;
  projection: 'wgs84' | 'gcj02';
  z: number;
  x: number;
  y: number;
}

// 已知图源 URL 模式配置
const SOURCE_PATTERNS: Array<{
  pattern: RegExp;
  sourceId: string;
  sourceName: string;
  projection: 'wgs84' | 'gcj02';
  // 从正则匹配中提取坐标的函数
  coordExtractor: (match: RegExpMatchArray) => { z: number; x: number; y: number };
}> = [
  // CARTO Light
  {
    pattern: /cartocdn\.com\/light_all\/(\d+)\/(\d+)\/(\d+)/,
    sourceId: 'light',
    sourceName: 'CARTO Light',
    projection: 'wgs84',
    coordExtractor: (m) => ({ z: parseInt(m[1]), x: parseInt(m[2]), y: parseInt(m[3]) }),
  },
  // CARTO Dark
  {
    pattern: /cartocdn\.com\/dark_all\/(\d+)\/(\d+)\/(\d+)/,
    sourceId: 'dark',
    sourceName: 'CARTO Dark',
    projection: 'wgs84',
    coordExtractor: (m) => ({ z: parseInt(m[1]), x: parseInt(m[2]), y: parseInt(m[3]) }),
  },
  // CARTO Voyager
  {
    pattern: /cartocdn\.com\/rastertiles\/voyager\/(\d+)\/(\d+)\/(\d+)/,
    sourceId: 'voyager',
    sourceName: 'CARTO Voyager',
    projection: 'wgs84',
    coordExtractor: (m) => ({ z: parseInt(m[1]), x: parseInt(m[2]), y: parseInt(m[3]) }),
  },
  // Esri World Imagery (卫星)
  {
    pattern: /arcgisonline\.com.*\/World_Imagery\/MapServer\/tile\/(\d+)\/(\d+)\/(\d+)/,
    sourceId: 'satellite',
    sourceName: 'Esri Satellite',
    projection: 'wgs84',
    // 注意 Esri 的顺序是 z/y/x
    coordExtractor: (m) => ({ z: parseInt(m[1]), y: parseInt(m[2]), x: parseInt(m[3]) }),
  },
  // Esri World Street Map
  {
    pattern: /arcgisonline\.com.*\/World_Street_Map\/MapServer\/tile\/(\d+)\/(\d+)\/(\d+)/,
    sourceId: 'street',
    sourceName: 'Esri Street',
    projection: 'wgs84',
    coordExtractor: (m) => ({ z: parseInt(m[1]), y: parseInt(m[2]), x: parseInt(m[3]) }),
  },
  // 高德卫星
  {
    pattern: /autonavi\.com.*style=6.*x=(\d+)&y=(\d+)&z=(\d+)/,
    sourceId: 'gaode_satellite',
    sourceName: '高德卫星',
    projection: 'gcj02',
    coordExtractor: (m) => ({ x: parseInt(m[1]), y: parseInt(m[2]), z: parseInt(m[3]) }),
  },
  // 高德路网
  {
    pattern: /autonavi\.com.*style=8.*x=(\d+)&y=(\d+)&z=(\d+)/,
    sourceId: 'gaode_road',
    sourceName: '高德路网',
    projection: 'gcj02',
    coordExtractor: (m) => ({ x: parseInt(m[1]), y: parseInt(m[2]), z: parseInt(m[3]) }),
  },
  // 高德标注
  {
    pattern: /autonavi\.com.*style=7.*x=(\d+)&y=(\d+)&z=(\d+)/,
    sourceId: 'gaode_label',
    sourceName: '高德标注',
    projection: 'gcj02',
    coordExtractor: (m) => ({ x: parseInt(m[1]), y: parseInt(m[2]), z: parseInt(m[3]) }),
  },
  // 高德 (通用)
  {
    pattern: /autonavi\.com.*x=(\d+)&y=(\d+)&z=(\d+)/,
    sourceId: 'gaode',
    sourceName: '高德地图',
    projection: 'gcj02',
    coordExtractor: (m) => ({ x: parseInt(m[1]), y: parseInt(m[2]), z: parseInt(m[3]) }),
  },
  // 天地图影像
  {
    pattern: /tianditu\.gov\.cn.*img_w.*x=(\d+)&y=(\d+)&l=(\d+)/,
    sourceId: 'tianditu_img',
    sourceName: '天地图影像',
    projection: 'wgs84',
    coordExtractor: (m) => ({ x: parseInt(m[1]), y: parseInt(m[2]), z: parseInt(m[3]) }),
  },
  // 天地图矢量
  {
    pattern: /tianditu\.gov\.cn.*vec_w.*x=(\d+)&y=(\d+)&l=(\d+)/,
    sourceId: 'tianditu_vec',
    sourceName: '天地图矢量',
    projection: 'wgs84',
    coordExtractor: (m) => ({ x: parseInt(m[1]), y: parseInt(m[2]), z: parseInt(m[3]) }),
  },
  // OpenStreetMap
  {
    pattern: /tile\.openstreetmap\.org\/(\d+)\/(\d+)\/(\d+)/,
    sourceId: 'osm',
    sourceName: 'OpenStreetMap',
    projection: 'wgs84',
    coordExtractor: (m) => ({ z: parseInt(m[1]), x: parseInt(m[2]), y: parseInt(m[3]) }),
  },
  // OSM 子域名
  {
    pattern: /[abc]\.tile\.openstreetmap\.org\/(\d+)\/(\d+)\/(\d+)/,
    sourceId: 'osm',
    sourceName: 'OpenStreetMap',
    projection: 'wgs84',
    coordExtractor: (m) => ({ z: parseInt(m[1]), x: parseInt(m[2]), y: parseInt(m[3]) }),
  },
  // MapBox
  {
    pattern: /api\.mapbox\.com\/v4\/[^/]+\/(\d+)\/(\d+)\/(\d+)/,
    sourceId: 'mapbox',
    sourceName: 'MapBox',
    projection: 'wgs84',
    coordExtractor: (m) => ({ z: parseInt(m[1]), x: parseInt(m[2]), y: parseInt(m[3]) }),
  },
  // Esri Light Gray Canvas
  {
    pattern: /arcgisonline\.com.*\/World_Light_Gray_Base\/MapServer\/tile\/(\d+)\/(\d+)\/(\d+)/,
    sourceId: 'light',
    sourceName: 'Esri Light Gray Canvas',
    projection: 'wgs84',
    coordExtractor: (m) => ({ z: parseInt(m[1]), y: parseInt(m[2]), x: parseInt(m[3]) }),
  },
];

/**
 * 解析瓦片 URL
 * @param url 瓦片 URL
 * @returns 解析后的瓦片信息，无法解析返回 null
 */
export function parseTileUrl(url: string): TileUrlInfo | null {
  // 遍历已知模式
  for (const source of SOURCE_PATTERNS) {
    const match = url.match(source.pattern);
    if (match) {
      const coords = source.coordExtractor(match);
      return {
        sourceId: source.sourceId,
        sourceName: source.sourceName,
        projection: source.projection,
        z: coords.z,
        x: coords.x,
        y: coords.y,
      };
    }
  }

  // 尝试通用匹配 /z/x/y 或 /{z}/{x}/{y} 模式
  const genericPatterns = [
    // 标准 XYZ
    /\/(\d+)\/(\d+)\/(\d+)(?:\.[a-z]+)?$/i,
    // 反向 Y
    /\/(\d+)\/(\d+)\/(-?\d+)(?:\.[a-z]+)?$/i,
  ];

  for (const pattern of genericPatterns) {
    const match = url.match(pattern);
    if (match) {
      const z = parseInt(match[1]);
      const x = parseInt(match[2]);
      const y = parseInt(match[3]);

      // 验证坐标合理性
      if (z >= 0 && z <= 22 && x >= 0 && y >= 0) {
        // 根据 URL 判断坐标系
        const projection: 'wgs84' | 'gcj02' =
          /autonavi|amap|gaode/i.test(url) ? 'gcj02' : 'wgs84';

        return {
          sourceId: 'unknown',
          sourceName: '未知图源',
          projection,
          z,
          x,
          y,
        };
      }
    }
  }

  return null;
}

/**
 * 从瓦片信息生成缓存键
 */
export function makeTileCacheKey(info: TileUrlInfo): string {
  return `${info.sourceId}/${info.projection}/${info.z}/${info.x}/${info.y}`;
}

/**
 * 从缓存键解析瓦片信息
 */
export function parseTileCacheKey(key: string): TileUrlInfo | null {
  const parts = key.split('/');
  if (parts.length !== 5) return null;

  const [sourceId, projection, zStr, xStr, yStr] = parts;
  const z = parseInt(zStr);
  const x = parseInt(xStr);
  const y = parseInt(yStr);

  if (isNaN(z) || isNaN(x) || isNaN(y)) return null;
  if (projection !== 'wgs84' && projection !== 'gcj02') return null;

  return {
    sourceId,
    sourceName: sourceId,
    projection: projection as 'wgs84' | 'gcj02',
    z,
    x,
    y,
  };
}

/**
 * 判断两个瓦片 URL 是否指向同一瓦片
 */
export function isSameTile(url1: string, url2: string): boolean {
  const info1 = parseTileUrl(url1);
  const info2 = parseTileUrl(url2);

  if (!info1 || !info2) return false;

  return (
    info1.z === info2.z &&
    info1.x === info2.x &&
    info1.y === info2.y &&
    info1.projection === info2.projection
  );
}

/**
 * 获取相邻瓦片坐标
 */
export function getAdjacentTiles(
  z: number,
  x: number,
  y: number,
  range: number = 1
): Array<{ z: number; x: number; y: number }> {
  const tiles: Array<{ z: number; x: number; y: number }> = [];
  const maxTile = Math.pow(2, z) - 1;

  for (let dz = -range; dz <= range; dz++) {
    for (let dy = -range; dy <= range; dy++) {
      for (let dx = -range; dx <= range; dx++) {
        if (dz === 0 && dx === 0 && dy === 0) continue;

        const newZ = z + dz;
        const newX = x + dx;
        const newY = y + dy;

        // 跳过无效坐标
        if (newZ < 0 || newZ > 22) continue;
        if (newX < 0 || newX > maxTile) continue;
        if (newY < 0 || newY > maxTile) continue;

        tiles.push({ z: newZ, x: newX, y: newY });
      }
    }
  }

  return tiles;
}
