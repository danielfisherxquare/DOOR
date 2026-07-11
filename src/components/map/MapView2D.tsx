import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import { useMapStore, type MapDrawToolId, type MapMeasurementMode } from '../../stores/mapStore';
import {
  createTileLayer,
  replaceTileLayer,
  PRESET_TILE_SOURCES,
  LEGACY_ID_MAP,
  type TileSourceConfig,
} from '../../utils/map/tileLayer';
import type { MapBrowseState, MapBrowseSyncSource } from '../../utils/map/browseState';
import { SPATIAL_OBJECT_PRESETS, getSpatialObjectPreset } from '../../utils/map/spatialObjects';
import studioProjectApi from '../../services/studioProjectApi';
import { applyAssetTemplateToNode, inferTemplateObjectType, type StudioAssetTemplate } from '../../utils/map/assetTemplates';
import { measureGeometry } from '../../utils/map/measurements';
import { buildMapFeatureCollection, downloadGeoJSON, parseMapFeatureCollection } from '../../utils/map/geojsonExchange';
import { mapNodeToSpatialObjectPayload } from '../../utils/map/spatialObjects';
import { showError, showSuccess } from '../../utils/toast';

interface MapView2DProps {
  onBrowseStateChange?: (state: MapBrowseState) => void;
  browseSyncToken?: number;
  browseSyncSource?: MapBrowseSyncSource;
  projectId?: string | null;
  orgId?: string | null;
}

interface DrawToolDefinition {
  id: MapDrawToolId;
  shape: L.PM.SUPPORTED_SHAPES;
  icon: string;
  label: string;
  hint: string;
  shortcut: string;
}

const DRAW_TOOLS: DrawToolDefinition[] = [
  { id: 'marker', shape: 'Marker', icon: 'place', label: '点位', hint: '单击地图完成落点', shortcut: '1' },
  { id: 'label', shape: 'Marker', icon: 'title', label: '标签', hint: '单击地图放置文字标签', shortcut: '2' },
  { id: 'polyline', shape: 'Line', icon: 'timeline', label: '线段', hint: '逐点绘制路径，双击结束', shortcut: '3' },
  { id: 'polygon', shape: 'Polygon', icon: 'hexagon', label: '面域', hint: '逐点围合区域，双击结束', shortcut: '4' },
  { id: 'rectangle', shape: 'Rectangle', icon: 'crop_5_4', label: '矩形', hint: '点击起止点快速落框', shortcut: '5' },
  { id: 'circle', shape: 'Circle', icon: 'circle', label: '圆域', hint: '点击中心后拖出半径', shortcut: '6' },
];

const DRAW_TOOL_BY_ID = DRAW_TOOLS.reduce<Record<MapDrawToolId, DrawToolDefinition>>((acc, item) => {
  acc[item.id] = item;
  return acc;
}, {} as Record<MapDrawToolId, DrawToolDefinition>);

const FEATURE_TYPE_TO_DRAW_TOOL: Record<string, MapDrawToolId> = {
  marker: 'marker',
  polyline: 'polyline',
  polygon: 'polygon',
  rectangle: 'rectangle',
  circle: 'circle',
};

const DEFAULT_DRAW_GUIDE = '选择工具后在地图上单次落图。绘制完成后系统会自动回到浏览态。';

/**
 * 根据ID解析图源配置（支持向后兼容）
 */
function resolveTileSource(id: string): TileSourceConfig {
  let source = PRESET_TILE_SOURCES.find((s) => s.id === id);
  if (source) return source;

  const mappedId = LEGACY_ID_MAP[id];
  if (mappedId) {
    source = PRESET_TILE_SOURCES.find((s) => s.id === mappedId);
    if (source) return source;
  }

  return PRESET_TILE_SOURCES.find((s) => s.id === 'osm_mapnik') || PRESET_TILE_SOURCES[0];
}

/**
 * 从 Leaflet polygon 层中计算质心经纬度。
 */
function computeLayerCenter(layer: L.Polygon): { latitude: number; longitude: number } | null {
  try {
    const geojson = layer.toGeoJSON() as GeoJSON.Feature<GeoJSON.Polygon>;
    const ring = geojson.geometry?.coordinates?.[0];
    if (!ring || ring.length < 3) return null;
    const pts = ring[ring.length - 1][0] === ring[0][0] && ring[ring.length - 1][1] === ring[0][1]
      ? ring.slice(0, -1)
      : ring;
    if (pts.length === 0) return null;
    let sLng = 0;
    let sLat = 0;
    for (const p of pts) {
      sLng += p[0];
      sLat += p[1];
    }
    return { longitude: sLng / pts.length, latitude: sLat / pts.length };
  } catch {
    return null;
  }
}

function getGeometryBounds(geometry?: GeoJSON.Geometry | null): L.LatLngBounds | null {
  if (!geometry) return null;

  if (geometry.type === 'Point') {
    const [longitude, latitude] = geometry.coordinates;
    const point = L.latLng(latitude, longitude);
    return L.latLngBounds(point, point);
  }

  if (geometry.type === 'LineString') {
    const coords = geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude] as [number, number]);
    return coords.length ? L.latLngBounds(coords) : null;
  }

  if (geometry.type === 'Polygon') {
    const ring = geometry.coordinates?.[0] || [];
    const coords = ring.map(([longitude, latitude]) => [latitude, longitude] as [number, number]);
    return coords.length ? L.latLngBounds(coords) : null;
  }

  return null;
}

function getFeatureBounds(feature?: GeoJSON.Feature | null): L.LatLngBounds | null {
  return getGeometryBounds(feature?.geometry);
}

function getCollectionBounds(features: GeoJSON.Feature[]): L.LatLngBounds | null {
  let bounds: L.LatLngBounds | null = null;

  for (const feature of features) {
    const nextBounds = getFeatureBounds(feature);
    if (!nextBounds) continue;
    bounds = bounds ? bounds.extend(nextBounds) : nextBounds;
  }

  return bounds;
}

function flyToBounds(map: L.Map, bounds: L.LatLngBounds | null, maxZoom = 17) {
  if (!bounds || !bounds.isValid()) return;

  const diagonalMeters = bounds.getSouthWest().distanceTo(bounds.getNorthEast());
  if (diagonalMeters < 2) {
    map.flyTo(bounds.getCenter(), Math.max(map.getZoom(), maxZoom), { duration: 0.85 });
    return;
  }

  map.flyToBounds(bounds, {
    padding: [72, 72],
    maxZoom,
    duration: 0.95,
  });
}

export default function MapView2D({ onBrowseStateChange, browseSyncToken, browseSyncSource, projectId = null, orgId = null }: MapView2DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.GridLayer | L.TileLayer | null>(null);
  const featureLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const buildingLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const activeSpatialObjectTypeRef = useRef('generic');
  const activeTemplateRef = useRef<StudioAssetTemplate | null>(null);
  const activeDrawToolRef = useRef<MapDrawToolId | null>(null);
  const measurementModeRef = useRef<MapMeasurementMode>(null);
  const snapEnabledRef = useRef(true);
  const continuousDrawingRef = useRef(false);
  const homeViewRef = useRef<MapBrowseState>(browseStateFallback());
  const importInputRef = useRef<HTMLInputElement>(null);

  const tileStyle = useMapStore((s) => s.tileStyle);
  const browseState = useMapStore((s) => s.browseState);
  const addFeature = useMapStore((s) => s.addFeature);
  const updateFeature = useMapStore((s) => s.updateFeature);
  const treeNodes = useMapStore((s) => s.treeNodes);
  const drawnFeatures = useMapStore((s) => s.drawnFeatures);
  const editingMode = useMapStore((s) => s.editingMode);
  const activeDrawTool = useMapStore((s) => s.activeDrawTool);
  const setActiveDrawTool = useMapStore((s) => s.setActiveDrawTool);
  const setEditingMode = useMapStore((s) => s.setEditingMode);
  const snapEnabled = useMapStore((s) => s.snapEnabled);
  const toggleSnapEnabled = useMapStore((s) => s.toggleSnapEnabled);
  const continuousDrawing = useMapStore((s) => s.continuousDrawing);
  const setContinuousDrawing = useMapStore((s) => s.setContinuousDrawing);
  const measurementMode = useMapStore((s) => s.measurementMode);
  const setMeasurementMode = useMapStore((s) => s.setMeasurementMode);
  const historyPast = useMapStore((s) => s.historyPast);
  const historyFuture = useMapStore((s) => s.historyFuture);
  const dirtyFeatureIds = useMapStore((s) => s.dirtyFeatureIds);
  const recordHistory = useMapStore((s) => s.recordHistory);
  const undoMapEdit = useMapStore((s) => s.undoMapEdit);
  const redoMapEdit = useMapStore((s) => s.redoMapEdit);
  const copySelectedFeature = useMapStore((s) => s.copySelectedFeature);
  const pasteClipboardFeature = useMapStore((s) => s.pasteClipboardFeature);
  const markFeatureClean = useMapStore((s) => s.markFeatureClean);
  const flyToFeatureId = useMapStore((s) => s.flyToFeatureId);
  const flyToToken = useMapStore((s) => s.flyToToken);
  const clearFlyToFeature = useMapStore((s) => s.clearFlyToFeature);
  const notifyBuildingMoved = useMapStore((s) => s.notifyBuildingMoved);
  const selectedNodeId = useMapStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useMapStore((s) => s.setSelectedNodeId);
  const setPropsPanelNodeId = useMapStore((s) => s.setPropsPanelNodeId);
  const deleteFeature = useMapStore((s) => s.deleteFeature);
  const [activeSpatialObjectType, setActiveSpatialObjectType] = useState<string>('generic');
  const [assetTemplates, setAssetTemplates] = useState<StudioAssetTemplate[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<string>('');
  const [drawGuide, setDrawGuide] = useState(DEFAULT_DRAW_GUIDE);
  const [mapZoom, setMapZoom] = useState<number>(browseState.zoom);
  const [savingAll, setSavingAll] = useState(false);

  useEffect(() => {
    homeViewRef.current = browseState;
  }, []);

  useEffect(() => {
    let active = true;

    if (!orgId) {
      setAssetTemplates([]);
      return () => {
        active = false;
      };
    }

    studioProjectApi.listAssetTemplates(orgId || undefined)
      .then((result) => {
        if (!active) return;
        const items = Array.isArray(result?.data) ? result.data : [];
        setAssetTemplates(items);
      })
      .catch((error) => {
        if (!active) return;
        console.warn('[MapView2D] Failed to load asset templates', error);
        setAssetTemplates([]);
      });

    return () => {
      active = false;
    };
  }, [orgId]);

  useEffect(() => {
    activeSpatialObjectTypeRef.current = activeSpatialObjectType;
  }, [activeSpatialObjectType]);

  useEffect(() => {
    activeDrawToolRef.current = activeDrawTool;
  }, [activeDrawTool]);

  useEffect(() => {
    measurementModeRef.current = measurementMode;
  }, [measurementMode]);

  useEffect(() => {
    snapEnabledRef.current = snapEnabled;
  }, [snapEnabled]);

  useEffect(() => {
    continuousDrawingRef.current = continuousDrawing;
  }, [continuousDrawing]);

  const activeTemplate = activeTemplateId
    ? assetTemplates.find((item) => item.id === activeTemplateId) || null
    : null;

  useEffect(() => {
    activeTemplateRef.current = activeTemplate;
  }, [activeTemplate]);

  useEffect(() => {
    if (!browseSyncToken || browseSyncSource === '2d') return;
    homeViewRef.current = browseState;
  }, [browseState, browseSyncSource, browseSyncToken]);

  const selectedFeatureNode = selectedNodeId
    ? treeNodes.find((node) => node.id === selectedNodeId && node.type === 'feature') || null
    : null;

  const recommendedTool = FEATURE_TYPE_TO_DRAW_TOOL[getSpatialObjectPreset(activeSpatialObjectType).featureType] || 'polygon';
  const activeDrawConfig = activeDrawTool ? DRAW_TOOL_BY_ID[activeDrawTool] : null;
  function resetDrawingState(nextGuide = DEFAULT_DRAW_GUIDE) {
    activeDrawToolRef.current = null;
    setActiveDrawTool(null);
    setMeasurementMode(null);
    setDrawGuide(nextGuide);
  }

  function stopDrawing(options?: { cancel?: boolean; guide?: string }) {
    const map = mapRef.current;
    const currentToolId = activeDrawToolRef.current;
    const currentMeasureMode = measurementModeRef.current;
    if (!map || !currentToolId) {
      if (map && currentMeasureMode) {
        const measureShape = currentMeasureMode === 'distance' ? 'Line' : 'Polygon';
        try {
          if (options?.cancel) {
            ((map.pm as any).Draw?.[measureShape] as { cancel?: () => void } | undefined)?.cancel?.();
          }
          map.pm.disableDraw(measureShape as L.PM.SUPPORTED_SHAPES);
        } catch (error) {
          console.warn('[MapView2D] Failed to disable measure mode', error);
        }
      }
      resetDrawingState(options?.guide || DEFAULT_DRAW_GUIDE);
      return;
    }

    const currentTool = DRAW_TOOL_BY_ID[currentToolId];
    if (options?.cancel) {
      try {
        ((map.pm as any).Draw?.[currentTool.shape] as { cancel?: () => void } | undefined)?.cancel?.();
      } catch (error) {
        console.warn('[MapView2D] Failed to cancel drawing', error);
      }
    }

    try {
      map.pm.disableDraw(currentTool.shape);
    } catch (error) {
      console.warn('[MapView2D] Failed to disable drawing mode', error);
    }

    resetDrawingState(options?.guide || DEFAULT_DRAW_GUIDE);
  }

  function startDrawing(toolId: MapDrawToolId) {
    const map = mapRef.current;
    if (!map) return;

    const tool = DRAW_TOOL_BY_ID[toolId];
    if (activeDrawToolRef.current === toolId) {
      stopDrawing({ cancel: true, guide: `${tool.label} 已取消，返回浏览模式。` });
      return;
    }

    stopDrawing({ cancel: true });

    try {
      map.pm.enableDraw(tool.shape, {
        continueDrawing: continuousDrawingRef.current,
        snappable: snapEnabledRef.current,
        pathOptions: {
          color: '#f97316',
          weight: 3,
          opacity: 0.92,
          fillColor: '#fb923c',
          fillOpacity: 0.18,
        },
        templineStyle: {
          color: '#f97316',
          weight: 3,
          dashArray: [10, 8],
        },
        hintlineStyle: {
          color: '#fdba74',
          weight: 2,
          dashArray: [6, 6],
        },
      } as any);
      activeDrawToolRef.current = toolId;
      setEditingMode('draw');
      setMeasurementMode(null);
      setActiveDrawTool(toolId);
      setDrawGuide(`${tool.label} 已启用。${tool.hint}`);
    } catch (error) {
      console.warn('[MapView2D] Failed to enable draw mode', error);
      resetDrawingState('绘制工具启动失败，请重试。');
    }
  }

  function startMeasurement(mode: Exclude<MapMeasurementMode, null>) {
    const map = mapRef.current;
    if (!map) return;
    stopDrawing({ cancel: true });

    const shape = mode === 'distance' ? 'Line' : 'Polygon';
    try {
      map.pm.enableDraw(shape, {
        continueDrawing: false,
        snappable: snapEnabledRef.current,
        pathOptions: {
          color: '#16a34a',
          weight: 3,
          opacity: 0.95,
          fillColor: '#22c55e',
          fillOpacity: 0.14,
        },
        templineStyle: {
          color: '#16a34a',
          weight: 3,
          dashArray: [8, 6],
        },
        hintlineStyle: {
          color: '#86efac',
          weight: 2,
          dashArray: [6, 6],
        },
      } as any);
      setMeasurementMode(mode);
      setEditingMode('measure');
      setDrawGuide(mode === 'distance' ? '测距已启用，逐点绘制后双击结束。' : '测面已启用，围合区域后双击结束。');
    } catch (error) {
      console.warn('[MapView2D] Failed to enable measure mode', error);
      resetDrawingState('量算工具启动失败，请重试。');
    }
  }

  function zoomIn() {
    mapRef.current?.zoomIn(undefined, { animate: true });
  }

  function zoomOut() {
    mapRef.current?.zoomOut(undefined, { animate: true });
  }

  function focusAllFeatures() {
    const map = mapRef.current;
    if (!map) return;
    const bounds = getCollectionBounds(drawnFeatures);
    if (!bounds) {
      flyToBounds(map, getGeometryBounds({ type: 'Point', coordinates: [homeViewRef.current.centerWgs84[1], homeViewRef.current.centerWgs84[0]] }), 15);
      return;
    }
    flyToBounds(map, bounds, 18);
  }

  function focusSelectedFeature() {
    const map = mapRef.current;
    if (!map || !selectedFeatureNode) return;
    flyToBounds(map, getGeometryBounds(selectedFeatureNode.geometry), 18);
  }

  function focusHomeView() {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo(homeViewRef.current.centerWgs84, homeViewRef.current.zoom, { duration: 0.95 });
  }

  function handleDeleteSelected() {
    if (!selectedFeatureNode) return;
    recordHistory();
    deleteFeature(selectedFeatureNode.id);
    setDrawGuide(`已删除 ${selectedFeatureNode.name}。`);
  }

  // 初始化地图
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: browseState.centerWgs84,
      zoom: browseState.zoom,
      zoomControl: false,
    });

    mapRef.current = map;
    setMapZoom(map.getZoom());
    map.whenReady(() => {
      requestAnimationFrame(() => {
        map.invalidateSize(false);
      });
    });

    const source = resolveTileSource(tileStyle);
    tileLayerRef.current = createTileLayer(source);
    tileLayerRef.current.addTo(map);

    const featureLayerGroup = L.layerGroup().addTo(map);
    featureLayerGroupRef.current = featureLayerGroup;

    const buildingLayerGroup = L.layerGroup().addTo(map);
    buildingLayerGroupRef.current = buildingLayerGroup;

    const handleCreate: L.PM.CreateEventHandler = (e) => {
      const layer = (e as any).layer;
      const geojson = layer.toGeoJSON() as GeoJSON.Feature;
      const currentMeasurementMode = measurementModeRef.current;
      const currentDrawTool = activeDrawToolRef.current;

      let featureType: 'polygon' | 'polyline' | 'marker' | 'circle' | 'rectangle' = 'polygon';
      if (layer instanceof L.Circle) featureType = 'circle';
      else if (layer instanceof L.Rectangle) featureType = 'rectangle';
      else if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) featureType = 'polyline';
      else if (layer instanceof L.Marker) featureType = 'marker';

      const radius = layer instanceof L.Circle ? layer.getRadius() : undefined;
      recordHistory();

      if (currentMeasurementMode) {
        const measurement = measureGeometry(geojson.geometry);
        const id = addFeature(geojson, {
          featureType,
          name: currentMeasurementMode === 'distance' ? '测距线' : '测面区域',
          objectType: 'generic',
          color: '#16a34a',
          strokeColor: '#16a34a',
          strokeWeight: 3,
          fillColor: '#22c55e',
          fillOpacity: currentMeasurementMode === 'area' ? 0.14 : 0,
          geometry: geojson.geometry,
          syncStatus: 'local',
        });
        updateFeature(id, {
          name: `${currentMeasurementMode === 'distance' ? '测距' : '测面'} · ${measurement.summary}`,
        });
        setSelectedNodeId(id);
        setPropsPanelNodeId(id);
        map.removeLayer(layer);
        stopDrawing({ guide: measurement.summary });
        return;
      }

      const baseNode = {
        featureType,
        name: currentDrawTool === 'label' ? '新标签' : `新${getSpatialObjectPreset(activeSpatialObjectTypeRef.current).label}`,
        objectType: activeSpatialObjectTypeRef.current,
        placementMode: getSpatialObjectPreset(activeSpatialObjectTypeRef.current).placementMode,
        radius,
        geometry: geojson.geometry,
        labelMode: currentDrawTool === 'label' ? 'name' as const : undefined,
        syncStatus: 'local' as const,
      };

      const id = addFeature(
        geojson,
        activeTemplateRef.current
          ? applyAssetTemplateToNode(activeTemplateRef.current, baseNode)
          : baseNode,
      );
      setSelectedNodeId(id);
      setPropsPanelNodeId(id);

      map.removeLayer(layer);
      if (continuousDrawingRef.current && currentDrawTool) {
        setDrawGuide(`${baseNode.name} 已创建，可继续连续落图。`);
      } else {
        stopDrawing({ guide: `${baseNode.name} 已创建，可继续选中编辑。` });
      }
    };

    const handleBrowseStateChange = () => {
      setMapZoom(map.getZoom());
      if (mapRef.current && onBrowseStateChange) {
        const center = mapRef.current.getCenter();
        onBrowseStateChange({
          centerWgs84: [center.lat, center.lng],
          zoom: mapRef.current.getZoom(),
          headingDeg: 0,
          pitchDeg: 0,
        });
      }
    };

    const handleDrawEnd = () => {
      if (!activeDrawToolRef.current) return;
      if (continuousDrawingRef.current) return;
      resetDrawingState('绘制已结束，可切换其它工具或继续浏览。');
    };

    map.on('pm:create', handleCreate);
    map.on('pm:drawend', handleDrawEnd as any);
    map.on('moveend zoomend', handleBrowseStateChange);

    const container = containerRef.current;
    const resizeObserver = typeof ResizeObserver !== 'undefined' && container
      ? new ResizeObserver(() => {
        map.invalidateSize(false);
      })
      : null;
    resizeObserver?.observe(container);

    return () => {
      map.off('pm:create', handleCreate);
      map.off('pm:drawend', handleDrawEnd as any);
      map.off('moveend zoomend', handleBrowseStateChange);
      resizeObserver?.disconnect();
      map.remove();
      mapRef.current = null;
      featureLayerGroupRef.current = null;
      buildingLayerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      if (tagName === 'INPUT' || tagName === 'SELECT' || tagName === 'TEXTAREA' || target?.isContentEditable) {
        return;
      }

      if (event.key === 'Escape' && (activeDrawToolRef.current || measurementModeRef.current)) {
        event.preventDefault();
        stopDrawing({ cancel: true, guide: '草图已取消，返回浏览模式。' });
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          redoMapEdit();
          setDrawGuide('已重做上一步地图编辑。');
        } else {
          undoMapEdit();
          setDrawGuide('已撤销上一步地图编辑。');
        }
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        handleSaveDirtyFeatures();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        copySelectedFeature();
        setDrawGuide('已复制当前图形。');
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        pasteClipboardFeature();
        setDrawGuide('已粘贴图形副本。');
        return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedFeatureNode) {
        event.preventDefault();
        handleDeleteSelected();
        return;
      }

      if (event.key.toLowerCase() === 'e') {
        event.preventDefault();
        setEditingMode(editingMode === 'edit' ? 'browse' : 'edit');
        setDrawGuide(editingMode === 'edit' ? '已退出节点编辑。' : '节点编辑已启用，可拖动图形或节点。');
        return;
      }

      if (event.key === '=' || event.key === '+' || event.key === 'NumpadAdd') {
        event.preventDefault();
        zoomIn();
        return;
      }

      if (event.key === '-' || event.key === '_' || event.key === 'NumpadSubtract') {
        event.preventDefault();
        zoomOut();
        return;
      }

      if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        focusAllFeatures();
        return;
      }

      if (event.key.toLowerCase() === 'h') {
        event.preventDefault();
        focusHomeView();
        return;
      }

      const tool = DRAW_TOOLS.find((item) => item.shortcut === event.key);
      if (tool) {
        event.preventDefault();
        startDrawing(tool.id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [copySelectedFeature, drawnFeatures, editingMode, handleSaveDirtyFeatures, pasteClipboardFeature, redoMapEdit, selectedFeatureNode, setEditingMode, undoMapEdit]);

  useEffect(() => {
    const map = mapRef.current;
    const group = featureLayerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    const visibleNodeIds = new Set(treeNodes.filter((node) => node.visible !== false).map((node) => node.id));
    const renderableFeatures = drawnFeatures.filter((feature) => {
      const source = (feature.properties as any)?.source;
      const props = (feature.properties || {}) as Record<string, any>;
      const featureId = String(feature.id || props.id || '');
      return source !== 'studio-building' && !(feature.properties as any)?.studioDerived && (!featureId || visibleNodeIds.has(featureId));
    });

    renderableFeatures.forEach((feature) => {
      const props = (feature.properties || {}) as Record<string, any>;
      const featureId = String(feature.id || props.id || '');
      const isTerrainWorkZone = props.source === 'terrain-work-zone';
      const isSelected = Boolean(featureId) && featureId === selectedNodeId;
      const strokeColor = isSelected
        ? '#f97316'
        : (props.strokeColor || props.color || (isTerrainWorkZone ? '#f59e0b' : '#3388ff'));
      const fillColor = isSelected ? '#fb923c' : (props.fillColor || props.color || strokeColor);
      const strokeWeight = (props.strokeWeight || (isTerrainWorkZone ? 3 : 2)) + (isSelected ? 1 : 0);
      const strokeOpacity = isSelected ? 1 : (props.strokeOpacity ?? 0.9);
      const fillOpacity = Math.min((props.fillOpacity ?? (isTerrainWorkZone ? 0.18 : 0.28)) + (isSelected ? 0.08 : 0), 0.42);

      try {
        const layer = L.geoJSON(feature as any, {
          style: {
            color: strokeColor,
            weight: strokeWeight,
            opacity: strokeOpacity,
            fillColor,
            fillOpacity,
            dashArray: props.dashArray || (isTerrainWorkZone ? '8 6' : undefined),
          },
          pointToLayer: (_geoFeature, latlng) => {
            if (props.featureType === 'circle' && props.radius) {
              return L.circle(latlng, {
                radius: Number(props.radius),
                color: strokeColor,
                weight: strokeWeight,
                opacity: strokeOpacity,
                fillColor,
                fillOpacity,
              });
            }
            return L.circleMarker(latlng, {
              radius: isSelected ? 8 : (isTerrainWorkZone ? 7 : 6),
              color: strokeColor,
              weight: isSelected ? 3 : 2,
              opacity: strokeOpacity,
              fillColor,
              fillOpacity: isSelected ? 1 : 0.92,
            });
          },
          onEachFeature: (_geoFeature, childLayer) => {
            const tooltip = props.name || '未命名图形';
            childLayer.bindTooltip(tooltip, {
              permanent: props.labelMode === 'name',
              direction: 'top',
              className: isTerrainWorkZone ? 'studio-building-tooltip' : undefined,
            });
            childLayer.on('click', () => {
              if (!featureId) return;
              setSelectedNodeId(featureId);
              setPropsPanelNodeId(featureId);
              setDrawGuide(`已选中 ${tooltip}，可定位、删除或继续编辑属性。`);
            });
            if ((childLayer as any).pm && editingMode === 'edit' && !isTerrainWorkZone) {
              try {
                (childLayer as any).pm.enable({
                  snappable: snapEnabled,
                  allowSelfIntersection: false,
                });
                (childLayer as any).pm.enableLayerDrag?.();
                const handleLayerChanged = () => {
                  if (!featureId) return;
                  recordHistory();
                  const nextGeoJson = (childLayer as any).toGeoJSON() as GeoJSON.Feature;
                  const nextRadius = childLayer instanceof L.Circle ? childLayer.getRadius() : props.radius;
                  updateFeature(featureId, {
                    geometry: nextGeoJson.geometry,
                    radius: nextRadius,
                  });
                  setDrawGuide(`已更新 ${tooltip}。${measureGeometry(nextGeoJson.geometry).summary}`);
                };
                childLayer.on('pm:edit' as any, handleLayerChanged);
                childLayer.on('pm:dragend' as any, handleLayerChanged);
              } catch (error) {
                console.warn('[MapView2D] Failed to enable feature editing', error);
              }
            }
          },
        });

        layer.addTo(group);
        if (isSelected) {
          (layer as any).bringToFront?.();
        }
      } catch (error) {
        console.warn('[MapView2D] Skipped invalid GeoJSON feature', {
          featureId,
          source: props.source,
          error,
        });
      }
    });
  }, [drawnFeatures, editingMode, recordHistory, selectedNodeId, setPropsPanelNodeId, setSelectedNodeId, snapEnabled, treeNodes, updateFeature]);

  // 同步建筑 polygon 到独立图层组（支持拖拽）
  useEffect(() => {
    const map = mapRef.current;
    const group = buildingLayerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    const buildingFeatures = drawnFeatures.filter(
      (f) => (f.properties as any)?.source === 'studio-building' || (f.properties as any)?.studioDerived,
    );

    buildingFeatures.forEach((feature) => {
      if (!feature.geometry || feature.geometry.type !== 'Polygon') return;
      const props = (feature.properties || {}) as Record<string, any>;
      const buildingId = props.buildingId;
      if (!buildingId) return;

      const polygon = L.geoJSON(feature as any, {
        style: {
          color: props.strokeColor || '#2563eb',
          weight: props.strokeWeight || 2,
          opacity: props.strokeOpacity ?? 0.9,
          fillColor: props.fillColor || '#3b82f6',
          fillOpacity: props.fillOpacity ?? 0.25,
          dashArray: '6 4',
        },
        onEachFeature: (_feature, layer) => {
          const name = props.name || '建筑';
          layer.bindTooltip(name, { permanent: false, direction: 'center', className: 'studio-building-tooltip' });

          try {
            if ((layer as any).pm) {
              (layer as any).pm.enableLayerDrag();
            }
          } catch (error) {
            console.warn('[MapView2D] Failed to enable layer drag:', error);
          }

          layer.on('pm:dragend' as any, () => {
            const center = computeLayerCenter(layer as L.Polygon);
            if (center && buildingId) {
              notifyBuildingMoved(buildingId, center);
            }
          });
        },
      });

      polygon.addTo(group);
    });
  }, [drawnFeatures, notifyBuildingMoved]);

  // 切换瓦片图层
  useEffect(() => {
    if (!mapRef.current) return;
    const source = resolveTileSource(tileStyle);
    tileLayerRef.current = replaceTileLayer(mapRef.current, tileLayerRef.current, source);
  }, [tileStyle]);

  // 同步浏览状态
  useEffect(() => {
    if (!mapRef.current || !browseSyncToken || browseSyncSource === '2d') return;
    const map = mapRef.current;
    const currentCenter = map.getCenter();
    const currentZoom = map.getZoom();

    if (
      Math.abs(currentCenter.lat - browseState.centerWgs84[0]) > 0.0001 ||
      Math.abs(currentCenter.lng - browseState.centerWgs84[1]) > 0.0001 ||
      Math.abs(currentZoom - browseState.zoom) > 0.1
    ) {
      map.setView(browseState.centerWgs84, browseState.zoom);
      setMapZoom(browseState.zoom);
    }
  }, [browseSyncSource, browseSyncToken, browseState]);

  // 响应飞行定位信号
  useEffect(() => {
    if (!mapRef.current || !flyToFeatureId || !flyToToken) return;
    const node = treeNodes.find((n) => n.id === flyToFeatureId);
    if (!node?.geometry) {
      clearFlyToFeature();
      return;
    }

    flyToBounds(mapRef.current, getGeometryBounds(node.geometry), 18);
    clearFlyToFeature();
  }, [clearFlyToFeature, flyToFeatureId, flyToToken, treeNodes]);

  const handleTemplateChange = (templateId: string) => {
    setActiveTemplateId(templateId);
    if (!templateId) return;
    const template = assetTemplates.find((item) => item.id === templateId);
    if (!template) return;
    setActiveSpatialObjectType(inferTemplateObjectType(template));
  };

  function handleExportGeoJSON() {
    const collection = buildMapFeatureCollection(treeNodes, drawnFeatures);
    downloadGeoJSON(`door-map-${new Date().toISOString().slice(0, 10)}.geojson`, collection);
    setDrawGuide(`已导出 ${collection.features.length} 个 GeoJSON 要素。`);
  }

  async function handleImportGeoJSONFile(file?: File | null) {
    if (!file) return;
    try {
      const text = await file.text();
      const imported = parseMapFeatureCollection(JSON.parse(text));
      if (!imported.length) {
        setDrawGuide('GeoJSON 文件没有可导入的 Feature。');
        return;
      }

      recordHistory();
      let lastId: string | null = null;
      imported.forEach(({ feature, node }) => {
        lastId = addFeature(feature, node);
      });
      if (lastId) {
        setSelectedNodeId(lastId);
        setPropsPanelNodeId(lastId);
      }
      showSuccess(`已导入 ${imported.length} 个 GeoJSON 要素`);
      setDrawGuide(`已导入 ${imported.length} 个图形，可继续编辑或保存到项目。`);
    } catch (error: any) {
      showError(`导入 GeoJSON 失败：${error.message}`);
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
    }
  }

  async function handleSaveDirtyFeatures() {
    if (!projectId) {
      showError('当前地图未绑定项目，无法保存到项目空间对象。');
      return;
    }

    const dirtySet = new Set(dirtyFeatureIds);
    const candidates = treeNodes.filter((node) =>
      node.type === 'feature' &&
      node.source !== 'studio-derived' &&
      node.geometry &&
      (dirtySet.has(node.id) || node.syncStatus === 'local' || node.syncStatus === 'dirty')
    );

    if (!candidates.length) {
      setDrawGuide('没有需要保存的变更。');
      return;
    }

    setSavingAll(true);
    try {
      for (const node of candidates) {
        if (node.backendWorkZoneId || node.source === 'terrain-work-zone') {
          if (node.geometry?.type !== 'Polygon') continue;
          const payload = {
            name: node.name || '地形工作区',
            zoneType: node.zoneType || 'focus-zone',
            clipPolygonWgs84: node.geometry,
            terrainResolution: node.terrainResolution ?? 2,
            includedObjectIds: node.includedObjectIds || [],
            status: 'ready',
            metadata: {
              source: 'map-bulk-save',
              mapNodeId: node.id,
            },
          };
          const response = node.backendWorkZoneId
            ? await studioProjectApi.updateTerrainWorkZone(node.backendWorkZoneId, payload, orgId || undefined)
            : await studioProjectApi.createTerrainWorkZone(projectId, payload, orgId || undefined);
          const zoneId = response?.data?.id || node.backendWorkZoneId || null;
          updateFeature(node.id, {
            backendWorkZoneId: zoneId,
            focusZoneId: zoneId,
            syncStatus: 'synced',
            sourceProjectId: projectId,
            source: 'terrain-work-zone',
          });
          markFeatureClean(node.id);
          continue;
        }

        const response = node.backendObjectId
          ? await studioProjectApi.updateSpatialObject(node.backendObjectId, mapNodeToSpatialObjectPayload(node as any), orgId || undefined)
          : await studioProjectApi.createSpatialObject(projectId, mapNodeToSpatialObjectPayload(node as any), orgId || undefined);
        const objectId = response?.data?.id || node.backendObjectId || null;
        updateFeature(node.id, {
          backendObjectId: objectId,
          syncStatus: 'synced',
          sourceProjectId: projectId,
          source: 'spatial-object',
        });
        markFeatureClean(node.id);
      }

      showSuccess(`已保存 ${candidates.length} 个地图对象`);
      setDrawGuide(`已保存 ${candidates.length} 个对象到项目。`);
    } catch (error: any) {
      showError(`保存项目对象失败：${error.message}`);
    } finally {
      setSavingAll(false);
    }
  }

  return (
    <div className="map-view-2d-shell">
      <div ref={containerRef} className="map-view-2d" />

      <div className="map-view-2d__overlay map-view-2d__overlay--top-left">
        <section className="map-view-2d__panel map-view-2d__panel--ovi-toolbar" aria-label="地图测绘工具">
          <input
            ref={importInputRef}
            type="file"
            accept=".geojson,.json,application/geo+json,application/json"
            className="map-view-2d__file-input"
            onChange={(event) => handleImportGeoJSONFile(event.target.files?.[0])}
          />
          <div className="map-view-2d__toolbar-head">
            <div>
              <div className="map-view-2d__eyebrow">Survey Tools</div>
              <strong>测绘编辑</strong>
            </div>
            <span className={`map-view-2d__sync-pill${dirtyFeatureIds.length ? ' is-dirty' : ''}`}>
              {dirtyFeatureIds.length ? `${dirtyFeatureIds.length} 未保存` : '已同步'}
            </span>
          </div>

          <div className="map-view-2d__toolbar-group">
            <button type="button" className={`map-view-2d__tool-chip${editingMode === 'select' || editingMode === 'browse' ? ' is-active' : ''}`} onClick={() => { stopDrawing({ guide: '浏览/选择模式。' }); setEditingMode('select'); }}>
              <span className="material-symbols-outlined">near_me</span>
              选择
            </button>
            <button type="button" className={`map-view-2d__tool-chip${editingMode === 'edit' ? ' is-active' : ''}`} onClick={() => { stopDrawing({ guide: editingMode === 'edit' ? '已退出节点编辑。' : '节点编辑已启用，可拖动节点或图形。' }); setEditingMode(editingMode === 'edit' ? 'browse' : 'edit'); }}>
              <span className="material-symbols-outlined">edit_location_alt</span>
              编辑
            </button>
            <button type="button" className="map-view-2d__tool-chip" onClick={focusAllFeatures} title="适配全部 (F)">
              <span className="material-symbols-outlined">fit_screen</span>
              适配
            </button>
          </div>

          <div className="map-view-2d__toolbar-group">
            {DRAW_TOOLS.map((tool) => {
              const isActive = activeDrawTool === tool.id;
              const isRecommended = recommendedTool === tool.id;
              return (
                <button
                  key={tool.id}
                  type="button"
                  className={`map-view-2d__tool-chip${isActive ? ' is-active' : ''}${isRecommended ? ' is-recommended' : ''}`}
                  onClick={() => startDrawing(tool.id)}
                  title={`${tool.label} (${tool.shortcut})`}
                >
                  <span className="material-symbols-outlined">{tool.icon}</span>
                  {tool.label}
                  <span className="map-view-2d__keycap">{tool.shortcut}</span>
                </button>
              );
            })}
          </div>

          <div className="map-view-2d__toolbar-group">
            <button type="button" className={`map-view-2d__tool-chip${measurementMode === 'distance' ? ' is-active' : ''}`} onClick={() => startMeasurement('distance')}>
              <span className="material-symbols-outlined">straighten</span>
              测距
            </button>
            <button type="button" className={`map-view-2d__tool-chip${measurementMode === 'area' ? ' is-active' : ''}`} onClick={() => startMeasurement('area')}>
              <span className="material-symbols-outlined">activity_zone</span>
              测面
            </button>
            <button type="button" className={`map-view-2d__tool-chip${snapEnabled ? ' is-active' : ''}`} onClick={toggleSnapEnabled}>
              <span className="material-symbols-outlined">join_inner</span>
              吸附
            </button>
            <button type="button" className={`map-view-2d__tool-chip${continuousDrawing ? ' is-active' : ''}`} onClick={() => setContinuousDrawing(!continuousDrawing)}>
              <span className="material-symbols-outlined">all_inclusive</span>
              连续
            </button>
          </div>

          <div className="map-view-2d__toolbar-group">
            <button type="button" className="map-view-2d__tool-chip" onClick={undoMapEdit} disabled={!historyPast.length}>
              <span className="material-symbols-outlined">undo</span>
              撤销
            </button>
            <button type="button" className="map-view-2d__tool-chip" onClick={redoMapEdit} disabled={!historyFuture.length}>
              <span className="material-symbols-outlined">redo</span>
              重做
            </button>
            <button type="button" className="map-view-2d__tool-chip" onClick={copySelectedFeature} disabled={!selectedFeatureNode}>
              <span className="material-symbols-outlined">content_copy</span>
              复制
            </button>
            <button type="button" className="map-view-2d__tool-chip" onClick={pasteClipboardFeature}>
              <span className="material-symbols-outlined">content_paste</span>
              粘贴
            </button>
            <button type="button" className="map-view-2d__tool-chip is-danger" onClick={handleDeleteSelected} disabled={!selectedFeatureNode}>
              <span className="material-symbols-outlined">delete</span>
              删除
            </button>
          </div>

          <div className="map-view-2d__toolbar-group">
            <button type="button" className="map-view-2d__tool-chip is-primary" onClick={handleSaveDirtyFeatures} disabled={savingAll || !dirtyFeatureIds.length}>
              <span className="material-symbols-outlined">cloud_upload</span>
              {savingAll ? '保存中' : '保存'}
            </button>
            <button type="button" className="map-view-2d__tool-chip" onClick={() => importInputRef.current?.click()}>
              <span className="material-symbols-outlined">upload_file</span>
              导入
            </button>
            <button type="button" className="map-view-2d__tool-chip" onClick={handleExportGeoJSON} disabled={!drawnFeatures.length}>
              <span className="material-symbols-outlined">download</span>
              导出
            </button>
            <button type="button" className="map-view-2d__tool-chip" onClick={() => stopDrawing({ cancel: true, guide: '已退出当前工具。' })} disabled={!activeDrawTool && !measurementMode}>
              <span className="material-symbols-outlined">close</span>
              退出
            </button>
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
              {activeDrawTool ? activeDrawConfig?.icon || 'gesture' : measurementMode ? 'straighten' : editingMode === 'edit' ? 'edit_location_alt' : 'travel_explore'}
            </span>
            <div className="map-view-2d__status-copy">
              <strong>{activeDrawConfig ? activeDrawConfig.label : measurementMode === 'distance' ? '测距模式' : measurementMode === 'area' ? '测面模式' : editingMode === 'edit' ? '节点编辑' : '浏览模式'}</strong>
              <span>{activeDrawConfig ? activeDrawConfig.hint : measurementMode ? '双击完成量算，结果会作为图形保留。' : editingMode === 'edit' ? '拖动节点或图形后自动回写。' : '选择工具后开始测绘。'}</span>
            </div>
          </div>

          <div className={`map-view-2d__selection-card map-view-2d__selection-card--compact${selectedFeatureNode ? ' is-selected' : ''}`}>
            {selectedFeatureNode ? (
              <>
                <div className="map-view-2d__selection-head">
                  <strong>{selectedFeatureNode.name || '未命名图形'}</strong>
                  <span className="map-view-2d__selection-tag">已选中</span>
                </div>
                <p>{(selectedFeatureNode.featureType || 'polygon').toUpperCase()} · {(selectedFeatureNode.objectType || 'generic').replace(/_/g, ' ')}</p>
                <div className="map-view-2d__selection-actions map-view-2d__selection-actions--compact">
                  <button type="button" className="map-view-2d__ghost-btn" onClick={focusSelectedFeature}>
                    定位
                  </button>
                  <button type="button" className="map-view-2d__ghost-btn is-danger" onClick={handleDeleteSelected}>
                    删除
                  </button>
                </div>
              </>
            ) : (
              <>
                <strong>未选择对象</strong>
                <p>{drawGuide}</p>
              </>
            )}
          </div>
        </section>
      </div>

      <div className="map-view-2d__overlay map-view-2d__overlay--top-right">
        <section className="map-view-2d__panel map-view-2d__panel--semantic map-view-2d__panel--semantic-compact">
          <div className="map-view-2d__eyebrow">语义对象</div>
          <div className="map-view-2d__panel-head map-view-2d__panel-head--compact">
            <div className="map-view-2d__panel-copy">
              <h3>语义与模板</h3>
              <p>先定义，再落图。</p>
            </div>
            <span className="map-view-2d__badge is-accent">{DRAW_TOOL_BY_ID[recommendedTool].label}</span>
          </div>

          <label className="map-view-2d__field">
            <span>语义对象类型</span>
            <select value={activeSpatialObjectType} onChange={(event) => setActiveSpatialObjectType(event.target.value)}>
              {SPATIAL_OBJECT_PRESETS.map((preset) => (
                <option key={preset.objectType} value={preset.objectType}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>

          <label className="map-view-2d__field">
            <span>标准件模板</span>
            <select value={activeTemplateId} onChange={(event) => handleTemplateChange(event.target.value)}>
              <option value="">不使用模板</option>
              {assetTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                  {template.source === 'builtin' ? ' · 内置' : ''}
                </option>
              ))}
            </select>
          </label>

          {activeTemplate && (
            <div className="map-view-2d__note map-view-2d__note--compact">
              {activeTemplate.name} · {inferTemplateObjectType(activeTemplate)}
            </div>
          )}

          <div className="map-view-2d__note map-view-2d__note--compact">
            1-6 绘图 · E 编辑 · Esc 取消 · Ctrl+S 保存 · F 适配
          </div>
        </section>
      </div>

      <div className="map-view-2d__overlay map-view-2d__overlay--bottom-right">
        <section className="map-view-2d__panel map-view-2d__panel--nav-compact">
          <div className="map-view-2d__nav-head map-view-2d__nav-head--compact">
            <div className="map-view-2d__eyebrow">导航</div>
            <div className="map-view-2d__zoom-readout">Z {mapZoom.toFixed(1)}</div>
          </div>

          <div className="map-view-2d__nav-stack">
            <button type="button" className="map-view-2d__nav-btn map-view-2d__nav-btn--compact is-primary" onClick={zoomIn} title="放大 (+)">
              <span className="material-symbols-outlined">add</span>
              <span>放大</span>
              <span className="map-view-2d__keycap">+</span>
            </button>
            <button type="button" className="map-view-2d__nav-btn map-view-2d__nav-btn--compact" onClick={zoomOut} title="缩小 (-)">
              <span className="material-symbols-outlined">remove</span>
              <span>缩小</span>
              <span className="map-view-2d__keycap">-</span>
            </button>
            <button type="button" className="map-view-2d__nav-btn map-view-2d__nav-btn--compact" onClick={focusAllFeatures} title="适配全部图形 (F)">
              <span className="material-symbols-outlined">fit_screen</span>
              <span>适配全部</span>
              <span className="map-view-2d__keycap">F</span>
            </button>
            <button
              type="button"
              className="map-view-2d__nav-btn map-view-2d__nav-btn--compact"
              onClick={focusSelectedFeature}
              disabled={!selectedFeatureNode}
              title="定位当前选择"
            >
              <span className="material-symbols-outlined">my_location</span>
              <span>定位选中</span>
              <span className="map-view-2d__keycap">S</span>
            </button>
            <button type="button" className="map-view-2d__nav-btn map-view-2d__nav-btn--compact" onClick={focusHomeView} title="返回工作区 (H)">
              <span className="material-symbols-outlined">home_pin</span>
              <span>返回工作区</span>
              <span className="map-view-2d__keycap">H</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function browseStateFallback(): MapBrowseState {
  return {
    centerWgs84: [30.57, 104.07],
    zoom: 12,
    headingDeg: 0,
    pitchDeg: 0,
  };
}
