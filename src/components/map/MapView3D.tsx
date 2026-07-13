import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { useMapStore, type HiddenOsmBuilding, type MapRenderQuality } from '../../stores/mapStore';
import { useModelStore, type PlacedModel } from '../../stores/modelStore';
import useAuthStore from '../../stores/authStore';
import studioProjectApi from '../../services/studioProjectApi';
import {
  cesiumRangeFromZoom,
  clampPitchDeg,
  clampZoomForMode,
  normalizeHeadingDeg,
  smoothstep,
  lerp,
  type MapBrowseSyncSource,
  zoomFromCesiumRange,
  type MapBrowseState,
} from '../../utils/map/browseState';
import { createFixedFrameOrientation, createPlacementPose } from '../../utils/map/cesiumTransforms';
import {
  PRESET_TILE_SOURCES,
  getTileSourceAvailabilityIssue,
  normalizeCesiumTemplateUrl,
} from '../../utils/map/tileLayer'
import {
  classifyProviderError,
  classifyTerrainFallbackFailure,
  createLatestRequestGate,
  createProviderRuntimeSources,
  deriveProviderOverallStatus,
  deriveTileRequestRuntimeStatus,
  deriveTilesetRuntimeStatus,
  observeFirstSuccessfulTileRequest,
  type ClassifiedProviderError,
  type LatestRequestToken,
  type MapProviderKey,
  type MapProviderRuntimeEntry,
  type MapProviderRuntimeSnapshot,
  type MapProviderRuntimeSources,
} from '../../utils/map/providerRuntimeStatus'
import MapProviderStatusHud from './MapProviderStatusHud'

interface MapView3DProps {
  onBrowseStateChange?: (state: MapBrowseState) => void;
  browseSyncToken?: number;
  browseSyncSource?: MapBrowseSyncSource;
}

const MAX_MERCATOR_LATITUDE = 85.05112878;
const RANGE_MIN_METERS = 10;
const RANGE_MAX_METERS = 20_000_000;
const CAMERA_MIN_ZOOM_DISTANCE = 2;
const CAMERA_MAX_ZOOM_DISTANCE = 25_000_000;
const CAMERA_MAX_TILT_DEGREES = 88;
const CAMERA_WHEEL_NOTIFY_DELAY_MS = 140;
const CESIUM_TARGET_FRAME_RATE = 120;
const FPS_SAMPLE_INTERVAL_MS = 500;
const FPS_IDLE_RESET_DELAY_MS = FPS_SAMPLE_INTERVAL_MS * 3;
const CESIUM_GLOBE_MAX_SCREEN_SPACE_ERROR = 4;
const OSM_BUILDINGS_MAX_SCREEN_SPACE_ERROR = 16;
const MAX_INSTANCING_PREVIEW_MODELS = 96;
const MAX_TEMPLATE_FANOUT_MODELS = 48;
const RUNTIME_DEGRADE_FPS = 24;
const RUNTIME_BALANCE_FPS = 36;
const ARCGIS_TERRAIN_URL =
  'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer';

let arcGisTerrainProviderPromise: Promise<Cesium.TerrainProvider> | null = null;
let worldTerrainProviderPromise: Promise<Cesium.TerrainProvider> | null = null;

// ── 三方OSM：Overpass API 视口查询 ─────────────────────────────────────────
const OVERPASS_API_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const OVERPASS_MIN_CAMERA_HEIGHT = 3000; // 低于此高度才加载（米）
const OVERPASS_DEBOUNCE_MS = 5000;       // 视口变化后等待 ms 再请求（Overpass 限制 ~10s/req）
const OVERPASS_COOLDOWN_MS = 12000;      // 两次请求之间的最小间隔
const OVERPASS_RETRY_BASE_MS = 15000;    // 429 退避重试基础等待时间
const OVERPASS_MAX_RETRIES = 2;          // 429 最大重试次数
const OVERPASS_FAILURE_BACKOFF_MS = 45000;
const OVERPASS_REQUEST_TIMEOUT_MS = 12000;
const OVERPASS_DEFAULT_HEIGHT = 10;      // 缺少高度数据时的默认值（米）
const OVERPASS_BUILDING_COLOR = Cesium.Color.fromCssColorString('#D0E4F0').withAlpha(0.75);
const OVERPASS_BUILDING_OUTLINE_COLOR = Cesium.Color.fromCssColorString('#8AB4D0').withAlpha(0.4);

/** 从 Cesium viewer 获取当前视口的经纬度边界 */
function getViewportBBox(viewer: Cesium.Viewer): { south: number; west: number; north: number; east: number } | null {
  const canvas = viewer.scene.canvas;
  const camera = viewer.camera;
  const ellipsoid = viewer.scene.globe.ellipsoid;

  const corners = [
    new Cesium.Cartesian2(0, 0),
    new Cesium.Cartesian2(canvas.width, 0),
    new Cesium.Cartesian2(canvas.width, canvas.height),
    new Cesium.Cartesian2(0, canvas.height),
    new Cesium.Cartesian2(canvas.width / 2, canvas.height / 2),
  ];

  let lonMin = 180, lonMax = -180, latMin = 90, latMax = -90;
  let validCount = 0;

  for (const corner of corners) {
    const ray = camera.getPickRay(corner);
    if (!ray) continue;
    const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
    if (!cartesian) continue;
    const carto = ellipsoid.cartesianToCartographic(cartesian);
    const lon = Cesium.Math.toDegrees(carto.longitude);
    const lat = Cesium.Math.toDegrees(carto.latitude);
    lonMin = Math.min(lonMin, lon);
    lonMax = Math.max(lonMax, lon);
    latMin = Math.min(latMin, lat);
    latMax = Math.max(latMax, lat);
    validCount++;
  }

  if (validCount < 2) return null;
  // 限制查询范围：bbox 面积不超过约 0.02°×0.02°（防止查询过大）
  const lonSpan = lonMax - lonMin;
  const latSpan = latMax - latMin;
  if (lonSpan > 0.05 || latSpan > 0.05) {
    // 视野太广，裁剪到中心附近
    const centerLon = (lonMin + lonMax) / 2;
    const centerLat = (latMin + latMax) / 2;
    const halfSpan = 0.02;
    return { south: centerLat - halfSpan, west: centerLon - halfSpan, north: centerLat + halfSpan, east: centerLon + halfSpan };
  }
  return { south: latMin, west: lonMin, north: latMax, east: lonMax };
}

/** 构建 Overpass QL 查询：获取 bbox 内的所有建筑 */
function buildOverpassQuery(bbox: { south: number; west: number; north: number; east: number }): string {
  return `[out:json][timeout:15][bbox:${bbox.south},${bbox.west},${bbox.north},${bbox.east}];(way["building"];relation["building"];);out geom;`;
}

function getOverpassEndpointLabel(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** 将 Overpass JSON 响应转换为 GeoJSON FeatureCollection */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function overpassToGeoJson(data: { elements: Array<{ type: string; tags?: Record<string, string>; geometry?: Array<{ lat: number; lon: number }>; bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number }; members?: Array<{ type: string; role: string; geometry?: Array<{ lat: number; lon: number }> }> }> }): { type: 'FeatureCollection'; features: Array<{ type: 'Feature'; properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown } }> } {
  const features: Array<{ type: 'Feature'; properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown } }> = [];

  for (const el of data.elements) {
    if (el.type === 'way' && el.geometry) {
      const coords = el.geometry.map((g: { lat: number; lon: number }) => [g.lon, g.lat]);
      // 确保多边形闭合
      if (coords.length >= 3) {
        const first = coords[0], last = coords[coords.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
          coords.push([...first]);
        }
        features.push({
          type: 'Feature',
          properties: el.tags || {},
          geometry: { type: 'Polygon', coordinates: [coords] },
        });
      }
    } else if (el.type === 'relation' && el.members) {
      // relation 多多边形：外环 + 内环
      const outers: number[][][] = [];
      const inners: number[][][] = [];
      for (const member of el.members) {
        if (member.geometry) {
          const ring = member.geometry.map((g: { lat: number; lon: number }) => [g.lon, g.lat]);
          if (ring.length >= 3) {
            const first = ring[0], last = ring[ring.length - 1];
            if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
            if (member.role === 'outer') outers.push(ring);
            else if (member.role === 'inner') inners.push(ring);
          }
        }
      }
      for (const outer of outers) {
        features.push({
          type: 'Feature',
          properties: el.tags || {},
          geometry: { type: 'Polygon', coordinates: [outer, ...inners] },
        });
      }
    }
  }

  return { type: 'FeatureCollection', features };
}

// Google Earth 风格：海拔自适应缩放
const ZOOM_BASE_MIN = 1.04;           // 贴地时的缩放系数（极慢）
const ZOOM_BASE_MAX = 1.35;           // 太空时的缩放系数（极快）
const ZOOM_ALTITUDE_SLOW = 200;       // 低于此高度（米）使用最小系数
const ZOOM_ALTITUDE_FAST = 500_000;   // 高于此高度使用最大系数

// 自动俯仰 (Auto-Tilt)
const AUTO_TILT_START_HEIGHT = 2000;         // 开始自动倾斜的海拔（米）
const AUTO_TILT_END_HEIGHT = 300;            // 完全倾斜的海拔
const AUTO_TILT_TARGET_PITCH_DEG = -45;      // 目标倾斜角度
const AUTO_TILT_BLEND_FACTOR = 0.12;         // 每次缩放事件的混合步长

// 轨道旋转灵敏度
const ORBIT_SENSITIVITY_X = 1.4;       // 水平拖拽 → heading 灵敏度
const ORBIT_SENSITIVITY_Y_DEG = 120;   // 垂直拖拽 → pitch 灵敏度（度）

type TilesetRef = MutableRefObject<Cesium.Cesium3DTileset | null>;
type PickedEntityLike = {
  id?: unknown;
};
type PickedOsmFeatureLike = {
  primitive?: unknown;
  tileset?: unknown;
  content?: {
    tileset?: unknown;
    tile?: {
      tileset?: unknown;
    };
  };
  getProperty?: (name: string) => unknown;
  getPropertyInherited?: (name: string) => unknown;
};
type OsmBuildingMenuState = {
  anchor: { x: number; y: number };
  building: HiddenOsmBuilding;
};
type TerrainWorkZoneRuntimePreviewSource = {
  id: string;
  type: 'glb' | 'tileset' | 'instancing';
  url: string;
  lodLevel?: string | null;
  fallbackUrl?: string | null;
  instancing?: {
    planUrl?: string | null;
    instancedUrl?: string | null;
    templateCount?: number;
    totalInstances?: number;
    templates?: Array<{
      id: string;
      url?: string | null;
      key?: string | null;
      geometryFamily?: string | null;
      appearanceKey?: string | null;
      instanceCount?: number;
      instances?: Array<{
        objectId?: string | null;
        title?: string | null;
        translation?: { x?: number; y?: number; z?: number };
        rotationDeg?: number;
        scale?: { x?: number; y?: number; z?: number };
      }>;
    }>;
  } | null;
};
type TerrainWorkZoneRuntimePreviewPayload = {
  zoneId?: string | null;
  originWgs84?: { longitude?: number; latitude?: number; height?: number | null } | null;
  sources?: TerrainWorkZoneRuntimePreviewSource[];
};
type TerrainWorkZoneRuntimeStrategy = 'template-fanout' | 'instanced-glb' | 'merged-glb';
type TerrainWorkZoneRuntimePolicy = {
  strategy: TerrainWorkZoneRuntimeStrategy;
  reason: string;
  qualityPreset: string;
  fpsBucket: 'idle' | 'degraded' | 'balanced' | 'quality';
};
type TerrainWorkZoneRuntimeHandle = {
  signature: string;
  models: Cesium.Model[];
  tilesets: Cesium.Cesium3DTileset[];
  sourceSummaries: Array<{
    sourceId: string;
    sourceType: string;
    strategy: string;
    instanceCount: number;
    fallbackReason: string | null;
  }>;
};
type TerrainWorkZoneRuntimeSummary = {
  zoneCount: number
  sourceCount: number
  strategyLabel: string
  requestedStrategyLabel: string
  fallbackReason: string | null
  qualityPreset: string
  fpsBucket: 'idle' | 'degraded' | 'balanced' | 'quality'
  renderFps: number | null
  instanceCount: number
  fallbackSourceCount: number
}
type GlobeStatusTone = 'loading' | 'ready' | 'warn' | 'error'
type GlobeExperienceStatus = {
  visible: boolean;
  eyebrow: string;
  title: string;
  message: string;
  detail: string | null;
  tone: GlobeStatusTone;
};
type DebugWindow = Window & typeof globalThis & {
  __ARCSPRO_CESIUM_VIEWER__?: Cesium.Viewer;
  __ARCSPRO_CESIUM_DEBUG__?: {
    placedModelIds: string[];
    entityMapKeys: string[];
    entityIds: string[];
    terrainWorkZoneRuntimes?: Array<{
      zoneId: string;
      signature: string;
      sourceSummaries: Array<{
        sourceId: string;
        sourceType: string;
        strategy: string;
        instanceCount: number;
        fallbackReason: string | null;
      }>;
    }>;
  };
};

function getArcGisTerrainProvider(): Promise<Cesium.TerrainProvider> {
  if (!arcGisTerrainProviderPromise) {
    arcGisTerrainProviderPromise = Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(
      ARCGIS_TERRAIN_URL
    ).catch((error) => {
      arcGisTerrainProviderPromise = null
      throw error
    })
  }

  return arcGisTerrainProviderPromise;
}

function getWorldTerrainProvider(): Promise<Cesium.TerrainProvider> {
  if (!worldTerrainProviderPromise) {
    worldTerrainProviderPromise = Cesium.createWorldTerrainAsync({
      // requestVertexNormals 启用后地形光照更平滑，减少低 LOD 三角面产生的视觉“尖刺”感
      requestVertexNormals: true,
      requestWaterMask: false,
    }).catch((error) => {
      worldTerrainProviderPromise = null
      throw error
    })
  }

  return worldTerrainProviderPromise;
}

function resetTerrainProviderPromise(providerId: string): void {
  if (providerId === 'cesium-world-terrain') {
    worldTerrainProviderPromise = null
    return
  }

  arcGisTerrainProviderPromise = null
}

function getOrgIdFromLocation(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const orgId = new URLSearchParams(window.location.search).get('orgId');
  return orgId || undefined;
}

function createAuthorizedCesiumResource(url: string): Cesium.Resource {
  const token = useAuthStore.getState().token;
  return new Cesium.Resource({
    url,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

function buildFocusZonePreviewModelMatrix(
  originWgs84?: { longitude?: number; latitude?: number; height?: number | null } | null,
): Cesium.Matrix4 {
  const longitude = Number(originWgs84?.longitude ?? 0);
  const latitude = Number(originWgs84?.latitude ?? 0);
  const height = Number(originWgs84?.height ?? 0);
  const origin = Cesium.Cartesian3.fromDegrees(longitude, latitude, Number.isFinite(height) ? height : 0);
  const enuFrame = Cesium.Transforms.eastNorthUpToFixedFrame(origin);
  const localAxisSwap = Cesium.Matrix4.fromArray([
    1, 0, 0, 0,
    0, 0, 1, 0,
    0, 1, 0, 0,
    0, 0, 0, 1,
  ]);
  return Cesium.Matrix4.multiply(enuFrame, localAxisSwap, new Cesium.Matrix4());
}

function buildFocusZoneInstancingModelMatrix(
  baseModelMatrix: Cesium.Matrix4,
  instance?: {
    translation?: { x?: number; y?: number; z?: number };
    rotationDeg?: number;
    scale?: { x?: number; y?: number; z?: number };
  } | null,
): Cesium.Matrix4 {
  const translation = new Cesium.Cartesian3(
    Number(instance?.translation?.x ?? 0),
    Number(instance?.translation?.y ?? 0),
    Number(instance?.translation?.z ?? 0),
  );
  const rotation = Cesium.Matrix3.fromRotationY(
    Cesium.Math.toRadians(Number(instance?.rotationDeg ?? 0)),
  );
  let localMatrix = Cesium.Matrix4.fromRotationTranslation(rotation, translation, new Cesium.Matrix4());
  const scale = new Cesium.Cartesian3(
    Number(instance?.scale?.x ?? 1),
    Number(instance?.scale?.y ?? 1),
    Number(instance?.scale?.z ?? 1),
  );
  localMatrix = Cesium.Matrix4.multiplyByScale(localMatrix, scale, localMatrix);
  return Cesium.Matrix4.multiply(baseModelMatrix, localMatrix, new Cesium.Matrix4());
}

function resolveTerrainWorkZoneRuntimePolicy(
  renderQuality: MapRenderQuality,
  renderFps: number | null,
): TerrainWorkZoneRuntimePolicy {
  const fpsBucket = renderFps == null
    ? 'idle'
    : renderFps < RUNTIME_DEGRADE_FPS
      ? 'degraded'
      : renderFps < RUNTIME_BALANCE_FPS
        ? 'balanced'
        : 'quality';

  if (fpsBucket === 'degraded') {
    return {
      strategy: 'merged-glb',
      reason: `fps<${RUNTIME_DEGRADE_FPS}`,
      qualityPreset: renderQuality.preset,
      fpsBucket,
    };
  }

  if (renderQuality.preset === 'performance') {
    return {
      strategy: 'merged-glb',
      reason: 'quality-preset-performance',
      qualityPreset: renderQuality.preset,
      fpsBucket,
    };
  }

  if (renderQuality.preset === 'balanced' || fpsBucket === 'balanced') {
    return {
      strategy: 'instanced-glb',
      reason: renderQuality.preset === 'balanced' ? 'quality-preset-balanced' : `fps<${RUNTIME_BALANCE_FPS}`,
      qualityPreset: renderQuality.preset,
      fpsBucket,
    };
  }

  return {
    strategy: 'template-fanout',
    reason: 'quality-preset-high',
    qualityPreset: renderQuality.preset,
    fpsBucket,
  };
}

function formatTerrainRuntimeStrategyLabel(strategy: string): string {
  switch (strategy) {
    case 'template-fanout':
      return '模板展开预览';
    case 'instanced-glb':
      return '实例化 GLB';
    case 'merged-glb':
      return '合批 GLB';
    case 'tileset':
      return 'Tileset';
    case 'glb':
      return '单体 GLB';
    case 'empty':
      return '无可用资源';
    default:
      return strategy || '未知策略';
  }
}

function summarizeTerrainWorkZoneRuntimeHandles(
  handles: Iterable<TerrainWorkZoneRuntimeHandle>,
  policy: TerrainWorkZoneRuntimePolicy,
  renderFps: number | null,
): TerrainWorkZoneRuntimeSummary {
  const runtimeHandles = Array.from(handles);
  const sourceSummaries = runtimeHandles.flatMap((handle) => handle.sourceSummaries || []);
  const strategyLabels = Array.from(
    new Set(
      sourceSummaries
        .map((item) => item.strategy)
        .filter(Boolean)
        .map((item) => formatTerrainRuntimeStrategyLabel(item)),
    ),
  );
  const fallbackReasons = sourceSummaries
    .map((item) => item.fallbackReason)
    .filter((item): item is string => Boolean(item));
  const fallbackSourceCount = sourceSummaries.filter((item) => Boolean(item.fallbackReason)).length;
  const instanceCount = sourceSummaries.reduce((sum, item) => sum + Math.max(0, Number(item.instanceCount || 0)), 0);

  return {
    zoneCount: runtimeHandles.length,
    sourceCount: sourceSummaries.length,
    strategyLabel: strategyLabels.length > 0 ? strategyLabels.join(' + ') : formatTerrainRuntimeStrategyLabel(policy.strategy),
    requestedStrategyLabel: formatTerrainRuntimeStrategyLabel(policy.strategy),
    fallbackReason: fallbackReasons.length > 0 ? fallbackReasons[0] : (policy.strategy === 'merged-glb' ? policy.reason : null),
    qualityPreset: policy.qualityPreset,
    fpsBucket: policy.fpsBucket,
    renderFps,
    instanceCount,
    fallbackSourceCount,
  };
}

function formatRuntimePolicyReason(reason: string | null): string | null {
  if (!reason) return null;

  if (reason.startsWith('fps<')) {
    return '当前设备帧率偏低，系统已自动切到更稳的预览模式。';
  }

  switch (reason) {
    case 'quality-preset-performance':
      return '你当前选择了“性能”画质，系统会优先使用更轻的预览模式。';
    case 'quality-preset-balanced':
      return '你当前选择了“平衡”画质，系统默认优先使用实例化预览。';
    case 'instanced-glb-load-failed':
    case 'instanced-glb-fallback-load-failed':
      return '实例化资源暂时不可用，系统已自动回退到合批白模。';
    case 'template-fanout-load-failed':
      return '高精展开预览暂时不可用，系统已自动回退到更稳的模式。';
    case 'missing-fallback-url':
      return '当前重点区缺少备用资源，建议重新生成导出包。';
    default:
      return '系统已根据当前设备状态自动调整预览方式。';
  }
}

function deriveGlobeExperienceStatus({
  hasRenderableSize,
  viewerReady,
  hasRenderedFrame,
  tileLoadCount,
  runtimeLoadingCount,
  expectedZoneCount,
  summary,
  providers,
}: {
  hasRenderableSize: boolean
  viewerReady: boolean
  hasRenderedFrame: boolean
  tileLoadCount: number
  runtimeLoadingCount: number
  expectedZoneCount: number
  summary: TerrainWorkZoneRuntimeSummary
  providers: MapProviderRuntimeSnapshot
}): GlobeExperienceStatus {
  if (!hasRenderableSize || !viewerReady) {
    return {
      visible: true,
      eyebrow: '三维场景',
      title: '正在启动地球视图',
      message: '正在初始化地形、底图和相机控制。',
      detail: '如果画面短时间内没有变化，请稍等几秒再观察。',
      tone: 'loading',
    };
  }

  if (providers.overall === 'failed' || providers.overall === 'unavailable') {
    const failedLabels = providers.requiredProviders
      .map((key) => providers.sources[key])
      .filter((entry) => entry.status === 'failed' || entry.status === 'unavailable')
      .map((entry) => entry.provider)
    return {
      visible: true,
      eyebrow: '三维资源',
      title: providers.overall === 'unavailable' ? '必要资源尚不可用' : '三维资源加载失败',
      message:
        failedLabels.length > 0
          ? `${failedLabels.join('、')}未能连接，场景不会标记为已就绪。`
          : '必要的三维资源未能连接，场景不会标记为已就绪。',
      detail: '请查看下方资源状态；可重试的服务会提供单独的重试入口。',
      tone: 'error',
    }
  }

  if (
    providers.overall === 'loading' ||
    !hasRenderedFrame ||
    tileLoadCount > 0 ||
    runtimeLoadingCount > 0
  ) {
    const hasPendingFocusZones = expectedZoneCount > 0 || summary.zoneCount > 0
    return {
      visible: true,
      eyebrow: hasPendingFocusZones ? '重点区预览' : '三维场景',
      title: hasPendingFocusZones ? '正在准备重点区预览' : '正在加载三维画面',
      message: hasPendingFocusZones
        ? '正在拉取地形、白模和重点区资源，首次进入可能需要几秒。'
        : '正在拉取底图和地形数据，首次进入可能需要几秒。',
      detail: '如果画面暂时发黑，请等待资源流入；仍无内容时可先切回 2D 或把画质调到“平衡”。',
      tone: 'loading',
    };
  }

  if (providers.overall === 'degraded') {
    return {
      visible: true,
      eyebrow: '三维资源',
      title: '场景正在降级运行',
      message: '至少一个必要资源正在使用备用数据或只完成了部分加载。',
      detail: '当前画面仍可浏览，但地形、底图或建筑可能不完整。',
      tone: 'warn',
    }
  }

  if (summary.fallbackSourceCount > 0 || summary.fallbackReason) {
    return {
      visible: true,
      eyebrow: '重点区预览',
      title: '已切到稳定预览',
      message: '系统已自动降低渲染复杂度，优先保证浏览稳定。',
      detail: formatRuntimePolicyReason(summary.fallbackReason),
      tone: 'warn',
    };
  }

  if (summary.zoneCount > 0) {
    return {
      visible: true,
      eyebrow: '重点区预览',
      title: '重点区白模已就绪',
      message: '可以继续在 GIS 里选对象，也可以直接进入工作台精修重点区。',
      detail: null,
      tone: 'ready',
    };
  }

  return {
    visible: true,
    eyebrow: '三维场景',
    title: '三维地球已就绪',
    message: '当前项目还没有可预览的重点区导出资源。',
    detail: '完成 terrain patch、发布清单和导出后，这里会自动出现重点区白模预览。',
    tone: 'ready',
  };
}

async function loadTerrainWorkZoneInstancingSource(
  viewer: Cesium.Viewer,
  modelMatrix: Cesium.Matrix4,
  source: TerrainWorkZoneRuntimePreviewSource,
  policy: TerrainWorkZoneRuntimePolicy,
): Promise<{ models: Cesium.Model[]; strategy: string; fallbackReason: string | null; instanceCount: number }> {
  const templates = source.instancing?.templates || [];
  const totalInstances = Number(source.instancing?.totalInstances ?? 0);
  const instancedUrl = source.instancing?.instancedUrl || source.url || null;
  const hasRenderableTemplates = templates.some((template) => template?.url && (template.instances?.length || 0) > 0);
  const canFanout = hasRenderableTemplates && totalInstances > 0 && totalInstances <= MAX_TEMPLATE_FANOUT_MODELS;
  const fallbackReasonParts: string[] = [];

  if (policy.strategy !== 'merged-glb' && policy.strategy !== 'template-fanout' && instancedUrl) {
    try {
      const instancedModel = await Cesium.Model.fromGltfAsync({
        url: createAuthorizedCesiumResource(instancedUrl),
        modelMatrix,
        allowPicking: false,
        asynchronous: true,
      });
      viewer.scene.primitives.add(instancedModel);
      return {
        models: [instancedModel],
        strategy: 'instanced-glb',
        fallbackReason: null,
        instanceCount: totalInstances,
      };
    } catch (error) {
      console.warn('[MapView3D] Failed to load instanced GLB preview, falling back:', error);
      fallbackReasonParts.push('instanced-glb-load-failed');
    }
  }

  if (policy.strategy === 'template-fanout') {
    if (canFanout && totalInstances <= MAX_INSTANCING_PREVIEW_MODELS) {
      const loadedModels: Cesium.Model[] = [];
      try {
        const loadQueue = templates.flatMap((template) => {
          if (!template?.url) return [];
          return (template.instances || []).map(async (instance) => {
            const model = await Cesium.Model.fromGltfAsync({
              url: createAuthorizedCesiumResource(template.url || ''),
              modelMatrix: buildFocusZoneInstancingModelMatrix(modelMatrix, instance),
              allowPicking: false,
              asynchronous: true,
            });
            viewer.scene.primitives.add(model);
            loadedModels.push(model);
            return model;
          });
        });

        const models = await Promise.all(loadQueue);
        return {
          models,
          strategy: 'template-fanout',
          fallbackReason: null,
          instanceCount: totalInstances,
        };
      } catch (error) {
        console.warn('[MapView3D] Falling back from template fanout preview:', error);
        loadedModels.forEach((model) => {
          if (!model.isDestroyed()) {
            viewer.scene.primitives.remove(model);
          }
        });
        fallbackReasonParts.push('template-fanout-load-failed');
      }
    } else {
      fallbackReasonParts.push(
        !hasRenderableTemplates
          ? 'template-fanout-no-templates'
          : `template-fanout-count>${MAX_TEMPLATE_FANOUT_MODELS}`,
      );
    }
  }

  if (policy.strategy === 'merged-glb') {
    fallbackReasonParts.push(policy.reason);
  }

  if (policy.strategy !== 'merged-glb' && instancedUrl) {
    try {
      const instancedModel = await Cesium.Model.fromGltfAsync({
        url: createAuthorizedCesiumResource(instancedUrl),
        modelMatrix,
        allowPicking: false,
        asynchronous: true,
      });
      viewer.scene.primitives.add(instancedModel);
      return {
        models: [instancedModel],
        strategy: 'instanced-glb',
        fallbackReason: fallbackReasonParts.length ? fallbackReasonParts.join(',') : null,
        instanceCount: totalInstances,
      };
    } catch (error) {
      console.warn('[MapView3D] Failed to load instanced GLB fallback, continuing to merged GLB:', error);
      fallbackReasonParts.push('instanced-glb-fallback-load-failed');
    }
  }

  if (!source.fallbackUrl) {
    return {
      models: [],
      strategy: 'empty',
      fallbackReason: fallbackReasonParts.join(',') || 'missing-fallback-url',
      instanceCount: totalInstances,
    };
  }

  const fallbackModel = await Cesium.Model.fromGltfAsync({
    url: createAuthorizedCesiumResource(source.fallbackUrl),
    modelMatrix,
    allowPicking: false,
    asynchronous: true,
  });
  viewer.scene.primitives.add(fallbackModel);
  return {
    models: [fallbackModel],
    strategy: 'merged-glb',
    fallbackReason: fallbackReasonParts.join(',') || null,
    instanceCount: totalInstances,
  };
}

async function loadTerrainWorkZoneRuntimePreview(
  viewer: Cesium.Viewer,
  preview: TerrainWorkZoneRuntimePreviewPayload,
  policy: TerrainWorkZoneRuntimePolicy,
): Promise<Omit<TerrainWorkZoneRuntimeHandle, 'signature'>> {
  const modelMatrix = buildFocusZonePreviewModelMatrix(preview.originWgs84);
  const models: Cesium.Model[] = [];
  const tilesets: Cesium.Cesium3DTileset[] = [];
  const sourceSummaries: TerrainWorkZoneRuntimeHandle['sourceSummaries'] = [];

  for (const source of preview.sources || []) {
    if (!source?.url) continue;
    if (source.type === 'tileset') {
      const tileset = await Cesium.Cesium3DTileset.fromUrl(
        createAuthorizedCesiumResource(source.url),
        {
          modelMatrix,
        },
      );
      tileset.maximumScreenSpaceError = source.lodLevel === 'LOD1' ? 8 : 14;
      tileset.dynamicScreenSpaceError = false;
      tileset.foveatedScreenSpaceError = false;
      tileset.enableCollision = false;
      viewer.scene.primitives.add(tileset);
      tilesets.push(tileset);
      sourceSummaries.push({
        sourceId: source.id,
        sourceType: source.type,
        strategy: 'tileset',
        instanceCount: 0,
        fallbackReason: null,
      });
      continue;
    }

    if (source.type === 'instancing') {
      const loaded = await loadTerrainWorkZoneInstancingSource(viewer, modelMatrix, source, policy);
      models.push(...loaded.models);
      sourceSummaries.push({
        sourceId: source.id,
        sourceType: source.type,
        strategy: loaded.strategy,
        instanceCount: loaded.instanceCount,
        fallbackReason: loaded.fallbackReason,
      });
      continue;
    }

    if (source.type === 'glb') {
      const model = await Cesium.Model.fromGltfAsync({
        url: createAuthorizedCesiumResource(source.url),
        modelMatrix,
        allowPicking: false,
        asynchronous: true,
      });
      viewer.scene.primitives.add(model);
      models.push(model);
      sourceSummaries.push({
        sourceId: source.id,
        sourceType: source.type,
        strategy: 'glb',
        instanceCount: 0,
        fallbackReason: null,
      });
    }
  }

  viewer.scene.requestRender();
  return { models, tilesets, sourceSummaries };
}

function unloadTerrainWorkZoneRuntimePreview(
  viewer: Cesium.Viewer,
  handle: Omit<TerrainWorkZoneRuntimeHandle, 'signature'> | TerrainWorkZoneRuntimeHandle,
): void {
  handle.tilesets.forEach((tileset) => {
    if (!tileset.isDestroyed()) {
      viewer.scene.primitives.remove(tileset);
    }
  });
  handle.models.forEach((model) => {
    if (!model.isDestroyed()) {
      viewer.scene.primitives.remove(model);
    }
  });
  viewer.scene.requestRender();
}

function getOsmBuildingKey(elementType: string, elementId: number): string {
  return `${elementType}:${elementId}`;
}

function getOsmBuildingLabel(building: Pick<HiddenOsmBuilding, 'name' | 'elementId'>): string {
  const name = building.name?.trim();
  return name || `OSM 建筑 #${building.elementId}`;
}

function createOsmBuildingsStyle(hiddenOsmBuildings: HiddenOsmBuilding[]): Cesium.Cesium3DTileStyle {
  if (hiddenOsmBuildings.length === 0) {
    return new Cesium.Cesium3DTileStyle({ show: true });
  }

  const conditions = hiddenOsmBuildings.map((building) => [
    `\${elementType} === ${JSON.stringify(building.elementType)} && \${elementId} === ${building.elementId}`,
    'false',
  ]);

  conditions.push(['true', 'true']);

  return new Cesium.Cesium3DTileStyle({
    show: {
      conditions,
    },
  });
}

function applyOsmBuildingsStyle(
  viewer: Cesium.Viewer,
  tileset: Cesium.Cesium3DTileset,
  hiddenOsmBuildings: HiddenOsmBuilding[],
): void {
  tileset.style = createOsmBuildingsStyle(hiddenOsmBuildings);
  viewer.scene.requestRender();
}

function applyOsmTilesetPresentation(
  viewer: Cesium.Viewer,
  tileset: Cesium.Cesium3DTileset,
  hiddenOsmBuildings: HiddenOsmBuilding[],
  renderQuality: MapRenderQuality
): void {
  // These are presentation settings only. Applying them must not start a new
  // provider generation or erase runtime diagnostics already seen by tileset.
  tileset.maximumScreenSpaceError =
    renderQuality.osmScreenSpaceError || OSM_BUILDINGS_MAX_SCREEN_SPACE_ERROR
  tileset.dynamicScreenSpaceError = false
  tileset.progressiveResolutionHeightFraction = 0.0
  tileset.cullRequestsWhileMoving = false
  tileset.preloadFlightDestinations = true
  tileset.skipLevelOfDetail = false
  tileset.foveatedScreenSpaceError = false
  tileset.foveatedTimeDelay = 0.0
  tileset.enableShowOutline = renderQuality.showOsmOutline
  tileset.showOutline = renderQuality.showOsmOutline
  applyOsmBuildingsStyle(viewer, tileset, hiddenOsmBuildings)
}

function getPickedObjects(viewer: Cesium.Viewer, pixel: Cesium.Cartesian2): unknown[] {
  try {
    const drilled = viewer.scene.drillPick(pixel, 12);
    if (Array.isArray(drilled) && drilled.length > 0) {
      return drilled;
    }
  } catch {
    // Fall through to single-pick mode.
  }

  const picked = viewer.scene.pick(pixel);
  return Cesium.defined(picked) ? [picked] : [];
}

function readPickedFeatureProperty(
  feature: PickedOsmFeatureLike,
  name: string,
): unknown {
  const directValue = typeof feature.getProperty === 'function'
    ? feature.getProperty(name)
    : undefined;

  if (directValue !== undefined) {
    return directValue;
  }

  return typeof feature.getPropertyInherited === 'function'
    ? feature.getPropertyInherited(name)
    : undefined;
}

function isSameOsmTileset(
  feature: PickedOsmFeatureLike,
  osmTileset: Cesium.Cesium3DTileset | null,
): boolean {
  if (!osmTileset) return false;

  return feature.primitive === osmTileset
    || feature.tileset === osmTileset
    || feature.content?.tileset === osmTileset
    || feature.content?.tile?.tileset === osmTileset;
}

function extractPickedOsmBuilding(
  pickedObject: unknown,
  osmTileset: Cesium.Cesium3DTileset | null,
): HiddenOsmBuilding | null {
  if (!pickedObject || !osmTileset || typeof pickedObject !== 'object') return null;

  const feature = pickedObject as PickedOsmFeatureLike;
  if (typeof feature.getProperty !== 'function' && typeof feature.getPropertyInherited !== 'function') {
    return null;
  }

  const rawElementType = readPickedFeatureProperty(feature, 'elementType');
  const rawElementId = readPickedFeatureProperty(feature, 'elementId');
  const elementType = typeof rawElementType === 'string' ? rawElementType.trim() : '';
  const elementId = typeof rawElementId === 'number' ? rawElementId : Number(rawElementId);

  if (!elementType || !Number.isFinite(elementId)) return null;
  if (!isSameOsmTileset(feature, osmTileset) && elementType !== 'way' && elementType !== 'relation') {
    return null;
  }

  const rawName = readPickedFeatureProperty(feature, 'name');
  const rawBuildingType = readPickedFeatureProperty(feature, 'building');

  return {
    key: getOsmBuildingKey(elementType, elementId),
    elementType,
    elementId,
    name: typeof rawName === 'string' ? rawName : null,
    buildingType: typeof rawBuildingType === 'string' ? rawBuildingType : null,
  };
}

function attachOsmBuildingAnchor(
  building: HiddenOsmBuilding,
  viewer: Cesium.Viewer,
  pixel: Cesium.Cartesian2,
): HiddenOsmBuilding {
  const target = pickSceneTarget(viewer, pixel);
  if (!target) return building;

  const cartographic = Cesium.Cartographic.fromCartesian(target);
  if (!cartographic) return building;

  return {
    ...building,
    latitude: Cesium.Math.toDegrees(cartographic.latitude),
    longitude: normalizeLongitude(Cesium.Math.toDegrees(cartographic.longitude)),
    targetElevation: Math.max(0, cartographic.height || 0),
  };
}

function clampLatitude(latitude: number): number {
  return Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, latitude));
}

function normalizeLongitude(longitude: number): number {
  let normalized = ((longitude + 180) % 360 + 360) % 360 - 180;
  if (normalized === -180 && longitude > 0) normalized = 180;
  return normalized;
}

function toCesiumPitchDeg(pitchDeg: number): number {
  return clampPitchDeg(pitchDeg) - 90;
}

function toBrowsePitchDeg(cesiumPitchDeg: number): number {
  return clampPitchDeg(cesiumPitchDeg + 90);
}

function clampCameraRange(rangeMeters: number): number {
  return Math.max(CAMERA_MIN_ZOOM_DISTANCE, Math.min(CAMERA_MAX_ZOOM_DISTANCE, rangeMeters));
}

function getSceneCanvasHeight(viewer: Cesium.Viewer): number {
  const canvas = viewer.scene.canvas;
  return Math.max(1, canvas.clientHeight || canvas.height || 1);
}

function getVerticalFovRadians(viewer: Cesium.Viewer): number {
  const frustum = viewer.camera.frustum as unknown as { fovy?: number; fov?: number };
  if (typeof frustum.fovy === 'number') return frustum.fovy;
  if (typeof frustum.fov === 'number') {
    const canvas = viewer.scene.canvas;
    const width = Math.max(1, canvas.clientWidth || canvas.width || 1);
    const height = Math.max(1, canvas.clientHeight || canvas.height || 1);
    if (width > height) {
      return 2 * Math.atan(Math.tan(frustum.fov / 2) * (height / width));
    }
    return frustum.fov;
  }
  return Cesium.Math.toRadians(60);
}

function pickSceneTarget(viewer: Cesium.Viewer, pixel: Cesium.Cartesian2): Cesium.Cartesian3 | null {
  const scene = viewer.scene;

  let target: Cesium.Cartesian3 | undefined;

  if (scene.pickPositionSupported) {
    try {
      target = scene.pickPosition(pixel) ?? undefined;
    } catch {
      target = undefined;
    }
  }

  if (!target) {
    const ray = viewer.camera.getPickRay(pixel);
    if (ray) {
      target = scene.globe.pick(ray, scene) ?? undefined;
    }
  }

  if (!target) {
    target = viewer.camera.pickEllipsoid(pixel, scene.globe.ellipsoid) ?? undefined;
  }

  if (!target) {
    const fallback = viewer.camera.positionCartographic;
    if (!fallback) return null;
    target = Cesium.Cartesian3.fromRadians(fallback.longitude, fallback.latitude, 0);
  }

  return target ?? null;
}

function pickGroundTarget(viewer: Cesium.Viewer, pixel: Cesium.Cartesian2): Cesium.Cartesian3 | null {
  const scene = viewer.scene;
  const ray = viewer.camera.getPickRay(pixel);

  let target: Cesium.Cartesian3 | undefined;

  if (ray) {
    target = scene.globe.pick(ray, scene) ?? undefined;
  }

  if (!target) {
    target = viewer.camera.pickEllipsoid(pixel, scene.globe.ellipsoid) ?? undefined;
  }

  if (!target) {
    const fallback = viewer.camera.positionCartographic;
    if (!fallback) return null;
    target = Cesium.Cartesian3.fromRadians(fallback.longitude, fallback.latitude, 0);
  }

  return target ?? null;
}

function getScreenCenterGroundTarget(viewer: Cesium.Viewer): Cesium.Cartesian3 | null {
  const canvas = viewer.scene.canvas;
  const width = Math.max(1, canvas.clientWidth || canvas.width || 1);
  const height = Math.max(1, canvas.clientHeight || canvas.height || 1);
  return pickGroundTarget(viewer, new Cesium.Cartesian2(width / 2, height / 2));
}

function readBrowseStateFromCamera(viewer: Cesium.Viewer): MapBrowseState | null {
  const target = getScreenCenterGroundTarget(viewer);
  if (!target) return null;

  const cartographic = Cesium.Cartographic.fromCartesian(target);
  if (!cartographic) return null;

  const lat = clampLatitude(Cesium.Math.toDegrees(cartographic.latitude));
  const lng = normalizeLongitude(Cesium.Math.toDegrees(cartographic.longitude));
  const targetElevation = cartographic.height;
  const pitchDeg = toBrowsePitchDeg(Cesium.Math.toDegrees(viewer.camera.pitch));
  const headingDeg = normalizeHeadingDeg(Cesium.Math.toDegrees(viewer.camera.heading));
  const rangeMeters = clampCameraRange(Cesium.Cartesian3.distance(viewer.camera.positionWC, target));
  const zoom = clampZoomForMode(
    '3DGlobe',
    zoomFromCesiumRange(lat, rangeMeters, getSceneCanvasHeight(viewer), getVerticalFovRadians(viewer)),
  );

  return {
    centerWgs84: [lat, lng],
    zoom,
    headingDeg,
    pitchDeg,
    targetElevation,
    cameraRangeMeters: rangeMeters,
  };
}

function applyBrowseStateToCamera(viewer: Cesium.Viewer, state: MapBrowseState, animate = false): void {
  const lat = clampLatitude(state.centerWgs84[0]);
  const lng = normalizeLongitude(state.centerWgs84[1]);
  const pitchDeg = clampPitchDeg(state.pitchDeg);
  const headingRad = Cesium.Math.toRadians(normalizeHeadingDeg(state.headingDeg));
  const pitchRad = Cesium.Math.toRadians(toCesiumPitchDeg(pitchDeg));
  const zoom = clampZoomForMode('3DGlobe', state.zoom);

  const rangeMeters = state.cameraRangeMeters && state.cameraRangeMeters > RANGE_MIN_METERS && state.cameraRangeMeters < RANGE_MAX_METERS
    ? clampCameraRange(state.cameraRangeMeters)
    : clampCameraRange(
      cesiumRangeFromZoom(lat, zoom, getSceneCanvasHeight(viewer), getVerticalFovRadians(viewer)),
    );

  const target = Cesium.Cartesian3.fromDegrees(lng, lat, state.targetElevation ?? 0);
  const offset = new Cesium.HeadingPitchRange(headingRad, pitchRad, rangeMeters);

  if (animate) {
    viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(target, 1), {
      offset,
      duration: 0.65,
      easingFunction: Cesium.EasingFunction.QUADRATIC_OUT,
    });
  } else {
    viewer.camera.lookAt(target, offset);
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  }

  viewer.scene.requestRender();
}

function configureCesiumCameraController(viewer: Cesium.Viewer): void {
  const controller = viewer.scene.screenSpaceCameraController;
  const ellipsoidRadius = viewer.scene.globe.ellipsoid.minimumRadius;

  controller.enableInputs = true;
  controller.enableZoom = true;
  controller.enableRotate = true;
  controller.enableTilt = true;
  controller.enableLook = false;
  controller.enableCollisionDetection = true;
  controller.inertiaSpin = 0.9;         // 增强旋转惯性（Google Earth 甩球感）
  controller.inertiaTranslate = 0.85;   // 增强平移惯性
  controller.inertiaZoom = 0.7;         // 缩放惯性更流畅
  controller.maximumMovementRatio = 0.15;
  controller.minimumZoomDistance = CAMERA_MIN_ZOOM_DISTANCE;
  controller.maximumZoomDistance = CAMERA_MAX_ZOOM_DISTANCE;
  controller.maximumTiltAngle = Cesium.Math.toRadians(CAMERA_MAX_TILT_DEGREES);
  controller.minimumTrackBallHeight = ellipsoidRadius * 0.05;
  controller.minimumPickingTerrainHeight = 150000;
  controller.minimumPickingTerrainDistanceWithInertia = 4000;
  controller.minimumCollisionTerrainHeight = 800;
  controller.zoomFactor = 2.1;
  controller.rotateEventTypes = [Cesium.CameraEventType.LEFT_DRAG];
  controller.tiltEventTypes = [Cesium.CameraEventType.MIDDLE_DRAG];
  controller.zoomEventTypes = [Cesium.CameraEventType.PINCH];
  controller.lookEventTypes = undefined;

  viewer.camera.constrainedAxis = Cesium.Cartesian3.UNIT_Z;
}

type ReferenceBuildingRuntimeCallbacks = {
  ionTokenAvailable: boolean
  isCurrent: () => boolean
  onStatus: (_patch: Partial<MapProviderRuntimeEntry>) => void
  getHiddenOsmBuildings: () => HiddenOsmBuilding[]
  getRenderQuality: () => MapRenderQuality
}

type ReferenceTilesetDiagnostics = {
  initialTilesLoaded: boolean
  failedTileCount: number
  timedOut: boolean
  lastError: ClassifiedProviderError | null
}

const referenceTilesetDiagnostics = new WeakMap<
  Cesium.Cesium3DTileset,
  ReferenceTilesetDiagnostics
>()

function syncReferenceBuildings(
  viewer: Cesium.Viewer,
  buildingStyle: string,
  osmBuildingsRef: TilesetRef,
  google3dTilesetRef: TilesetRef,
  callbacks: ReferenceBuildingRuntimeCallbacks
): () => void {
  let disposed = false
  let readinessTimer: ReturnType<typeof setTimeout> | null = null
  const removeEventListeners: Array<() => void> = []

  const updateStatus = (patch: Partial<MapProviderRuntimeEntry>) => {
    if (disposed || !callbacks.isCurrent()) return
    callbacks.onStatus(patch)
  }

  const removeOsmBuildings = () => {
    if (osmBuildingsRef.current) {
      viewer.scene.primitives.remove(osmBuildingsRef.current);
      osmBuildingsRef.current = null;
      console.log('[MapView3D] OSM Buildings unloaded');
    }
  };

  const removeGoogle3d = () => {
    if (google3dTilesetRef.current) {
      viewer.scene.primitives.remove(google3dTilesetRef.current);
      google3dTilesetRef.current = null;
      console.log('[MapView3D] Google Photorealistic 3D Tiles unloaded');
    }
  };

  const applyStableTilesetState = (tileset: Cesium.Cesium3DTileset) => {
    tileset.modelMatrix = Cesium.Matrix4.clone(Cesium.Matrix4.IDENTITY);
    tileset.enableCollision = false;
    viewer.scene.requestRender();
  };

  const attachTilesetDiagnostics = (
    tileset: Cesium.Cesium3DTileset,
    provider: string,
    activeId: string
  ) => {
    const diagnostics = referenceTilesetDiagnostics.get(tileset) ?? {
      initialTilesLoaded: false,
      failedTileCount: 0,
      timedOut: false,
      lastError: null,
    }
    referenceTilesetDiagnostics.set(tileset, diagnostics)

    const syncDiagnosticStatus = () => {
      const status = deriveTilesetRuntimeStatus(diagnostics)
      const hasFailures = diagnostics.failedTileCount > 0
      updateStatus({
        provider,
        status,
        activeId,
        message: hasFailures
          ? `当前视野${diagnostics.initialTilesLoaded ? '已加载，但' : ''}有 ${diagnostics.failedTileCount} 个建筑分块失败`
          : status === 'ready'
            ? '服务已连接，当前视野资源已加载'
            : status === 'degraded'
              ? '服务已连接，但当前视野尚未完成建筑加载'
              : '服务已连接，正在加载当前视野',
        retryable: hasFailures ? (diagnostics.lastError?.retryable ?? true) : status === 'degraded',
        errorCode: diagnostics.lastError?.code ?? null,
        pending: status === 'ready' ? 0 : undefined,
      })
    }

    removeEventListeners.push(
      tileset.loadProgress.addEventListener((pendingRequests, processingTiles) => {
        const pending = pendingRequests + processingTiles
        updateStatus({
          pending,
          message: diagnostics.initialTilesLoaded
            ? pending > 0
              ? `正在更新当前视野，${pending} 个分块待处理`
              : '当前视野已加载'
            : `正在加载当前视野，${pending} 个分块待处理`,
        })
      })
    )
    removeEventListeners.push(
      tileset.initialTilesLoaded.addEventListener(() => {
        diagnostics.initialTilesLoaded = true
        if (readinessTimer) {
          clearTimeout(readinessTimer)
          readinessTimer = null
        }
        syncDiagnosticStatus()
      })
    )
    removeEventListeners.push(
      tileset.tileFailed.addEventListener((error) => {
        diagnostics.failedTileCount += 1
        diagnostics.lastError = classifyProviderError(error)
        syncDiagnosticStatus()
      })
    )

    if (!diagnostics.initialTilesLoaded && !diagnostics.timedOut) {
      readinessTimer = setTimeout(() => {
        if (diagnostics.initialTilesLoaded) return
        diagnostics.timedOut = true
        syncDiagnosticStatus()
      }, 15_000)
    }

    // Re-attaching listeners after a style/quality refresh must preserve the
    // evidence already observed for this tileset instead of assuming success.
    syncDiagnosticStatus()
  }

  if (buildingStyle === 'osm') {
    removeGoogle3d();
    if (osmBuildingsRef.current) {
      applyOsmTilesetPresentation(
        viewer,
        osmBuildingsRef.current,
        callbacks.getHiddenOsmBuildings(),
        callbacks.getRenderQuality()
      )
      attachTilesetDiagnostics(osmBuildingsRef.current, 'OSM 白模', 'cesium-osm-buildings')
      return () => {
        disposed = true
        if (readinessTimer) clearTimeout(readinessTimer)
        removeEventListeners.forEach((remove) => remove())
      }
    }
    if (!callbacks.ionTokenAvailable) {
      updateStatus({
        provider: 'OSM 白模',
        status: 'unavailable',
        activeId: null,
        message: '未配置 Cesium ion 凭据，无法加载 OSM 白模',
        retryable: false,
        errorCode: 'missing-credentials',
      })
      return () => {
        disposed = true
      }
    }
    if (!osmBuildingsRef.current) {
      Cesium.createOsmBuildingsAsync({
        style: createOsmBuildingsStyle(callbacks.getHiddenOsmBuildings()),
        enableShowOutline: callbacks.getRenderQuality().showOsmOutline,
        showOutline: callbacks.getRenderQuality().showOsmOutline,
      })
        .then((tileset) => {
          if (viewer.isDestroyed() || disposed || !callbacks.isCurrent()) {
            tileset.destroy()
            return
          }
          applyStableTilesetState(tileset)
          applyOsmTilesetPresentation(
            viewer,
            tileset,
            callbacks.getHiddenOsmBuildings(),
            callbacks.getRenderQuality()
          )
          viewer.scene.primitives.add(tileset)
          osmBuildingsRef.current = tileset
          attachTilesetDiagnostics(tileset, 'OSM 白模', 'cesium-osm-buildings')
          updateStatus({
            provider: 'OSM 白模',
            status: 'loading',
            activeId: 'cesium-osm-buildings',
            message: '服务已连接，正在加载当前视野',
            retryable: false,
            errorCode: null,
          })
          console.log('[MapView3D] OSM Buildings loaded successfully')
        })
        .catch((err) => {
          if (disposed || !callbacks.isCurrent()) return
          const classified = classifyProviderError(err)
          updateStatus({
            provider: 'OSM 白模',
            status: classified.code === 'unauthorized' ? 'unavailable' : 'failed',
            activeId: null,
            message: classified.message,
            retryable: classified.retryable,
            errorCode: classified.code,
          })
          console.error('[MapView3D] Failed to load OSM Buildings:', err)
        })
    }
    return () => {
      disposed = true
      if (readinessTimer) clearTimeout(readinessTimer)
      removeEventListeners.forEach((remove) => remove())
    }
  }

  if (buildingStyle === 'google3d') {
    removeOsmBuildings()
    if (google3dTilesetRef.current) {
      attachTilesetDiagnostics(
        google3dTilesetRef.current,
        'Google 真实 3D',
        'google-photorealistic-3d'
      )
      return () => {
        disposed = true
        if (readinessTimer) clearTimeout(readinessTimer)
        removeEventListeners.forEach((remove) => remove())
      }
    }
    if (!callbacks.ionTokenAvailable) {
      updateStatus({
        provider: 'Google 真实 3D',
        status: 'unavailable',
        activeId: null,
        message: '未配置 Cesium ion 凭据，无法加载 Google 真实 3D',
        retryable: false,
        errorCode: 'missing-credentials',
      })
      return () => {
        disposed = true
      }
    }
    if (!google3dTilesetRef.current) {
      Cesium.createGooglePhotorealistic3DTileset()
        .then((tileset) => {
          if (viewer.isDestroyed() || disposed || !callbacks.isCurrent()) {
            tileset.destroy()
            return
          }
          applyStableTilesetState(tileset)
          viewer.scene.primitives.add(tileset)
          google3dTilesetRef.current = tileset
          attachTilesetDiagnostics(tileset, 'Google 真实 3D', 'google-photorealistic-3d')
          updateStatus({
            provider: 'Google 真实 3D',
            status: 'loading',
            activeId: 'google-photorealistic-3d',
            message: '服务已连接，正在加载当前视野',
            retryable: false,
            errorCode: null,
          })
          console.log('[MapView3D] Google Photorealistic 3D Tiles loaded successfully')
        })
        .catch((err) => {
          if (disposed || !callbacks.isCurrent()) return
          const classified = classifyProviderError(err)
          updateStatus({
            provider: 'Google 真实 3D',
            status: classified.code === 'unauthorized' ? 'unavailable' : 'failed',
            activeId: null,
            message: classified.message,
            retryable: classified.retryable,
            errorCode: classified.code,
          })
          console.error('[MapView3D] Failed to load Google Photorealistic 3D Tiles:', err)
        })
    }
    return () => {
      disposed = true
      if (readinessTimer) clearTimeout(readinessTimer)
      removeEventListeners.forEach((remove) => remove())
    }
  }

  if (buildingStyle === 'osmGeoJson') {
    // GeoJSON 瓦片由独立的 useEffect 管理，这里只需清理 3D Tiles
    removeOsmBuildings()
    removeGoogle3d()
    return () => {
      disposed = true
    }
  }

  removeOsmBuildings()
  removeGoogle3d()
  viewer.scene.requestRender()
  return () => {
    disposed = true
  }
}

type CesiumImagerySource = {
  provider: Cesium.ImageryProvider
  debugLabel: string
  debugUrl: string
  requestedId: string
  activeId: string
  fallbackReason: string | null
}

function observeFirstImageryTileSuccess(
  provider: Cesium.ImageryProvider,
  onFirstSuccess: () => void
): () => void {
  const originalRequestImage = provider.requestImage
  const observedRequestImage = observeFirstSuccessfulTileRequest(
    (x: number, y: number, level: number, request?: Cesium.Request) =>
      originalRequestImage.call(provider, x, y, level, request),
    onFirstSuccess
  )
  provider.requestImage = observedRequestImage
  return () => {
    if (provider.requestImage === observedRequestImage) {
      provider.requestImage = originalRequestImage
    }
  }
}

function observeFirstTerrainTileSuccess(
  provider: Cesium.TerrainProvider,
  onFirstSuccess: () => void
): () => void {
  const originalRequestTileGeometry = provider.requestTileGeometry
  const observedRequestTileGeometry = observeFirstSuccessfulTileRequest(
    (x: number, y: number, level: number, request?: Cesium.Request) =>
      originalRequestTileGeometry.call(provider, x, y, level, request),
    onFirstSuccess
  )
  provider.requestTileGeometry = observedRequestTileGeometry
  return () => {
    if (provider.requestTileGeometry === observedRequestTileGeometry) {
      provider.requestTileGeometry = originalRequestTileGeometry
    }
  }
}

function createCesiumImageryProvider(tileStyle: string): CesiumImagerySource {
  const webMercatorTilingScheme = new Cesium.WebMercatorTilingScheme()
  const source = PRESET_TILE_SOURCES.find((s) => s.id === tileStyle)
  let fallbackReason = source ? null : `未找到图源 ${tileStyle}`

  if (source) {
    const availabilityIssue = getTileSourceAvailabilityIssue(source, '3DGlobe');

    if (availabilityIssue) {
      fallbackReason = availabilityIssue
      if (import.meta.env.DEV) {
        console.warn('[MapView3D] Skipping unavailable imagery source', {
          tileStyle,
          source: source.name,
          reason: availabilityIssue,
        });
      }
    } else {
      if (source.id === 'osm') {
        return {
          provider: new Cesium.UrlTemplateImageryProvider({
            url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            tilingScheme: webMercatorTilingScheme,
            maximumLevel: 19,
            credit: new Cesium.Credit('© OpenStreetMap contributors'),
          }),
          debugLabel: 'OSM 开源底图',
          debugUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          requestedId: tileStyle,
          activeId: source.id,
          fallbackReason: null,
        }
      }

      const normalizedUrl = normalizeCesiumTemplateUrl(source);

      return {
        provider: new Cesium.UrlTemplateImageryProvider({
          url: normalizedUrl,
          subdomains: source.subdomains ? source.subdomains.split('') : undefined,
          tilingScheme: webMercatorTilingScheme,
          maximumLevel: source.maxNativeZoom ?? 18,
          credit: new Cesium.Credit(source.attribution || ''),
        }),
        debugLabel: source.name,
        debugUrl: normalizedUrl,
        requestedId: tileStyle,
        activeId: source.id,
        fallbackReason: null,
      }
    }
  }

  // fallback to light
  return {
    provider: new Cesium.UrlTemplateImageryProvider({
      url: 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      tilingScheme: webMercatorTilingScheme,
      maximumLevel: 16,
      credit: new Cesium.Credit('Esri Light Gray Canvas'),
      enablePickFeatures: false,
    }),
    debugLabel: 'Light',
    debugUrl:
      'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    requestedId: tileStyle,
    activeId: 'esri-light-gray-fallback',
    fallbackReason: fallbackReason || '所选底图不可用',
  }
}

function syncExtrudedFeatures(viewer: Cesium.Viewer, drawnFeatures: GeoJSON.Feature[]): void {
  let cancelled = false;
  viewer.dataSources.removeAll();

  drawnFeatures.forEach((feature) => {
    const props = feature?.properties || {};
    const strokeColor = Cesium.Color.fromCssColorString(
      String(props.strokeColor || props.color || '#3388ff'),
    ).withAlpha(Number(props.strokeOpacity ?? 1));
    const fillColor = Cesium.Color.fromCssColorString(
      String(props.fillColor || props.color || '#3388ff'),
    ).withAlpha(Number(props.fillOpacity ?? 0.3));
    const strokeWidth = Number(props.strokeWeight ?? 3);

    // 判断是否需要拉伸（有高度数据则拉伸，否则贴地）
    const hasExtrusion = Number(props.heightMeters ?? 0) > 0;

    Cesium.GeoJsonDataSource.load(feature as never, {
      stroke: strokeColor,
      strokeWidth,
      fill: fillColor,
      clampToGround: !hasExtrusion, // 无高度时贴地渲染
    })
      .then((dataSource) => {
        if (cancelled || viewer.isDestroyed()) return;

        dataSource.entities.values.forEach((entity) => {
          entity.properties = new Cesium.PropertyBag({
            ...props,
            featureId: feature?.id || props.id || entity.id,
            // 标记 studio-building 来源的 entity，用于拖拽识别
            ...(props.source === 'studio-building' || props.studioDerived
              ? { studioBuildingId: props.buildingId }
              : {}),
          });

          if (entity.polygon) {
            if (hasExtrusion) {
              // 有高度数据：拉伸模式，高度相对于地面
              const baseHeightMeters = Number(props.baseHeightMeters ?? 0);
              const heightMeters = Number(props.heightMeters ?? 0);
              entity.polygon.heightReference = new Cesium.ConstantProperty(
                Cesium.HeightReference.RELATIVE_TO_GROUND,
              );
              entity.polygon.extrudedHeightReference = new Cesium.ConstantProperty(
                Cesium.HeightReference.RELATIVE_TO_GROUND,
              );
              entity.polygon.height = new Cesium.ConstantProperty(baseHeightMeters);
              entity.polygon.extrudedHeight = new Cesium.ConstantProperty(
                baseHeightMeters + heightMeters,
              );
              entity.polygon.material = new Cesium.ColorMaterialProperty(fillColor);
              entity.polygon.outline = new Cesium.ConstantProperty(true);
              entity.polygon.outlineColor = new Cesium.ConstantProperty(strokeColor);
            } else {
              // 无高度数据：贴地模式
              entity.polygon.height = undefined;
              entity.polygon.extrudedHeight = undefined;
              entity.polygon.material = new Cesium.ColorMaterialProperty(fillColor);
              entity.polygon.outline = new Cesium.ConstantProperty(true);
              entity.polygon.outlineColor = new Cesium.ConstantProperty(strokeColor);
              entity.polygon.heightReference = new Cesium.ConstantProperty(
                Cesium.HeightReference.CLAMP_TO_GROUND,
              );
              entity.polygon.classificationType = new Cesium.ConstantProperty(
                Cesium.ClassificationType.BOTH,
              );
            }
            entity.orientation = undefined;
          }

          // 折线贴地
          if (entity.polyline && !hasExtrusion) {
            entity.polyline.clampToGround = new Cesium.ConstantProperty(true);
            entity.polyline.classificationType = new Cesium.ConstantProperty(
              Cesium.ClassificationType.BOTH,
            );
          }
        });

        viewer.dataSources.add(dataSource);
        viewer.scene.requestRender();
      })
      .catch((err) => {
        console.error('[MapView3D] Failed to load GeoJSON:', err);
      });
  });

  if (drawnFeatures.length === 0) {
    viewer.scene.requestRender();
  }

  return () => {
    cancelled = true;
  };
}

function syncPlacedModels(
  viewer: Cesium.Viewer,
  placedModels: PlacedModel[],
  selectedPlacedModelId: string | null,
  entityMap: Map<string, Cesium.Entity>,
): void {
  const currentIds = new Set(placedModels.map((model) => model.id));

  entityMap.forEach((entity, id) => {
    if (!currentIds.has(id)) {
      viewer.entities.remove(entity);
      entityMap.delete(id);
    }
  });

  placedModels.forEach((placedModel) => {
    const { id, modelInfo, placement, visible } = placedModel;
    const isSelected = selectedPlacedModelId === id;

    // 根据贴地设置计算位置
    const position = Cesium.Cartesian3.fromDegrees(
      placement.longitude,
      placement.latitude,
      placement.clampToGround ? (placement.groundOffset || 0) : placement.height,
    );
    const orientation = createFixedFrameOrientation(position, placement);

    let entity = entityMap.get(id);
    if (entity && viewer.entities.getById(entity.id) !== entity) {
      entityMap.delete(id);
      entity = undefined;
    }

    if (!entity) {
      entity = viewer.entities.add({
        id: `model_${id}`,
        position: new Cesium.ConstantPositionProperty(position),
        orientation: new Cesium.ConstantProperty(orientation),
        model: {
          uri: modelInfo.url,
          scale: placement.scale,
          heightReference: placement.clampToGround
            ? Cesium.HeightReference.CLAMP_TO_GROUND
            : Cesium.HeightReference.NONE,
          color: isSelected ? Cesium.Color.YELLOW : Cesium.Color.WHITE,
          silhouetteColor: isSelected ? Cesium.Color.CYAN : undefined,
          silhouetteSize: isSelected ? 2 : 0,
        },
        show: visible,
        properties: new Cesium.PropertyBag({
          placedModelId: id,
        }),
      });
      entityMap.set(id, entity);
      return;
    }

    entity.show = visible;
    entity.position = new Cesium.ConstantPositionProperty(position);
    entity.orientation = new Cesium.ConstantProperty(orientation);

    const modelGraphics = entity.model as Cesium.ModelGraphics | undefined;
    if (modelGraphics) {
      modelGraphics.scale = new Cesium.ConstantProperty(placement.scale);
      modelGraphics.color = new Cesium.ConstantProperty(
        isSelected ? Cesium.Color.YELLOW : Cesium.Color.WHITE,
      );
      modelGraphics.silhouetteColor = new Cesium.ConstantProperty(
        isSelected ? Cesium.Color.CYAN : Cesium.Color.TRANSPARENT,
      );
      modelGraphics.silhouetteSize = new Cesium.ConstantProperty(isSelected ? 2 : 0);
      modelGraphics.heightReference = new Cesium.ConstantProperty(
        placement.clampToGround
          ? Cesium.HeightReference.CLAMP_TO_GROUND
          : Cesium.HeightReference.NONE,
      );
    }
  });

  viewer.scene.requestRender();
}

function installGoogleEarthCameraControls(
  viewer: Cesium.Viewer,
  emitBrowseStateChange: () => void,
  getAutoTiltEnabled: () => boolean,
): () => void {
  const canvas = viewer.scene.canvas;
  // 在 canvas 的祖先元素上监听 wheel，利用捕获阶段在 Cesium 的 CameraEventAggregator 之前截获事件
  const wheelContainer = viewer.container as HTMLElement;
  let wheelTimeout: ReturnType<typeof setTimeout> | null = null;

  // ----- 轨道拖拽状态 -----
  let dragAnchor: Cesium.Cartesian3 | null = null;
  let dragRange = 0;
  let dragActive = false;
  let dragSource: 'right' | 'ctrl-left' = 'right';

  const notifyLater = () => {
    if (wheelTimeout) clearTimeout(wheelTimeout);
    wheelTimeout = setTimeout(() => {
      emitBrowseStateChange();
      wheelTimeout = null;
    }, CAMERA_WHEEL_NOTIFY_DELAY_MS);
  };

  // ===== 滚轮缩放：沿 camera→target 方向移动相机（避免 lookAt 坐标系偏差） =====
  const zoomTowardsPointer = (event: WheelEvent) => {
    const rect = canvas.getBoundingClientRect();
    const pixel = new Cesium.Cartesian2(
      event.clientX - rect.left,
      event.clientY - rect.top,
    );

    const target = pickGroundTarget(viewer, pixel) ?? getScreenCenterGroundTarget(viewer);
    if (!target) return;

    const camera = viewer.camera;
    const cameraPos = camera.positionWC.clone();
    const currentDistance = Cesium.Cartesian3.distance(cameraPos, target);

    // 海拔自适应缩放速率：高空快、低空慢
    const height = camera.positionCartographic.height;
    const adaptiveBase = lerp(
      ZOOM_BASE_MIN,
      ZOOM_BASE_MAX,
      smoothstep(ZOOM_ALTITUDE_SLOW, ZOOM_ALTITUDE_FAST, height),
    );
    const deltaStrength = Math.min(4, Math.max(0.25, Math.abs(event.deltaY) / 120));
    const zoomFactor = Math.pow(adaptiveBase, deltaStrength);

    // 计算新距离
    const newDistance = clampCameraRange(
      event.deltaY > 0 ? currentDistance * zoomFactor : currentDistance / zoomFactor,
    );

    // 沿 camera→target 方向移动相机位置（不改变朝向）
    const moveAmount = currentDistance - newDistance; // 正=靠近, 负=远离
    const direction = Cesium.Cartesian3.subtract(target, cameraPos, new Cesium.Cartesian3());
    Cesium.Cartesian3.normalize(direction, direction);
    const moveVec = Cesium.Cartesian3.multiplyByScalar(direction, moveAmount, new Cesium.Cartesian3());
    const newPos = Cesium.Cartesian3.add(cameraPos, moveVec, new Cesium.Cartesian3());

    // 检查高度是否在有效范围内
    const newCarto = Cesium.Cartographic.fromCartesian(newPos);
    if (!newCarto || newCarto.height < CAMERA_MIN_ZOOM_DISTANCE || newCarto.height > CAMERA_MAX_ZOOM_DISTANCE) {
      return;
    }

    // Auto-Tilt：缩放接近地面时渐进倾斜
    let finalPitch = camera.pitch;
    if (event.deltaY < 0 && getAutoTiltEnabled()) {
      if (newCarto.height < AUTO_TILT_START_HEIGHT) {
        const t = 1 - smoothstep(AUTO_TILT_END_HEIGHT, AUTO_TILT_START_HEIGHT, newCarto.height);
        const targetPitch = Cesium.Math.toRadians(
          lerp(-90, AUTO_TILT_TARGET_PITCH_DEG, t),
        );
        finalPitch = finalPitch + (targetPitch - finalPitch) * AUTO_TILT_BLEND_FACTOR;
      }
    }

    // 使用 setView 保持相机朝向不变，仅改变位置
    camera.setView({
      destination: newPos,
      orientation: {
        heading: camera.heading,
        pitch: finalPitch,
        roll: camera.roll,
      },
    });

    viewer.scene.requestRender();
    notifyLater();
  };

  const onWheel = (event: WheelEvent) => {
    // 在祖先元素的捕获阶段截断，阻止事件到达 canvas（Cesium 的 CameraEventAggregator 监听在 canvas 上）
    event.preventDefault();
    event.stopPropagation();
    if (event.deltaY === 0) return;
    zoomTowardsPointer(event);
  };

  // ===== 轨道旋转：增量式（修复抖动） =====
  const startOrbit = (position: Cesium.Cartesian2, source: 'right' | 'ctrl-left') => {
    dragAnchor = pickGroundTarget(viewer, position) ?? getScreenCenterGroundTarget(viewer);
    if (!dragAnchor) return;
    dragRange = clampCameraRange(
      Cesium.Cartesian3.distance(viewer.camera.positionWC, dragAnchor),
    );
    dragActive = true;
    dragSource = source;
  };

  const updateOrbit = (startPos: Cesium.Cartesian2, endPos: Cesium.Cartesian2) => {
    if (!dragActive || !dragAnchor) return;
    const canvasWidth = Math.max(1, canvas.clientWidth || canvas.width || 1);
    const canvasHeight = Math.max(1, canvas.clientHeight || canvas.height || 1);

    // 增量模式：每帧差值直接叠加到当前相机角度
    const dx = (endPos.x - startPos.x) / canvasWidth;
    const dy = (endPos.y - startPos.y) / canvasHeight;

    const heading = viewer.camera.heading - dx * Math.PI * ORBIT_SENSITIVITY_X;
    const pitch = Cesium.Math.clamp(
      viewer.camera.pitch - dy * Cesium.Math.toRadians(ORBIT_SENSITIVITY_Y_DEG),
      Cesium.Math.toRadians(-CAMERA_MAX_TILT_DEGREES),
      Cesium.Math.toRadians(-2),
    );

    viewer.camera.lookAt(
      dragAnchor,
      new Cesium.HeadingPitchRange(heading, pitch, dragRange),
    );
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    viewer.scene.requestRender();
  };

  const finishDrag = () => {
    if (!dragActive) return;
    dragActive = false;
    dragAnchor = null;
    emitBrowseStateChange();
  };

  const handler = new Cesium.ScreenSpaceEventHandler(canvas);

  // ----- 右键拖拽：轨道旋转 -----
  handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
    startOrbit(event.position, 'right');
  }, Cesium.ScreenSpaceEventType.RIGHT_DOWN);

  handler.setInputAction((event: { startPosition: Cesium.Cartesian2; endPosition: Cesium.Cartesian2 }) => {
    if (dragActive && dragSource === 'right') {
      updateOrbit(event.startPosition, event.endPosition);
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  handler.setInputAction(finishDrag, Cesium.ScreenSpaceEventType.RIGHT_UP);
  handler.setInputAction(finishDrag, Cesium.ScreenSpaceEventType.RIGHT_CLICK);

  // ----- Ctrl+左键拖拽：轨道旋转快捷方式 -----
  handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
    startOrbit(event.position, 'ctrl-left');
  }, Cesium.ScreenSpaceEventType.LEFT_DOWN, Cesium.KeyboardEventModifier.CTRL);

  handler.setInputAction((event: { startPosition: Cesium.Cartesian2; endPosition: Cesium.Cartesian2 }) => {
    if (dragActive && dragSource === 'ctrl-left') {
      updateOrbit(event.startPosition, event.endPosition);
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE, Cesium.KeyboardEventModifier.CTRL);

  handler.setInputAction(finishDrag, Cesium.ScreenSpaceEventType.LEFT_UP, Cesium.KeyboardEventModifier.CTRL);

  // 在祖先元素的捕获阶段注册，确保在 Cesium canvas 上的处理器之前触发
  wheelContainer.addEventListener('wheel', onWheel, { passive: false, capture: true });

  return () => {
    if (wheelTimeout) clearTimeout(wheelTimeout);
    wheelContainer.removeEventListener('wheel', onWheel, { capture: true });
    handler.destroy();
  };
}

function emitBrowseState(
  viewer: Cesium.Viewer,
  isUpdatingRef: MutableRefObject<boolean>,
  onBrowseStateChange?: (state: MapBrowseState) => void,
): void {
  if (isUpdatingRef.current) return;
  const state = readBrowseStateFromCamera(viewer);
  if (state) {
    onBrowseStateChange?.(state);
  }
}

const cesiumIonToken = import.meta.env.VITE_CESIUM_ION_TOKEN
if (cesiumIonToken) {
  Cesium.Ion.defaultAccessToken = cesiumIonToken
}

export default function MapView3D({
  onBrowseStateChange,
  browseSyncToken,
  browseSyncSource,
}: MapView3DProps) {
  const shellRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Cesium.Viewer | null>(null)
  const onBrowseStateChangeRef = useRef(onBrowseStateChange)
  const isUpdatingRef = useRef(false)
  const syncReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const osmBuildingsRef = useRef<Cesium.Cesium3DTileset | null>(null)
  const google3dTilesetRef = useRef<Cesium.Cesium3DTileset | null>(null)
  const entityMapRef = useRef<Map<string, Cesium.Entity>>(new Map())
  const terrainWorkZoneRuntimeRef = useRef<Map<string, TerrainWorkZoneRuntimeHandle>>(new Map())
  const terrainWorkZoneRuntimeLoadingRef = useRef<Set<string>>(new Set())
  const osmMenuRef = useRef<HTMLDivElement>(null)
  const osmGeoJsonTilesRef = useRef<Map<string, Cesium.GeoJsonDataSource>>(new Map())
  const hasRenderedFrameRef = useRef(false)
  const [hasRenderableSize, setHasRenderableSize] = useState(false)
  const [osmBuildingMenu, setOsmBuildingMenu] = useState<OsmBuildingMenuState | null>(null)
  const [viewerReadyToken, setViewerReadyToken] = useState(0)
  const [hasRenderedFrame, setHasRenderedFrame] = useState(false)
  const [runtimeLoadingCount, setRuntimeLoadingCount] = useState(0)
  const [terrainTileLoadCount, setTerrainTileLoadCount] = useState(0)
  const providerGenerationRef = useRef<Record<MapProviderKey, number>>({
    imagery: 0,
    terrain: 0,
    buildings: 0,
  })
  const [providerSources, setProviderSources] = useState<MapProviderRuntimeSources>(() =>
    createProviderRuntimeSources()
  )
  const [providerRetryTokens, setProviderRetryTokens] = useState<Record<MapProviderKey, number>>({
    imagery: 0,
    terrain: 0,
    buildings: 0,
  })

  const beginProviderLoad = useCallback(
    (key: MapProviderKey, provider: string, requestedId: string): number => {
      const generation = providerGenerationRef.current[key] + 1
      providerGenerationRef.current[key] = generation
      setProviderSources((current) => ({
        ...current,
        [key]: {
          ...current[key],
          provider,
          status: 'loading',
          message: '正在连接服务',
          retryable: false,
          requestedId,
          activeId: null,
          errorCode: null,
          attempt: current[key].attempt + 1,
          generation,
          pending: undefined,
          itemCount: undefined,
        },
      }))
      return generation
    },
    []
  )

  const updateProviderStatus = useCallback(
    (key: MapProviderKey, generation: number, patch: Partial<MapProviderRuntimeEntry>) => {
      if (providerGenerationRef.current[key] !== generation) return
      setProviderSources((current) => {
        if (current[key].generation !== generation) return current
        return {
          ...current,
          [key]: {
            ...current[key],
            ...patch,
          },
        }
      })
    },
    []
  )

  const tileStyle = useMapStore((s) => s.tileStyle)
  const drawnFeatures = useMapStore((s) => s.drawnFeatures)
  const buildingStyle = useMapStore((s) => s.buildingStyle)
  const hiddenOsmBuildings = useMapStore((s) => s.hiddenOsmBuildings)
  const renderQuality = useMapStore((s) => s.renderQuality)
  const renderFps = useMapStore((s) => s.renderFps)
  const setRenderFps = useMapStore((s) => s.setRenderFps)
  const setSelectedNodeId = useMapStore((s) => s.setSelectedNodeId)
  const setPropsPanelNodeId = useMapStore((s) => s.setPropsPanelNodeId)
  const hideOsmBuilding = useMapStore((s) => s.hideOsmBuilding)
  const showOsmBuilding = useMapStore((s) => s.showOsmBuilding)
  const revealReferencePanel = useMapStore((s) => s.revealReferencePanel)
  const treeNodes = useMapStore((s) => s.treeNodes)
  const flyToFeatureId = useMapStore((s) => s.flyToFeatureId)
  const flyToToken = useMapStore((s) => s.flyToToken)
  const clearFlyToFeature = useMapStore((s) => s.clearFlyToFeature)
  const { placedModels, selectedPlacedModelId, selectPlacedModel, updatePlacement } =
    useModelStore()
  const notifyBuildingMoved = useMapStore((s) => s.notifyBuildingMoved)
  const hiddenOsmBuildingKeys = new Set(hiddenOsmBuildings.map((item) => item.key))
  const providerRuntimeStatus = useMemo(
    () => deriveProviderOverallStatus(providerSources, buildingStyle !== 'none'),
    [buildingStyle, providerSources]
  )

  const retryProvider = useCallback(
    (key: MapProviderKey) => {
      const viewer = viewerRef.current

      if (key === 'terrain') {
        resetTerrainProviderPromise(
          buildingStyle === 'osm' ? 'cesium-world-terrain' : 'arcgis-terrain'
        )
      }

      if (key === 'buildings' && viewer && !viewer.isDestroyed()) {
        if (osmBuildingsRef.current) {
          viewer.scene.primitives.remove(osmBuildingsRef.current)
          osmBuildingsRef.current = null
        }
        if (google3dTilesetRef.current) {
          viewer.scene.primitives.remove(google3dTilesetRef.current)
          google3dTilesetRef.current = null
        }
        viewer.scene.requestRender()
      }

      setProviderRetryTokens((current) => ({
        ...current,
        [key]: current[key] + 1,
      }))
    },
    [buildingStyle]
  )
  const terrainWorkZoneRuntimePolicy = useMemo(
    () => resolveTerrainWorkZoneRuntimePolicy(renderQuality, renderFps),
    [renderQuality, renderFps],
  );
  const previewableRuntimeZoneCount = useMemo(
    () => treeNodes.filter((node) => {
      const zoneId = node.backendWorkZoneId || node.focusZoneId;
      return Boolean(
        zoneId
        && node.visible
        && (node.source === 'terrain-work-zone' || node.backendWorkZoneId)
        && String(node.exportTaskStatus || '').startsWith('completed'),
      );
    }).length,
    [treeNodes],
  );
  const [runtimePreviewSummary, setRuntimePreviewSummary] = useState<TerrainWorkZoneRuntimeSummary>(() => (
    summarizeTerrainWorkZoneRuntimeHandles([], terrainWorkZoneRuntimePolicy, renderFps)
  ));
  const terrainWorkZoneRuntimePolicyRef = useRef(terrainWorkZoneRuntimePolicy);
  const renderFpsRef = useRef(renderFps);
  const syncRuntimePreviewSummary = useCallback(() => {
    setRuntimePreviewSummary(
      summarizeTerrainWorkZoneRuntimeHandles(
        terrainWorkZoneRuntimeRef.current.values(),
        terrainWorkZoneRuntimePolicyRef.current,
        renderFpsRef.current,
      ),
    );
  }, []);

  useEffect(() => {
    terrainWorkZoneRuntimePolicyRef.current = terrainWorkZoneRuntimePolicy;
    renderFpsRef.current = renderFps;
    syncRuntimePreviewSummary();
  }, [renderFps, syncRuntimePreviewSummary, terrainWorkZoneRuntimePolicy]);

  useEffect(() => {
    if (!osmBuildingMenu) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (osmMenuRef.current?.contains(event.target as Node)) return;
      setOsmBuildingMenu(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOsmBuildingMenu(null);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [osmBuildingMenu]);

  useEffect(() => {
    if (buildingStyle !== 'osm') {
      setOsmBuildingMenu(null);
    }
  }, [buildingStyle]);

  useEffect(() => {
    onBrowseStateChangeRef.current = onBrowseStateChange;
  }, [onBrowseStateChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const syncContainerSize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      const nextHasRenderableSize = width > 0 && height > 0;

      setHasRenderableSize((prev) => (prev === nextHasRenderableSize ? prev : nextHasRenderableSize));

      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;

      viewer.resize();
      if (nextHasRenderableSize) {
        viewer.scene.requestRender();
      }
    };

    syncContainerSize();

    const observer = new ResizeObserver(() => {
      syncContainerSize();
    });

    observer.observe(container);
    window.addEventListener('resize', syncContainerSize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', syncContainerSize);
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current || viewerRef.current || !hasRenderableSize) return;

    hasRenderedFrameRef.current = false;
    setHasRenderedFrame(false);
    setTerrainTileLoadCount(0);

    const viewer = new Cesium.Viewer(containerRef.current, {
      baseLayer: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      vrButton: false,
      infoBox: false,
      selectionIndicator: false,
      shadows: false,
      shouldAnimate: false,
      requestRenderMode: true,
      maximumRenderTimeChange: Infinity,
      targetFrameRate: CESIUM_TARGET_FRAME_RATE,
      useBrowserRecommendedResolution: true,
    });

    viewer.scene.rethrowRenderErrors = false;

    viewerRef.current = viewer;
    setViewerReadyToken((token) => token + 1);
    entityMapRef.current.clear();
    if (import.meta.env.DEV) {
      (window as DebugWindow).__ARCSPRO_CESIUM_VIEWER__ = viewer;
      (window as DebugWindow).__ARCSPRO_CESIUM_DEBUG__ = {
        placedModelIds: [],
        entityMapKeys: [],
        entityIds: [],
      };
    }

    try {
      (viewer.cesiumWidget.creditContainer as HTMLElement).style.display = 'none';
    } catch {
      // ignore
    }

    const initialRenderQuality = useMapStore.getState().renderQuality;
    viewer.scene.postProcessStages.fxaa.enabled = initialRenderQuality.fxaaEnabled;
    viewer.resolutionScale = initialRenderQuality.resolutionScale;
    viewer.scene.globe.maximumScreenSpaceError = initialRenderQuality.terrainScreenSpaceError;

    // 确保地形垂直方向无缩放（1.0 = 真实比例）
    viewer.scene.verticalExaggeration = 1.0;
    viewer.scene.verticalExaggerationRelativeHeight = 0.0;

    configureCesiumCameraController(viewer);
    applyBrowseStateToCamera(viewer, useMapStore.getState().browseState);
    setRenderFps(null);

    const handleRenderError = (_scene: Cesium.Scene, error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes('Expected width to be greater than 0')) {
        console.warn('[MapView3D] Render skipped until container regains size');
        viewer.resize();
        return;
      }

      console.error('[MapView3D] Render error:', error);
    };
    const handleTileLoadProgress = (queuedTiles: number) => {
      setTerrainTileLoadCount(queuedTiles);
    };

    const onCameraMoveEnd = () => {
      emitBrowseState(viewer, isUpdatingRef, onBrowseStateChangeRef.current);
    };
    let sampledFrameCount = 0;
    let lastSampleAt = performance.now();
    let lastFrameAt = lastSampleAt;

    const handlePostRender = () => {
      const now = performance.now();
      sampledFrameCount += 1;
      lastFrameAt = now;

      if (!hasRenderedFrameRef.current) {
        hasRenderedFrameRef.current = true;
        setHasRenderedFrame(true);
      }

      if (now - lastSampleAt < FPS_SAMPLE_INTERVAL_MS) {
        return;
      }

      setRenderFps(Math.round((sampledFrameCount * 1000) / Math.max(1, now - lastSampleAt)));
      sampledFrameCount = 0;
      lastSampleAt = now;
    };
    const idleFpsResetTimer = window.setInterval(() => {
      if (performance.now() - lastFrameAt >= FPS_IDLE_RESET_DELAY_MS) {
        setRenderFps(null);
      }
    }, FPS_SAMPLE_INTERVAL_MS);

    viewer.camera.moveEnd.addEventListener(onCameraMoveEnd);
    viewer.scene.globe.tileLoadProgressEvent.addEventListener(handleTileLoadProgress);
    viewer.scene.renderError.addEventListener(handleRenderError);
    viewer.scene.postRender.addEventListener(handlePostRender);

    const cleanupCameraControls = installGoogleEarthCameraControls(
      viewer,
      () => {
        emitBrowseState(viewer, isUpdatingRef, onBrowseStateChangeRef.current);
      },
      () => useMapStore.getState().autoTilt,
    );

    return () => {
      if (syncReleaseTimerRef.current) {
        clearTimeout(syncReleaseTimerRef.current);
        syncReleaseTimerRef.current = null;
      }
      terrainWorkZoneRuntimeRef.current.forEach((handle) => {
        unloadTerrainWorkZoneRuntimePreview(viewer, handle)
      })
      terrainWorkZoneRuntimeRef.current.clear()
      terrainWorkZoneRuntimeLoadingRef.current.clear()
      syncRuntimePreviewSummary()
      window.clearInterval(idleFpsResetTimer)
      cleanupCameraControls()
      viewer.camera.moveEnd.removeEventListener(onCameraMoveEnd)
      viewer.scene.globe.tileLoadProgressEvent.removeEventListener(handleTileLoadProgress)
      viewer.scene.renderError.removeEventListener(handleRenderError)
      viewer.scene.postRender.removeEventListener(handlePostRender)
      hasRenderedFrameRef.current = false
      setHasRenderedFrame(false)
      setTerrainTileLoadCount(0)
      setRuntimeLoadingCount(0)
      setRenderFps(null)
      providerGenerationRef.current.imagery += 1
      providerGenerationRef.current.terrain += 1
      providerGenerationRef.current.buildings += 1
      viewer.destroy()
      viewerRef.current = null
      if (import.meta.env.DEV) {
        delete (window as DebugWindow).__ARCSPRO_CESIUM_VIEWER__;
        delete (window as DebugWindow).__ARCSPRO_CESIUM_DEBUG__;
      }
    };
  }, [hasRenderableSize, setRenderFps, syncRuntimePreviewSummary]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    viewer.targetFrameRate = CESIUM_TARGET_FRAME_RATE
    viewer.resolutionScale = renderQuality.resolutionScale
    viewer.scene.postProcessStages.fxaa.enabled = renderQuality.fxaaEnabled
    viewer.scene.globe.maximumScreenSpaceError =
      buildingStyle === 'osm'
        ? Math.max(renderQuality.terrainScreenSpaceError, 4.0)
        : renderQuality.terrainScreenSpaceError
    viewer.scene.requestRender()
  }, [buildingStyle, renderQuality, viewerReadyToken])

  // 根据 buildingStyle 切换地形源：
  // - OSM 白模：必须使用 Cesium World Terrain + depthTest=true
  //   → OSM Buildings 的每栋建筑底部高程精确匹配 World Terrain
  //   → 这是唯一能实现逐建筑贴地的方案（任何全局偏移都无法补偿逐点高差）
  //   → requestVertexNormals=true 改善地形光照，减少视觉崎岖感
  //   → 适当提高 globe.maximumScreenSpaceError 降低地形网格精度，视觉更平滑
  // - 其他模式：使用 ArcGIS Terrain + depthTest=false
  //   → 地面更平滑，不影响 3D 模型摆放
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const useWorldTerrain = buildingStyle === 'osm'
    const requestedId = useWorldTerrain ? 'cesium-world-terrain' : 'arcgis-terrain'
    const requestedProvider = useWorldTerrain ? 'Cesium World Terrain' : 'ArcGIS Terrain'
    const generation = beginProviderLoad('terrain', requestedProvider, requestedId)
    let disposed = false
    let removeTerrainErrorListener: (() => void) | null = null
    let removeTerrainSuccessObserver: (() => void) | null = null
    viewer.scene.globe.depthTestAgainstTerrain = useWorldTerrain

    const isCurrent = () =>
      !disposed && !viewer.isDestroyed() && providerGenerationRef.current.terrain === generation

    const applyTerrainProvider = (
      terrainProvider: Cesium.TerrainProvider,
      activeId: string,
      provider: string,
      successStatus: 'ready' | 'degraded',
      successMessage: string,
      retryable: boolean,
      errorCode: MapProviderRuntimeEntry['errorCode'] = null
    ) => {
      if (!isCurrent()) return
      removeTerrainErrorListener?.()
      removeTerrainSuccessObserver?.()
      let tileErrorCount = 0
      let hasSuccessfulTile = false
      let lastTileError: ClassifiedProviderError | null = null
      removeTerrainSuccessObserver = observeFirstTerrainTileSuccess(terrainProvider, () => {
        if (!isCurrent()) return
        hasSuccessfulTile = true
        updateProviderStatus('terrain', generation, {
          provider,
          status: deriveTileRequestRuntimeStatus(
            { hasSuccessfulTile, failedTileCount: tileErrorCount },
            successStatus
          ),
          activeId,
          message: lastTileError?.message || successMessage,
          retryable: lastTileError?.retryable ?? retryable,
          errorCode: lastTileError?.code ?? errorCode,
        })
      })
      removeTerrainErrorListener = terrainProvider.errorEvent.addEventListener((error: unknown) => {
        if (!isCurrent()) return
        tileErrorCount += 1
        const classified = classifyProviderError(error)
        lastTileError = classified
        updateProviderStatus('terrain', generation, {
          provider,
          status: deriveTileRequestRuntimeStatus({
            hasSuccessfulTile,
            failedTileCount: tileErrorCount,
          }),
          message: classified.message,
          retryable: classified.retryable,
          errorCode: classified.code,
        })
      })
      viewer.terrainProvider = terrainProvider
      viewer.scene.requestRender()
      updateProviderStatus('terrain', generation, {
        provider,
        status: successStatus === 'ready' ? 'loading' : 'degraded',
        activeId,
        message: successStatus === 'ready'
          ? '正在等待首个地形瓦片'
          : `${successMessage}，正在等待首个地形瓦片`,
        retryable,
        errorCode,
      })
    }

    void (async () => {
      if (useWorldTerrain && !cesiumIonToken) {
        try {
          const fallbackProvider = await getArcGisTerrainProvider()
          applyTerrainProvider(
            fallbackProvider,
            'arcgis-terrain',
            'ArcGIS Terrain（备用）',
            'degraded',
            '未配置 Cesium ion 凭据，已使用 ArcGIS 地形',
            false,
            'missing-credentials'
          )
        } catch (fallbackError) {
          if (!isCurrent()) return
          applyTerrainProvider(
            new Cesium.EllipsoidTerrainProvider(),
            'ellipsoid-terrain',
            '无高程地表（备用）',
            'degraded',
            '在线地形不可用，已使用无高程地表',
            true,
            classifyProviderError(fallbackError).code
          )
        }
        return
      }

      try {
        const terrainProvider = await (useWorldTerrain
          ? getWorldTerrainProvider()
          : getArcGisTerrainProvider())
        applyTerrainProvider(
          terrainProvider,
          requestedId,
          requestedProvider,
          'ready',
          '首个地形瓦片已加载',
          false
        )
      } catch (error) {
        if (!isCurrent()) return
        const classified = classifyProviderError(error)
        let terminalFailure = classified
        console.error(`[MapView3D] Failed to load ${requestedProvider}:`, error)

        if (useWorldTerrain) {
          try {
            const fallbackProvider = await getArcGisTerrainProvider()
            applyTerrainProvider(
              fallbackProvider,
              'arcgis-terrain',
              'ArcGIS Terrain（备用）',
              'degraded',
              `${classified.message}，已切换到 ArcGIS 地形`,
              classified.retryable,
              classified.code
            )
            return
          } catch (fallbackError) {
            console.error('[MapView3D] Failed to load ArcGIS terrain fallback:', fallbackError)
            terminalFailure = classifyTerrainFallbackFailure(error, fallbackError)
          }
        }

        applyTerrainProvider(
          new Cesium.EllipsoidTerrainProvider(),
          'ellipsoid-terrain',
          '无高程地表（备用）',
          'degraded',
          `${terminalFailure.message}，已使用无高程地表`,
          terminalFailure.retryable,
          terminalFailure.code
        )
      }
    })()

    return () => {
      disposed = true
      removeTerrainErrorListener?.()
      removeTerrainSuccessObserver?.()
    }
  }, [
    beginProviderLoad,
    buildingStyle,
    providerRetryTokens.terrain,
    updateProviderStatus,
    viewerReadyToken,
  ])

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    let debugLabel = tileStyle
    const selectedSource = PRESET_TILE_SOURCES.find((source) => source.id === tileStyle)
    const generation = beginProviderLoad('imagery', selectedSource?.name || tileStyle, tileStyle)
    let disposed = false
    let removeImageryErrorListener: (() => void) | null = null
    let removeImagerySuccessObserver: (() => void) | null = null

    try {
      viewer.imageryLayers.removeAll(true)
      const imagerySource = createCesiumImageryProvider(tileStyle)
      const imageryProvider = imagerySource.provider
      debugLabel = imagerySource.debugLabel
      let tileErrorCount = 0
      let hasSuccessfulTile = false
      let lastTileError: ClassifiedProviderError | null = null
      const successStatus = imagerySource.fallbackReason ? 'degraded' : 'ready'
      const successMessage = imagerySource.fallbackReason
        ? `${imagerySource.fallbackReason}，已使用备用底图`
        : '首个影像瓦片已加载'

      removeImagerySuccessObserver = observeFirstImageryTileSuccess(imageryProvider, () => {
        if (disposed || providerGenerationRef.current.imagery !== generation) return
        hasSuccessfulTile = true
        updateProviderStatus('imagery', generation, {
          provider: debugLabel,
          status: deriveTileRequestRuntimeStatus(
            { hasSuccessfulTile, failedTileCount: tileErrorCount },
            successStatus
          ),
          activeId: imagerySource.activeId,
          message: lastTileError?.message || successMessage,
          retryable: lastTileError?.retryable ?? Boolean(imagerySource.fallbackReason),
          errorCode: lastTileError?.code ?? null,
        })
      })

      removeImageryErrorListener = imageryProvider.errorEvent.addEventListener((error: unknown) => {
        if (disposed || providerGenerationRef.current.imagery !== generation) return
        tileErrorCount += 1
        const classified = classifyProviderError(error)
        lastTileError = classified
        updateProviderStatus('imagery', generation, {
          provider: debugLabel,
          status: deriveTileRequestRuntimeStatus({
            hasSuccessfulTile,
            failedTileCount: tileErrorCount,
          }),
          message: classified.message,
          retryable: classified.retryable,
          errorCode: classified.code,
        })
        if (import.meta.env.DEV) {
          console.warn('[MapView3D] Imagery tile error', {
            tileStyle,
            provider: debugLabel,
            error,
          })
        } else {
          console.warn(`[MapView3D] Imagery tile error: ${tileStyle} (${debugLabel})`)
        }
      })

      viewer.imageryLayers.addImageryProvider(imageryProvider)
      viewer.scene.requestRender()
      updateProviderStatus('imagery', generation, {
        provider: debugLabel,
        status: successStatus === 'ready' ? 'loading' : 'degraded',
        activeId: imagerySource.activeId,
        message: imagerySource.fallbackReason
          ? `${successMessage}，正在等待首个影像瓦片`
          : '正在等待首个影像瓦片',
        retryable: Boolean(imagerySource.fallbackReason),
        errorCode: null,
      })
    } catch (err) {
      const classified = classifyProviderError(err)
      updateProviderStatus('imagery', generation, {
        provider: debugLabel,
        status: 'failed',
        activeId: null,
        message: classified.message,
        retryable: classified.retryable,
        errorCode: classified.code,
      })
      console.error('[MapView3D] Failed to add imagery:', {
        tileStyle,
        provider: debugLabel,
        error: err,
      });
    }

    return () => {
      disposed = true
      removeImageryErrorListener?.()
      removeImagerySuccessObserver?.()
    }
  }, [
    beginProviderLoad,
    providerRetryTokens.imagery,
    tileStyle,
    updateProviderStatus,
    viewerReadyToken,
  ])

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    if (buildingStyle === 'osmGeoJson') return

    const providerLabel =
      buildingStyle === 'osm'
        ? 'OSM 白模'
        : buildingStyle === 'google3d'
          ? 'Google 真实 3D'
          : '建筑参考层'
    const generation = beginProviderLoad('buildings', providerLabel, buildingStyle)

    if (buildingStyle === 'none' || buildingStyle === 'amap') {
      updateProviderStatus('buildings', generation, {
        provider: providerLabel,
        status: 'unavailable',
        activeId: null,
        message: buildingStyle === 'none' ? '未启用建筑参考层' : '高德白模仅支持高德三维视图',
        retryable: false,
        errorCode: null,
      })
    }

    return syncReferenceBuildings(viewer, buildingStyle, osmBuildingsRef, google3dTilesetRef, {
      ionTokenAvailable: Boolean(cesiumIonToken),
      isCurrent: () => providerGenerationRef.current.buildings === generation,
      onStatus: (patch) => updateProviderStatus('buildings', generation, patch),
      getHiddenOsmBuildings: () => useMapStore.getState().hiddenOsmBuildings,
      getRenderQuality: () => useMapStore.getState().renderQuality,
    })
  }, [
    beginProviderLoad,
    buildingStyle,
    providerRetryTokens.buildings,
    updateProviderStatus,
    viewerReadyToken,
  ])

  useEffect(() => {
    const viewer = viewerRef.current
    const osmTileset = osmBuildingsRef.current
    if (
      buildingStyle !== 'osm' ||
      !viewer ||
      viewer.isDestroyed() ||
      !osmTileset ||
      osmTileset.isDestroyed()
    ) {
      return
    }

    applyOsmTilesetPresentation(viewer, osmTileset, hiddenOsmBuildings, renderQuality)
  }, [buildingStyle, hiddenOsmBuildings, renderQuality, viewerReadyToken])

  // ── 三方OSM：Overpass API 视口查询 ────────────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const tilesMap = osmGeoJsonTilesRef.current;

    // 清理所有已加载的 DataSource
    const clearAllGeoJsonData = () => {
      for (const [key, ds] of tilesMap) {
        try { viewer.dataSources.remove(ds, true); } catch { /* ignore */ }
        tilesMap.delete(key);
      }
    };

    // 如果不是 osmGeoJson 模式，清理并退出
    if (buildingStyle !== 'osmGeoJson') {
      clearAllGeoJsonData();
      return;
    }

    const generation = beginProviderLoad('buildings', '三方 OSM', 'osm-overpass')
    let disposed = false
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let currentAbort: AbortController | null = null
    let lastBBoxKey = ''
    let lastRequestTime = 0
    let retryCount = 0
    let activeEndpointIndex = 0
    let blockedUntil = 0
    const requestGate = createLatestRequestGate()

    const isRequestCurrent = (request: LatestRequestToken) => (
      !disposed
      && !viewer.isDestroyed()
      && providerGenerationRef.current.buildings === generation
      && requestGate.isCurrent(request)
    )
    const updateOverpassStatus = (
      patch: Partial<MapProviderRuntimeEntry>,
      request?: LatestRequestToken,
    ) => {
      if (request && !isRequestCurrent(request)) return
      updateProviderStatus('buildings', generation, patch)
    }
    const disposeStaleDataSource = (dataSource: Cesium.GeoJsonDataSource) => {
      if (!viewer.isDestroyed()) {
        try { viewer.dataSources.remove(dataSource, true) } catch { /* ignore */ }
      }
      dataSource.entities.removeAll()
    }

    const scheduleRetry = (reason: string, request: LatestRequestToken) => {
      if (!isRequestCurrent(request)) return false
      if (retryCount < OVERPASS_MAX_RETRIES) {
        retryCount++;
        activeEndpointIndex = (activeEndpointIndex + 1) % OVERPASS_API_ENDPOINTS.length;
        const retryDelay = OVERPASS_RETRY_BASE_MS * Math.pow(2, retryCount - 1);
        const nextEndpoint = getOverpassEndpointLabel(OVERPASS_API_ENDPOINTS[activeEndpointIndex]);
        console.warn(
          `[MapView3D] Overpass ${reason}: retry #${retryCount} in ${retryDelay / 1000}s via ${nextEndpoint}`
        )
        updateOverpassStatus({
          provider: '三方 OSM',
          status: 'loading',
          message: `${reason}，${Math.round(retryDelay / 1000)} 秒后重试`,
          retryable: true,
          errorCode: reason.includes('429') ? 'rate-limited' : 'network',
        }, request)
        lastBBoxKey = ''
        if (retryTimer) clearTimeout(retryTimer)
        retryTimer = setTimeout(() => syncBuildingsForViewport(true), retryDelay)
        return true
      }

      blockedUntil = Date.now() + OVERPASS_FAILURE_BACKOFF_MS;
      console.warn(
        `[MapView3D] Overpass ${reason}: paused for ${OVERPASS_FAILURE_BACKOFF_MS / 1000}s after ${OVERPASS_MAX_RETRIES} retries`
      )
      updateOverpassStatus({
        provider: '三方 OSM',
        status: 'failed',
        message: `${reason}，自动重试已暂停`,
        retryable: true,
        errorCode: reason.includes('429')
          ? 'rate-limited'
          : reason.includes('timeout')
            ? 'timeout'
            : 'network',
      }, request)
      return false
    }

    const syncBuildingsForViewport = (isRetry = false) => {
      if (disposed || viewer.isDestroyed()) return;

      const remainingBlockTime = blockedUntil - Date.now();
      if (remainingBlockTime > 0) {
        if (!isRetry) {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(
            () => syncBuildingsForViewport(false),
            remainingBlockTime + 500,
          );
        }
        return;
      }

      // cooldown 保护：非重试时检查距上次请求的间隔
      if (!isRetry) {
        const timeSinceLast = Date.now() - lastRequestTime;
        if (timeSinceLast < OVERPASS_COOLDOWN_MS && lastRequestTime > 0) {
          // 延迟到 cooldown 结束后再执行
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => syncBuildingsForViewport(false), OVERPASS_COOLDOWN_MS - timeSinceLast + 500);
          return;
        }
        retryCount = 0; // 非重试请求重置计数
      }

      const cameraHeight = viewer.camera.positionCartographic?.height || 100_000;

      // 太高时清空数据
      if (cameraHeight > OVERPASS_MIN_CAMERA_HEIGHT) {
        requestGate.invalidate()
        lastBBoxKey = ''
        if (currentAbort) {
          currentAbort.abort()
          currentAbort = null
        }
        clearAllGeoJsonData()
        viewer.scene.requestRender()
        updateOverpassStatus({
          provider: '三方 OSM',
          status: 'degraded',
          activeId: 'osm-overpass',
          message: '放大到距地面 3000 米以内后加载当前视野建筑',
          retryable: false,
          errorCode: null,
          itemCount: 0,
        })
        return
      }

      const bbox = getViewportBBox(viewer);
      if (!bbox) return;

      // 构建 bbox key，避免重复请求
      const bboxKey = `${bbox.south.toFixed(5)},${bbox.west.toFixed(5)},${bbox.north.toFixed(5)},${bbox.east.toFixed(5)}`;
      if (bboxKey === lastBBoxKey) return;
      lastBBoxKey = bboxKey;
      const request = requestGate.begin(bboxKey)

      // 取消上一个请求
      if (currentAbort) {
        currentAbort.abort();
        currentAbort = null;
      }

      const controller = new AbortController();
      currentAbort = controller;
      lastRequestTime = Date.now();
      const endpointUrl = OVERPASS_API_ENDPOINTS[activeEndpointIndex];
      const endpointLabel = getOverpassEndpointLabel(endpointUrl);
      let didTimeout = false;
      const timeoutHandle = setTimeout(() => {
        didTimeout = true;
        controller.abort();
      }, OVERPASS_REQUEST_TIMEOUT_MS);

      const query = buildOverpassQuery(bbox);
      console.log(
        `[MapView3D] Overpass: querying bbox ${bboxKey} via ${endpointLabel}${isRetry ? ` (retry #${retryCount})` : ''}`
      )
      updateOverpassStatus({
        provider: '三方 OSM',
        status: 'loading',
        activeId: 'osm-overpass',
        message: `正在从 ${endpointLabel} 查询当前视野建筑`,
        retryable: false,
        errorCode: null,
      }, request)

      fetch(endpointUrl, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: controller.signal,
      })
        .then((res) => {
          clearTimeout(timeoutHandle);
          if (!isRequestCurrent(request)) {
            return Promise.reject(new DOMException('Stale Overpass request', 'AbortError'));
          }
          if ([429, 502, 503, 504].includes(res.status)) {
            scheduleRetry(`HTTP ${res.status}`, request);
            return Promise.reject(new DOMException('Transient Overpass failure', 'AbortError'));
          }
          if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
          return res.json();
        })
        .then((overpassData) => {
          if (!isRequestCurrent(request)) return;
          clearTimeout(timeoutHandle);
          if (currentAbort === controller) currentAbort = null;
          blockedUntil = 0;
          retryCount = 0;

          const geojson = overpassToGeoJson(overpassData);
          if (geojson.features.length === 0) {
            console.log('[MapView3D] Overpass: no buildings in viewport')
            clearAllGeoJsonData()
            viewer.scene.requestRender()
            updateOverpassStatus({
              provider: '三方 OSM',
              status: 'ready',
              activeId: 'osm-overpass',
              message: '服务已连接，当前视野未查询到建筑',
              retryable: false,
              errorCode: null,
              itemCount: 0,
            }, request)
            return
          }

          console.log(`[MapView3D] Overpass: ${geojson.features.length} buildings loaded`);

          return Cesium.GeoJsonDataSource.load(geojson, {
            clampToGround: true,
            stroke: OVERPASS_BUILDING_OUTLINE_COLOR,
            fill: OVERPASS_BUILDING_COLOR,
            strokeWidth: 1,
          });
        })
        .then((dataSource) => {
          if (!dataSource) return;
          if (!isRequestCurrent(request)) {
            disposeStaleDataSource(dataSource)
            return
          }

          // 为每个建筑设置拉伸高度
          for (const entity of dataSource.entities.values) {
            if (entity.polygon) {
              const props = entity.properties;
              let height = OVERPASS_DEFAULT_HEIGHT;

              if (props) {
                const hVal = props.height?.getValue(Cesium.JulianDate.now());
                const levelsKey = props['building:levels'] || props.levels;
                const levelsVal = levelsKey?.getValue?.(Cesium.JulianDate.now());
                if (typeof hVal === 'number' && hVal > 0) {
                  height = hVal;
                } else if (typeof hVal === 'string' && parseFloat(hVal) > 0) {
                  height = parseFloat(hVal);
                } else if (typeof levelsVal === 'number' && levelsVal > 0) {
                  height = levelsVal * 3;
                } else if (typeof levelsVal === 'string' && parseInt(levelsVal, 10) > 0) {
                  height = parseInt(levelsVal, 10) * 3;
                }
              }

              entity.polygon.heightReference = Cesium.HeightReference.CLAMP_TO_GROUND as unknown as Cesium.Property;
              entity.polygon.extrudedHeight = new Cesium.ConstantProperty(height);
              entity.polygon.extrudedHeightReference = Cesium.HeightReference.RELATIVE_TO_GROUND as unknown as Cesium.Property;
              entity.polygon.material = OVERPASS_BUILDING_COLOR as unknown as Cesium.MaterialProperty;
              entity.polygon.outline = new Cesium.ConstantProperty(true);
              entity.polygon.outlineColor = new Cesium.ConstantProperty(OVERPASS_BUILDING_OUTLINE_COLOR);
              entity.polygon.outlineWidth = new Cesium.ConstantProperty(1);
            }
          }

          if (!isRequestCurrent(request)) {
            disposeStaleDataSource(dataSource)
            return
          }

          // 清除旧数据后添加新数据
          clearAllGeoJsonData()
          if (!isRequestCurrent(request)) {
            disposeStaleDataSource(dataSource)
            return
          }

          return viewer.dataSources.add(dataSource).then((addedDataSource) => {
            if (!isRequestCurrent(request)) {
              disposeStaleDataSource(addedDataSource as Cesium.GeoJsonDataSource)
              return
            }
            tilesMap.set(bboxKey, addedDataSource as Cesium.GeoJsonDataSource)
            viewer.scene.requestRender()
            updateOverpassStatus({
              provider: '三方 OSM',
              status: 'ready',
              activeId: 'osm-overpass',
              message: '当前视野建筑已加载',
              retryable: false,
              errorCode: null,
              itemCount: addedDataSource.entities.values.length,
            }, request)
          })
        })
        .catch((err) => {
          clearTimeout(timeoutHandle);
          if (currentAbort === controller) currentAbort = null;
          if (!isRequestCurrent(request)) return;
          if (didTimeout) {
            scheduleRetry(`timeout @ ${endpointLabel}`, request);
            return;
          }
          if (err instanceof TypeError) {
            scheduleRetry(`network error @ ${endpointLabel}`, request);
            return;
          }
          if (err.name !== 'AbortError') {
            const classified = classifyProviderError(err)
            updateOverpassStatus({
              provider: '三方 OSM',
              status: 'failed',
              message: classified.message,
              retryable: classified.retryable,
              errorCode: classified.code,
            }, request)
            console.warn('[MapView3D] Overpass query failed:', err.message)
          }
        });
    };

    // debounce 包装
    const debouncedSync = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(syncBuildingsForViewport, OVERPASS_DEBOUNCE_MS);
    };

    // 首次加载 + 监听相机移动
    syncBuildingsForViewport();
    const moveEndListener = viewer.camera.moveEnd.addEventListener(debouncedSync);

    console.log('[MapView3D] Overpass building manager started');

    return () => {
      disposed = true
      requestGate.invalidate()
      moveEndListener()
      if (debounceTimer) clearTimeout(debounceTimer)
      if (retryTimer) clearTimeout(retryTimer)
      if (currentAbort) currentAbort.abort()
      currentAbort = null
      clearAllGeoJsonData()
      console.log('[MapView3D] Overpass building manager stopped')
    }
  }, [
    beginProviderLoad,
    buildingStyle,
    providerRetryTokens.buildings,
    updateProviderStatus,
    viewerReadyToken,
  ])

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    syncExtrudedFeatures(viewer, drawnFeatures);
  }, [drawnFeatures, viewerReadyToken]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    syncPlacedModels(viewer, placedModels, selectedPlacedModelId, entityMapRef.current);
    if (import.meta.env.DEV) {
      (window as DebugWindow).__ARCSPRO_CESIUM_DEBUG__ = {
        placedModelIds: placedModels.map((model) => model.id),
        entityMapKeys: Array.from(entityMapRef.current.keys()),
        entityIds: viewer.entities.values.map((entity) => entity.id),
        terrainWorkZoneRuntimes: Array.from(terrainWorkZoneRuntimeRef.current.entries()).map(([zoneId, handle]) => ({
          zoneId,
          signature: handle.signature,
          sourceSummaries: handle.sourceSummaries,
        })),
      };
    }
  }, [placedModels, selectedPlacedModelId, viewerReadyToken]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const previewableZones = treeNodes
      .filter((node) => {
        const zoneId = node.backendWorkZoneId || node.focusZoneId;
        return Boolean(
          zoneId
          && node.visible
          && (node.source === 'terrain-work-zone' || node.backendWorkZoneId)
          && String(node.exportTaskStatus || '').startsWith('completed'),
        );
      })
      .map((node) => ({
        nodeId: node.id,
        zoneId: node.backendWorkZoneId || node.focusZoneId || '',
        signature: [
          node.exportTaskId || 'task',
          node.exportTaskStatus || 'status',
          node.exportOutputRoot || 'output',
          terrainWorkZoneRuntimePolicy.strategy,
          terrainWorkZoneRuntimePolicy.fpsBucket,
        ].join(':'),
      }));

    const activeZoneIds = new Set(previewableZones.map((item) => item.zoneId));
    terrainWorkZoneRuntimeRef.current.forEach((handle, zoneId) => {
      const expected = previewableZones.find((item) => item.zoneId === zoneId);
      if (!expected || expected.signature !== handle.signature) {
        unloadTerrainWorkZoneRuntimePreview(viewer, handle);
        terrainWorkZoneRuntimeRef.current.delete(zoneId);
        syncRuntimePreviewSummary();
      }
    });

    let disposed = false;
    const orgId = getOrgIdFromLocation();

    previewableZones.forEach((zone) => {
      if (!zone.zoneId || !activeZoneIds.has(zone.zoneId)) return;
      const existing = terrainWorkZoneRuntimeRef.current.get(zone.zoneId);
      if (existing?.signature === zone.signature) return;
      if (terrainWorkZoneRuntimeLoadingRef.current.has(zone.zoneId)) return;

      terrainWorkZoneRuntimeLoadingRef.current.add(zone.zoneId);
      setRuntimeLoadingCount(terrainWorkZoneRuntimeLoadingRef.current.size);
      studioProjectApi.getTerrainWorkZoneRuntimePreview(zone.zoneId, orgId)
        .then(async (response) => {
          if (disposed || viewer.isDestroyed()) return;
          const preview = response?.data?.preview as TerrainWorkZoneRuntimePreviewPayload | undefined;
          if (!preview?.sources?.length) return;

          const loaded = await loadTerrainWorkZoneRuntimePreview(viewer, preview, terrainWorkZoneRuntimePolicy);
          if (disposed || viewer.isDestroyed()) {
            unloadTerrainWorkZoneRuntimePreview(viewer, loaded);
            return;
          }

          const previous = terrainWorkZoneRuntimeRef.current.get(zone.zoneId);
          if (previous) {
            unloadTerrainWorkZoneRuntimePreview(viewer, previous);
          }
          terrainWorkZoneRuntimeRef.current.set(zone.zoneId, {
            signature: zone.signature,
            ...loaded,
          });
          syncRuntimePreviewSummary();
          if (import.meta.env.DEV) {
            const currentPlacedModels = useModelStore.getState().placedModels;
            (window as DebugWindow).__ARCSPRO_CESIUM_DEBUG__ = {
              placedModelIds: currentPlacedModels.map((model) => model.id),
              entityMapKeys: Array.from(entityMapRef.current.keys()),
              entityIds: viewer.entities.values.map((entity) => entity.id),
              terrainWorkZoneRuntimes: Array.from(terrainWorkZoneRuntimeRef.current.entries()).map(([runtimeZoneId, handle]) => ({
                zoneId: runtimeZoneId,
                signature: handle.signature,
                sourceSummaries: handle.sourceSummaries,
              })),
            };
          }
        })
        .catch((error) => {
          console.error(`[MapView3D] Failed to load terrain work zone preview ${zone.zoneId}:`, error);
        })
        .finally(() => {
          terrainWorkZoneRuntimeLoadingRef.current.delete(zone.zoneId);
          setRuntimeLoadingCount(terrainWorkZoneRuntimeLoadingRef.current.size);
          if (!disposed && !viewer.isDestroyed()) {
            viewer.scene.requestRender();
          }
        });
    });

    return () => {
      disposed = true;
    };
  }, [
    treeNodes,
    viewerReadyToken,
    terrainWorkZoneRuntimePolicy.strategy,
    terrainWorkZoneRuntimePolicy.fpsBucket,
    syncRuntimePreviewSummary,
  ]);

  // 模型 + 建筑拖拽处理器
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    let dragState: {
      isActive: boolean;
      kind: 'model' | 'building' | null;
      placedModelId: string | null;
      studioBuildingId: string | null;
      originalPlacement: {
        longitude: number;
        latitude: number;
        height: number;
        clampToGround: boolean;
      } | null;
    } = {
      isActive: false,
      kind: null,
      placedModelId: null,
      studioBuildingId: null,
      originalPlacement: null,
    };

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

    // LEFT_DOWN: 检测是否点击了可拖拽的模型或建筑
    handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(event.position);
      if (!Cesium.defined(picked) || !picked?.id) return;

      const entity = picked.id as Cesium.Entity;

      // 优先检测模型
      const placedModelId = entity.properties?.placedModelId?.getValue();
      if (placedModelId) {
        const model = placedModels.find(m => m.id === placedModelId);
        if (!model || model.locked) return;

        dragState = {
          isActive: true,
          kind: 'model',
          placedModelId,
          studioBuildingId: null,
          originalPlacement: {
            longitude: model.placement.longitude,
            latitude: model.placement.latitude,
            height: model.placement.height,
            clampToGround: model.placement.clampToGround,
          },
        };

        selectPlacedModel(placedModelId);
        viewer.scene.screenSpaceCameraController.enableInputs = false;
        return;
      }

      // 检测建筑 polygon entity
      const studioBuildingId = entity.properties?.studioBuildingId?.getValue();
      if (studioBuildingId) {
        // 从当前 entity 的 polygon hierarchy 计算中心点
        const groundPos = pickGroundTarget(viewer, event.position);
        if (!groundPos) return;
        const carto = Cesium.Cartographic.fromCartesian(groundPos);
        if (!carto) return;

        dragState = {
          isActive: true,
          kind: 'building',
          placedModelId: null,
          studioBuildingId,
          originalPlacement: {
            longitude: Cesium.Math.toDegrees(carto.longitude),
            latitude: Cesium.Math.toDegrees(carto.latitude),
            height: 0,
            clampToGround: true,
          },
        };

        viewer.scene.screenSpaceCameraController.enableInputs = false;
      }
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

    // MOUSE_MOVE: 更新拖拽位置
    handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      if (!dragState.isActive) return;

      const groundPos = pickGroundTarget(viewer, event.position);
      if (!groundPos) return;

      const carto = Cesium.Cartographic.fromCartesian(groundPos);
      if (!carto) return;

      const newLongitude = Cesium.Math.toDegrees(carto.longitude);
      const newLatitude = Cesium.Math.toDegrees(carto.latitude);

      if (dragState.kind === 'model' && dragState.placedModelId && dragState.originalPlacement) {
        updatePlacement(dragState.placedModelId, {
          longitude: newLongitude,
          latitude: newLatitude,
          height: dragState.originalPlacement.clampToGround ? 0 : dragState.originalPlacement.height,
        });
      }
      // 建筑拖拽不做实时预览（需要重建 GeoJSON DataSource 太重），仅在 LEFT_UP 时一次性通知
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    // LEFT_UP: 完成拖拽
    handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      if (!dragState.isActive) return;

      viewer.scene.screenSpaceCameraController.enableInputs = true;

      if (dragState.kind === 'building' && dragState.studioBuildingId) {
        // 建筑拖拽完成：计算鼠标释放位置作为新中心
        const groundPos = pickGroundTarget(viewer, event.position);
        if (groundPos) {
          const carto = Cesium.Cartographic.fromCartesian(groundPos);
          if (carto) {
            notifyBuildingMoved(dragState.studioBuildingId, {
              latitude: Cesium.Math.toDegrees(carto.latitude),
              longitude: Cesium.Math.toDegrees(carto.longitude),
            });
          }
        }
      }

      dragState = {
        isActive: false,
        kind: null,
        placedModelId: null,
        studioBuildingId: null,
        originalPlacement: null,
      };
    }, Cesium.ScreenSpaceEventType.LEFT_UP);

    return () => {
      handler.destroy();
    };
  }, [placedModels, selectPlacedModel, updatePlacement, notifyBuildingMoved]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !browseSyncToken || browseSyncSource === 'cesium3d') return;

    // 从 store 直接读取最新的 browseState，避免将其加入依赖数组造成循环
    const currentBrowseState = useMapStore.getState().browseState;

    isUpdatingRef.current = true;
    applyBrowseStateToCamera(viewer, currentBrowseState, true);

    if (syncReleaseTimerRef.current) {
      clearTimeout(syncReleaseTimerRef.current);
    }

    syncReleaseTimerRef.current = setTimeout(() => {
      isUpdatingRef.current = false;
      syncReleaseTimerRef.current = null;
    }, 700);
  }, [browseSyncSource, browseSyncToken, viewerReadyToken]);

  // 响应飞行定位信号
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !flyToFeatureId || !flyToToken) return;
    const node = treeNodes.find(n => n.id === flyToFeatureId);
    if (!node?.geometry) { clearFlyToFeature(); return; }

    const geom = node.geometry;
    const positions: Cesium.Cartesian3[] = [];

    if (geom.type === 'Polygon') {
      const coords = (geom as GeoJSON.Polygon).coordinates[0];
      coords.forEach(c => positions.push(Cesium.Cartesian3.fromDegrees(c[0], c[1])));
    } else if (geom.type === 'LineString') {
      const coords = (geom as GeoJSON.LineString).coordinates;
      coords.forEach(c => positions.push(Cesium.Cartesian3.fromDegrees(c[0], c[1])));
    } else if (geom.type === 'Point') {
      const c = (geom as GeoJSON.Point).coordinates;
      const target = Cesium.Cartesian3.fromDegrees(c[0], c[1]);
      viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(target, 200), {
        duration: 1.5,
        offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), 500),
      });
      clearFlyToFeature();
      return;
    }

    if (positions.length >= 2) {
      const sphere = Cesium.BoundingSphere.fromPoints(positions);
      viewer.camera.flyToBoundingSphere(sphere, {
        duration: 1.5,
        offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), sphere.radius * 3),
      });
    }
    clearFlyToFeature();
  }, [flyToToken, viewerReadyToken]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

    handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const pickedObjects = getPickedObjects(viewer, event.position);

      // 优先处理用户添加的实体（模型和GeoJSON要素）
      for (const pickedObject of pickedObjects) {
        const entityCandidate = pickedObject as PickedEntityLike;

        if (Cesium.defined(entityCandidate.id) && entityCandidate.id instanceof Cesium.Entity) {
          const entity = entityCandidate.id as Cesium.Entity;
          const placedModelId = entity.properties?.placedModelId?.getValue();
          const featureId = entity.properties?.featureId?.getValue?.();

          if (featureId) {
            setOsmBuildingMenu(null);
            selectPlacedModel(null);
            setSelectedNodeId(String(featureId));
            setPropsPanelNodeId(String(featureId));
            return;
          }

          if (placedModelId) {
            const model = placedModels.find((item) => item.id === placedModelId);
            if (model && !model.locked) {
              setOsmBuildingMenu(null);
              setSelectedNodeId(null);
              setPropsPanelNodeId(null);
              selectPlacedModel(placedModelId);
              return;
            }
          }
        }
      }

      for (const pickedObject of pickedObjects) {
        const pickedOsmBuilding = extractPickedOsmBuilding(pickedObject, osmBuildingsRef.current);
        if (pickedOsmBuilding) {
          const anchoredOsmBuilding = attachOsmBuildingAnchor(pickedOsmBuilding, viewer, event.position);
          selectPlacedModel(null);
          setSelectedNodeId(null);
          setPropsPanelNodeId(null);
          setOsmBuildingMenu({
            building: anchoredOsmBuilding,
            anchor: {
              x: event.position.x,
              y: event.position.y,
            },
          });
          return;
        }
      }

      setOsmBuildingMenu(null);
      if (useMapStore.getState().selectedNodeId || useMapStore.getState().propsPanelNodeId) {
        setSelectedNodeId(null);
        setPropsPanelNodeId(null);
      } else if (selectedPlacedModelId) {
        selectPlacedModel(null);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.destroy();
    };
  }, [
    placedModels,
    selectedPlacedModelId,
    selectPlacedModel,
    setPropsPanelNodeId,
    setSelectedNodeId,
    viewerReadyToken,
  ]);

  const activeOsmBuilding = osmBuildingMenu?.building ?? null;
  const activeOsmBuildingHidden = activeOsmBuilding ? hiddenOsmBuildingKeys.has(activeOsmBuilding.key) : false;
  const shellWidth = shellRef.current?.clientWidth ?? 0;
  const shellHeight = shellRef.current?.clientHeight ?? 0;
  const menuLeft = osmBuildingMenu
    ? Math.max(12, Math.min(osmBuildingMenu.anchor.x + 14, Math.max(12, shellWidth - 260)))
    : 12;
  const menuTop = osmBuildingMenu
    ? Math.max(12, Math.min(osmBuildingMenu.anchor.y + 14, Math.max(12, shellHeight - 200)))
    : 12;
  const showRuntimePreviewHud = runtimePreviewSummary.zoneCount > 0;
  const runtimeBucketLabel = runtimePreviewSummary.fpsBucket === 'degraded'
    ? '低帧率保护'
    : runtimePreviewSummary.fpsBucket === 'balanced'
      ? '平衡'
      : runtimePreviewSummary.fpsBucket === 'quality'
        ? '高质量'
        : '待采样';
  const runtimeFpsLabel = runtimePreviewSummary.renderFps == null
    ? 'FPS --'
    : `FPS ${runtimePreviewSummary.renderFps}`;
  const globeExperienceStatus = deriveGlobeExperienceStatus({
    hasRenderableSize,
    viewerReady: Boolean(viewerRef.current),
    hasRenderedFrame,
    tileLoadCount: terrainTileLoadCount,
    runtimeLoadingCount,
    expectedZoneCount: previewableRuntimeZoneCount,
    summary: runtimePreviewSummary,
    providers: providerRuntimeStatus,
  })
  const displayZoneCount = Math.max(runtimePreviewSummary.zoneCount, previewableRuntimeZoneCount)
  const showRuntimeResourceMeta = runtimePreviewSummary.sourceCount > 0 || displayZoneCount > 0

  return (
    <div
      ref={shellRef}
      className="map-view-3d-shell"
      style={{ width: '100%', height: '100%' }}
    >
      <div
        ref={containerRef}
        className="map-view-3d"
        style={{ width: '100%', height: '100%' }}
      />

      {globeExperienceStatus.visible && (
        <div
          className={`map-runtime-preview-hud is-${globeExperienceStatus.tone}`.trim()}
          data-experience-status={globeExperienceStatus.tone}
        >
          <div className="map-runtime-preview-hud__eyebrow">{globeExperienceStatus.eyebrow}</div>
          <div className="map-runtime-preview-hud__title">{globeExperienceStatus.title}</div>
          <div className="map-runtime-preview-hud__subline">
            {globeExperienceStatus.message}
          </div>
          <div className="map-runtime-preview-hud__meta">
            <span>{displayZoneCount} 个工作区</span>
            {showRuntimeResourceMeta && <span>{runtimePreviewSummary.sourceCount} 个资源源</span>}
            {runtimePreviewSummary.sourceCount > 0 && <span>模式 {runtimePreviewSummary.strategyLabel}</span>}
            {showRuntimeResourceMeta && <span>目标 {runtimePreviewSummary.requestedStrategyLabel}</span>}
            {runtimePreviewSummary.instanceCount > 0 && <span>{runtimePreviewSummary.instanceCount} 个实例</span>}
            <span>{runtimeBucketLabel}</span>
            <span>{runtimeFpsLabel}</span>
            <span>画质 {runtimePreviewSummary.qualityPreset}</span>
            {runtimeLoadingCount > 0 && <span>{runtimeLoadingCount} 个工作区加载中</span>}
            {terrainTileLoadCount > 0 && <span>{terrainTileLoadCount} 个地形分块排队</span>}
          </div>
          {showRuntimePreviewHud && runtimePreviewSummary.fallbackSourceCount > 0 && (
            <div className="map-runtime-preview-hud__subline">
              {runtimePreviewSummary.fallbackSourceCount} 个资源源已自动回退到更稳的展示方式
            </div>
          )}
          {globeExperienceStatus.detail && (
            <div className="map-runtime-preview-hud__reason">
              {globeExperienceStatus.detail}
            </div>
          )}
          <MapProviderStatusHud value={providerRuntimeStatus} onRetry={retryProvider} />
        </div>
      )}

      {osmBuildingMenu && activeOsmBuilding && (
        <div
          ref={osmMenuRef}
          className="map-reference-menu"
          style={{ left: `${menuLeft}px`, top: `${menuTop}px` }}
        >
          <div className="map-reference-menu__eyebrow">OSM 白模</div>
          <div className="map-reference-menu__title">{getOsmBuildingLabel(activeOsmBuilding)}</div>
          <div className="map-reference-menu__meta">
            <span>{activeOsmBuilding.elementType}</span>
            <span>#{activeOsmBuilding.elementId}</span>
            {activeOsmBuilding.buildingType ? <span>{activeOsmBuilding.buildingType}</span> : null}
          </div>
          <div className="map-reference-menu__actions">
            <button
              type="button"
              className={`btn btn--sm ${activeOsmBuildingHidden ? 'btn--ghost' : 'btn--secondary'}`}
              onClick={() => {
                if (activeOsmBuildingHidden) {
                  showOsmBuilding(activeOsmBuilding.key);
                } else {
                  hideOsmBuilding(activeOsmBuilding);
                }
                revealReferencePanel();
                setOsmBuildingMenu(null);
              }}
            >
              {activeOsmBuildingHidden ? '取消隐藏' : '隐藏这栋白模'}
            </button>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => {
                revealReferencePanel();
                setOsmBuildingMenu(null);
              }}
            >
              打开白模管理
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
