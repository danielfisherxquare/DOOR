import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useAssetDesignerStore from '../../stores/assetDesignerStore'
import { showError, showSuccess } from '../../utils/toast'
import { getPrefabById } from '../../data/prefabRegistry'
import { getSceneConfig } from '../../utils/sceneAdapter'
import SceneTree from './SceneTree'
import FloatingToolbar from './FloatingToolbar'
import FloatingInspector from './FloatingInspector'
import FloatingTopbar from './FloatingTopbar'
import MaterialPicker from './MaterialPicker'
import AssetCatalog from './AssetCatalog'
import ShortcutHints from './ShortcutHints'
import AssetDesignerCanvas from './AssetDesignerCanvas'
import LevelSelector from './LevelSelector'
import MeasurementPanel from './MeasurementPanel'
import ExportPanel from './ExportPanel'
import ShareDialog from './ShareDialog'
import '../../views/asset-designer/AssetDesigner.css'
import { distance, GRID_SIZE } from '../../utils/snapEngine'
import { formatDistance } from '../../utils/measureUtils'

const MM_TO_SCENE = 0.001

function readValue(record, ...keys) {
  for (const key of keys) {
    if (record?.[key] !== undefined && record?.[key] !== null) return record[key]
  }
  return null
}

function buildPersistedScene({
  sceneType,
  warehouse,
  zones,
  racks,
  locations,
  prefabs,
  walls,
  structures,
  levels,
  activeLevelId,
  viewMode,
  measurements,
}) {
  return {
    sceneType,
    warehouse,
    zones,
    racks,
    locations,
    prefabs,
    walls,
    structures,
    levels,
    activeLevelId,
    viewMode,
    measurements,
  }
}

export default function AssetDesignerWorkbench({
  sceneKey = 'default',
  initialScene,
  sceneType = 'warehouse',
  rackTemplates = [],
  sourceContext = null,
  preferredSidebarTab = null,
  onSceneChange,
  onSave,
  onBack,
  embedded = false,
}) {
  const skipSceneSyncRef = useRef(true)
  const [wallPreview, setWallPreview] = useState(null)
  const {
    mode, paintMode, activeMaterialId, selection, draftScene, dirty,
    sidebarTab, inspectorOpen, catalogOpen, theme,
    history, future,
    hydrateScene, stageScene, markSaved,
    setMode, setPaintMode, setActiveMaterial,
    selectEntity, setSidebarTab,
    toggleInspector, toggleCatalog, toggleTheme,
    undo, redo, resetDesigner, setSceneType,
    activeTemplateId, activePrefabId,
    openingMode, activeOpeningPreset,
    activeStructurePreset,
    levels, activeLevelId, viewMode, setActiveLevel,
    measurements, measurementMode, setMeasurementMode, addMeasurement, removeMeasurement, clearMeasurements,
    exportPanelOpen, shareDialogOpen, toggleExportPanel, toggleShareDialog,
  } = useAssetDesignerStore()

  useEffect(() => {
    if (initialScene) {
      skipSceneSyncRef.current = true
      hydrateScene(initialScene, { type: 'warehouse', id: initialScene?.warehouse?.id ?? null })
    }
  }, [sceneKey, initialScene, hydrateScene])

  useEffect(() => {
    setSceneType(sceneType)
  }, [sceneType, setSceneType])

  useEffect(() => {
    if (preferredSidebarTab) {
      setSidebarTab(preferredSidebarTab)
    }
  }, [preferredSidebarTab, setSidebarTab])

  useEffect(() => () => resetDesigner(), [resetDesigner])

  useEffect(() => {
    if (mode !== 'wall') {
      setWallPreview(null)
    }
  }, [mode])

  const activeWarehouse = draftScene?.warehouse || initialScene?.warehouse || null
  const activeZones = draftScene?.zones || []
  const activeRacks = draftScene?.racks || []
  const activeLocations = draftScene?.locations || []
  const activePrefabs = draftScene?.prefabs || []
  const activeWalls = draftScene?.walls || []
  const activeStructures = draftScene?.structures || []

  const persistableScene = useMemo(() => buildPersistedScene({
    sceneType,
    warehouse: activeWarehouse,
    zones: activeZones,
    racks: activeRacks,
    locations: activeLocations,
    prefabs: activePrefabs,
    walls: activeWalls,
    structures: activeStructures,
    levels,
    activeLevelId,
    viewMode,
    measurements,
  }), [
    sceneType,
    activeWarehouse,
    activeZones,
    activeRacks,
    activeLocations,
    activePrefabs,
    activeWalls,
    activeStructures,
    levels,
    activeLevelId,
    viewMode,
    measurements,
  ])

  const handleSave = useCallback(async () => {
    if (!persistableScene?.warehouse) {
      showError('当前项目还没有可保存的场景')
      return
    }

    try {
      const savedProject = await onSave?.({
        name: readValue(persistableScene.warehouse, 'name') || '未命名项目',
        sceneType,
        snapshotJson: persistableScene,
      })
      markSaved(persistableScene)
      showSuccess(savedProject?.id ? '项目已保存' : '保存完成')
      return savedProject
    } catch (error) {
      showError(`保存失败：${error.message}`)
      return null
    }
  }, [markSaved, onSave, persistableScene, sceneType])

  useEffect(() => {
    if (skipSceneSyncRef.current) {
      skipSceneSyncRef.current = false
      return
    }
    onSceneChange?.(persistableScene)
  }, [onSceneChange, persistableScene])

  const handleUpdateProjectName = useCallback((name) => {
    stageScene((draft) => {
      draft.warehouse = {
        ...(draft.warehouse || {}),
        name: name || '未命名项目',
      }
      return draft
    })
  }, [stageScene])

  const handleUpdateZone = useCallback((id, updates) => {
    stageScene((draft) => {
      const index = draft.zones.findIndex((zone) => zone.id === id)
      if (index >= 0) {
        draft.zones[index] = { ...draft.zones[index], ...updates }
        if (updates.zoneType) {
          draft.zones[index].zone_type = updates.zoneType
        }
      }
      return draft
    })
  }, [stageScene])

  const handleUpdateRack = useCallback((id, updates) => {
    stageScene((draft) => {
      const index = draft.racks.findIndex((rack) => rack.id === id)
      if (index >= 0) {
        draft.racks[index] = { ...draft.racks[index], ...updates }
        if (updates.finish) {
          draft.racks[index].finish = updates.finish
        }
      }
      return draft
    })
  }, [stageScene])

  const handleAddRack = useCallback((templateId, position) => {
    stageScene((draft) => {
      if (!draft.racks) draft.racks = []

      const maxId = draft.racks.reduce((max, rack) => {
        const num = parseInt(String(rack.id).replace(/\D/g, ''), 10)
        return !Number.isNaN(num) && num > max ? num : max
      }, 0)
      const newId = `R${String(maxId + 1).padStart(3, '0')}`

      draft.racks.push({
        id: newId,
        name: `新建货架 ${newId}`,
        rack_template_id: templateId,
        outer_dimensions_mm: { width_mm: 2400, height_mm: 3200, depth_mm: 1000 },
        position_mm: { x: position.x / MM_TO_SCENE, y: 0, z: position.z / MM_TO_SCENE },
        finish: 'steel',
      })
      return draft
    })
    setMode('select')
  }, [setMode, stageScene])

  const handleDeleteEntity = useCallback(() => {
    if (!selection?.id) return
    stageScene((draft) => {
      if (selection.type === 'zone') {
        draft.zones = draft.zones.filter((zone) => zone.id !== selection.id)
      } else if (selection.type === 'rack') {
        draft.racks = draft.racks.filter((rack) => rack.id !== selection.id)
      } else if (selection.type === 'prefab') {
        draft.prefabs = (draft.prefabs || []).filter((prefab) => prefab.id !== selection.id)
      } else if (selection.type === 'wall') {
        draft.walls = (draft.walls || []).filter((wall) => wall.id !== selection.id)
      } else if (selection.type === 'structure') {
        draft.structures = (draft.structures || []).filter((structure) => structure.id !== selection.id)
      }
      return draft
    })
    selectEntity(null, null)
  }, [selection, stageScene, selectEntity])

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT' || event.target.tagName === 'TEXTAREA') return
      const key = event.key.toLowerCase()
      if (key === 'v') setMode('select')
      else if (key === 'w') setMode('wall')
      else if (key === 'e') setMode('door')
      else if (key === 'q') setMode('window')
      else if (key === 'b') setMode('zone')
      else if (key === 'f') {
        setMode('place')
        setSidebarTab('furnish')
        if (!catalogOpen) toggleCatalog()
      }
      else if (key === 'd') setMode('delete')
      else if (key === 'c') setMode('column')
      else if (key === 's') setMode('stair')
      else if (key === 'm') {
        setMode('measure')
        setMeasurementMode('distance')
      }
      else if (event.key === 'PageUp') {
        const currentIndex = levels.findIndex((level) => level.id === activeLevelId)
        if (currentIndex < levels.length - 1) {
          setActiveLevel(levels[currentIndex + 1].id)
        }
      }
      else if (event.key === 'PageDown') {
        const currentIndex = levels.findIndex((level) => level.id === activeLevelId)
        if (currentIndex > 0) {
          setActiveLevel(levels[currentIndex - 1].id)
        }
      }
      else if (key === 'escape') {
        setMode('select')
        setPaintMode(null)
        selectEntity(null, null)
      }
      else if (key === 'delete' || key === 'backspace') {
        if (selection?.id && selection?.type !== 'warehouse') handleDeleteEntity()
      }
      else if ((event.ctrlKey || event.metaKey) && key === 'z') {
        event.preventDefault()
        event.shiftKey ? redo() : undo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeLevelId, catalogOpen, handleDeleteEntity, levels, redo, selectEntity, selection, setActiveLevel, setMeasurementMode, setMode, setPaintMode, setSidebarTab, toggleCatalog, undo])

  const handleAddZone = useCallback((position) => {
    stageScene((draft) => {
      if (!draft.zones) draft.zones = []
      const maxId = draft.zones.reduce((max, zone) => {
        const num = parseInt(String(zone.id).replace(/\D/g, ''), 10)
        return !Number.isNaN(num) && num > max ? num : max
      }, 0)
      const newId = `Z${String(maxId + 1).padStart(3, '0')}`
      const isEvent = sceneType === 'outdoor-event'
      draft.zones.push({
        id: newId,
        code: newId,
        name: `${isEvent ? '功能区' : '区域'} ${newId}`,
        zone_type: isEvent ? 'event_area' : 'general',
        bounds_mm: {
          x: position.x / MM_TO_SCENE,
          y: 0,
          z: position.z / MM_TO_SCENE,
          width_mm: isEvent ? 5000 : 6000,
          height_mm: 600,
          depth_mm: isEvent ? 5000 : 4000,
        },
      })
      return draft
    })
    setMode('select')
  }, [sceneType, setMode, stageScene])

  const handleAddPrefab = useCallback((prefabId, position) => {
    stageScene((draft) => {
      if (!draft.prefabs) draft.prefabs = []
      const maxId = draft.prefabs.reduce((max, prefab) => {
        const num = parseInt(String(prefab.id).replace(/\D/g, ''), 10)
        return !Number.isNaN(num) && num > max ? num : max
      }, 0)
      const meta = getPrefabById(prefabId)
      draft.prefabs.push({
        id: `P${String(maxId + 1).padStart(3, '0')}`,
        name: `${meta?.name || '预制物'} P${maxId + 1}`,
        prefabId,
        position: { x: position.x, y: 0, z: position.z },
        rotationDeg: 0,
        color: null,
      })
      return draft
    })
    setMode('select')
  }, [setMode, stageScene])

  const handleAddWall = useCallback((start, end) => {
    stageScene((draft) => {
      if (!draft.walls) draft.walls = []
      const maxId = draft.walls.reduce((max, wall) => {
        const num = parseInt(String(wall.id).replace(/\D/g, ''), 10)
        return !Number.isNaN(num) && num > max ? num : max
      }, 0)
      const newId = `W${String(maxId + 1).padStart(3, '0')}`
      draft.walls.push({
        id: newId,
        start: { x: start.x, z: start.z },
        end: { x: end.x, z: end.z },
        height: 2.8,
        thickness: 0.2,
        material: 'concrete',
        openings: [],
      })
      return draft
    })
  }, [stageScene])

  const handleAddOpening = useCallback((wallId, opening) => {
    stageScene((draft) => {
      const wall = draft.walls?.find((item) => item.id === wallId)
      if (!wall) return draft
      if (!wall.openings) wall.openings = []
      wall.openings.push(opening)
      return draft
    })
  }, [stageScene])

  const handleAddStructure = useCallback((structure) => {
    stageScene((draft) => {
      if (!draft.structures) draft.structures = []
      draft.structures.push(structure)
      return draft
    })
    setMode('select')
  }, [setMode, stageScene])

  const selectedEntity = useMemo(() => {
    if (!selection?.id) return null
    if (selection.type === 'zone') return activeZones.find((zone) => zone.id === selection.id) || null
    if (selection.type === 'rack') return activeRacks.find((rack) => rack.id === selection.id) || null
    if (selection.type === 'prefab') return activePrefabs.find((prefab) => prefab.id === selection.id) || null
    if (selection.type === 'location') return activeLocations.find((location) => location.id === selection.id) || null
    if (selection.type === 'wall') return activeWalls.find((wall) => wall.id === selection.id) || null
    if (selection.type === 'structure') return activeStructures.find((structure) => structure.id === selection.id) || null
    if (selection.type === 'warehouse') return activeWarehouse
    return null
  }, [selection, activeZones, activeRacks, activePrefabs, activeLocations, activeWalls, activeStructures, activeWarehouse])

  const sceneConfig = getSceneConfig(sceneType)

  const treeNodes = useMemo(() => {
    if (sidebarTab === 'structure' || sidebarTab === 'zones') {
      return activeZones.map((zone) => ({
        id: zone.id,
        type: 'zone',
        label: readValue(zone, 'code') || readValue(zone, 'name') || `${sceneConfig.areaLabel} ${zone.id}`,
        color: '#64748B',
      }))
    }
    if (sidebarTab === 'furnish') {
      const rackNodes = activeRacks.map((rack) => ({
        id: rack.id,
        type: 'rack',
        label: readValue(rack, 'code') || readValue(rack, 'name') || `Rack ${rack.id}`,
        color: '#6366F1',
      }))
      const prefabNodes = activePrefabs.map((prefab) => ({
        id: prefab.id,
        type: 'prefab',
        label: prefab.name || `Prefab ${prefab.id}`,
        color: '#10B981',
      }))
      return [...rackNodes, ...prefabNodes]
    }
    return []
  }, [activePrefabs, activeRacks, activeZones, sceneConfig, sidebarTab])

  const shortcutHints = useMemo(() => {
    const isEvent = sceneType === 'outdoor-event'
    const items = [
      { key: 'V', desc: '选择模式' },
      { key: 'W', desc: '画墙' },
      { key: 'E', desc: '放门' },
      { key: 'Q', desc: '放窗' },
      { key: 'C', desc: '放柱' },
      { key: 'S', desc: '放楼梯' },
      { key: 'M', desc: '测量' },
      { key: 'B', desc: isEvent ? '画功能区' : '建造区域' },
      { key: 'F', desc: isEvent ? '放预制物' : '放货架' },
      { key: 'D', desc: '删除' },
      { key: 'Esc', desc: '取消' },
    ]
    if (mode === 'place') items.push({ key: 'R', desc: '旋转' })
    return items
  }, [mode, sceneType])

  const projectName = readValue(activeWarehouse, 'name') || '未命名项目'
  const sourceLabel = sourceContext?.label ? `${projectName} · ${sourceContext.label}` : projectName
  const warehouseDimensionsMm = readValue(activeWarehouse, 'dimensions_mm', 'dimensionsMm') || {}
  const workspaceDimensions = useMemo(() => ({
    width: Number(readValue(warehouseDimensionsMm, 'width_mm', 'widthMm') || 24000) / 1000,
    depth: Number(readValue(warehouseDimensionsMm, 'depth_mm', 'depthMm') || 18000) / 1000,
    height: Number(readValue(warehouseDimensionsMm, 'height_mm', 'heightMm') || 9000) / 1000,
  }), [warehouseDimensionsMm])
  const wallPreviewLabel = useMemo(() => {
    if (!wallPreview?.start || !wallPreview?.end) return null
    return formatDistance(distance(wallPreview.start, wallPreview.end))
  }, [wallPreview])

  // embedded 模式不再强制 dark —— CSS .asset-designer--embedded 已自带完整深色主题变量
  const resolvedTheme = theme
  const designerClassName = `asset-designer${resolvedTheme === 'light' ? ' asset-designer--light' : ''}${embedded ? ' asset-designer--embedded' : ''}`

  if (!initialScene) {
    return (
      <div className={designerClassName}>
        <div className="asset-designer__canvas">
          <div className="asset-designer__empty-hint">
            <div className="asset-designer__empty-title">加载项目中</div>
            <div className="asset-designer__empty-sub">正在准备空间画布数据…</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={designerClassName}>
      {/* 跳过导航链接 - 仅在键盘导航时可见 */}
      <a
        href="#asset-designer-canvas"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-designer-panel focus:text-designer-text focus:border focus:border-designer-border focus:rounded"
      >
        跳过导航，直接访问画布
      </a>
      
      <div className="asset-designer__canvas">
        <div className="asset-designer__guide-chip asset-designer__guide-chip--snap">
          <strong>{embedded ? '嵌入式画布' : '地面网格'}</strong>
          <span>{GRID_SIZE}m 自动吸附</span>
        </div>
        <div className="asset-designer__guide-chip asset-designer__guide-chip--scene">
          <strong>尺寸</strong>
          <span>宽 {workspaceDimensions.width.toFixed(1)}m</span>
          <span>深 {workspaceDimensions.depth.toFixed(1)}m</span>
          <span>高 {workspaceDimensions.height.toFixed(1)}m</span>
        </div>
        {mode === 'wall' && (
          <div className="asset-designer__guide-chip asset-designer__guide-chip--wall">
            <strong>画墙参考</strong>
            <span>{wallPreviewLabel || '点击开始，移动时显示长度'}</span>
            <span>自动吸附 {GRID_SIZE}m，Shift 锁定角度</span>
          </div>
        )}
        <AssetDesignerCanvas
          warehouse={activeWarehouse}
          zones={activeZones}
          racks={activeRacks}
          prefabs={activePrefabs}
          walls={activeWalls}
          structures={activeStructures}
          levels={levels}
          activeLevelId={activeLevelId}
          viewMode={viewMode}
          selection={selection}
          onSelectEntity={(type, id) => {
            if (!type) setMode('select')
            selectEntity(type, id)
          }}
          mode={mode}
          paintMode={paintMode}
          activeMaterialId={activeMaterialId}
          activeTemplateId={activeTemplateId}
          activePrefabId={activePrefabId}
          openingMode={openingMode}
          activeOpeningPreset={activeOpeningPreset}
          activeStructurePreset={activeStructurePreset}
          measurements={measurements}
          measurementMode={measurementMode}
          onUpdateZone={handleUpdateZone}
          onUpdateRack={handleUpdateRack}
          onAddRack={handleAddRack}
          onAddPrefab={handleAddPrefab}
          onAddZone={handleAddZone}
          onAddWall={handleAddWall}
          onAddOpening={handleAddOpening}
          onAddStructure={handleAddStructure}
          onAddMeasurement={addMeasurement}
          onWallPreview={(start, end) => setWallPreview(start && end ? { start, end } : null)}
          theme={theme}
          sceneType={sceneType}
        />
      </div>

        <FloatingTopbar
          projectName={projectName}
          onProjectNameChange={handleUpdateProjectName}
          dirty={dirty}
          canUndo={history.length > 0}
          canRedo={future.length > 0}
          onUndo={undo}
          onRedo={redo}
          onSave={handleSave}
          theme={resolvedTheme}
          onToggleTheme={embedded ? undefined : toggleTheme}
          showThemeToggle={!embedded}
          saveTitle={embedded ? '保存仓储画布' : '保存项目'}
        />

      <SceneTree
        warehouseName={sourceLabel}
        activeTab={sidebarTab}
        onTabChange={setSidebarTab}
        nodes={treeNodes}
        selectedId={selection?.id}
        onSelectNode={(type, id) => selectEntity(type, id)}
        onAddAsset={() => {
          if (sidebarTab === 'furnish') {
            setMode('place')
            if (!catalogOpen) toggleCatalog()
          } else if (sidebarTab === 'zones') {
            setMode('zone')
          }
        }}
        onBack={onBack}
      />

      <LevelSelector />

      {mode === 'measure' && (
        <MeasurementPanel
          measurements={measurements}
          onClear={clearMeasurements}
          onDelete={removeMeasurement}
          measurementMode={measurementMode}
          onModeChange={setMeasurementMode}
        />
      )}

      <FloatingToolbar
        mode={mode}
        paintMode={paintMode}
        onModeChange={setMode}
        onToggleCatalog={toggleCatalog}
        catalogOpen={catalogOpen}
        sceneType={sceneType}
        onToggleExportPanel={toggleExportPanel}
        onToggleShareDialog={toggleShareDialog}
      />

      {exportPanelOpen && (
        <ExportPanel onClose={() => toggleExportPanel()} />
      )}

      {shareDialogOpen && (
        <ShareDialog onClose={() => toggleShareDialog()} />
      )}

      {mode === 'paint' && (
        <MaterialPicker
          paintMode={paintMode}
          activeMaterialId={activeMaterialId}
          onPaintModeChange={setPaintMode}
          onMaterialSelect={setActiveMaterial}
        />
      )}

      {catalogOpen && sidebarTab === 'furnish' && mode !== 'paint' && (
        <AssetCatalog
          rackTemplates={rackTemplates}
          onSelectTemplate={(templateId) => selectEntity('rackTemplate', templateId)}
          sceneType={sceneType}
        />
      )}

      {inspectorOpen && selectedEntity && (
        <FloatingInspector
          selection={selection}
          entity={selectedEntity}
          onClose={toggleInspector}
        />
      )}

      <ShortcutHints items={shortcutHints} />
    </div>
  )
}
