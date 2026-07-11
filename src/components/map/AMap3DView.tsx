import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { APILoader, Map, Marker, MouseTool, MouseToolDrawType, Polygon, Polyline } from '@uiw/react-amap';
import gcoord from 'gcoord';
import { useMapStore, type MapDrawToolId, type MapTreeNode } from '../../stores/mapStore';
import {
  clampPitchDeg,
  clampZoomForMode,
  normalizeHeadingDeg,
  type MapBrowseSyncSource,
  type MapBrowseState,
} from '../../utils/map/browseState';

interface AMap3DViewProps {
  onBrowseStateChange?: (state: MapBrowseState) => void;
  browseSyncToken?: number;
  browseSyncSource?: MapBrowseSyncSource;
}

interface DrawToolDefinition {
  id: MapDrawToolId;
  drawType: MouseToolDrawType;
  icon: string;
  label: string;
  hint: string;
  shortcut: string;
}

const AMAP_KEY = import.meta.env.VITE_AMAP_KEY || '';
const AMAP_SECURITY_CODE = import.meta.env.VITE_AMAP_SECURITY_CODE || '';

const DRAW_TOOLS: DrawToolDefinition[] = [
  { id: 'marker', drawType: MouseToolDrawType.MARKER, icon: 'place', label: '点位', hint: '单击地图完成落点。', shortcut: '1' },
  { id: 'label', drawType: MouseToolDrawType.MARKER, icon: 'title', label: '标签', hint: '单击地图放置文字标签。', shortcut: '2' },
  { id: 'polyline', drawType: MouseToolDrawType.POLYLINE, icon: 'timeline', label: '线段', hint: '逐点绘制路径，双击结束。', shortcut: '3' },
  { id: 'polygon', drawType: MouseToolDrawType.POLYGON, icon: 'hexagon', label: '面域', hint: '逐点围合区域，双击结束。', shortcut: '4' },
  { id: 'rectangle', drawType: MouseToolDrawType.RECTANGLE, icon: 'crop_5_4', label: '矩形', hint: '拖出矩形工作区。', shortcut: '5' },
  { id: 'circle', drawType: MouseToolDrawType.CIRCLE, icon: 'circle', label: '圆域', hint: '拖出圆形范围。', shortcut: '6' },
];

const DRAW_TOOL_BY_ID = DRAW_TOOLS.reduce<Record<MapDrawToolId, DrawToolDefinition>>((acc, item) => {
  acc[item.id] = item;
  return acc;
}, {} as Record<MapDrawToolId, DrawToolDefinition>);

// Configure AMap security before loading
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>)._AMapSecurityConfig = {
    securityJsCode: AMAP_SECURITY_CODE,
  };
}

function wgs84ToGcj02(wgs84: [number, number]): [number, number] {
  const result = gcoord.transform([wgs84[1], wgs84[0]], gcoord.WGS84, gcoord.GCJ02);
  return [result[0], result[1]];
}

function gcj02ToWgs84(gcj02: [number, number]): [number, number] {
  const result = gcoord.transform([gcj02[0], gcj02[1]], gcoord.GCJ02, gcoord.WGS84);
  return [result[1], result[0]];
}

function gcjCoordToWgs84(gcj02: [number, number]): [number, number] {
  return gcoord.transform(gcj02, gcoord.GCJ02, gcoord.WGS84) as [number, number];
}

function getLngLatCoord(input: unknown): [number, number] | null {
  if (!input) return null;
  if (Array.isArray(input) && input.length >= 2) {
    const lng = Number(input[0]);
    const lat = Number(input[1]);
    return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
  }

  const value = input as { lng?: number; lat?: number; getLng?: () => number; getLat?: () => number };
  const lng = typeof value.getLng === 'function' ? value.getLng() : value.lng;
  const lat = typeof value.getLat === 'function' ? value.getLat() : value.lat;
  return Number.isFinite(lng) && Number.isFinite(lat) ? [Number(lng), Number(lat)] : null;
}

function normalizePath(pathValue: unknown): [number, number][][] {
  if (!Array.isArray(pathValue) || pathValue.length === 0) return [];

  const directPath = pathValue
    .map((item) => getLngLatCoord(item))
    .filter((item): item is [number, number] => Boolean(item));
  if (directPath.length === pathValue.length) {
    return [directPath];
  }

  return pathValue
    .map((part) => {
      if (!Array.isArray(part)) return [];
      return part
        .map((item) => getLngLatCoord(item))
        .filter((item): item is [number, number] => Boolean(item));
    })
    .filter((ring) => ring.length > 0);
}

function closeRing(coords: [number, number][]): [number, number][] {
  if (!coords.length) return coords;
  const [firstLng, firstLat] = coords[0];
  const [lastLng, lastLat] = coords[coords.length - 1];
  if (firstLng === lastLng && firstLat === lastLat) return coords;
  return [...coords, coords[0]];
}

// Calculate polygon center (simple average)
function getPolygonCenter(coords: number[][]): [number, number] {
  let sumLng = 0, sumLat = 0;
  for (const c of coords) {
    sumLng += c[0];
    sumLat += c[1];
  }
  return [sumLng / coords.length, sumLat / coords.length];
}

// Calculate line midpoint
function getLineCenter(coords: number[][]): [number, number] {
  if (coords.length === 0) return [0, 0];
  const mid = Math.floor(coords.length / 2);
  return [coords[mid][0], coords[mid][1]];
}

type AMapInstance = {
  getCenter: () => { lng: number; lat: number };
  getZoom: () => number;
  getPitch: () => number;
  getRotation: () => number;
  setZoomAndCenter: (zoom: number, center: [number, number], immediately?: boolean, duration?: number) => void;
  setRotation: (rotation: number, immediately?: boolean, duration?: number) => void;
  setPitch: (pitch: number, immediately?: boolean, duration?: number) => void;
  setMapStyle: (style: string) => void;
  setFeatures: (features: string[]) => void;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  off: (event: string, cb: (...args: unknown[]) => void) => void;
};

type AMapOverlayLike = {
  setMap?: (map: AMap.Map | null) => void;
  getPosition?: () => unknown;
  getPath?: () => unknown;
  getCenter?: () => unknown;
  getRadius?: () => number;
  getBounds?: () => {
    getSouthWest?: () => unknown;
    getNorthEast?: () => unknown;
  };
};

type MouseToolDrawEvent = Parameters<AMap.MouseToolEvents['onDraw']>[0] & {
  target?: AMapOverlayLike;
};

function rectangleRingFromBounds(bounds: ReturnType<NonNullable<AMapOverlayLike['getBounds']>> | undefined): [number, number][] {
  const southWest = getLngLatCoord(bounds?.getSouthWest?.());
  const northEast = getLngLatCoord(bounds?.getNorthEast?.());
  if (!southWest || !northEast) return [];

  const [west, south] = southWest;
  const [east, north] = northEast;
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];
}

function buildGeometryFromOverlay(toolId: MapDrawToolId, overlay: AMapOverlayLike | null): { geometry: GeoJSON.Geometry; radius?: number } | null {
  if (!overlay) return null;

  if (toolId === 'marker' || toolId === 'label') {
    const gcjCoord = getLngLatCoord(overlay.getPosition?.());
    if (!gcjCoord) return null;
    return {
      geometry: {
        type: 'Point',
        coordinates: gcjCoordToWgs84(gcjCoord),
      },
    };
  }

  if (toolId === 'polyline') {
    const path = normalizePath(overlay.getPath?.());
    if (!path[0]?.length) return null;
    return {
      geometry: {
        type: 'LineString',
        coordinates: path[0].map((coord) => gcjCoordToWgs84(coord)),
      },
    };
  }

  if (toolId === 'polygon') {
    const path = normalizePath(overlay.getPath?.());
    if (!path[0]?.length) return null;
    return {
      geometry: {
        type: 'Polygon',
        coordinates: [closeRing(path[0].map((coord) => gcjCoordToWgs84(coord)))],
      },
    };
  }

  if (toolId === 'rectangle') {
    const boundsRing = rectangleRingFromBounds(overlay.getBounds?.());
    const sourceRing = boundsRing.length ? boundsRing : normalizePath(overlay.getPath?.())[0];
    if (!sourceRing?.length) return null;
    return {
      geometry: {
        type: 'Polygon',
        coordinates: [closeRing(sourceRing.map((coord) => gcjCoordToWgs84(coord)))],
      },
    };
  }

  if (toolId === 'circle') {
    const gcjCenter = getLngLatCoord(overlay.getCenter?.());
    const radius = overlay.getRadius?.();
    if (!gcjCenter || !radius) return null;
    return {
      geometry: {
        type: 'Point',
        coordinates: gcjCoordToWgs84(gcjCenter),
      },
      radius,
    };
  }

  return null;
}

function detachOverlay(overlay: AMapOverlayLike | null) {
  try {
    overlay?.setMap?.(null);
  } catch {
    // Ignore cleanup failures from temporary draw overlays.
  }
}

// Stable feature key counter
let featureKeyCounter = 0;
const getStableFeatureKey = (id?: string): string => {
  return id || `amap_feature_${++featureKeyCounter}`;
};

function resolveFeatureId(feature: GeoJSON.Feature): string | null {
  const props = (feature.properties || {}) as Record<string, unknown>;
  return typeof props.id === 'string'
    ? props.id
    : typeof props.featureId === 'string'
      ? props.featureId
      : typeof feature.id === 'string'
        ? feature.id
        : null;
}

function findFeatureNode(nodes: MapTreeNode[], targetId: string | null): MapTreeNode | null {
  if (!targetId) return null;
  for (const node of nodes) {
    if (node.id === targetId && node.type === 'feature') return node;
    if (node.children?.length) {
      const match = findFeatureNode(node.children, targetId);
      if (match) return match;
    }
  }
  return null;
}

function isCircleFeature(props: Record<string, unknown>): boolean {
  return props.featureType === 'circle' || typeof props.radius === 'number' || typeof props._radius === 'number';
}

export default function AMap3DView({ onBrowseStateChange, browseSyncToken, browseSyncSource }: AMap3DViewProps) {
  const mapRef = useRef<AMapInstance | null>(null);
  const initializedRef = useRef(false);
  const applyingExternalSyncRef = useRef(false);
  const lastAppliedTokenRef = useRef(-1);

  const browseState = useMapStore((s) => s.browseState);
  const tileStyle = useMapStore((s) => s.tileStyle);
  const drawnFeatures = useMapStore((s) => s.drawnFeatures);
  const buildingStyle = useMapStore((s) => s.buildingStyle);
  const treeNodes = useMapStore((s) => s.treeNodes);
  const flyToFeatureId = useMapStore((s) => s.flyToFeatureId);
  const flyToToken = useMapStore((s) => s.flyToToken);
  const clearFlyToFeature = useMapStore((s) => s.clearFlyToFeature);
  const editingMode = useMapStore((s) => s.editingMode);
  const activeDrawTool = useMapStore((s) => s.activeDrawTool);
  const selectedNodeId = useMapStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useMapStore((s) => s.setSelectedNodeId);
  const setPropsPanelNodeId = useMapStore((s) => s.setPropsPanelNodeId);
  const setEditingMode = useMapStore((s) => s.setEditingMode);
  const setActiveDrawTool = useMapStore((s) => s.setActiveDrawTool);
  const measurementMode = useMapStore((s) => s.measurementMode);
  const setMeasurementMode = useMapStore((s) => s.setMeasurementMode);
  const continuousDrawing = useMapStore((s) => s.continuousDrawing);
  const setContinuousDrawing = useMapStore((s) => s.setContinuousDrawing);
  const dirtyFeatureIds = useMapStore((s) => s.dirtyFeatureIds);
  const recordHistory = useMapStore((s) => s.recordHistory);
  const addFeature = useMapStore((s) => s.addFeature);
  const showBuildings = buildingStyle === 'amap';

  // Current pitch angle (for occlusion opacity)
  const [currentPitch, setCurrentPitch] = useState(clampPitchDeg(browseState.pitchDeg));
  const activeDrawConfig = activeDrawTool ? DRAW_TOOL_BY_ID[activeDrawTool] : null;
  const selectedFeatureNode = useMemo(() => findFeatureNode(treeNodes, selectedNodeId), [treeNodes, selectedNodeId]);
  const initialBrowseState = useRef(browseState).current;

  // Calculate occlusion opacity based on pitch
  const occlusionOpacity = useMemo(() => {
    if (currentPitch <= 20) return 1;
    return Math.max(0.25, 1 - (currentPitch - 20) / 70 * 0.75);
  }, [currentPitch]);

  // Initial values
  const initialGcjCenter = wgs84ToGcj02(initialBrowseState.centerWgs84);
  const initialZoom = clampZoomForMode('3D', initialBrowseState.zoom);
  const initialHeading = normalizeHeadingDeg(initialBrowseState.headingDeg);
  const initialPitch = clampPitchDeg(initialBrowseState.pitchDeg);

  const handleSelectFeature = useCallback((featureId: string | null) => {
    if (!featureId) return;
    setSelectedNodeId(featureId);
    setPropsPanelNodeId(featureId);
    setEditingMode('select');
  }, [setEditingMode, setPropsPanelNodeId, setSelectedNodeId]);

  const stopDrawing = useCallback(() => {
    setActiveDrawTool(null);
    setMeasurementMode(null);
    setEditingMode(selectedNodeId ? 'select' : 'browse');
  }, [selectedNodeId, setActiveDrawTool, setEditingMode, setMeasurementMode]);

  const restartDrawTool = useCallback((toolId: MapDrawToolId) => {
    setActiveDrawTool(null);
    window.setTimeout(() => {
      useMapStore.getState().setActiveDrawTool(toolId);
    }, 0);
  }, [setActiveDrawTool]);

  const handleDrawComplete = useCallback((event: MouseToolDrawEvent) => {
    if (!activeDrawTool) return;

    const overlay = event.obj || event.target || null;
    const result = buildGeometryFromOverlay(activeDrawTool, overlay);
    detachOverlay(overlay);
    if (!result) return;

    recordHistory();

    const featureType = activeDrawTool === 'label' ? 'marker' : activeDrawTool;
    const featureName = activeDrawTool === 'label' ? '新标签' : `新${DRAW_TOOL_BY_ID[activeDrawTool].label}`;
    const id = addFeature(
      {
        type: 'Feature',
        geometry: result.geometry,
        properties: {},
      },
      {
        name: featureName,
        featureType,
        objectType: 'generic',
        placementMode: 'follow-terrain',
        color: '#3388ff',
        strokeColor: '#3388ff',
        strokeWeight: 3,
        strokeOpacity: 1,
        fillColor: '#3388ff',
        fillOpacity: activeDrawTool === 'polyline' || activeDrawTool === 'marker' || activeDrawTool === 'label' ? 0 : 0.2,
        icon: activeDrawTool === 'label' ? '🏷️' : activeDrawTool === 'marker' ? '📍' : undefined,
        labelMode: activeDrawTool === 'label' ? 'name' : undefined,
        radius: result.radius,
        geometry: result.geometry,
        syncStatus: 'local',
      },
    );

    setSelectedNodeId(id);
    setPropsPanelNodeId(id);

    if (continuousDrawing) {
      restartDrawTool(activeDrawTool);
      return;
    }

    setActiveDrawTool(null);
    setEditingMode('select');
  }, [
    activeDrawTool,
    addFeature,
    continuousDrawing,
    recordHistory,
    restartDrawTool,
    setActiveDrawTool,
    setEditingMode,
    setPropsPanelNodeId,
    setSelectedNodeId,
  ]);

  const startDrawTool = useCallback((toolId: MapDrawToolId) => {
    if (activeDrawTool === toolId) {
      stopDrawing();
      return;
    }
    setMeasurementMode(null);
    setActiveDrawTool(toolId);
  }, [activeDrawTool, setActiveDrawTool, setMeasurementMode, stopDrawing]);

  useEffect(() => {
    if (measurementMode) {
      setMeasurementMode(null);
    }
  }, [measurementMode, setMeasurementMode]);

  // Handle map events and sync back to store
  const handleMapMoveEnd = useCallback(() => {
    const map = mapRef.current;
    if (!map || !initializedRef.current || applyingExternalSyncRef.current) return;

    const center = map.getCenter();
    const zoom = clampZoomForMode('3D', map.getZoom());
    const pitch = clampPitchDeg(map.getPitch());
    const heading = normalizeHeadingDeg(map.getRotation());

    const wgs84 = gcj02ToWgs84([center.lng, center.lat]);

    setCurrentPitch(pitch);
    onBrowseStateChange?.({
      centerWgs84: wgs84,
      zoom,
      headingDeg: heading,
      pitchDeg: pitch,
    });
  }, [onBrowseStateChange]);

  // Sync from other views
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !browseSyncToken || browseSyncSource === 'amap3d' || browseSyncToken === lastAppliedTokenRef.current) return;

    lastAppliedTokenRef.current = browseSyncToken;
    applyingExternalSyncRef.current = true;

    const gcj = wgs84ToGcj02(browseState.centerWgs84);
    const zoom = clampZoomForMode('3D', browseState.zoom);
    const heading = normalizeHeadingDeg(browseState.headingDeg);
    const pitch = clampPitchDeg(browseState.pitchDeg);

    map.setZoomAndCenter(zoom, gcj, false, 500);
    map.setRotation(heading, false, 500);
    map.setPitch(pitch, false, 500);
    setCurrentPitch(pitch);

    setTimeout(() => {
      applyingExternalSyncRef.current = false;
    }, 600);
  }, [browseSyncSource, browseSyncToken, browseState]);

  // 响应飞行定位信号
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyToFeatureId || !flyToToken) return;
    const node = treeNodes.find((item) => item.id === flyToFeatureId);
    if (!node?.geometry) {
      clearFlyToFeature();
      return;
    }

    const geom = node.geometry;
    let center: [number, number] | null = null;
    let zoom = 17;

    if (geom.type === 'Polygon') {
      const coords = (geom as GeoJSON.Polygon).coordinates[0];
      const wgsCenter = getPolygonCenter(coords);
      center = wgs84ToGcj02([wgsCenter[1], wgsCenter[0]]);
      // 根据多边形大小计算缩放级别
      let minLng = Infinity;
      let maxLng = -Infinity;
      let minLat = Infinity;
      let maxLat = -Infinity;
      coords.forEach((coord) => {
        minLng = Math.min(minLng, coord[0]);
        maxLng = Math.max(maxLng, coord[0]);
        minLat = Math.min(minLat, coord[1]);
        maxLat = Math.max(maxLat, coord[1]);
      });
      const spanDeg = Math.max(maxLng - minLng, maxLat - minLat);
      zoom = spanDeg > 0.1 ? 12 : spanDeg > 0.01 ? 15 : spanDeg > 0.001 ? 17 : 18;
    } else if (geom.type === 'LineString') {
      const coords = (geom as GeoJSON.LineString).coordinates;
      const wgsCenter = getLineCenter(coords);
      center = wgs84ToGcj02([wgsCenter[1], wgsCenter[0]]);
      let minLng = Infinity;
      let maxLng = -Infinity;
      let minLat = Infinity;
      let maxLat = -Infinity;
      coords.forEach((coord) => {
        minLng = Math.min(minLng, coord[0]);
        maxLng = Math.max(maxLng, coord[0]);
        minLat = Math.min(minLat, coord[1]);
        maxLat = Math.max(maxLat, coord[1]);
      });
      const spanDeg = Math.max(maxLng - minLng, maxLat - minLat);
      zoom = spanDeg > 0.1 ? 12 : spanDeg > 0.01 ? 15 : spanDeg > 0.001 ? 17 : 18;
    } else if (geom.type === 'Point') {
      const c = (geom as GeoJSON.Point).coordinates;
      center = wgs84ToGcj02([c[1], c[0]]);
      zoom = 17;
    }

    if (center) {
      map.setZoomAndCenter(zoom, center, false, 800);
    }
    clearFlyToFeature();
  }, [clearFlyToFeature, flyToFeatureId, flyToToken, treeNodes]);

  // Cleanup
  useEffect(() => {
    return () => {
      const map = mapRef.current;
      if (map) {
        map.off('moveend', handleMapMoveEnd);
        map.off('zoomend', handleMapMoveEnd);
        map.off('rotateend', handleMapMoveEnd);
        map.off('pitchend', handleMapMoveEnd);
      }
    };
  }, [handleMapMoveEnd]);

  // Determine map style based on tileStyle
  const mapStyle = useMemo(() => {
    switch (tileStyle) {
      case 'satellite':
      case 'gaode_satellite':
        return 'amap://styles/satellite';
      case 'gaode_road':
        return 'amap://styles/normal';
      default:
        return 'amap://styles/normal';
    }
  }, [tileStyle]);

  // 命令式更新地图样式（@uiw/react-amap 的 Map 不会在 mapStyle prop 更新时重新渲染）
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !initializedRef.current) return;
    try {
      map.setMapStyle(mapStyle);
      console.log(`[AMap3DView] Style switched to: ${mapStyle}`);
    } catch (err) {
      console.warn('[AMap3DView] Failed to switch style:', err);
    }
  }, [mapStyle]);

  // 命令式切换建筑物白模（@uiw/react-amap 的 showBuildingBlock 不响应运行时更新）
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !initializedRef.current) return;
    try {
      const features = showBuildings
        ? ['bg', 'road', 'building', 'point']
        : ['bg', 'road', 'point'];
      map.setFeatures(features);
      console.log(`[AMap3DView] Buildings ${showBuildings ? 'ON' : 'OFF'}`);
    } catch (err) {
      console.warn('[AMap3DView] Failed to toggle buildings:', err);
    }
  }, [showBuildings]);

  // Label style helper
  const labelStyle = (borderColor: string, isSelected = false): React.CSSProperties => ({
    background: isSelected ? 'rgba(127, 29, 29, 0.8)' : 'rgba(0, 0, 0, 0.6)',
    color: '#fff',
    padding: '3px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    border: '2px solid ' + borderColor,
    backdropFilter: 'blur(4px)',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none' as const,
    opacity: occlusionOpacity,
    transition: 'opacity 0.3s ease',
  });

  if (!AMAP_KEY) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        background: '#1a1a2e',
        color: '#fff'
      }}>
        <div style={{ textAlign: 'center' }}>
          <p>高德地图未配置</p>
          <p style={{ fontSize: '12px', opacity: 0.6 }}>请在 .env.local 中设置 VITE_AMAP_KEY</p>
        </div>
      </div>
    );
  }

  if (!AMAP_SECURITY_CODE) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        background: '#1a1a2e',
        color: '#fff'
      }}>
        <div style={{ textAlign: 'center' }}>
          <p>⚠️ 高德地图安全密钥未配置</p>
          <p style={{ fontSize: '12px', opacity: 0.6 }}>请在 .env.local 中设置 VITE_AMAP_SECURITY_CODE</p>
          <p style={{ fontSize: '11px', opacity: 0.4, marginTop: '8px' }}>高德 JS API 2.0 需要安全密钥才能加载</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <APILoader akey={AMAP_KEY} version="2.0" plugins={['AMap.MouseTool']}>
        <Map
          style={{ width: '100%', height: '100%' }}
          center={initialGcjCenter}
          zoom={initialZoom}
          rotation={initialHeading}
          pitch={initialPitch}
          viewMode="3D"
          zooms={[2, 20]}
          features={showBuildings ? ['bg', 'road', 'building', 'point'] : ['bg', 'road', 'point']}
          mapStyle={mapStyle}
          showLabel
          onComplete={(event: unknown) => {
            const maybeTarget = (event as { target?: unknown })?.target;
            const map = maybeTarget as AMapInstance;
            if (!map || typeof map.getPitch !== 'function') return;
            mapRef.current = map;
            initializedRef.current = true;
            map.setPitch(initialPitch, true, 0);
            setCurrentPitch(initialPitch);
            map.on('moveend', handleMapMoveEnd);
            map.on('zoomend', handleMapMoveEnd);
            map.on('rotateend', handleMapMoveEnd);
            map.on('pitchend', handleMapMoveEnd);
            lastAppliedTokenRef.current = browseSyncToken || 0;
          }}
        >
          <MouseTool
            active={Boolean(activeDrawTool)}
            type={activeDrawTool ? DRAW_TOOL_BY_ID[activeDrawTool].drawType : MouseToolDrawType.MARKER}
            ifClear
            drawElementOptions={{
              strokeColor: '#ef4444',
              strokeOpacity: 1,
              strokeWeight: 3,
              fillColor: '#f87171',
              fillOpacity: 0.18,
            }}
            onDraw={handleDrawComplete}
          />

          <div className="map-view-2d__overlay map-view-2d__overlay--top-left">
            <section className="map-view-2d__panel map-view-2d__panel--ovi-toolbar" aria-label="3D 测绘工具">
              <div className="map-view-2d__toolbar-head">
                <div>
                  <div className="map-view-2d__eyebrow">3D Survey Tools</div>
                  <strong>三维测绘</strong>
                </div>
                <span className={`map-view-2d__sync-pill${dirtyFeatureIds.length ? ' is-dirty' : ''}`}>
                  {dirtyFeatureIds.length ? `${dirtyFeatureIds.length} 未保存` : '已同步'}
                </span>
              </div>

              <div className="map-view-2d__toolbar-group">
                <button type="button" className={`map-view-2d__tool-chip${editingMode === 'select' || editingMode === 'browse' ? ' is-active' : ''}`} onClick={() => { stopDrawing(); setEditingMode('select'); }}>
                  <span className="material-symbols-outlined">near_me</span>
                  选择
                </button>
                <button type="button" className={`map-view-2d__tool-chip${continuousDrawing ? ' is-active' : ''}`} onClick={() => setContinuousDrawing(!continuousDrawing)}>
                  <span className="material-symbols-outlined">all_inclusive</span>
                  连续
                </button>
                <button type="button" className="map-view-2d__tool-chip" onClick={stopDrawing} disabled={!activeDrawTool}>
                  <span className="material-symbols-outlined">close</span>
                  退出
                </button>
              </div>

              <div className="map-view-2d__toolbar-group">
                {DRAW_TOOLS.map((tool) => {
                  const isActive = activeDrawTool === tool.id;
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      className={`map-view-2d__tool-chip${isActive ? ' is-active' : ''}`}
                      onClick={() => startDrawTool(tool.id)}
                      title={`${tool.label} (${tool.shortcut})`}
                    >
                      <span className="material-symbols-outlined">{tool.icon}</span>
                      {tool.label}
                      <span className="map-view-2d__keycap">{tool.shortcut}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="map-view-2d__overlay map-view-2d__overlay--bottom-left">
            <section className="map-view-2d__panel map-view-2d__panel--draw-context">
              <div className="map-view-2d__context-head">
                <div className="map-view-2d__eyebrow">绘制状态</div>
                <span className="map-view-2d__badge">{drawnFeatures.length}</span>
              </div>

              <div className={`map-view-2d__status map-view-2d__status--compact${activeDrawTool ? ' is-active' : ''}`}>
                <span className="material-symbols-outlined">
                  {activeDrawConfig ? activeDrawConfig.icon : editingMode === 'select' ? 'near_me' : 'travel_explore'}
                </span>
                <div className="map-view-2d__status-copy">
                  <strong>{activeDrawConfig ? activeDrawConfig.label : editingMode === 'select' ? '选择模式' : '浏览模式'}</strong>
                  <span>{activeDrawConfig ? activeDrawConfig.hint : '选择工具后即可在 3D 模式下直接落图。'}</span>
                </div>
              </div>

              <div className={`map-view-2d__selection-card map-view-2d__selection-card--compact${selectedFeatureNode ? ' is-selected' : ''}`}>
                {selectedFeatureNode ? (
                  <>
                    <div className="map-view-2d__selection-head">
                      <strong>{selectedFeatureNode.name || '未命名图形'}</strong>
                      <span className="map-view-2d__selection-tag">已选中</span>
                    </div>
                    <p>{(selectedFeatureNode.featureType || 'polygon').toUpperCase()} · 3D 模式可编辑属性与导出</p>
                  </>
                ) : (
                  <>
                    <div className="map-view-2d__selection-head">
                      <strong>尚未选中图形</strong>
                    </div>
                    <p>点击已有图形，或使用左上工具直接在 3D 视图中绘制。</p>
                  </>
                )}
              </div>
            </section>
          </div>

          {/* Pitch angle indicator */}
          {currentPitch > 20 && (
            <div style={{
              position: 'absolute',
              top: 8,
              right: 8,
              zIndex: 999,
              background: 'rgba(0,0,0,0.6)',
              color: '#fff',
              padding: '4px 10px',
              borderRadius: '12px',
              fontSize: '11px',
              fontWeight: 600,
              backdropFilter: 'blur(6px)',
              border: '1px solid rgba(255,255,255,0.15)',
              pointerEvents: 'none',
            }}>
              透明度补偿 {Math.round((1 - occlusionOpacity) * 100)}%
            </div>
          )}

          {/* Render GeoJSON features */}
          {drawnFeatures.map((feature) => {
            const props = (feature.properties || {}) as Record<string, unknown>;
            const geometry = feature.geometry;
            if (!geometry) return null;

            const featureId = resolveFeatureId(feature);
            const featureKey = getStableFeatureKey(featureId || undefined);
            const isSelected = Boolean(featureId && featureId === selectedNodeId);

            if (geometry.type === 'Polygon') {
              const coordinates = (geometry as GeoJSON.Polygon).coordinates;
              const gcjPath = coordinates[0].map((coord) => gcoord.transform(coord as [number, number], gcoord.WGS84, gcoord.GCJ02) as [number, number]);
              const labelText = String(props.name || '');
              const centerWgs = getPolygonCenter(coordinates[0]);
              const centerGcj = gcoord.transform(centerWgs, gcoord.WGS84, gcoord.GCJ02) as [number, number];
              const borderColor = isSelected ? '#ef4444' : String(props.strokeColor || props.color || '#3388ff');
              const fillOpacity = ((props.fillOpacity as number | undefined) ?? 0.2) + (isSelected ? 0.08 : 0);

              return (
                <React.Fragment key={featureKey}>
                  <Polygon
                    path={gcjPath}
                    fillColor={String(props.fillColor || props.color || '#3388ff')}
                    fillOpacity={fillOpacity * occlusionOpacity}
                    strokeColor={borderColor}
                    strokeOpacity={
                      ((props.strokeOpacity as number | undefined) ?? 1) * occlusionOpacity
                    }
                    strokeWeight={
                      ((props.strokeWeight as number | undefined) ?? 3) + (isSelected ? 1 : 0)
                    }
                    onClick={() => handleSelectFeature(featureId)}
                  />
                  {labelText && (
                    <Marker position={centerGcj} onClick={() => handleSelectFeature(featureId)}>
                      <div style={labelStyle(borderColor, isSelected)}>
                        {props.icon ? `${String(props.icon)} ` : ''}{labelText}
                      </div>
                    </Marker>
                  )}
                </React.Fragment>
              );
            }

            if (geometry.type === 'LineString') {
              const coordinates = (geometry as GeoJSON.LineString).coordinates;
              const gcjPath = coordinates.map((coord) => gcoord.transform(coord as [number, number], gcoord.WGS84, gcoord.GCJ02) as [number, number]);
              const labelText = String(props.name || '');
              const centerWgs = getLineCenter(coordinates);
              const centerGcj = gcoord.transform(centerWgs, gcoord.WGS84, gcoord.GCJ02) as [number, number];
              const borderColor = isSelected ? '#ef4444' : String(props.strokeColor || props.color || '#3388ff');

              return (
                <React.Fragment key={featureKey}>
                  <Polyline
                    path={gcjPath}
                    strokeColor={borderColor}
                    strokeOpacity={
                      ((props.strokeOpacity as number | undefined) ?? 1) * occlusionOpacity
                    }
                    strokeWeight={
                      ((props.strokeWeight as number | undefined) ?? 3) + (isSelected ? 1 : 0)
                    }
                    onClick={() => handleSelectFeature(featureId)}
                  />
                  {labelText && (
                    <Marker position={centerGcj} onClick={() => handleSelectFeature(featureId)}>
                      <div style={labelStyle(borderColor, isSelected)}>
                        {labelText}
                      </div>
                    </Marker>
                  )}
                </React.Fragment>
              );
            }

            if (geometry.type === 'Point' && !isCircleFeature(props)) {
              const coordinates = (geometry as GeoJSON.Point).coordinates;
              const gcjCoord = gcoord.transform(coordinates as [number, number], gcoord.WGS84, gcoord.GCJ02) as [number, number];
              const icon = String(props.icon || '📍');
              const label = String(props.name || '');

              return (
                <Marker key={featureKey} position={gcjCoord} onClick={() => handleSelectFeature(featureId)}>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    transform: 'translate(-50%, -100%)',
                    marginTop: '-6px',
                    pointerEvents: 'none',
                    opacity: occlusionOpacity,
                    transition: 'opacity 0.3s ease',
                  }}>
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50% 50% 50% 0',
                      background: isSelected ? 'rgba(190, 24, 93, 0.88)' : 'rgba(0, 0, 0, 0.75)',
                      border: '2px solid rgba(255,255,255,0.7)',
                      boxShadow: isSelected ? '0 4px 14px rgba(190,24,93,0.55)' : '0 3px 10px rgba(0,0,0,0.5)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transform: 'rotate(-45deg)',
                    }}>
                      <span style={{
                        transform: 'rotate(45deg)',
                        fontSize: 18,
                        lineHeight: 1,
                      }}>{icon}</span>
                    </div>
                    {label && (
                      <div style={{
                        background: isSelected ? 'rgba(127, 29, 29, 0.82)' : 'rgba(0,0,0,0.65)',
                        color: '#fff',
                        padding: '2px 6px',
                        borderRadius: '3px',
                        fontSize: '10px',
                        fontWeight: 600,
                        marginTop: '4px',
                        whiteSpace: 'nowrap',
                        border: '1px solid rgba(255,255,255,0.2)',
                      }}>
                        {label}
                      </div>
                    )}
                  </div>
                </Marker>
              );
            }

            return null;
          })}

          {/* Render circles */}
          {drawnFeatures.map((feature) => {
            const props = (feature.properties || {}) as Record<string, unknown>;
            const geometry = feature.geometry;
            const radius = typeof props.radius === 'number' ? props.radius : typeof props._radius === 'number' ? props._radius : null;
            if (!geometry || geometry.type !== 'Point' || !radius) return null;

            const featureId = resolveFeatureId(feature);
            const featureKey = getStableFeatureKey(featureId || undefined);
            const isSelected = Boolean(featureId && featureId === selectedNodeId);
            const coordinates = (geometry as GeoJSON.Point).coordinates;
            const gcjCoord = gcoord.transform(coordinates as [number, number], gcoord.WGS84, gcoord.GCJ02) as [number, number];
            const borderColor = isSelected ? '#ef4444' : String(props.strokeColor || props.color || '#3388ff');
            const labelText = String(props.name || '');

            const circlePoints: [number, number][] = [];
            const segments = 64;
            for (let i = 0; i <= segments; i++) {
              const angle = (i * 360) / segments;
              const dx = radius * Math.cos(angle * Math.PI / 180);
              const dy = radius * Math.sin(angle * Math.PI / 180);
              const lat = gcjCoord[1] + dy / 111320;
              const lng = gcjCoord[0] + dx / (111320 * Math.cos(gcjCoord[1] * Math.PI / 180));
              circlePoints.push([lng, lat]);
            }

            return (
              <React.Fragment key={featureKey}>
                <Polygon
                  path={circlePoints}
                  fillColor={String(props.fillColor || props.color || '#3388ff')}
                  fillOpacity={
                    ((props.fillOpacity as number | undefined) ?? 0.2) * occlusionOpacity +
                    (isSelected ? 0.08 * occlusionOpacity : 0)
                  }
                  strokeColor={borderColor}
                  strokeOpacity={
                    ((props.strokeOpacity as number | undefined) ?? 1) * occlusionOpacity
                  }
                  strokeWeight={
                    ((props.strokeWeight as number | undefined) ?? 3) + (isSelected ? 1 : 0)
                  }
                  onClick={() => handleSelectFeature(featureId)}
                />
                {labelText && (
                  <Marker position={gcjCoord} onClick={() => handleSelectFeature(featureId)}>
                    <div style={labelStyle(borderColor, isSelected)}>
                      {labelText}
                    </div>
                  </Marker>
                )}
              </React.Fragment>
            );
          })}
        </Map>
      </APILoader>
    </div>
  );
}
