import { Suspense, lazy, useState, useEffect, useCallback } from 'react';
import { useMapStore } from '../../stores/mapStore';
import { useModelStore } from '../../stores/modelStore';
import { CommandToolbar } from '../command/CommandPrimitives';
import MapView2D from './MapView2D';
import MapControls from './MapControls';
import MapObjectTree from './MapObjectTree';
import MapFeaturePanel from './MapFeaturePanel';
import ModelManager from './ModelManager';
import ModelEditor from './ModelEditor';
import ReferenceBuildingsPanel from './ReferenceBuildingsPanel';
import CacheStatusIndicator from './CacheStatusIndicator';
import MapShortcutsModal from './MapShortcutsModal';
import OfflineTileManager from './OfflineTileManager';
import useProjectSpatialObjects from '../../hooks/useProjectSpatialObjects';
import type { MapBrowseState, MapBrowseSyncSource } from '../../utils/map/browseState';
import './map.css';

// 懒加载3D视图
const MapView3D = lazy(() => import('./MapView3D'));
const AMap3DView = lazy(() => import('./AMap3DView'));

type SidebarTab = 'layers' | 'models' | 'offline' | 'reference';

interface MapViewProps {
  disableModelAutoLoad?: boolean;
  controlsVariant?: 'floating' | 'inline' | 'hidden';
  projectId?: string | null;
  orgId?: string | null;
  raceId?: string | null;
}

export default function MapView({
  disableModelAutoLoad = false,
  controlsVariant = 'floating',
  projectId = null,
  orgId = null,
  raceId = null,
}: MapViewProps) {
  const viewMode = useMapStore((s) => s.viewMode);
  const sidebarOpen = useMapStore((s) => s.sidebarOpen);
  const selectedNodeId = useMapStore((s) => s.selectedNodeId);
  const propsPanelNodeId = useMapStore((s) => s.propsPanelNodeId);
  const browseSyncToken = useMapStore((s) => s.browseSyncToken);
  const browseSyncSource = useMapStore((s) => s.browseSyncSource);
  const buildingStyle = useMapStore((s) => s.buildingStyle);
  const hiddenOsmBuildings = useMapStore((s) => s.hiddenOsmBuildings);
  const referencePanelRevealToken = useMapStore((s) => s.referencePanelRevealToken);
  const setSelectedNodeId = useMapStore((s) => s.setSelectedNodeId);
  const setPropsPanelNodeId = useMapStore((s) => s.setPropsPanelNodeId);
  const { selectedPlacedModelId, placedModels } = useModelStore();
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('layers');
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  useProjectSpatialObjects(projectId, orgId);
  const hasReferenceTab = viewMode === '3DGlobe' && (buildingStyle === 'osm' || hiddenOsmBuildings.length > 0);
  const sidebarTabs: { key: SidebarTab; label: string; summary: string }[] = [
    { key: 'layers', label: '图层对象', summary: '标注、区域与锚点' },
    { key: 'models', label: '模型资源', summary: '已放置模型与模板' },
    { key: 'offline', label: '离线下载', summary: '瓦片下载与空间占用' },
    ...(hasReferenceTab ? [{
      key: 'reference' as SidebarTab,
      label: '白模管理',
      summary: hiddenOsmBuildings.length > 0 ? `已隐藏 ${hiddenOsmBuildings.length} 栋` : '单栋隐藏与恢复',
    }] : []),
  ];

  const selectedPlacedModel = placedModels.find((m) => m.id === selectedPlacedModelId);
  const clearFeatureSelection = useCallback(() => {
    setSelectedNodeId(null);
    setPropsPanelNodeId(null);
  }, [setPropsPanelNodeId, setSelectedNodeId]);

  // 键盘快捷键监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + / 打开快捷键帮助
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        setShortcutsModalOpen(true);
      }
      // Esc 关闭弹窗
      if (e.key === 'Escape') {
        if (shortcutsModalOpen) {
          setShortcutsModalOpen(false);
          return;
        }

        if (selectedPlacedModelId) {
          useModelStore.getState().selectPlacedModel(null);
          return;
        }

        if (propsPanelNodeId || selectedNodeId) {
          clearFeatureSelection();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearFeatureSelection, propsPanelNodeId, selectedNodeId, selectedPlacedModelId, shortcutsModalOpen]);

  useEffect(() => {
    if (referencePanelRevealToken > 0) {
      setSidebarTab('reference');
    }
  }, [referencePanelRevealToken]);

  useEffect(() => {
    if (!hasReferenceTab && sidebarTab === 'reference') {
      setSidebarTab('layers');
    }
  }, [hasReferenceTab, sidebarTab]);

  const handleBrowseStateChange = useCallback((state: MapBrowseState, source: MapBrowseSyncSource) => {
    useMapStore.getState().setBrowseState(state, source);
  }, []);

  return (
    <div className="map-container">
      {/* 侧边栏 */}
      {sidebarOpen && (
        <div className="map-sidebar">
          <CommandToolbar className="map-sidebar__toolbar">
            <div className="map-sidebar__label">地图侧栏</div>
            <div className="map-sidebar__switcher">
              {sidebarTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`map-sidebar__tab ${sidebarTab === tab.key ? 'is-active' : ''}`}
                  onClick={() => setSidebarTab(tab.key)}
                >
                  <strong>{tab.label}</strong>
                  <span>{tab.summary}</span>
                </button>
              ))}
            </div>
          </CommandToolbar>

          <div className="map-sidebar-content">
            {sidebarTab === 'layers' && <MapObjectTree />}
            {sidebarTab === 'models' && <ModelManager disableAutoLoad={disableModelAutoLoad} />}
            {sidebarTab === 'offline' && <OfflineTileManager />}
            {sidebarTab === 'reference' && hasReferenceTab && <ReferenceBuildingsPanel />}
          </div>
        </div>
      )}

      {/* 地图区域 */}
      <div className="map-main">
        {/* 视图切换 */}
        <Suspense fallback={<div className="map-loading">加载中...</div>}>
          {viewMode === '2D' && (
            <MapView2D
              onBrowseStateChange={(state) => handleBrowseStateChange(state, '2d')}
              browseSyncToken={browseSyncToken}
              browseSyncSource={browseSyncSource}
              projectId={projectId}
              orgId={orgId}
            />
          )}
          {viewMode === '3DGlobe' && (
            <MapView3D
              onBrowseStateChange={(state) => handleBrowseStateChange(state, 'cesium3d')}
              browseSyncToken={browseSyncToken}
              browseSyncSource={browseSyncSource}
            />
          )}
          {viewMode === '3D' && (
            <AMap3DView
              onBrowseStateChange={(state) => handleBrowseStateChange(state, 'amap3d')}
              browseSyncToken={browseSyncToken}
              browseSyncSource={browseSyncSource}
            />
          )}
        </Suspense>

        {/* 控制面板 */}
        {controlsVariant !== 'hidden' && (
          <MapControls
            variant={controlsVariant === 'inline' ? 'inline' : 'floating'}
            showHint={controlsVariant === 'floating'}
          />
        )}

        {/* 缓存状态指示器 */}
        <CacheStatusIndicator />

      </div>

      {/* 属性面板 - GeoJSON图形 */}
      {propsPanelNodeId && !selectedPlacedModelId && (
        <div className="map-props-panel">
          <MapFeaturePanel
            nodeId={propsPanelNodeId}
            onClose={clearFeatureSelection}
            projectId={projectId}
            orgId={orgId}
            raceId={raceId}
          />
        </div>
      )}

      {/* 模型编辑面板 */}
      {selectedPlacedModelId && (
        <div className="map-props-panel">
          <ModelEditor
            placedModel={selectedPlacedModel}
            onClose={() => useModelStore.getState().selectPlacedModel(null)}
          />
        </div>
      )}

      {/* 快捷键帮助弹窗 */}
      <MapShortcutsModal
        open={shortcutsModalOpen}
        onClose={() => setShortcutsModalOpen(false)}
      />
    </div>
  );
}
