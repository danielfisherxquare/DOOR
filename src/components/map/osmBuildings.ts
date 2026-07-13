import * as Cesium from 'cesium';
import type { HiddenOsmBuilding, MapRenderQuality } from '../../stores/mapStore';
import {
  classifyProviderError,
  createLatestRequestGate,
  deriveTilesetRuntimeStatus,
  type ClassifiedProviderError,
  type LatestRequestToken,
  type MapProviderRuntimeEntry,
} from '../../utils/map/providerRuntimeStatus';

const OSM_BUILDINGS_MAX_SCREEN_SPACE_ERROR = 16;
const OVERPASS_API_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const OVERPASS_MIN_CAMERA_HEIGHT = 3000;
const OVERPASS_DEBOUNCE_MS = 5000;
const OVERPASS_COOLDOWN_MS = 12000;
const OVERPASS_RETRY_BASE_MS = 15000;
const OVERPASS_MAX_RETRIES = 2;
const OVERPASS_FAILURE_BACKOFF_MS = 45000;
const OVERPASS_REQUEST_TIMEOUT_MS = 12000;
const OVERPASS_DEFAULT_HEIGHT = 10;
const OVERPASS_BUILDING_COLOR = Cesium.Color.fromCssColorString('#D0E4F0').withAlpha(0.75);
const OVERPASS_BUILDING_OUTLINE_COLOR = Cesium.Color.fromCssColorString('#8AB4D0').withAlpha(0.4);

type ViewportBBox = { south: number; west: number; north: number; east: number };

type OverpassElement = {
  type: string;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
  bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number };
  members?: Array<{
    type: string;
    role: string;
    geometry?: Array<{ lat: number; lon: number }>;
  }>;
};

type GeoJsonFeature = {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown };
};

type PickedOsmFeatureLike = {
  primitive?: unknown;
  tileset?: unknown;
  content?: {
    tileset?: unknown;
    tile?: { tileset?: unknown };
  };
  getProperty?: (name: string) => unknown;
  getPropertyInherited?: (name: string) => unknown;
};

export function getViewportBBox(viewer: Cesium.Viewer): ViewportBBox | null {
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

  let lonMin = 180;
  let lonMax = -180;
  let latMin = 90;
  let latMax = -90;
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
    validCount += 1;
  }

  if (validCount < 2) return null;
  const lonSpan = lonMax - lonMin;
  const latSpan = latMax - latMin;
  if (lonSpan > 0.05 || latSpan > 0.05) {
    const centerLon = (lonMin + lonMax) / 2;
    const centerLat = (latMin + latMax) / 2;
    const halfSpan = 0.02;
    return {
      south: centerLat - halfSpan,
      west: centerLon - halfSpan,
      north: centerLat + halfSpan,
      east: centerLon + halfSpan,
    };
  }
  return { south: latMin, west: lonMin, north: latMax, east: lonMax };
}

export function buildOverpassQuery(bbox: ViewportBBox): string {
  return `[out:json][timeout:15][bbox:${bbox.south},${bbox.west},${bbox.north},${bbox.east}];(way["building"];relation["building"];);out geom;`;
}

export function getOverpassEndpointLabel(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function overpassToGeoJson(data: { elements: OverpassElement[] }): {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
} {
  const features: GeoJsonFeature[] = [];

  for (const element of data.elements) {
    if (element.type === 'way' && element.geometry) {
      const coordinates = element.geometry.map((point) => [point.lon, point.lat]);
      if (coordinates.length >= 3) {
        const first = coordinates[0];
        const last = coordinates[coordinates.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) coordinates.push([...first]);
        features.push({
          type: 'Feature',
          properties: element.tags || {},
          geometry: { type: 'Polygon', coordinates: [coordinates] },
        });
      }
    } else if (element.type === 'relation' && element.members) {
      const outers: number[][][] = [];
      const inners: number[][][] = [];
      for (const member of element.members) {
        if (!member.geometry) continue;
        const ring = member.geometry.map((point) => [point.lon, point.lat]);
        if (ring.length < 3) continue;
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
        if (member.role === 'outer') outers.push(ring);
        else if (member.role === 'inner') inners.push(ring);
      }
      for (const outer of outers) {
        features.push({
          type: 'Feature',
          properties: element.tags || {},
          geometry: { type: 'Polygon', coordinates: [outer, ...inners] },
        });
      }
    }
  }

  return { type: 'FeatureCollection', features };
}

function getOsmBuildingKey(elementType: string, elementId: number): string {
  return `${elementType}:${elementId}`;
}

export function getOsmBuildingLabel(building: Pick<HiddenOsmBuilding, 'name' | 'elementId'>): string {
  const name = building.name?.trim();
  return name || `OSM 建筑 #${building.elementId}`;
}

export function createOsmBuildingsStyle(hiddenOsmBuildings: HiddenOsmBuilding[]): Cesium.Cesium3DTileStyle {
  if (hiddenOsmBuildings.length === 0) return new Cesium.Cesium3DTileStyle({ show: true });

  const conditions = hiddenOsmBuildings.map((building) => [
    `\${elementType} === ${JSON.stringify(building.elementType)} && \${elementId} === ${building.elementId}`,
    'false',
  ]);
  conditions.push(['true', 'true']);

  return new Cesium.Cesium3DTileStyle({ show: { conditions } });
}

export function applyOsmBuildingsStyle(
  viewer: Cesium.Viewer,
  tileset: Cesium.Cesium3DTileset,
  hiddenOsmBuildings: HiddenOsmBuilding[],
): void {
  tileset.style = createOsmBuildingsStyle(hiddenOsmBuildings);
  viewer.scene.requestRender();
}

export function getPickedObjects(viewer: Cesium.Viewer, pixel: Cesium.Cartesian2): unknown[] {
  try {
    const drilled = viewer.scene.drillPick(pixel, 12);
    if (Array.isArray(drilled) && drilled.length > 0) return drilled;
  } catch {
    // Fall through to single-pick mode.
  }

  const picked = viewer.scene.pick(pixel);
  return Cesium.defined(picked) ? [picked] : [];
}

function readPickedFeatureProperty(feature: PickedOsmFeatureLike, name: string): unknown {
  const directValue = typeof feature.getProperty === 'function' ? feature.getProperty(name) : undefined;
  if (directValue !== undefined) return directValue;
  return typeof feature.getPropertyInherited === 'function' ? feature.getPropertyInherited(name) : undefined;
}

function isSameOsmTileset(
  feature: PickedOsmFeatureLike,
  osmTileset: Cesium.Cesium3DTileset | null,
): boolean {
  if (!osmTileset) return false;
  return (
    feature.primitive === osmTileset ||
    feature.tileset === osmTileset ||
    feature.content?.tileset === osmTileset ||
    feature.content?.tile?.tileset === osmTileset
  );
}

export function extractPickedOsmBuilding(
  pickedObject: unknown,
  osmTileset: Cesium.Cesium3DTileset | null,
): HiddenOsmBuilding | null {
  if (!pickedObject || !osmTileset || typeof pickedObject !== 'object') return null;

  const feature = pickedObject as PickedOsmFeatureLike;
  if (typeof feature.getProperty !== 'function' && typeof feature.getPropertyInherited !== 'function') return null;

  const rawElementType = readPickedFeatureProperty(feature, 'elementType');
  const rawElementId = readPickedFeatureProperty(feature, 'elementId');
  const elementType = typeof rawElementType === 'string' ? rawElementType.trim() : '';
  const elementId = typeof rawElementId === 'number' ? rawElementId : Number(rawElementId);

  if (!elementType || !Number.isFinite(elementId)) return null;
  if (!isSameOsmTileset(feature, osmTileset) && elementType !== 'way' && elementType !== 'relation') return null;

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

export function applyOsmTilesetPresentation(
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
  ;(tileset as Cesium.Cesium3DTileset & { enableShowOutline?: boolean }).enableShowOutline =
    renderQuality.showOsmOutline
  tileset.showOutline = renderQuality.showOsmOutline
  applyOsmBuildingsStyle(viewer, tileset, hiddenOsmBuildings)
}

type TilesetRef = { current: Cesium.Cesium3DTileset | null }

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

export function syncReferenceBuildings(
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

type OverpassBuildingRuntimeCallbacks = {
  isCurrent: () => boolean
  onStatus: (_patch: Partial<MapProviderRuntimeEntry>) => void
}

export function startOverpassBuildingManager(
  viewer: Cesium.Viewer,
  tilesMap: Map<string, Cesium.GeoJsonDataSource>,
  callbacks: OverpassBuildingRuntimeCallbacks,
): () => void {
    // 清理所有已加载的 DataSource
    const clearAllGeoJsonData = () => {
      for (const [key, ds] of tilesMap) {
        try { viewer.dataSources.remove(ds, true); } catch { /* ignore */ }
        tilesMap.delete(key);
      }
    };

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
      && callbacks.isCurrent()
      && requestGate.isCurrent(request)
    )
    const updateOverpassStatus = (
      patch: Partial<MapProviderRuntimeEntry>,
      request?: LatestRequestToken,
    ) => {
      if (request && !isRequestCurrent(request)) return
      callbacks.onStatus(patch)
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

}
