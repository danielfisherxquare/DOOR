import { useCallback, useEffect, useMemo, useRef } from 'react'
import MapView from '../../map/MapView'
import { useMapStore } from '../../../stores/mapStore'
import { useModelStore } from '../../../stores/modelStore'
import { buildStudioMapState, cloneStudioValue, createDefaultMapState, updateBuildingGeo } from '../../../utils/studioProjectUtils'

function serializeComparableState(value) {
  try {
    return JSON.stringify(cloneStudioValue(value))
  } catch {
    return ''
  }
}

export default function StudioMapBridge({ workspaceKey, snapshot, placingBuildingId, onStateChange, onBuildingPlaced, onCancelPlacement, onSelectLevel }) {
  const skipSyncRef = useRef(false)
  const lastWorkspaceKeyRef = useRef(workspaceKey)
  const lastPersistedStateRef = useRef('')
  const browseState = useMapStore((state) => state.browseState)
  const viewMode = useMapStore((state) => state.viewMode)
  const tileStyle = useMapStore((state) => state.tileStyle)
  const treeNodes = useMapStore((state) => state.treeNodes)
  const drawnFeatures = useMapStore((state) => state.drawnFeatures)
  const buildingStyle = useMapStore((state) => state.buildingStyle)
  const hiddenOsmBuildings = useMapStore((state) => state.hiddenOsmBuildings)
  const selectedNodeId = useMapStore((state) => state.selectedNodeId)
  const hydrateMap = useMapStore((state) => state.hydrateWorkspace)
  const models = useModelStore((state) => state.models)
  const placedModels = useModelStore((state) => state.placedModels)
  const hydrateModels = useModelStore((state) => state.hydrateWorkspace)

  useEffect(() => {
    const incoming = snapshot ? buildStudioMapState(snapshot) : createDefaultMapState()
    const currentMapState = useMapStore.getState()
    const currentModelState = useModelStore.getState()
    const workspaceChanged = lastWorkspaceKeyRef.current !== workspaceKey
    lastWorkspaceKeyRef.current = workspaceKey

    const incomingComparable = serializeComparableState({
      browseState: incoming.browseState,
      viewMode: incoming.viewMode,
      tileStyle: incoming.tileStyle,
      treeNodes: incoming.treeNodes,
      drawnFeatures: incoming.drawnFeatures,
      buildingStyle: incoming.buildingStyle,
      hiddenOsmBuildings: incoming.hiddenOsmBuildings,
      models: incoming.models || [],
      placedModels: incoming.placedModels || [],
    })

    const currentComparable = serializeComparableState({
      browseState: currentMapState.browseState,
      viewMode: currentMapState.viewMode,
      tileStyle: currentMapState.tileStyle,
      treeNodes: currentMapState.treeNodes,
      drawnFeatures: currentMapState.drawnFeatures,
      buildingStyle: currentMapState.buildingStyle,
      hiddenOsmBuildings: currentMapState.hiddenOsmBuildings,
      models: currentModelState.models,
      placedModels: currentModelState.placedModels,
    })

    if (!workspaceChanged && incomingComparable === currentComparable) {
      lastPersistedStateRef.current = incomingComparable
      return
    }

    skipSyncRef.current = true
    lastPersistedStateRef.current = incomingComparable
    hydrateMap({
      viewMode: incoming.viewMode,
      tileStyle: incoming.tileStyle,
      browseState: incoming.browseState,
      treeNodes: incoming.treeNodes,
      drawnFeatures: incoming.drawnFeatures,
      buildingStyle: incoming.buildingStyle,
      hiddenOsmBuildings: incoming.hiddenOsmBuildings,
      selectedNodeId: workspaceChanged ? null : currentMapState.selectedNodeId,
      propsPanelNodeId: workspaceChanged ? null : currentMapState.propsPanelNodeId,
    })
    hydrateModels({
      models: incoming.models || [],
      placedModels: incoming.placedModels || [],
      selectedPlacedModelId: workspaceChanged ? null : currentModelState.selectedPlacedModelId,
    })
  }, [hydrateMap, hydrateModels, snapshot, workspaceKey])

  useEffect(() => {
    if (skipSyncRef.current) {
      skipSyncRef.current = false
      return
    }
    const nextState = {
      browseState: cloneStudioValue(browseState),
      viewMode,
      tileStyle,
      treeNodes: cloneStudioValue(treeNodes),
      drawnFeatures: cloneStudioValue(drawnFeatures),
      buildingStyle,
      hiddenOsmBuildings: cloneStudioValue(hiddenOsmBuildings),
      models: cloneStudioValue(models),
      placedModels: cloneStudioValue(placedModels),
    }
    const serialized = serializeComparableState(nextState)
    if (serialized === lastPersistedStateRef.current) return
    lastPersistedStateRef.current = serialized
    onStateChange?.(nextState)
  }, [browseState, drawnFeatures, models, onStateChange, placedModels, buildingStyle, hiddenOsmBuildings, tileStyle, treeNodes, viewMode])

  useEffect(() => {
    if (!selectedNodeId) return
    const selectedNode = treeNodes.find((node) => node.id === selectedNodeId)
    if (selectedNode?.buildingId && selectedNode?.levelId) {
      onSelectLevel?.(selectedNode.buildingId, selectedNode.levelId)
    }
  }, [onSelectLevel, selectedNodeId, treeNodes])

  // --- 建筑拖拽事件监听 ---
  const buildingMoveEvent = useMapStore((state) => state.buildingMoveEvent)
  const clearBuildingMoveEvent = useMapStore((state) => state.clearBuildingMoveEvent)
  const lastMoveTokenRef = useRef(0)

  useEffect(() => {
    if (!buildingMoveEvent || !snapshot) return
    // 避免重复处理同一事件
    if (buildingMoveEvent.token === lastMoveTokenRef.current) return
    lastMoveTokenRef.current = buildingMoveEvent.token

    const { buildingId, latitude, longitude } = buildingMoveEvent
    const newSnapshot = updateBuildingGeo(snapshot, buildingId, { latitude, longitude })
    if (newSnapshot && onStateChange) {
      // 回写 snapshot 中更新后的 map state
      const newMapState = buildStudioMapState(newSnapshot)
      skipSyncRef.current = true
      hydrateMap({
        ...useMapStore.getState(),
        treeNodes: newMapState.treeNodes,
        drawnFeatures: newMapState.drawnFeatures,
      })
      // 将包含更新后 buildings 的 snapshot 持久化
      onStateChange({
        __snapshotOverride: newSnapshot,
      })
    }
    clearBuildingMoveEvent()
  }, [buildingMoveEvent, clearBuildingMoveEvent, hydrateMap, onStateChange, snapshot])

  // --- 建筑放置模式 ---
  const placingBuilding = useMemo(() => {
    if (!placingBuildingId || !snapshot?.buildings) return null
    return snapshot.buildings.find((b) => b.id === placingBuildingId) || null
  }, [placingBuildingId, snapshot?.buildings])

  const handleMapPlacementClick = useCallback(() => {
    if (!placingBuildingId || !onBuildingPlaced) return
    // 从 mapStore 获取当前拐点的经纬度
    const mapState = useMapStore.getState()
    const center = mapState.browseState?.centerWgs84
    if (!center) return
    onBuildingPlaced(placingBuildingId, {
      latitude: center[0],
      longitude: center[1],
    })
  }, [placingBuildingId, onBuildingPlaced])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {placingBuilding && (
        <div className="studio-map-placement-bar">
          <div className="studio-map-placement-bar__content">
            <span className="material-symbols-outlined">pin_drop</span>
            <span>正在放置建筑「{placingBuilding.name}」—— 将地图导航到目标位置，然后点击“确认放置”将建筑锚定到地图中心点</span>
          </div>
          <div className="studio-map-placement-bar__actions">
            <button type="button" className="studio-shell__primary" onClick={handleMapPlacementClick}>✅ 确认放置</button>
            <button type="button" className="studio-shell__ghost" onClick={onCancelPlacement}>取消</button>
          </div>
        </div>
      )}
      {placingBuilding && (
        <div className="studio-map-placement-crosshair">
          <span className="material-symbols-outlined">add</span>
        </div>
      )}
      <MapView disableModelAutoLoad />
    </div>
  )
}
