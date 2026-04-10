import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clearSceneHistory, useScene } from '@pascal-app/core'
import useViewer from '../../node_modules/@pascal-app/viewer/dist/store/use-viewer.js'
import PascalViewer from './PascalViewer'
import useEditor, { TOOL_TYPES } from './store/useEditor'
import useModelingDocument from './store/useModelingDocument'
import {
  convertEditorDocumentToLegacyScene,
  createEditorDocumentFromWarehouseScene,
  getEditorDocumentStats,
  resolveSketchPlaneForSelection,
} from './model/editorDocument'
import GeometryRenderer from './renderers/GeometryRenderer'
import PropertyInspector from './panels/PropertyInspector'
import SceneTreePanel from './panels/SceneTreePanel'
import SelectTool from './tools/SelectTool'
import SketchTool from './tools/SketchTool'
import PushPullTool from './tools/PushPullTool'
import MoveTool from './tools/MoveTool'
import RotateTool from './tools/RotateTool'
import MeasureTool from './tools/MeasureTool'
import OpeningPlacementTool from './tools/OpeningPlacementTool'

const VIEW_PRESETS = [
  { id: 'iso', label: '轴测' },
  { id: 'top', label: '顶视' },
  { id: 'front', label: '前视' },
  { id: 'right', label: '右视' },
]

function ToolButton({ active, label, onClick, secondary = false }) {
  return (
    <button
      className={`studio-tool-btn ${active ? 'is-active' : ''} ${secondary ? 'is-secondary' : ''}`.trim()}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  )
}

function StudioTools() {
  const activeTool = useEditor((state) => state.activeTool)
  const openingPlacement = useEditor((state) => state.openingPlacement)
  return (
    <>
      {activeTool === TOOL_TYPES.SELECT ? <SelectTool /> : null}
      {activeTool === TOOL_TYPES.SKETCH ? <SketchTool /> : null}
      {activeTool === TOOL_TYPES.PUSHPULL ? <PushPullTool /> : null}
      {activeTool === TOOL_TYPES.MOVE ? <MoveTool /> : null}
      {activeTool === TOOL_TYPES.ROTATE ? <RotateTool /> : null}
      {activeTool === TOOL_TYPES.MEASURE ? <MeasureTool /> : null}
      {openingPlacement ? <OpeningPlacementTool /> : null}
    </>
  )
}

export default function Studio3DApp({
  sceneKey,
  initialScene,
  sceneType = 'warehouse',
  warehouseMeta = {},
  sourceContext,
  focusZoneContext = null,
  compactChrome = false,
  embedded = false,
  onSceneChange,
  onSave,
  onSaveTemplate,
  onSaveAsset,
  onBack,
}) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const sceneLoadedRef = useRef(false)
  const previousSceneKeyRef = useRef(null)
  const setScene = useScene((state) => state.setScene)
  const clearScene = useScene((state) => state.clearScene)

  const activeTool = useEditor((state) => state.activeTool)
  const sketchMode = useEditor((state) => state.sketchMode)
  const dirty = useEditor((state) => state.dirty)
  const viewportView = useEditor((state) => state.viewportView)
  const inferenceHint = useEditor((state) => state.inferenceHint)
  const sceneTreeOpen = useEditor((state) => state.sceneTreeOpen)
  const inspectorOpen = useEditor((state) => state.inspectorOpen)
  const selectionMode = useEditor((state) => state.selectionMode)
  const selectedGeometry = useEditor((state) => state.selectedGeometry)
  const openingPlacement = useEditor((state) => state.openingPlacement)
  const projectName = useEditor((state) => state.projectName)
  const setTool = useEditor((state) => state.setTool)
  const setSketchMode = useEditor((state) => state.setSketchMode)
  const setDirty = useEditor((state) => state.setDirty)
  const setProjectName = useEditor((state) => state.setProjectName)
  const setSceneType = useEditor((state) => state.setSceneType)
  const setViewportView = useEditor((state) => state.setViewportView)
  const setSelectionMode = useEditor((state) => state.setSelectionMode)
  const toggleSceneTree = useEditor((state) => state.toggleSceneTree)
  const toggleInspector = useEditor((state) => state.toggleInspector)
  const resetEditor = useEditor((state) => state.reset)

  const document = useModelingDocument((state) => state.document)
  const loadFromScene = useModelingDocument((state) => state.loadFromScene)
  const deleteSelection = useModelingDocument((state) => state.deleteSelection)
  const createSweepSurface = useModelingDocument((state) => state.createSweepSurface)
  const createLoftSurface = useModelingDocument((state) => state.createLoftSurface)
  const undo = useModelingDocument((state) => state.undo)
  const redo = useModelingDocument((state) => state.redo)

  const cameraMode = useViewer((state) => state.cameraMode)
  const setCameraMode = useViewer((state) => state.setCameraMode)
  const showGrid = useViewer((state) => state.showGrid ?? true)
  const setShowGrid = useViewer((state) => state.setShowGrid)

  const geometryStats = useMemo(() => getEditorDocumentStats(document), [document])
  const activeSketchPlane = useMemo(
    () => resolveSketchPlaneForSelection(document, selectedGeometry),
    [document, selectedGeometry],
  )

  useEffect(() => {
    useViewer.getState().setProjectId(sceneKey || warehouseMeta.id || 'studio-direct')
    return () => useViewer.getState().setProjectId(null)
  }, [sceneKey, warehouseMeta.id])

  useEffect(() => {
    if (sceneLoadedRef.current && previousSceneKeyRef.current === sceneKey) return
    previousSceneKeyRef.current = sceneKey
    sceneLoadedRef.current = true
    clearScene()
    clearSceneHistory()
    setScene({}, [])
    resetEditor()
    loadFromScene(initialScene || { editorDocument: createEditorDocumentFromWarehouseScene(null) })
    setProjectName(warehouseMeta.name || initialScene?.warehouse?.name || '未命名项目')
    setSceneType(sceneType)
    setViewportView('iso')
    setCameraMode('perspective')
    setLoading(false)
  }, [clearScene, initialScene, loadFromScene, resetEditor, sceneKey, sceneType, setCameraMode, setProjectName, setScene, setSceneType, setViewportView, warehouseMeta.name])

  const buildSnapshot = useCallback(() => {
    const legacyScene = convertEditorDocumentToLegacyScene(document, {
      warehouse: initialScene?.warehouse || warehouseMeta || null,
      activeLevelId: initialScene?.activeLevelId || null,
      sceneType,
      name: projectName,
    })
    return {
      ...legacyScene,
      editorDocument: document,
      warehouse: legacyScene.warehouse,
      activeLevelId: legacyScene.activeLevelId,
      sceneType,
    }
  }, [document, initialScene?.activeLevelId, initialScene?.warehouse, projectName, sceneType, warehouseMeta])

  useEffect(() => {
    if (!sceneLoadedRef.current || !onSceneChange) return
    const timer = setTimeout(() => {
      onSceneChange(buildSnapshot())
    }, 250)
    return () => clearTimeout(timer)
  }, [buildSnapshot, onSceneChange])

  const handleSave = useCallback(async () => {
    if (!onSave) return
    setSaving(true)
    try {
      await onSave({ snapshotJson: buildSnapshot() })
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }, [buildSnapshot, onSave, setDirty])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName)) return
      const key = event.key.toLowerCase()
      const chord = event.ctrlKey || event.metaKey
      if (chord && (key === 'y' || (event.shiftKey && key === 'z'))) { event.preventDefault(); redo() }
      else if (chord && key === 'z') { event.preventDefault(); undo() }
      else if (chord && key === 's') { event.preventDefault(); handleSave() }
      else if (!chord && key === 'v') setTool(TOOL_TYPES.SELECT)
      else if (!chord && key === 'l') { setTool(TOOL_TYPES.SKETCH); setSketchMode('line') }
      else if (!chord && key === 'r') { setTool(TOOL_TYPES.SKETCH); setSketchMode('rect') }
      else if (!chord && key === 'a') { setTool(TOOL_TYPES.SKETCH); setSketchMode('arc') }
      else if (!chord && key === 'c') { setTool(TOOL_TYPES.SKETCH); setSketchMode('circle') }
      else if (!chord && key === 'b') { setTool(TOOL_TYPES.SKETCH); setSketchMode('bezier') }
      else if (!chord && key === 'p') setTool(TOOL_TYPES.PUSHPULL)
      else if (!chord && key === 'm') setTool(TOOL_TYPES.MOVE)
      else if (!chord && key === 'q') setTool(TOOL_TYPES.ROTATE)
      else if (!chord && key === 't') setTool(TOOL_TYPES.MEASURE)
      else if (key === 'delete' || key === 'backspace') {
        if (!selectedGeometry) return
        event.preventDefault()
        const result = deleteSelection(selectedGeometry)
        if (result?.deletedCount) {
          useEditor.getState().clearSelectedGeometry()
          setDirty(true)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [deleteSelection, handleSave, redo, selectedGeometry, setDirty, setSketchMode, setTool, undo])

  const handleProjectionToggle = () => {
    if (viewportView === 'top') {
      setCameraMode('orthographic')
      return
    }
    setCameraMode(cameraMode === 'orthographic' ? 'perspective' : 'orthographic')
  }

  const selectionItems = selectedGeometry?.meta?.entityType === 'multi'
    ? selectedGeometry.meta.items || []
    : selectedGeometry ? [selectedGeometry] : []
  const selectedProfileIds = selectionItems
    .map((item) => item.meta?.profileId || (item.meta?.entityType === 'profile' ? item.entityId : null))
    .filter(Boolean)
  const selectedSegmentIds = selectionItems
    .filter((item) => item.meta?.entityType === 'segment')
    .map((item) => item.entityId)
  const handleSweep = () => {
    const profileId = selectedProfileIds[0]
    if (!profileId || !selectedSegmentIds.length) return
    const result = createSweepSurface(profileId, selectedSegmentIds, { historyLabel: '扫掠曲面' })
    if (!result?.error) setDirty(true)
  }
  const handleLoft = () => {
    const profileIds = [...new Set(selectedProfileIds)]
    if (profileIds.length < 2) return
    const result = createLoftSurface(profileIds, { historyLabel: '放样曲面' })
    if (!result?.error) setDirty(true)
  }

  if (loading) {
    return <div className="studio-loading">加载编辑器...</div>
  }

  return (
    <div className="studio-shell">
      <header className={`studio-toolbar ${compactChrome ? 'is-compact' : ''}`.trim()}>
        <div className="studio-toolbar__left">
          {onBack && !embedded ? <button className="studio-link-btn" onClick={onBack} type="button">返回</button> : null}
          <div className="studio-title-block">
            <strong>{projectName}</strong>
            <span>{dirty ? '未保存' : '已保存'} {sourceContext ? `· ${sourceContext.label}` : ''}</span>
          </div>
        </div>

        <div className="studio-toolbar__center">
          <div className="studio-toolbar__group">
            <ToolButton active={activeTool === TOOL_TYPES.SELECT} label="Select" onClick={() => setTool(TOOL_TYPES.SELECT)} />
            <ToolButton active={activeTool === TOOL_TYPES.SKETCH && sketchMode === 'line'} label="Sketch" onClick={() => { setTool(TOOL_TYPES.SKETCH); setSketchMode('line') }} />
            <ToolButton active={activeTool === TOOL_TYPES.SKETCH && sketchMode === 'rect'} label="Rect" onClick={() => { setTool(TOOL_TYPES.SKETCH); setSketchMode('rect') }} secondary />
            <ToolButton active={activeTool === TOOL_TYPES.SKETCH && sketchMode === 'arc'} label="Arc" onClick={() => { setTool(TOOL_TYPES.SKETCH); setSketchMode('arc') }} secondary />
            <ToolButton active={activeTool === TOOL_TYPES.SKETCH && sketchMode === 'circle'} label="Circle" onClick={() => { setTool(TOOL_TYPES.SKETCH); setSketchMode('circle') }} secondary />
            <ToolButton active={activeTool === TOOL_TYPES.SKETCH && sketchMode === 'bezier'} label="Bezier" onClick={() => { setTool(TOOL_TYPES.SKETCH); setSketchMode('bezier') }} secondary />
            <ToolButton active={activeTool === TOOL_TYPES.PUSHPULL} label="Push/Pull" onClick={() => setTool(TOOL_TYPES.PUSHPULL)} />
            <ToolButton active={false} label="Sweep" onClick={handleSweep} secondary />
            <ToolButton active={false} label="Loft" onClick={handleLoft} secondary />
            <ToolButton active={activeTool === TOOL_TYPES.MOVE} label="Move" onClick={() => setTool(TOOL_TYPES.MOVE)} />
            <ToolButton active={activeTool === TOOL_TYPES.ROTATE} label="Rotate" onClick={() => setTool(TOOL_TYPES.ROTATE)} />
            <ToolButton active={activeTool === TOOL_TYPES.MEASURE} label="Measure" onClick={() => setTool(TOOL_TYPES.MEASURE)} />
          </div>

          <div className="studio-toolbar__group">
            {VIEW_PRESETS.map((view) => (
              <ToolButton key={view.id} active={viewportView === view.id} label={view.label} onClick={() => { setViewportView(view.id); setCameraMode(view.id === 'top' ? 'orthographic' : 'perspective') }} />
            ))}
            <ToolButton active={cameraMode === 'orthographic'} label={cameraMode === 'orthographic' ? '平行' : '透视'} onClick={handleProjectionToggle} />
            <ToolButton active={showGrid} label="网格" onClick={() => setShowGrid(!showGrid)} />
          </div>
        </div>

        <div className="studio-toolbar__right">
          <ToolButton active={selectionMode === 'object'} label="对象" onClick={() => setSelectionMode('object')} />
          <ToolButton active={selectionMode === 'face'} label="面" onClick={() => setSelectionMode('face')} />
          <ToolButton active={selectionMode === 'edge'} label="边" onClick={() => setSelectionMode('edge')} />
          <ToolButton active={selectionMode === 'vertex'} label="点" onClick={() => setSelectionMode('vertex')} />
          <button className="studio-link-btn" onClick={toggleSceneTree} type="button">{sceneTreeOpen ? '隐藏树' : '场景树'}</button>
          <button className="studio-link-btn" onClick={toggleInspector} type="button">{inspectorOpen ? '隐藏属性' : '属性'}</button>
          {onSaveTemplate ? <button className="studio-link-btn" onClick={() => onSaveTemplate({ snapshotJson: buildSnapshot() })} type="button">标件</button> : null}
          {onSaveAsset ? <button className="studio-link-btn" onClick={() => onSaveAsset({ snapshotJson: buildSnapshot() })} type="button">资产</button> : null}
          <button className="studio-save-btn" disabled={saving} onClick={handleSave} type="button">{saving ? '保存中...' : '保存'}</button>
        </div>
      </header>

      <div className="studio-main">
        <SceneTreePanel />

        <div className="studio-canvas-shell">
          {focusZoneContext ? (
            <div className="studio-focus-chip">
              Focus Zone · {focusZoneContext.name || '未命名'} · {Math.round(focusZoneContext.boundsMeters?.width || 0)}m × {Math.round(focusZoneContext.boundsMeters?.depth || 0)}m
            </div>
          ) : null}

          {inferenceHint ? (
            <div className="studio-hint" style={{ left: inferenceHint.x, top: inferenceHint.y }}>
              {inferenceHint.label}
            </div>
          ) : null}

          <div className="studio-canvas">
            <PascalViewer
              defaultView="iso"
              referenceMode="bounded"
              sceneBounds={{
                width: Math.max((initialScene?.warehouse?.dimensions_mm?.width_mm || 24000) / 1000, 8),
                depth: Math.max((initialScene?.warehouse?.dimensions_mm?.depth_mm || 18000) / 1000, 8),
                height: Math.max((initialScene?.warehouse?.dimensions_mm?.height_mm || 9000) / 1000, 4),
              }}
              selectionManager="none"
              showAxisGizmo
              showGroundPlane
              toolOverlays={<StudioTools />}
            >
              <GeometryRenderer document={document} />
            </PascalViewer>
          </div>

          <div className="studio-status-bar">
            <span>草图平面: {activeSketchPlane?.name || 'Ground'}</span>
            <span>{geometryStats.vertexCount} 顶点</span>
            <span>{geometryStats.edgeCount} 边</span>
            <span>{geometryStats.faceCount} 面</span>
            <span>{geometryStats.solidCount} 实体</span>
            <span>{geometryStats.surfaceCount} 曲面</span>
            {openingPlacement ? <span>开洞放置: {openingPlacement.type === 'door' ? '门洞' : '窗洞'} · 侧面单击落位</span> : null}
            <span>{selectedGeometry ? `已选: ${selectedGeometry.label}` : '未选择对象'}</span>
          </div>
        </div>

        <PropertyInspector />
      </div>

      <style>{`
        .studio-shell { display: flex; flex-direction: column; height: 100%; background: #e9edf2; color: #1f2d3d; }
        .studio-loading { display: grid; place-items: center; height: 100%; color: #1f2d3d; font-weight: 700; }
        .studio-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 10px; border-bottom: 1px solid #cfd7e2; background: linear-gradient(180deg, #fbfcfd, #eef2f6); }
        .studio-toolbar.is-compact { padding: 6px 8px; gap: 8px; }
        .studio-toolbar__left, .studio-toolbar__center, .studio-toolbar__right { display: flex; align-items: center; gap: 8px; }
        .studio-toolbar__center { flex: 1; justify-content: center; flex-wrap: wrap; }
        .studio-toolbar__group { display: flex; align-items: center; gap: 6px; padding-right: 10px; border-right: 1px solid #d6dde7; }
        .studio-toolbar__group:last-child { border-right: none; padding-right: 0; }
        .studio-title-block { display: grid; gap: 2px; }
        .studio-title-block strong { font-size: 14px; }
        .studio-title-block span { font-size: 11px; color: #5a6a7d; }
        .studio-tool-btn, .studio-link-btn, .studio-save-btn { border: 1px solid #d5dbe4; background: #fff; color: #1f2d3d; min-height: 30px; padding: 0 10px; cursor: pointer; font-size: 12px; font-weight: 700; }
        .studio-tool-btn.is-active { background: #2f5ea5; border-color: #2f5ea5; color: #fff; }
        .studio-tool-btn.is-secondary { opacity: 0.92; }
        .studio-save-btn { background: #edf6ee; border-color: #bfd7c2; color: #2d5a38; }
        .studio-main { display: flex; flex: 1; min-height: 0; }
        .studio-canvas-shell { position: relative; flex: 1; min-width: 0; }
        .studio-canvas { height: 100%; background: linear-gradient(180deg, #f1f4f8, #e7ebf0); }
        .studio-focus-chip { position: absolute; top: 12px; left: 12px; z-index: 20; padding: 6px 10px; background: rgba(249, 250, 252, 0.96); border-left: 3px solid #c59633; border: 1px solid #d8d1c0; font-size: 11px; font-weight: 700; }
        .studio-hint { position: absolute; z-index: 21; transform: translate(12px, -28px); padding: 4px 8px; background: rgba(255,255,255,0.96); border: 1px solid #d1d7e0; font-size: 11px; font-weight: 700; pointer-events: none; }
        .studio-status-bar { position: absolute; left: 0; right: 0; bottom: 0; z-index: 20; display: flex; gap: 10px; flex-wrap: wrap; padding: 5px 8px; background: rgba(248,250,252,0.96); border-top: 1px solid #d1d8e0; font-size: 11px; }
        .scene-tree-panel { width: 220px; border-right: 1px solid #d4dae2; background: linear-gradient(180deg, #f8f9fb, #f2f4f7); display: flex; flex-direction: column; }
        .scene-tree-panel__header { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid #d4dae2; font-size: 12px; }
        .scene-tree-panel__group { display: grid; gap: 6px; padding: 10px 12px; }
        .scene-tree-panel__title { font-size: 11px; color: #607089; text-transform: uppercase; font-weight: 800; letter-spacing: 0.08em; }
        .scene-tree-panel__item { border: 1px solid #d5dbe4; background: #fff; text-align: left; padding: 6px 8px; font-size: 12px; cursor: pointer; }
        .scene-tree-panel__item.is-active { background: #2f5ea5; border-color: #2f5ea5; color: #fff; }
        .property-inspector { width: 260px; border-left: 1px solid #d4dae2; background: linear-gradient(180deg, #f9fafc, #f3f5f8); display: flex; flex-direction: column; }
        .property-inspector__header { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid #d4dae2; font-size: 12px; }
        .property-inspector__body, .property-inspector__empty { display: grid; gap: 10px; padding: 12px; font-size: 12px; }
        .pi-field { display: grid; gap: 4px; }
        .pi-field__label { font-size: 11px; color: #607089; text-transform: uppercase; font-weight: 800; letter-spacing: 0.08em; }
        .pi-input, .pi-field__readonly { min-height: 32px; border: 1px solid #d5dbe4; background: #fff; padding: 0 10px; display: flex; align-items: center; }
        .pi-opening-actions { display: flex; gap: 8px; flex-wrap: wrap; }
        .pi-placement-banner { display: grid; gap: 4px; padding: 9px 10px; border: 1px solid #ddc49a; background: linear-gradient(180deg, #fff8e8, #f4ead1); color: #5b420f; }
        .pi-placement-banner strong { font-size: 12px; }
        .pi-placement-banner span { font-size: 11px; line-height: 1.45; }
        .pi-opening-list { display: grid; gap: 8px; }
        .pi-opening-item { display: flex; justify-content: space-between; gap: 10px; align-items: center; padding: 8px 10px; border: 1px solid #d5dbe4; background: #fff; }
        .pi-opening-item strong { display: block; margin-bottom: 2px; }
        @media (max-width: 1280px) {
          .studio-toolbar { flex-direction: column; align-items: stretch; }
          .studio-toolbar__center { justify-content: flex-start; }
          .property-inspector, .scene-tree-panel { width: 220px; }
        }
      `}</style>
    </div>
  )
}
