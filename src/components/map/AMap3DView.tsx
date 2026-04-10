import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { APILoader, Map, Polygon, Polyline, Marker } from '@uiw/react-amap';
import gcoord from 'gcoord';
import { useMapStore } from '../../stores/mapStore';
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

const AMAP_KEY = import.meta.env.VITE_AMAP_KEY || '';
const AMAP_SECURITY_CODE = import.meta.env.VITE_AMAP_SECURITY_CODE || '';

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
  on: (event: string, cb: () => void) => void;
  off: (event: string, cb: () => void) => void;
};

// Stable feature key counter
let featureKeyCounter = 0;
const getStableFeatureKey = (id?: string): string => {
  return id || `amap_feature_${++featureKeyCounter}`;
};

export default function AMap3DView({ onBrowseStateChange, browseSyncToken, browseSyncSource }: AMap3DViewProps) {
  const mapRef = useRef<AMapInstance | null>(null);
  const initializedRef = useRef(false);
  const applyingExternalSyncRef = useRef(false);
  const lastAppliedTokenRef = useRef(-1);

  const { browseState, tileStyle, drawnFeatures, buildingStyle, treeNodes, flyToFeatureId, flyToToken, clearFlyToFeature } = useMapStore();
  const showBuildings = buildingStyle === 'amap';

  // Current pitch angle (for occlusion opacity)
  const [currentPitch, setCurrentPitch] = useState(clampPitchDeg(browseState.pitchDeg));

  // Calculate occlusion opacity based on pitch
  const occlusionOpacity = useMemo(() => {
    if (currentPitch <= 20) return 1;
    return Math.max(0.25, 1 - (currentPitch - 20) / 70 * 0.75);
  }, [currentPitch]);

  // Initial values
  const initialGcjCenter = useMemo(() => wgs84ToGcj02(browseState.centerWgs84), []);
  const initialZoom = useMemo(() => clampZoomForMode('3D', browseState.zoom), []);
  const initialHeading = useMemo(() => normalizeHeadingDeg(browseState.headingDeg), []);
  const initialPitch = useMemo(() => clampPitchDeg(browseState.pitchDeg), []);

  // Current GCJ center
  const gcjCenter = useMemo(() => wgs84ToGcj02(browseState.centerWgs84), [browseState.centerWgs84]);

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

  // Initialize map
  const handleMapCreated = useCallback((instance: AMapInstance) => {
    mapRef.current = instance;

    // Bind events
    instance.on('moveend', handleMapMoveEnd);
    instance.on('zoomend', handleMapMoveEnd);
    instance.on('rotateend', handleMapMoveEnd);
    instance.on('pitchend', handleMapMoveEnd);

    // Set initial pitch
    instance.setPitch(initialPitch, true, 0);
    setCurrentPitch(initialPitch);

    // Mark as initialized after a short delay
    setTimeout(() => {
      initializedRef.current = true;
    }, 100);
  }, [handleMapMoveEnd, initialPitch]);

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
    const node = treeNodes.find(n => n.id === flyToFeatureId);
    if (!node?.geometry) { clearFlyToFeature(); return; }

    const geom = node.geometry;
    let center: [number, number] | null = null;
    let zoom = 17;

    if (geom.type === 'Polygon') {
      const coords = (geom as GeoJSON.Polygon).coordinates[0];
      const wgsCenter = getPolygonCenter(coords);
      center = wgs84ToGcj02([wgsCenter[1], wgsCenter[0]]);
      // 根据多边形大小计算缩放级别
      let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
      coords.forEach(c => { minLng = Math.min(minLng, c[0]); maxLng = Math.max(maxLng, c[0]); minLat = Math.min(minLat, c[1]); maxLat = Math.max(maxLat, c[1]); });
      const spanDeg = Math.max(maxLng - minLng, maxLat - minLat);
      zoom = spanDeg > 0.1 ? 12 : spanDeg > 0.01 ? 15 : spanDeg > 0.001 ? 17 : 18;
    } else if (geom.type === 'LineString') {
      const coords = (geom as GeoJSON.LineString).coordinates;
      const wgsCenter = getLineCenter(coords);
      center = wgs84ToGcj02([wgsCenter[1], wgsCenter[0]]);
      let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
      coords.forEach(c => { minLng = Math.min(minLng, c[0]); maxLng = Math.max(maxLng, c[0]); minLat = Math.min(minLat, c[1]); maxLat = Math.max(maxLat, c[1]); });
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
  }, [flyToToken]);

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
  const labelStyle = (borderColor: string): React.CSSProperties => ({
    background: 'rgba(0, 0, 0, 0.6)',
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
      <APILoader akey={AMAP_KEY} version="2.0">
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
            if (map && typeof map.getPitch === 'function') {
              mapRef.current = map;
              initializedRef.current = true;
              map.setPitch(initialPitch, true, 0);
              setCurrentPitch(initialPitch);
              
              map.on('moveend', handleMapMoveEnd);
              map.on('zoomend', handleMapMoveEnd);
              map.on('rotateend', handleMapMoveEnd);
              map.on('pitchend', handleMapMoveEnd);
              
              lastAppliedTokenRef.current = browseSyncToken || 0;
            }
          }}
        >
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
            const props = feature.properties || {};
            const geometry = feature.geometry;
            if (!geometry) return null;

            const featureKey = getStableFeatureKey(props.id as string);

            if (geometry.type === 'Polygon') {
              const coordinates = (geometry as GeoJSON.Polygon).coordinates;
              const gcjPath = coordinates[0].map(coord => gcoord.transform(coord as [number, number], gcoord.WGS84, gcoord.GCJ02) as [number, number]);
              const labelText = props.name || '';
              const centerWgs = getPolygonCenter(coordinates[0]);
              const centerGcj = gcoord.transform(centerWgs, gcoord.WGS84, gcoord.GCJ02) as [number, number];
              const borderColor = props.strokeColor || props.color || '#3388ff';

              return (
                <React.Fragment key={featureKey}>
                  <Polygon
                    path={gcjPath}
                    style={{
                      fillColor: props.fillColor || props.color || '#3388ff',
                      fillOpacity: (props.fillOpacity ?? 0.2) * occlusionOpacity,
                      strokeColor: borderColor,
                      strokeOpacity: (props.strokeOpacity ?? 1) * occlusionOpacity,
                      strokeWeight: props.strokeWeight ?? 3,
                    }}
                  />
                  {labelText && (
                    <Marker position={centerGcj}>
                      <div style={labelStyle(borderColor)}>
                        {props.icon ? (props.icon + ' ') : ''}{labelText}
                      </div>
                    </Marker>
                  )}
                </React.Fragment>
              );
            }

            if (geometry.type === 'LineString') {
              const coordinates = (geometry as GeoJSON.LineString).coordinates;
              const gcjPath = coordinates.map(coord => gcoord.transform(coord as [number, number], gcoord.WGS84, gcoord.GCJ02) as [number, number]);
              const labelText = props.name || '';
              const centerWgs = getLineCenter(coordinates);
              const centerGcj = gcoord.transform(centerWgs, gcoord.WGS84, gcoord.GCJ02) as [number, number];
              const borderColor = props.strokeColor || props.color || '#3388ff';

              return (
                <React.Fragment key={featureKey}>
                  <Polyline
                    path={gcjPath}
                    style={{
                      strokeColor: borderColor,
                      strokeOpacity: (props.strokeOpacity ?? 1) * occlusionOpacity,
                      strokeWeight: props.strokeWeight ?? 3,
                    }}
                  />
                  {labelText && (
                    <Marker position={centerGcj}>
                      <div style={labelStyle(borderColor)}>
                        {labelText}
                      </div>
                    </Marker>
                  )}
                </React.Fragment>
              );
            }

            if (geometry.type === 'Point') {
              const coordinates = (geometry as GeoJSON.Point).coordinates;
              const gcjCoord = gcoord.transform(coordinates as [number, number], gcoord.WGS84, gcoord.GCJ02) as [number, number];
              const icon = props.icon || '📍';
              const label = props.name || '';

              return (
                <Marker key={featureKey} position={gcjCoord}>
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
                      background: 'rgba(0, 0, 0, 0.75)',
                      border: '2px solid rgba(255,255,255,0.7)',
                      boxShadow: '0 3px 10px rgba(0,0,0,0.5)',
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
                        background: 'rgba(0,0,0,0.65)',
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
            const props = feature.properties || {};
            const geometry = feature.geometry;
            if (!geometry || geometry.type !== 'Point' || !props._radius) return null;

            const featureKey = getStableFeatureKey(props.id as string);
            const coordinates = (geometry as GeoJSON.Point).coordinates;
            const gcjCoord = gcoord.transform(coordinates as [number, number], gcoord.WGS84, gcoord.GCJ02) as [number, number];
            const radius = props._radius as number;
            const borderColor = props.strokeColor || props.color || '#3388ff';
            const labelText = props.name || '';

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
                  style={{
                    fillColor: props.fillColor || props.color || '#3388ff',
                    fillOpacity: (props.fillOpacity ?? 0.2) * occlusionOpacity,
                    strokeColor: borderColor,
                    strokeOpacity: (props.strokeOpacity ?? 1) * occlusionOpacity,
                    strokeWeight: props.strokeWeight ?? 3,
                  }}
                />
                {labelText && (
                  <Marker position={gcjCoord}>
                    <div style={labelStyle(borderColor)}>
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
