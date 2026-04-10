import L from 'leaflet';
import type { MapProjection } from './projection';
import { getTileDataUriByCoords } from '../db/tileCacheStore';
import { getAutoCacheTile } from '../cache/lruManager';

export type TileSourceCategory = 'basic' | 'satellite' | 'terrain' | 'special' | 'esri' | 'tianditu' | 'stadia' | 'weather' | 'other';

export interface TileSourceConfig {
  id: string;
  name: string;
  url: string;
  type: 'xyz' | 'wmts' | 'wms' | 'tms';
  attribution?: string;
  subdomains?: string;
  maxNativeZoom?: number;
  minZoom?: number;
  projection: MapProjection;
  category?: TileSourceCategory;
  icon?: string;
  // API Key 支持
  requires_api_key?: boolean;
  api_key?: string;
  api_key_hint?: string;
  // 叠加层标识
  is_overlay?: boolean;
  is_weather?: boolean;
  // 状态
  enabled?: number;
  is_custom?: boolean;
  is_preset?: boolean;
  three_d_globe_ready?: boolean;
  availability_note?: string;
}

const GALILEO_SERVERS = ['Galileo', 'Galileo1', 'Galileo2', 'Galileo3'];
let galileoIdx = 0;

function resolveTemplateUrl(
  template: string,
  x: number,
  y: number,
  z: number,
  subdomains = 'abc',
  apiKey = '',
): string {
  const safeSubdomains = subdomains.length > 0 ? subdomains : 'abc';
  const s = safeSubdomains[Math.abs(x + y) % safeSubdomains.length];
  galileoIdx = (galileoIdx + 1) % GALILEO_SERVERS.length;

  let quadkey = '';
  for (let i = z; i > 0; i--) {
    let digit = 0;
    const mask = 1 << (i - 1);
    if ((x & mask) !== 0) digit += 1;
    if ((y & mask) !== 0) digit += 2;
    quadkey += digit.toString();
  }

  return template
    .replace(/\{\$x\}/gi, String(x))
    .replace(/\{\$y\}/gi, String(y))
    .replace(/\{\$z\}/gi, String(z))
    .replace(/\{x\}/gi, String(x))
    .replace(/\{y\}/gi, String(y))
    .replace(/\{z\}/gi, String(z))
    .replace(/\{s\}/gi, s)
    .replace(/\{\$Galileo\}/gi, GALILEO_SERVERS[galileoIdx])
    .replace(/\{quadkey\}/gi, quadkey)
    .replace(/\{r\}/gi, (window.devicePixelRatio || 1) > 1 ? '@2x' : '')
    .replace(/\{api_key\}/gi, apiKey);
}

const TILE_OPTIONS_BASE: L.TileLayerOptions = {
  maxZoom: 22,
  maxNativeZoom: 19,
  keepBuffer: 2,
  updateWhenIdle: false,
  updateWhenZooming: true,
  zoomOffset: 0,
  tileSize: 256,
};

function logTileLoadError(
  source: TileSourceConfig,
  coords: { x: number; y: number; z: number },
  url: string,
  error?: unknown,
): void {
  const tileKey = `${coords.z}/${coords.x}/${coords.y}`;

  if (import.meta.env.DEV) {
    console.warn('[TileLayer] Tile load failed', {
      sourceId: source.id,
      tileKey,
      url,
      error,
    });
    return;
  }

  console.warn(`[TileLayer] Tile load failed: ${source.id} ${tileKey}`);
}

function attachTileLayerDiagnostics(
  layer: L.TileLayer,
  source: TileSourceConfig,
): L.TileLayer {
  layer.on('tileerror', (event: L.TileErrorEvent) => {
    const coords = event.coords
      ? { x: event.coords.x, y: event.coords.y, z: event.coords.z }
      : { x: NaN, y: NaN, z: NaN };
    const fallbackUrl = Number.isFinite(coords.x)
      ? resolveTemplateUrl(
        source.url,
        coords.x,
        coords.y,
        coords.z,
        source.subdomains || 'abc',
        source.api_key || '',
      )
      : source.url;
    const url = event.tile instanceof HTMLImageElement && event.tile.currentSrc
      ? event.tile.currentSrc
      : event.tile instanceof HTMLImageElement
        ? event.tile.src
        : fallbackUrl;

    logTileLoadError(source, coords, url, event.error);
  });

  return layer;
}

/**
 * 创建无间隙瓦片图层
 * Web版本：直接加载网络瓦片，无缓存
 */
export function createTileLayer(source: TileSourceConfig): L.GridLayer {
  const hasCustomTemplateTokens =
    /\{\$x\}|\{\$y\}|\{\$z\}|\{\$Galileo\}|\{quadkey\}|\{r\}|\{api_key\}/i.test(source.url);

  if (hasCustomTemplateTokens) {
    const CustomTileLayer = L.GridLayer.extend({
      options: {
        ...TILE_OPTIONS_BASE,
        attribution: source.attribution || `&copy; ${source.name}`,
        maxNativeZoom: source.maxNativeZoom ?? 19,
        subdomains: source.subdomains || 'abc',
      },

      createTile(
        coords: { x: number; y: number; z: number },
        done: (error?: any, tile?: HTMLElement) => void,
      ) {
        const tile = document.createElement('img');

        const url = resolveTemplateUrl(
          source.url,
          coords.x,
          coords.y,
          coords.z,
          source.subdomains || 'abc',
          source.api_key || '',
        );

        tile.src = url;

        const tileSize = this.getTileSize();
        tile.style.width = `${tileSize.x + 2}px`;
        tile.style.height = `${tileSize.y + 2}px`;
        tile.style.backfaceVisibility = 'hidden';
        tile.style.imageRendering = 'auto';
        tile.style.marginLeft = '-1px';
        tile.style.marginTop = '-1px';
        tile.alt = '';

        tile.onload = () => done(null, tile);
        tile.onerror = (error) => {
          logTileLoadError(source, coords, url, error);
          done(error, tile);
        };

        return tile;
      },
    });

    return new (CustomTileLayer as unknown as new () => L.GridLayer)();
  }

  // 标准 URL
  return attachTileLayerDiagnostics(L.tileLayer(source.url, {
    ...TILE_OPTIONS_BASE,
    attribution: source.attribution || `&copy; ${source.name}`,
    maxNativeZoom: source.maxNativeZoom ?? 19,
    subdomains: source.subdomains || 'abc',
  }), source);
}

/**
 * 替换地图上的瓦片图层
 */
export function replaceTileLayer(
  map: L.Map,
  previousLayer: L.TileLayer | L.GridLayer | null,
  source: TileSourceConfig,
): L.GridLayer | L.TileLayer {
  if (previousLayer) {
    map.removeLayer(previousLayer);
  }
  const layer = createTileLayer(source);
  layer.addTo(map);
  return layer;
}

// 预设图源（36个：22个免费 + 14个需API Key）
// 更新日志：
//  - 2025-01: 从TOOL项目移植完整预设图源配置
//  - 分类：basic基础、satellite卫星、terrain地形、special特殊、esri系列、tianditu天地图、stadia、weather天气
export const PRESET_TILE_SOURCES: TileSourceConfig[] = [
  // ========================================================================
  // 基础地图（7个）- 免费，无需Key
  // ========================================================================
  {
    id: 'osm_mapnik',
    name: 'OpenStreetMap',
    type: 'xyz',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxNativeZoom: 19,
    minZoom: 1,
    attribution: '© OpenStreetMap contributors',
    projection: 'wgs84',
    category: 'basic',
    icon: '🌍',
    enabled: 1,
  },
  {
    id: 'osm_de',
    name: 'OpenStreetMap DE',
    type: 'xyz',
    url: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png',
    maxNativeZoom: 18,
    minZoom: 1,
    attribution: '© OpenStreetMap DE contributors',
    projection: 'wgs84',
    category: 'basic',
    icon: '🇩🇪',
    enabled: 1,
  },
  {
    id: 'carto_positron',
    name: 'CartoDB Positron',
    type: 'xyz',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    maxNativeZoom: 20,
    minZoom: 1,
    attribution: '© OpenStreetMap, © CARTO',
    projection: 'wgs84',
    category: 'basic',
    icon: '☀️',
    enabled: 1,
  },
  {
    id: 'carto_positron_nolabels',
    name: 'CartoDB Positron (无标注)',
    type: 'xyz',
    url: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    maxNativeZoom: 20,
    minZoom: 1,
    attribution: '© OpenStreetMap, © CARTO',
    projection: 'wgs84',
    category: 'basic',
    icon: '🌫️',
    enabled: 1,
  },
  {
    id: 'carto_darkmatter',
    name: 'CartoDB DarkMatter',
    type: 'xyz',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    maxNativeZoom: 20,
    minZoom: 1,
    attribution: '© OpenStreetMap, © CARTO',
    projection: 'wgs84',
    category: 'basic',
    icon: '🌑',
    enabled: 1,
  },
  {
    id: 'carto_darkmatter_nolabels',
    name: 'CartoDB DarkMatter (无标注)',
    type: 'xyz',
    url: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    maxNativeZoom: 20,
    minZoom: 1,
    attribution: '© OpenStreetMap, © CARTO',
    projection: 'wgs84',
    category: 'basic',
    icon: '🌫️',
    enabled: 1,
  },
  {
    id: 'carto_voyager',
    name: 'CartoDB Voyager',
    type: 'xyz',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    maxNativeZoom: 20,
    minZoom: 1,
    attribution: '© OpenStreetMap, © CARTO',
    projection: 'wgs84',
    category: 'basic',
    icon: '🧭',
    enabled: 1,
  },

  // ========================================================================
  // 卫星影像（2个）- 免费，无需Key
  // ========================================================================
  {
    id: 'esri_world_imagery',
    name: 'Esri 卫星影像',
    type: 'xyz',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxNativeZoom: 19,
    minZoom: 1,
    attribution: '© Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    projection: 'wgs84',
    category: 'satellite',
    icon: '🛰️',
    enabled: 1,
  },
  {
    id: 'gaode_satellite',
    name: '高德卫星',
    type: 'xyz',
    url: 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
    subdomains: '1234',
    maxNativeZoom: 18,
    minZoom: 1,
    attribution: '© 高德地图',
    projection: 'gcj02',
    category: 'satellite',
    icon: '🛰️',
    enabled: 1,
  },

  // ========================================================================
  // 地形（3个）- 免费，无需Key
  // ========================================================================
  {
    id: 'opentopomap',
    name: 'OpenTopoMap',
    type: 'xyz',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    subdomains: 'abc',
    maxNativeZoom: 17,
    minZoom: 1,
    attribution: '© OpenStreetMap, SRTM | Map style: © OpenTopoMap (CC-BY-SA)',
    projection: 'wgs84',
    category: 'terrain',
    icon: '🏔️',
    enabled: 1,
  },
  {
    id: 'esri_world_terrain',
    name: 'Esri 地形',
    type: 'xyz',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}',
    maxNativeZoom: 13,
    minZoom: 1,
    attribution: '© Esri, USGS, TANA, DeLorme, and NPS',
    projection: 'wgs84',
    category: 'terrain',
    icon: '⛰️',
    enabled: 1,
    three_d_globe_ready: false,
    availability_note: '该服务在大量区域会返回 “Map data not yet available” 占位瓦片，不适合作为默认三维地球底图。',
  },

  // ========================================================================
  // 特殊用途（5个）- 免费，无需Key
  // ========================================================================
  {
    id: 'openseamap',
    name: 'OpenSeaMap',
    type: 'xyz',
    url: 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png',
    maxNativeZoom: 19,
    minZoom: 1,
    attribution: '© OpenSeaMap contributors',
    projection: 'wgs84',
    category: 'special',
    icon: '⛵',
    enabled: 1,
  },
  {
    id: 'openfiremap',
    name: 'OpenFireMap',
    type: 'xyz',
    url: 'http://openfiremap.org/hytiles/{z}/{x}/{y}.png',
    maxNativeZoom: 19,
    minZoom: 1,
    attribution: '© OpenStreetMap | Map style: © OpenFireMap (CC-BY-SA)',
    projection: 'wgs84',
    category: 'special',
    icon: '🔥',
    enabled: 1,
    availability_note: '该服务当前返回 404，且仅提供 HTTP 链接，现代浏览器环境下不可稳定使用。',
  },
  {
    id: 'cyclosm',
    name: 'CyclOSM',
    type: 'xyz',
    url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
    subdomains: 'abc',
    maxNativeZoom: 20,
    minZoom: 1,
    attribution: '© CyclOSM | Map data: © OpenStreetMap',
    projection: 'wgs84',
    category: 'special',
    icon: '🚴',
    enabled: 1,
  },
  {
    id: 'waymarkedtrails_hiking',
    name: 'WaymarkedTrails 徒步',
    type: 'xyz',
    url: 'https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png',
    maxNativeZoom: 18,
    minZoom: 1,
    attribution: '© OpenStreetMap | Map style: © waymarkedtrails.org (CC-BY-SA)',
    projection: 'wgs84',
    category: 'special',
    icon: '🥾',
    enabled: 1,
  },
  {
    id: 'waymarkedtrails_cycling',
    name: 'WaymarkedTrails 骑行',
    type: 'xyz',
    url: 'https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png',
    maxNativeZoom: 18,
    minZoom: 1,
    attribution: '© OpenStreetMap | Map style: © waymarkedtrails.org (CC-BY-SA)',
    projection: 'wgs84',
    category: 'special',
    icon: '🚵',
    enabled: 1,
  },

  // ========================================================================
  // Esri 系列（5个）- 免费，无需Key
  // ========================================================================
  {
    id: 'esri_world_street',
    name: 'Esri 街道地图',
    type: 'xyz',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    maxNativeZoom: 19,
    minZoom: 1,
    attribution: '© Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012',
    projection: 'wgs84',
    category: 'esri',
    icon: '🛣️',
    enabled: 1,
  },
  {
    id: 'esri_world_topo',
    name: 'Esri 地形图',
    type: 'xyz',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    maxNativeZoom: 19,
    minZoom: 1,
    attribution: '© Esri, Garmin, FAO, NOAA, USGS, © OpenStreetMap contributors, and the GIS user community',
    projection: 'wgs84',
    category: 'esri',
    icon: '🗺️',
    enabled: 1,
  },
  {
    id: 'esri_world_physical',
    name: 'Esri 物理地图',
    type: 'xyz',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}',
    maxNativeZoom: 8,
    minZoom: 1,
    attribution: '© Esri, US National Park Service',
    projection: 'wgs84',
    category: 'esri',
    icon: '🌐',
    enabled: 1,
    three_d_globe_ready: false,
    availability_note: '该服务覆盖范围有限，切到三维地球时容易出现大面积空白占位。',
  },
  {
    id: 'esri_ocean',
    name: 'Esri 海洋地图',
    type: 'xyz',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
    maxNativeZoom: 13,
    minZoom: 1,
    attribution: '© Esri, GEBCO, NOAA, National Geographic, DeLorme, NAVTEQ, and Esri',
    projection: 'wgs84',
    category: 'esri',
    icon: '🌊',
    enabled: 1,
  },
  {
    id: 'esri_nat_geo',
    name: 'Esri 国家地理',
    type: 'xyz',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}',
    maxNativeZoom: 16,
    minZoom: 1,
    attribution: '© National Geographic, Esri, Garmin, HERE, UNEP-WCMC, USGS, NASA, ESA, METI, NRCAN, GEBCO, NOAA, increment P Corp.',
    projection: 'wgs84',
    category: 'esri',
    icon: '📰',
    enabled: 1,
  },

  // ========================================================================
  // 其他（3个）- 免费，无需Key
  // ========================================================================
  {
    id: 'mtbmap',
    name: 'MtbMap 山地车',
    type: 'xyz',
    url: 'https://tile.mtbmap.cz/mtbmap_tiles/{z}/{x}/{y}.png',
    maxNativeZoom: 18,
    minZoom: 1,
    attribution: '© OpenStreetMap contributors, MtbMap',
    projection: 'wgs84',
    category: 'other',
    icon: '🚵',
    enabled: 1,
  },
  {
    id: 'topplus_open',
    name: 'TopPlus Open (德国)',
    type: 'xyz',
    url: 'https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web/default/WEBMERCATOR/{z}/{y}/{x}.png',
    maxNativeZoom: 19,
    minZoom: 1,
    attribution: '© Bundesamt für Kartographie und Geodäsie',
    projection: 'wgs84',
    category: 'other',
    icon: '🇩🇪',
    enabled: 1,
  },
  {
    id: 'gaode_road',
    name: '高德路网',
    type: 'xyz',
    url: 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
    subdomains: '1234',
    maxNativeZoom: 18,
    minZoom: 1,
    attribution: '© 高德地图',
    projection: 'gcj02',
    category: 'basic',
    icon: '🗺️',
    enabled: 1,
  },

  // ========================================================================
  // 天地图系列（4个）- 需要免费API Key
  // 注册地址: https://console.tianditu.gov.cn
  // ========================================================================
  {
    id: 'tianditu_vec',
    name: '天地图矢量',
    type: 'xyz',
    url: 'https://t{s}.tianditu.gov.cn/DataServer?T=vec_w&x={x}&y={y}&l={z}&tk={api_key}',
    subdomains: '01234567',
    maxNativeZoom: 18,
    minZoom: 1,
    attribution: '© 天地图',
    projection: 'wgs84',
    category: 'tianditu',
    icon: '🇨🇳',
    enabled: 1,
    requires_api_key: true,
    api_key_hint: '请前往 console.tianditu.gov.cn 注册获取免费Key',
  },
  {
    id: 'tianditu_img',
    name: '天地图影像',
    type: 'xyz',
    url: 'https://t{s}.tianditu.gov.cn/DataServer?T=img_w&x={x}&y={y}&l={z}&tk={api_key}',
    subdomains: '01234567',
    maxNativeZoom: 18,
    minZoom: 1,
    attribution: '© 天地图',
    projection: 'wgs84',
    category: 'tianditu',
    icon: '🛰️',
    enabled: 1,
    requires_api_key: true,
    api_key_hint: '请前往 console.tianditu.gov.cn 注册获取免费Key',
  },
  {
    id: 'tianditu_ter',
    name: '天地图地形',
    type: 'xyz',
    url: 'https://t{s}.tianditu.gov.cn/DataServer?T=ter_w&x={x}&y={y}&l={z}&tk={api_key}',
    subdomains: '01234567',
    maxNativeZoom: 14,
    minZoom: 1,
    attribution: '© 天地图',
    projection: 'wgs84',
    category: 'tianditu',
    icon: '🏔️',
    enabled: 1,
    requires_api_key: true,
    api_key_hint: '请前往 console.tianditu.gov.cn 注册获取免费Key',
  },
  {
    id: 'tianditu_cia',
    name: '天地图影像注记',
    type: 'xyz',
    url: 'https://t{s}.tianditu.gov.cn/DataServer?T=cia_w&x={x}&y={y}&l={z}&tk={api_key}',
    subdomains: '01234567',
    maxNativeZoom: 18,
    minZoom: 1,
    attribution: '© 天地图',
    projection: 'wgs84',
    category: 'tianditu',
    icon: '📝',
    enabled: 1,
    requires_api_key: true,
    api_key_hint: '请前往 console.tianditu.gov.cn 注册获取免费Key',
    is_overlay: true,
  },

  // ========================================================================
  // Stadia Maps 系列（6个）- 需要免费API Key
  // 注册地址: https://stadiamaps.com
  // ========================================================================
  {
    id: 'stadia_alidade_smooth',
    name: 'Stadia Alidade Smooth',
    type: 'xyz',
    url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png?api_key={api_key}',
    maxNativeZoom: 20,
    minZoom: 1,
    attribution: '© Stadia Maps, © OpenMapTiles, © OpenStreetMap',
    projection: 'wgs84',
    category: 'stadia',
    icon: '🎨',
    enabled: 1,
    requires_api_key: true,
    api_key_hint: '请前往 stadiamaps.com 注册获取免费Key',
  },
  {
    id: 'stadia_alidade_smooth_dark',
    name: 'Stadia Alidade Smooth Dark',
    type: 'xyz',
    url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png?api_key={api_key}',
    maxNativeZoom: 20,
    minZoom: 1,
    attribution: '© Stadia Maps, © OpenMapTiles, © OpenStreetMap',
    projection: 'wgs84',
    category: 'stadia',
    icon: '🌙',
    enabled: 1,
    requires_api_key: true,
    api_key_hint: '请前往 stadiamaps.com 注册获取免费Key',
  },
  {
    id: 'stadia_osm_bright',
    name: 'Stadia OSM Bright',
    type: 'xyz',
    url: 'https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}{r}.png?api_key={api_key}',
    maxNativeZoom: 20,
    minZoom: 1,
    attribution: '© Stadia Maps, © OpenMapTiles, © OpenStreetMap',
    projection: 'wgs84',
    category: 'stadia',
    icon: '✨',
    enabled: 1,
    requires_api_key: true,
    api_key_hint: '请前往 stadiamaps.com 注册获取免费Key',
  },
  {
    id: 'stadia_outdoors',
    name: 'Stadia Outdoors',
    type: 'xyz',
    url: 'https://tiles.stadiamaps.com/tiles/outdoors/{z}/{x}/{y}{r}.png?api_key={api_key}',
    maxNativeZoom: 20,
    minZoom: 1,
    attribution: '© Stadia Maps, © OpenMapTiles, © OpenStreetMap',
    projection: 'wgs84',
    category: 'stadia',
    icon: '🏕️',
    enabled: 1,
    requires_api_key: true,
    api_key_hint: '请前往 stadiamaps.com 注册获取免费Key',
  },
  {
    id: 'stadia_stamen_terrain',
    name: 'Stamen Terrain (Stadia)',
    type: 'xyz',
    url: 'https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}{r}.png?api_key={api_key}',
    maxNativeZoom: 18,
    minZoom: 1,
    attribution: '© Stadia Maps, © Stamen Design, © OpenMapTiles, © OpenStreetMap',
    projection: 'wgs84',
    category: 'stadia',
    icon: '🏞️',
    enabled: 1,
    requires_api_key: true,
    api_key_hint: '请前往 stadiamaps.com 注册获取免费Key',
  },
  {
    id: 'stamen_toner',
    name: 'Stamen 黑白 (Stadia)',
    type: 'xyz',
    url: 'https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}{r}.png?api_key={api_key}',
    maxNativeZoom: 20,
    minZoom: 1,
    attribution: '© Stadia Maps, © Stamen Design, © OpenMapTiles, © OpenStreetMap',
    projection: 'wgs84',
    category: 'stadia',
    icon: '⬛',
    enabled: 1,
    requires_api_key: true,
    api_key_hint: '请前往 stadiamaps.com 注册获取免费Key',
  },

  // ========================================================================
  // OpenWeatherMap 天气图层（4个）- 需要免费API Key，叠加层
  // 注册地址: https://openweathermap.org/api
  // ========================================================================
  {
    id: 'owm_clouds',
    name: '天气 - 云层',
    type: 'xyz',
    url: 'https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid={api_key}',
    maxNativeZoom: 18,
    minZoom: 1,
    attribution: '© OpenWeatherMap',
    projection: 'wgs84',
    category: 'weather',
    icon: '☁️',
    enabled: 1,
    requires_api_key: true,
    api_key_hint: '请前往 openweathermap.org/api 注册获取免费Key',
    is_overlay: true,
    is_weather: true,
  },
  {
    id: 'owm_precipitation',
    name: '天气 - 降水',
    type: 'xyz',
    url: 'https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid={api_key}',
    maxNativeZoom: 18,
    minZoom: 1,
    attribution: '© OpenWeatherMap',
    projection: 'wgs84',
    category: 'weather',
    icon: '🌧️',
    enabled: 1,
    requires_api_key: true,
    api_key_hint: '请前往 openweathermap.org/api 注册获取免费Key',
    is_overlay: true,
    is_weather: true,
  },
  {
    id: 'owm_temperature',
    name: '天气 - 温度',
    type: 'xyz',
    url: 'https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid={api_key}',
    maxNativeZoom: 18,
    minZoom: 1,
    attribution: '© OpenWeatherMap',
    projection: 'wgs84',
    category: 'weather',
    icon: '🌡️',
    enabled: 1,
    requires_api_key: true,
    api_key_hint: '请前往 openweathermap.org/api 注册获取免费Key',
    is_overlay: true,
    is_weather: true,
  },
  {
    id: 'owm_wind',
    name: '天气 - 风速',
    type: 'xyz',
    url: 'https://tile.openweathermap.org/map/wind_new/{z}/{x}/{y}.png?appid={api_key}',
    maxNativeZoom: 18,
    minZoom: 1,
    attribution: '© OpenWeatherMap',
    projection: 'wgs84',
    category: 'weather',
    icon: '💨',
    enabled: 1,
    requires_api_key: true,
    api_key_hint: '请前往 openweathermap.org/api 注册获取免费Key',
    is_overlay: true,
    is_weather: true,
  },
];

// 向后兼容的旧ID映射
export const LEGACY_ID_MAP: Record<string, string> = {
  'light': 'esri_world_street', // 使用 Esri 街道地图替代
  'satellite': 'esri_world_imagery',
  'osm': 'osm_mapnik',
};

export type TileSourceViewMode = '2D' | '3DGlobe' | '3D';

export function normalizeCesiumTemplateUrl(source: TileSourceConfig): string {
  const retinaSuffix =
    typeof window !== 'undefined' && (window.devicePixelRatio || 1) > 1
      ? '@2x'
      : '';

  return source.url
    .replace(/\{r\}/gi, retinaSuffix)
    .replace(/\{api_key\}/gi, source.api_key || '');
}

export function getTileSourceAvailabilityIssue(
  source: TileSourceConfig,
  viewMode?: TileSourceViewMode,
): string | null {
  if (source.enabled === 0) {
    return '图源已禁用';
  }

  if (source.requires_api_key && !source.api_key) {
    return source.api_key_hint || '该图源需要先配置 API Key';
  }

  if (/^http:\/\//i.test(source.url)) {
    return source.availability_note || '该图源仅提供 HTTP 链接，在当前环境下无法稳定加载';
  }

  if (viewMode === '3DGlobe' && source.three_d_globe_ready === false) {
    return source.availability_note || '该图源不适合作为三维地球底图';
  }

  return null;
}

/**
 * 创建支持显式离线下载的瓦片图层
 * 优先从离线下载区域或历史浏览缓存加载，无缓存时从网络获取
 */
export function createCachedTileLayer(source: TileSourceConfig): L.GridLayer {
  const CustomCachedTileLayer = L.GridLayer.extend({
    options: {
      ...TILE_OPTIONS_BASE,
      attribution: source.attribution || `&copy; ${source.name}`,
      maxNativeZoom: source.maxNativeZoom ?? 19,
      subdomains: source.subdomains || 'abc',
    },

    async createTile(
      coords: { x: number; y: number; z: number },
      done: (error?: any, tile?: HTMLElement) => void,
    ) {
      const tile = document.createElement('img');
      const tileSize = this.getTileSize();

      tile.style.width = `${tileSize.x + 2}px`;
      tile.style.height = `${tileSize.y + 2}px`;
      tile.style.backfaceVisibility = 'hidden';
      tile.style.imageRendering = 'auto';
      tile.style.marginLeft = '-1px';
      tile.style.marginTop = '-1px';
      tile.alt = '';

      const projection = source.projection || 'wgs84';

      try {
        // 1. 先尝试从缓存加载
        const cachedDataUri = await getTileDataUriByCoords(
          source.id,
          coords.z,
          coords.x,
          coords.y
        );

        if (cachedDataUri) {
          tile.src = cachedDataUri;
          done(null, tile);
          return tile;
        }

        // 2. 尝试历史浏览缓存 / 兼容缓存
        const autoCachedBlob = await getAutoCacheTile(
          source.id,
          projection,
          coords.z,
          coords.x,
          coords.y
        );

        if (autoCachedBlob) {
          const reader = new FileReader();
          reader.onload = () => {
            tile.src = reader.result as string;
            done(null, tile);
          };
          reader.readAsDataURL(autoCachedBlob);
          return tile;
        }
      } catch (err) {
        console.warn(`[TileLayer] Cache lookup failed for ${coords.z}/${coords.x}/${coords.y}:`, err);
      }

      // 3. 从网络加载
      const url = resolveTemplateUrl(
        source.url,
        coords.x,
        coords.y,
        coords.z,
        source.subdomains || 'abc',
        source.api_key || '',
      );

      tile.src = url;
      tile.onload = () => done(null, tile);
      tile.onerror = (error) => {
        logTileLoadError(source, coords, url, error);
        done(error, tile);
      };

      return tile;
    },
  });

  return new (CustomCachedTileLayer as unknown as new () => L.GridLayer)();
}
