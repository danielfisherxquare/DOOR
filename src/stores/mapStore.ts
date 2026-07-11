import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MapBrowseState, MapBrowseSyncSource, MapViewMode } from '../utils/map/browseState';
import { areBrowseStatesEquivalent, normalizeMapBrowseState } from '../utils/map/browseState';

export type TileStyle = string; // 图源ID，支持预设和自定义
export type BuildingStyle = 'none' | 'osm' | 'google3d' | 'amap' | 'osmGeoJson';
export type RenderQualityPreset = 'performance' | 'balanced' | 'quality' | 'ultra' | 'custom';
export type MapEditingMode = 'browse' | 'select' | 'draw' | 'edit' | 'measure';
export type MapDrawToolId = 'marker' | 'label' | 'polyline' | 'polygon' | 'rectangle' | 'circle';
export type MapMeasurementMode = 'distance' | 'area' | null;

interface MapHistorySnapshot {
  treeNodes: MapTreeNode[];
  drawnFeatures: GeoJSON.Feature[];
  selectedNodeId: string | null;
  propsPanelNodeId: string | null;
}

export interface MapRenderQuality {
  preset: RenderQualityPreset;
  resolutionScale: number;
  terrainScreenSpaceError: number;
  osmScreenSpaceError: number;
  fxaaEnabled: boolean;
  showOsmOutline: boolean;
}

const MAP_RENDER_QUALITY_PRESET_VALUES: Record<Exclude<RenderQualityPreset, 'custom'>, Omit<MapRenderQuality, 'preset'>> = {
  performance: {
    resolutionScale: 0.8,
    terrainScreenSpaceError: 7,
    osmScreenSpaceError: 24,
    fxaaEnabled: false,
    showOsmOutline: true,
  },
  balanced: {
    resolutionScale: 1,
    terrainScreenSpaceError: 4,
    osmScreenSpaceError: 16,
    fxaaEnabled: true,
    showOsmOutline: true,
  },
  quality: {
    resolutionScale: 1.2,
    terrainScreenSpaceError: 2.5,
    osmScreenSpaceError: 10,
    fxaaEnabled: true,
    showOsmOutline: true,
  },
  ultra: {
    resolutionScale: 1.4,
    terrainScreenSpaceError: 1.5,
    osmScreenSpaceError: 6,
    fxaaEnabled: true,
    showOsmOutline: true,
  },
};

function buildRenderQuality(preset: Exclude<RenderQualityPreset, 'custom'>): MapRenderQuality {
  return {
    preset,
    ...MAP_RENDER_QUALITY_PRESET_VALUES[preset],
  };
}

export const DEFAULT_MAP_RENDER_QUALITY = buildRenderQuality('balanced');

export interface HiddenOsmBuilding {
  key: string;
  elementId: number;
  elementType: string;
  name?: string | null;
  buildingType?: string | null;
  latitude?: number;
  longitude?: number;
  targetElevation?: number;
}

export interface GeneratedSceneOsmDiagnostics {
  rawElementCount?: number;
  renderableElementCount?: number;
  footprintCount?: number;
  returnedCount?: number;
  truncatedByMaxBuildings?: boolean;
  filters?: {
    areaTooLarge?: number;
    majorTooLong?: number;
    ribbonLike?: number;
    suppressedByBuildingParts?: number;
    truncatedByMaxBuildings?: number;
  };
  [key: string]: unknown;
}

export interface MapTreeNode {
  id: string;
  name: string;
  type: 'folder' | 'feature';
  icon?: string;
  visible: boolean;
  source?: string;
  buildingId?: string;
  levelId?: string;
  warehouseIds?: string[];
  expanded?: boolean;
  children?: MapTreeNode[];
  featureType?: 'polygon' | 'polyline' | 'marker' | 'circle' | 'rectangle';
  color?: string;
  geometry?: GeoJSON.Geometry;
  radius?: number;
  // 样式属性
  strokeColor?: string;
  strokeWeight?: number;
  strokeOpacity?: number;
  fillColor?: string;
  fillOpacity?: number;
  labelMode?: 'none' | 'name' | 'area' | 'name_area' | 'name_area_perimeter';
  objectType?: string;
  templateId?: string | null;
  templateName?: string | null;
  variantId?: string | null;
  assetTemplateSource?: string | null;
  assetTemplateKind?: string | null;
  placementMode?: 'follow-terrain' | 'level-platform' | 'vertical-keep';
  brandingPackId?: string | null;
  fasciaStyle?: string | null;
  sponsorName?: string | null;
  accentColor?: string | null;
  focusZoneId?: string | null;
  backendObjectId?: string | null;
  backendWorkZoneId?: string | null;
  zoneType?: 'focus-zone' | 'terrain-clip' | 'corridor-zone';
  terrainResolution?: number | null;
  terrainPatchGeneratedAt?: string | null;
  terrainHeightDeltaMeters?: number | null;
  includedObjectIds?: string[];
  publishManifestGeneratedAt?: string | null;
  publishManifestObjectCount?: number | null;
  publishManifestBatchCount?: number | null;
  publishManifestLodSummary?: Record<string, number> | null;
  publishManifestInstancingEligibleCount?: number | null;
  publishManifestGeometryFamilyCount?: number | null;
  exportPackageGeneratedAt?: string | null;
  exportPackageResourceCount?: number | null;
  exportPackageLodResources?: Record<string, number> | null;
  exportPackageInstancingReadyResources?: number | null;
  exportPackageInstancingReadyObjects?: number | null;
  exportTaskId?: string | null;
  exportTaskStatus?: string | null;
  exportOutputRoot?: string | null;
  geometrySource?: string | null;
  generatedSceneId?: string | null;
  generatedSceneStatus?: string | null;
  generatedSceneJobId?: string | null;
  generatedSceneQualityPreset?: string | null;
  generatedSceneOsmCount?: number | null;
  generatedSceneOsmDiagnostics?: GeneratedSceneOsmDiagnostics | null;
  syncStatus?: 'local' | 'synced' | 'dirty';
  sourceProjectId?: string | null;
}

interface MapState {
  // 视图状态
  viewMode: MapViewMode;
  tileStyle: TileStyle;
  browseState: MapBrowseState;
  browseSyncToken: number;
  browseSyncSource: MapBrowseSyncSource;

  // 图层数据
  treeNodes: MapTreeNode[];
  selectedNodeId: string | null;

  // GeoJSON数据
  drawnFeatures: GeoJSON.Feature[];

  // UI状态
  sidebarOpen: boolean;
  sidebarCompact: boolean;
  propsPanelNodeId: string | null;
  editingMode: MapEditingMode;
  activeDrawTool: MapDrawToolId | null;
  snapEnabled: boolean;
  continuousDrawing: boolean;
  measurementMode: MapMeasurementMode;
  dirtyFeatureIds: string[];
  historyPast: MapHistorySnapshot[];
  historyFuture: MapHistorySnapshot[];
  clipboardFeature: GeoJSON.Feature | null;
  buildingStyle: BuildingStyle;
  hiddenOsmBuildings: HiddenOsmBuilding[];
  referencePanelRevealToken: number;
  showBuildings: boolean; // 派生属性，向后兼容
  autoTilt: boolean; // 缩放时自动倾斜镜头（Google Earth风格）
  renderFps: number | null;
  renderQuality: MapRenderQuality;

  // 建筑拖拽事件（地图视图触发，StudioMapBridge 消费）
  buildingMoveEvent: { buildingId: string; latitude: number; longitude: number; token: number } | null;

  // 飞行定位信号
  flyToFeatureId: string | null;
  flyToToken: number;

  // Actions
  setViewMode: (mode: MapViewMode) => void;
  setTileStyle: (style: TileStyle) => void;
  setBrowseState: (state: MapBrowseState, source?: MapBrowseSyncSource) => void;
  setTreeNodes: (nodes: MapTreeNode[]) => void;
  setSelectedNodeId: (id: string | null) => void;
  setDrawnFeatures: (features: GeoJSON.Feature[]) => void;
  setEditingMode: (mode: MapEditingMode) => void;
  setActiveDrawTool: (tool: MapDrawToolId | null) => void;
  setSnapEnabled: (enabled: boolean) => void;
  toggleSnapEnabled: () => void;
  setContinuousDrawing: (enabled: boolean) => void;
  setMeasurementMode: (mode: MapMeasurementMode) => void;
  addFeature: (feature: GeoJSON.Feature, node: Partial<MapTreeNode>) => string;
  updateFeature: (id: string, updates: Partial<MapTreeNode>) => void;
  renameFeature: (id: string, name: string) => void;
  setFeatureVisibility: (id: string, visible: boolean) => void;
  deleteFeature: (id: string) => void;
  recordHistory: () => void;
  undoMapEdit: () => void;
  redoMapEdit: () => void;
  clearMapHistory: () => void;
  copySelectedFeature: () => void;
  pasteClipboardFeature: () => void;
  markFeatureClean: (id: string) => void;
  markFeaturesClean: (ids: string[]) => void;
  toggleSidebar: () => void;
  toggleSidebarCompact: () => void;
  setPropsPanelNodeId: (id: string | null) => void;
  setBuildingStyle: (style: BuildingStyle) => void;
  hideOsmBuilding: (building: HiddenOsmBuilding) => void;
  showOsmBuilding: (key: string) => void;
  showOsmBuildings: (keys: string[]) => void;
  clearHiddenOsmBuildings: () => void;
  revealReferencePanel: () => void;
  setShowBuildings: (show: boolean) => void; // 兼容旧调用
  toggleAutoTilt: () => void;
  setRenderFps: (fps: number | null) => void;
  setRenderQualityPreset: (preset: Exclude<RenderQualityPreset, 'custom'>) => void;
  updateRenderQuality: (updates: Partial<Omit<MapRenderQuality, 'preset'>>) => void;
  triggerFlyToFeature: (featureId: string) => void;
  clearFlyToFeature: () => void;
  notifyBuildingMoved: (buildingId: string, center: { latitude: number; longitude: number }) => void;
  clearBuildingMoveEvent: () => void;
  hydrateWorkspace: (payload?: Partial<MapState>) => void;
  resetWorkspace: () => void;
}

const DEFAULT_BROWSE_STATE: MapBrowseState = {
  centerWgs84: [30.57, 104.07], // 成都
  zoom: 12,
  headingDeg: 0,
  pitchDeg: 0,
};

const MAX_MAP_HISTORY = 40;

function cloneMapHistorySnapshot(snapshot: MapHistorySnapshot): MapHistorySnapshot {
  return {
    treeNodes: JSON.parse(JSON.stringify(snapshot.treeNodes)),
    drawnFeatures: JSON.parse(JSON.stringify(snapshot.drawnFeatures)),
    selectedNodeId: snapshot.selectedNodeId,
    propsPanelNodeId: snapshot.propsPanelNodeId,
  };
}

function createHistorySnapshot(state: Pick<MapState, 'treeNodes' | 'drawnFeatures' | 'selectedNodeId' | 'propsPanelNodeId'>): MapHistorySnapshot {
  return cloneMapHistorySnapshot({
    treeNodes: state.treeNodes,
    drawnFeatures: state.drawnFeatures,
    selectedNodeId: state.selectedNodeId,
    propsPanelNodeId: state.propsPanelNodeId,
  });
}

function appendDirtyId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids : [...ids, id];
}

export const useMapStore = create<MapState>()(
  persist(
    (set, get) => ({
      // 初始状态
      viewMode: '2D',
      tileStyle: 'osm_mapnik',
      browseState: DEFAULT_BROWSE_STATE,
      browseSyncToken: 0,
      browseSyncSource: 'system',
      treeNodes: [],
      selectedNodeId: null,
      drawnFeatures: [],
      sidebarOpen: true,
      sidebarCompact: false,
      propsPanelNodeId: null,
      editingMode: 'browse',
      activeDrawTool: null,
      snapEnabled: true,
      continuousDrawing: false,
      measurementMode: null,
      dirtyFeatureIds: [],
      historyPast: [],
      historyFuture: [],
      clipboardFeature: null,
      buildingStyle: 'none' as BuildingStyle,
      hiddenOsmBuildings: [],
      referencePanelRevealToken: 0,
      autoTilt: true, // 默认开启自动倾斜
      renderFps: null,
      renderQuality: DEFAULT_MAP_RENDER_QUALITY,
      flyToFeatureId: null,
      flyToToken: 0,
      buildingMoveEvent: null,
      get showBuildings() { return this.buildingStyle !== 'none'; },

      // Actions
      setViewMode: (mode) => set({ viewMode: mode }),

      setTileStyle: (style) => set({ tileStyle: style }),

      setBrowseState: (state, source = 'ui') => {
        const current = get();
        const normalized = normalizeMapBrowseState(state, current.viewMode);

        if (areBrowseStatesEquivalent(current.browseState, normalized)) {
          return;
        }

        set({
          browseState: normalized,
          browseSyncToken: current.browseSyncToken + 1,
          browseSyncSource: source,
        });
      },

      setTreeNodes: (nodes) => set({ treeNodes: nodes }),

      setSelectedNodeId: (id) => set({ selectedNodeId: id }),

      setDrawnFeatures: (features) => set({ drawnFeatures: features }),

      setEditingMode: (mode) => set({
        editingMode: mode,
        ...(mode !== 'draw' ? { activeDrawTool: null } : {}),
        ...(mode !== 'measure' ? { measurementMode: null } : {}),
      }),

      setActiveDrawTool: (tool) => set({
        activeDrawTool: tool,
        editingMode: tool ? 'draw' : get().editingMode === 'draw' ? 'browse' : get().editingMode,
      }),

      setSnapEnabled: (enabled) => set({ snapEnabled: enabled }),
      toggleSnapEnabled: () => set({ snapEnabled: !get().snapEnabled }),
      setContinuousDrawing: (enabled) => set({ continuousDrawing: enabled }),
      setMeasurementMode: (mode) => set({
        measurementMode: mode,
        editingMode: mode ? 'measure' : get().editingMode === 'measure' ? 'browse' : get().editingMode,
        activeDrawTool: null,
      }),

      addFeature: (feature, node) => {
        const id = `feature_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const newNode: MapTreeNode = {
          id,
          name: node.name || '新图形',
          type: 'feature',
          visible: true,
          featureType: node.featureType,
          color: node.color || '#3388ff',
          geometry: feature.geometry,
          ...node,
        };
        const nextFeature: GeoJSON.Feature = {
          ...feature,
          id,
          properties: {
            ...(feature.properties || {}),
            id,
            name: newNode.name,
            featureType: newNode.featureType,
            color: newNode.color,
            radius: newNode.radius,
            strokeColor: newNode.strokeColor,
            strokeWeight: newNode.strokeWeight,
            strokeOpacity: newNode.strokeOpacity,
            fillColor: newNode.fillColor,
            fillOpacity: newNode.fillOpacity,
            objectType: newNode.objectType,
            templateId: newNode.templateId,
            templateName: newNode.templateName,
            variantId: newNode.variantId,
            assetTemplateSource: newNode.assetTemplateSource,
            assetTemplateKind: newNode.assetTemplateKind,
            placementMode: newNode.placementMode,
            focusZoneId: newNode.focusZoneId,
            backendObjectId: newNode.backendObjectId,
            backendWorkZoneId: newNode.backendWorkZoneId,
            zoneType: newNode.zoneType,
            terrainResolution: newNode.terrainResolution,
            terrainPatchGeneratedAt: newNode.terrainPatchGeneratedAt,
            terrainHeightDeltaMeters: newNode.terrainHeightDeltaMeters,
            includedObjectIds: newNode.includedObjectIds,
            publishManifestGeneratedAt: newNode.publishManifestGeneratedAt,
            publishManifestObjectCount: newNode.publishManifestObjectCount,
            publishManifestBatchCount: newNode.publishManifestBatchCount,
            publishManifestLodSummary: newNode.publishManifestLodSummary,
            exportPackageGeneratedAt: newNode.exportPackageGeneratedAt,
            exportPackageResourceCount: newNode.exportPackageResourceCount,
            exportPackageLodResources: newNode.exportPackageLodResources,
            exportTaskId: newNode.exportTaskId,
            exportTaskStatus: newNode.exportTaskStatus,
            exportOutputRoot: newNode.exportOutputRoot,
            syncStatus: newNode.syncStatus,
            sourceProjectId: newNode.sourceProjectId,
          },
        };
        set({
          treeNodes: [...get().treeNodes, newNode],
          drawnFeatures: [...get().drawnFeatures, nextFeature],
          dirtyFeatureIds: appendDirtyId(get().dirtyFeatureIds, id),
        });
        return id;
      },

      updateFeature: (id, updates) => {
        const markDirty = updates.syncStatus === undefined
          && updates.backendObjectId === undefined
          && updates.backendWorkZoneId === undefined;
        const updateNode = (nodes: MapTreeNode[]): MapTreeNode[] =>
          nodes.map((node) => {
            if (node.id === id) {
              const hasRemoteBinding = Boolean(node.backendObjectId || node.backendWorkZoneId);
              return {
                ...node,
                ...updates,
                syncStatus: markDirty && hasRemoteBinding ? 'dirty' : (updates.syncStatus ?? node.syncStatus),
              };
            }
            if (node.children) return { ...node, children: updateNode(node.children) };
            return node;
          });
        const updateFeature = (feature: GeoJSON.Feature): GeoJSON.Feature => {
          const props = (feature.properties || {}) as Record<string, unknown>;
          const matches =
            feature.id === id ||
            props.id === id ||
            props.featureId === id;

          if (!matches) return feature;

          return {
            ...feature,
            ...(updates.geometry ? { geometry: updates.geometry } : {}),
            properties: {
              ...props,
              ...updates,
              id,
              syncStatus: markDirty && (props.backendObjectId || props.backendWorkZoneId)
                ? 'dirty'
                : (updates.syncStatus ?? props.syncStatus),
            },
          };
        };

        set({
          treeNodes: updateNode(get().treeNodes),
          drawnFeatures: get().drawnFeatures.map(updateFeature),
          dirtyFeatureIds: (updates.syncStatus === 'synced')
            ? get().dirtyFeatureIds.filter((item) => item !== id)
            : appendDirtyId(get().dirtyFeatureIds, id),
        });
      },

      renameFeature: (id, name) => get().updateFeature(id, { name }),

      setFeatureVisibility: (id, visible) => get().updateFeature(id, { visible }),

      deleteFeature: (id) => {
        const filterNodes = (nodes: MapTreeNode[]): MapTreeNode[] =>
          nodes
            .filter((node) => node.id !== id)
            .map((node) => (node.children ? { ...node, children: filterNodes(node.children) } : node));
        const { selectedNodeId, propsPanelNodeId } = get();
        set({
          treeNodes: filterNodes(get().treeNodes),
          drawnFeatures: get().drawnFeatures.filter((feature) => {
            const props = (feature.properties || {}) as Record<string, unknown>;
            return feature.id !== id && props.id !== id && props.featureId !== id;
          }),
          dirtyFeatureIds: get().dirtyFeatureIds.filter((item) => item !== id),
          selectedNodeId: selectedNodeId === id ? null : selectedNodeId,
          propsPanelNodeId: propsPanelNodeId === id ? null : propsPanelNodeId,
        });
      },

      recordHistory: () => {
        const snapshot = createHistorySnapshot(get());
        set((state) => ({
          historyPast: [...state.historyPast, snapshot].slice(-MAX_MAP_HISTORY),
          historyFuture: [],
        }));
      },

      undoMapEdit: () => {
        const state = get();
        const previous = state.historyPast[state.historyPast.length - 1];
        if (!previous) return;
        const current = createHistorySnapshot(state);
        set({
          ...cloneMapHistorySnapshot(previous),
          historyPast: state.historyPast.slice(0, -1),
          historyFuture: [current, ...state.historyFuture].slice(0, MAX_MAP_HISTORY),
          dirtyFeatureIds: Array.from(new Set([
            ...state.dirtyFeatureIds,
            ...previous.treeNodes.filter((node) => node.type === 'feature').map((node) => node.id),
          ])),
        });
      },

      redoMapEdit: () => {
        const state = get();
        const next = state.historyFuture[0];
        if (!next) return;
        const current = createHistorySnapshot(state);
        set({
          ...cloneMapHistorySnapshot(next),
          historyPast: [...state.historyPast, current].slice(-MAX_MAP_HISTORY),
          historyFuture: state.historyFuture.slice(1),
          dirtyFeatureIds: Array.from(new Set([
            ...state.dirtyFeatureIds,
            ...next.treeNodes.filter((node) => node.type === 'feature').map((node) => node.id),
          ])),
        });
      },

      clearMapHistory: () => set({ historyPast: [], historyFuture: [] }),

      copySelectedFeature: () => {
        const { selectedNodeId, drawnFeatures } = get();
        if (!selectedNodeId) return;
        const feature = drawnFeatures.find((item) => {
          const props = (item.properties || {}) as Record<string, unknown>;
          return item.id === selectedNodeId || props.id === selectedNodeId || props.featureId === selectedNodeId;
        });
        if (!feature) return;
        set({ clipboardFeature: JSON.parse(JSON.stringify(feature)) });
      },

      pasteClipboardFeature: () => {
        const feature = get().clipboardFeature;
        if (!feature) return;
        get().recordHistory();
        const sourceProps = (feature.properties || {}) as Partial<MapTreeNode> & { name?: string };
        const pastedFeature: GeoJSON.Feature = {
          ...JSON.parse(JSON.stringify(feature)),
          id: undefined,
          properties: {
            ...sourceProps,
            name: `${sourceProps.name || '复制图形'} 副本`,
            backendObjectId: null,
            backendWorkZoneId: null,
            syncStatus: 'local',
          },
        };
        const pastedId = get().addFeature(pastedFeature, {
          name: `${sourceProps.name || '复制图形'} 副本`,
          featureType: sourceProps.featureType,
          color: sourceProps.color,
          strokeColor: sourceProps.strokeColor,
          strokeWeight: sourceProps.strokeWeight,
          strokeOpacity: sourceProps.strokeOpacity,
          fillColor: sourceProps.fillColor,
          fillOpacity: sourceProps.fillOpacity,
          objectType: sourceProps.objectType,
          templateId: sourceProps.templateId,
          templateName: sourceProps.templateName,
          placementMode: sourceProps.placementMode,
          geometry: pastedFeature.geometry,
          syncStatus: 'local',
        });
        set({ selectedNodeId: pastedId, propsPanelNodeId: pastedId });
      },

      markFeatureClean: (id) => set((state) => ({
        dirtyFeatureIds: state.dirtyFeatureIds.filter((item) => item !== id),
      })),

      markFeaturesClean: (ids) => {
        const cleanIds = new Set(ids);
        set((state) => ({
          dirtyFeatureIds: state.dirtyFeatureIds.filter((item) => !cleanIds.has(item)),
        }));
      },

      toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
      toggleSidebarCompact: () => set({ sidebarCompact: !get().sidebarCompact }),

      setPropsPanelNodeId: (id) => set({ propsPanelNodeId: id }),

      setBuildingStyle: (style) => set({ buildingStyle: style }),
      hideOsmBuilding: (building) =>
        set((state) => {
          const nextHidden = state.hiddenOsmBuildings.filter((item) => item.key !== building.key);
          nextHidden.push(building);
          return { hiddenOsmBuildings: nextHidden };
        }),
      showOsmBuilding: (key) =>
        set((state) => ({
          hiddenOsmBuildings: state.hiddenOsmBuildings.filter((item) => item.key !== key),
        })),
      showOsmBuildings: (keys) => {
        if (!keys.length) return;
        const keySet = new Set(keys);
        set((state) => ({
          hiddenOsmBuildings: state.hiddenOsmBuildings.filter((item) => !keySet.has(item.key)),
        }));
      },
      clearHiddenOsmBuildings: () => set({ hiddenOsmBuildings: [] }),
      revealReferencePanel: () =>
        set((state) => ({
          referencePanelRevealToken: state.referencePanelRevealToken + 1,
          sidebarOpen: true,
        })),
      setShowBuildings: (show) => set({ buildingStyle: show ? 'osm' : 'none' }),
      toggleAutoTilt: () => set({ autoTilt: !get().autoTilt }),
      setRenderFps: (fps) => set((state) => (state.renderFps === fps ? state : { renderFps: fps })),
      setRenderQualityPreset: (preset) => set({ renderQuality: buildRenderQuality(preset) }),
      updateRenderQuality: (updates) =>
        set((state) => ({
          renderQuality: {
            ...state.renderQuality,
            ...updates,
            preset: 'custom',
          },
        })),

      triggerFlyToFeature: (featureId) => set({
        flyToFeatureId: featureId,
        flyToToken: get().flyToToken + 1,
      }),
      clearFlyToFeature: () => set({ flyToFeatureId: null }),

      notifyBuildingMoved: (buildingId, center) =>
        set((state) => ({
          buildingMoveEvent: {
            buildingId,
            latitude: center.latitude,
            longitude: center.longitude,
            token: (state.buildingMoveEvent?.token ?? 0) + 1,
          },
        })),
      clearBuildingMoveEvent: () => set({ buildingMoveEvent: null }),

      hydrateWorkspace: (payload = {}) =>
        set({
          viewMode: (payload.viewMode as MapViewMode) || '2D',
          tileStyle: (payload.tileStyle as TileStyle) || 'light',
          browseState: payload.browseState ? normalizeMapBrowseState(payload.browseState, payload.viewMode || '2D') : DEFAULT_BROWSE_STATE,
          browseSyncToken: get().browseSyncToken + 1,
          browseSyncSource: 'system',
          treeNodes: Array.isArray(payload.treeNodes) ? payload.treeNodes : [],
          selectedNodeId: payload.selectedNodeId || null,
          drawnFeatures: Array.isArray(payload.drawnFeatures) ? payload.drawnFeatures : [],
          sidebarOpen: payload.sidebarOpen ?? true,
          sidebarCompact: payload.sidebarCompact ?? false,
          propsPanelNodeId: payload.propsPanelNodeId || null,
          editingMode: 'browse',
          activeDrawTool: null,
          measurementMode: null,
          dirtyFeatureIds: [],
          historyPast: [],
          historyFuture: [],
          clipboardFeature: null,
          buildingStyle: payload.buildingStyle || 'none',
          hiddenOsmBuildings: Array.isArray(payload.hiddenOsmBuildings)
            ? payload.hiddenOsmBuildings
            : [],
          renderFps: null,
          renderQuality: payload.renderQuality
            ? {
              ...DEFAULT_MAP_RENDER_QUALITY,
              ...payload.renderQuality,
            }
            : DEFAULT_MAP_RENDER_QUALITY,
        }),

      resetWorkspace: () =>
        set({
          viewMode: '2D',
          tileStyle: 'osm_mapnik',
          browseState: DEFAULT_BROWSE_STATE,
          browseSyncToken: get().browseSyncToken + 1,
          browseSyncSource: 'system',
          treeNodes: [],
          selectedNodeId: null,
          drawnFeatures: [],
          sidebarOpen: true,
          sidebarCompact: false,
          propsPanelNodeId: null,
          editingMode: 'browse',
          activeDrawTool: null,
          snapEnabled: true,
          continuousDrawing: false,
          measurementMode: null,
          dirtyFeatureIds: [],
          historyPast: [],
          historyFuture: [],
          clipboardFeature: null,
          buildingStyle: 'none' as BuildingStyle,
          hiddenOsmBuildings: [],
          referencePanelRevealToken: 0,
          autoTilt: true,
          renderFps: null,
          renderQuality: DEFAULT_MAP_RENDER_QUALITY,
        }),
    }),
    {
      name: 'map-storage',
      partialize: (state) => ({
        browseState: state.browseState,
        tileStyle: state.tileStyle,
        treeNodes: state.treeNodes,
        drawnFeatures: state.drawnFeatures,
        buildingStyle: state.buildingStyle,
        hiddenOsmBuildings: state.hiddenOsmBuildings,
        sidebarCompact: state.sidebarCompact,
        autoTilt: state.autoTilt,
        renderQuality: state.renderQuality,
        snapEnabled: state.snapEnabled,
        continuousDrawing: state.continuousDrawing,
      }),
    },
  ),
);
