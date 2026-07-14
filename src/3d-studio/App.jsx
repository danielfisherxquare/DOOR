import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { clearSceneHistory, useScene } from '@pascal-app/core'
import useViewer from '../../node_modules/@pascal-app/viewer/dist/store/use-viewer.js'
import PascalViewer from './PascalViewer'
import useEditor, { TOOL_TYPES } from './store/useEditor'
import useModelingDocument from './store/useModelingDocument'
import {
  convertEditorDocumentToLegacyScene,
  createEditorDocumentFromWarehouseScene,
  getEditorDocumentStats,
  normalizeEditorDocument,
  resolveSketchPlaneForSelection,
} from './model/editorDocument'
import GeometryRenderer from './renderers/GeometryRenderer'
import SiteBackdrop from './renderers/SiteBackdrop'
import PropertyInspector from './panels/PropertyInspector'
import SceneTreePanel from './panels/SceneTreePanel'
import SelectTool from './tools/SelectTool'
import SketchTool from './tools/SketchTool'
import PushPullTool from './tools/PushPullTool'
import MoveTool from './tools/MoveTool'
import RotateTool from './tools/RotateTool'
import MeasureTool from './tools/MeasureTool'
import OpeningPlacementTool from './tools/OpeningPlacementTool'
import {
  pickStudioSaveEnvelope,
  planDirtySave,
  planStudioSaveSuccess,
  shouldRetainStudioSaveEnvelope,
} from './savePersistence'

const VIEW_PRESETS = [
  { id: 'iso', label: '轴测' },
  { id: 'top', label: '顶视' },
  { id: 'front', label: '前视' },
  { id: 'right', label: '右视' },
]

const FOCUS_ZONE_IMPORT_LABELS = {
  current: 'GIS 源数据一致',
  stale: 'GIS 源数据已变化',
  unknown: '来源状态未知',
  missing: '未生成白模',
}

const GIS_PREVIEW_MAX_BUILDING_MAJOR_METERS = 240
const GIS_PREVIEW_MAX_BUILDING_AREA_SQM = 20000
const GIS_PREVIEW_MAX_RIBBON_MAJOR_METERS = 120
const GIS_PREVIEW_MAX_RIBBON_ASPECT_RATIO = 12

function isRevisionConflictError(error) {
  return Boolean(
    error
    && typeof error === 'object'
    && error.status === 409
    && (error.code === 'REVISION_CONFLICT'
      || error.apiCode === 'REVISION_CONFLICT'
      || error.response?.data?.code === 'REVISION_CONFLICT')
  )
}

function getSaveStatusLabel({ status, revision, lastSavedAt, sourceContext }) {
  const sourceLabel = sourceContext ? ` · ${sourceContext.label}` : ''
  if (status === 'readonly') return `本地预览 · 修改不会保存${sourceLabel}`
  if (status === 'saving') return `正在保存…${sourceLabel}`
  if (status === 'conflict') return `版本冲突 · 远端已有新版本${sourceLabel}`
  if (status === 'error') return `保存失败 · 修改仍保留${sourceLabel}`
  if (status === 'dirty') return `有未保存修改${sourceLabel}`
  const revisionLabel = revision > 0 ? ` · r${revision}` : ''
  const timeLabel = lastSavedAt
    ? ` · ${new Date(lastSavedAt).toLocaleTimeString('zh-CN', { hour12: false })}`
    : ''
  return `已保存${revisionLabel}${timeLabel}${sourceLabel}`
}

function ToolButton({ active, label, onClick, secondary = false, title = '' }) {
  return (
    <button
      className={`studio-tool-btn ${active ? 'is-active' : ''} ${secondary ? 'is-secondary' : ''}`.trim()}
      onClick={onClick}
      type="button"
      aria-pressed={active}
      title={title || label}
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

function projectIsoPoint(point) {
  const [x, y, z] = point
  return [(x - z) * 0.58, (x + z) * 0.3 - y * 3.6]
}

function getPlanarBounds(points) {
  if (!points.length) return { width: 0, depth: 0 }
  const xs = points.map((point) => point.x)
  const zs = points.map((point) => point.z)
  return {
    width: Math.max(...xs) - Math.min(...xs),
    depth: Math.max(...zs) - Math.min(...zs),
  }
}

function getPlanarArea(points) {
  let area = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    area += current.x * next.z - next.x * current.z
  }
  return Math.abs(area) / 2
}

function isGisOsmSolid(solid) {
  return (
    solid?.metadata?.compatType === 'osm-building' ||
    solid?.metadata?.objectType === 'osm_building' ||
    Boolean(solid?.metadata?.osmId)
  )
}

function isUsablePreviewSolid(solid, footprint) {
  if (!isGisOsmSolid(solid)) return true
  const bounds = getPlanarBounds(footprint)
  const major = Math.max(bounds.width, bounds.depth)
  const minor = Math.max(Math.min(bounds.width, bounds.depth), 0.01)
  const area = getPlanarArea(footprint)
  if (major > GIS_PREVIEW_MAX_BUILDING_MAJOR_METERS) return false
  if (area > GIS_PREVIEW_MAX_BUILDING_AREA_SQM) return false
  if (
    major > GIS_PREVIEW_MAX_RIBBON_MAJOR_METERS &&
    major / minor > GIS_PREVIEW_MAX_RIBBON_ASPECT_RATIO
  )
    return false
  return true
}

function terrainGridSize(mesh, vertexCount) {
  const rows = Number(mesh?.metadata?.rows || mesh?.rows || 0)
  const cols = Number(mesh?.metadata?.cols || mesh?.cols || 0)
  if (rows >= 2 && cols >= 2 && rows * cols === vertexCount) return { rows, cols }
  const square = Math.sqrt(vertexCount)
  if (Number.isInteger(square) && square >= 2) return { rows: square, cols: square }
  return { rows: 0, cols: 0 }
}

function GisWhiteModelPreview({ document, onOpenInteractive }) {
  const canvasRef = useRef(null)
  const preview = useMemo(() => {
    const normalized = normalizeEditorDocument(document)
    const vertexById = new Map(normalized.vertices.map((vertex) => [vertex.id, vertex]))
    const profileById = new Map(normalized.profiles.map((profile) => [profile.id, profile]))
    let hiddenSolids = 0
    const solids = normalized.solids
      .map((solid) => {
        const profile = profileById.get(solid.profileId)
        const vertexIds = Array.isArray(profile?.vertexIds) ? profile.vertexIds.filter(Boolean) : []
        const cycle =
          vertexIds.length > 1 && vertexIds[0] === vertexIds[vertexIds.length - 1]
          ? vertexIds.slice(0, -1)
          : vertexIds
        const footprint = cycle.map((vertexId) => vertexById.get(vertexId)).filter(Boolean)
        if (footprint.length < 3) return null
        if (!isUsablePreviewSolid(solid, footprint)) {
          hiddenSolids += 1
          return null
        }
        const baseY = Number(solid.baseElevation) || 0
        const height = Math.max(Number(solid.height) || 0.1, 0.1)
        const base = footprint.map((vertex) => [vertex.x, baseY, vertex.z])
        const top = footprint.map((vertex) => [vertex.x, baseY + height, vertex.z])
        const sortKey =
          footprint.reduce((sum, vertex) => sum + vertex.x + vertex.z, 0) / footprint.length
        return {
          id: solid.id,
          name: solid.name,
          base,
          top,
          sortKey,
        }
      })
      .filter(Boolean)
      .sort((left, right) => left.sortKey - right.sortKey)
    const terrains = normalized.terrainMeshes
      .map((mesh) => {
        const points = []
        for (let index = 0; index < (mesh.vertices || []).length; index += 3) {
          const x = Number(mesh.vertices[index])
          const y = Number(mesh.vertices[index + 1])
          const z = Number(mesh.vertices[index + 2])
          if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) points.push([x, y, z])
        }
        const grid = terrainGridSize(mesh, points.length)
        if (points.length < 3) return null
        const heights = points.map((point) => point[1])
        return {
          id: mesh.id,
          color: mesh.color || '#d9e4d0',
          points,
          rows: grid.rows,
          cols: grid.cols,
          minY: Math.min(...heights),
          maxY: Math.max(...heights),
        }
      })
      .filter(Boolean)

    const projected = []
    terrains.forEach((terrain) => {
      terrain.points.forEach((point) => projected.push(projectIsoPoint(point)))
    })
    solids.forEach((solid) => {
      solid.base.forEach((point) => projected.push(projectIsoPoint(point)))
      solid.top.forEach((point) => projected.push(projectIsoPoint(point)))
    })

    if (!projected.length) {
      return {
        bounds: { height: 200, minX: -100, minY: -100, width: 200 },
        hiddenSolids,
        solids: [],
        terrains: [],
      }
    }

    const minX = Math.min(...projected.map((point) => point[0]))
    const maxX = Math.max(...projected.map((point) => point[0]))
    const minY = Math.min(...projected.map((point) => point[1]))
    const maxY = Math.max(...projected.map((point) => point[1]))
    const padding = Math.max((maxX - minX) * 0.06, (maxY - minY) * 0.06, 24)

    return {
      bounds: {
        height: Math.max(maxY - minY + padding * 2, 1),
        minX: minX - padding,
        minY: minY - padding,
        width: Math.max(maxX - minX + padding * 2, 1),
      },
      hiddenSolids,
      solids,
      terrains,
    }
  }, [document])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const width = Math.max(Math.floor(rect.width), 1)
    const height = Math.max(Math.floor(rect.height), 1)
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(height * dpr)
    const context = canvas.getContext('2d')
    if (!context) return

    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.clearRect(0, 0, width, height)

    const gradient = context.createLinearGradient(0, 0, width, height)
    gradient.addColorStop(0, '#eef3f8')
    gradient.addColorStop(1, '#f8fafc')
    context.fillStyle = gradient
    context.fillRect(0, 0, width, height)

    context.strokeStyle = '#d9e2ec'
    context.lineWidth = 1
    for (let x = 0; x < width; x += 28) {
      context.beginPath()
      context.moveTo(x, 0)
      context.lineTo(x, height)
      context.stroke()
    }
    for (let y = 0; y < height; y += 28) {
      context.beginPath()
      context.moveTo(0, y)
      context.lineTo(width, y)
      context.stroke()
    }

    const scale = Math.min(width / preview.bounds.width, height / preview.bounds.height)
    const offsetX = (width - preview.bounds.width * scale) / 2
    const offsetY = (height - preview.bounds.height * scale) / 2
    const toCanvas = (point) => [
      offsetX + (point[0] - preview.bounds.minX) * scale,
      offsetY + (point[1] - preview.bounds.minY) * scale,
    ]
    const drawPolygon = (points, fill, stroke = '#6b7280', alpha = 1) => {
      if (points.length < 3) return
      context.save()
      context.globalAlpha = alpha
      context.beginPath()
      const first = toCanvas(points[0])
      context.moveTo(first[0], first[1])
      for (let index = 1; index < points.length; index += 1) {
        const point = toCanvas(points[index])
        context.lineTo(point[0], point[1])
      }
      context.closePath()
      context.fillStyle = fill
      context.fill()
      context.strokeStyle = stroke
      context.lineWidth = 0.8
      context.stroke()
      context.restore()
    }
    const drawPolyline = (points, stroke = '#8ea08b', alpha = 0.24) => {
      if (points.length < 2) return
      context.save()
      context.globalAlpha = alpha
      context.beginPath()
      const first = toCanvas(points[0])
      context.moveTo(first[0], first[1])
      for (let index = 1; index < points.length; index += 1) {
        const point = toCanvas(points[index])
        context.lineTo(point[0], point[1])
      }
      context.strokeStyle = stroke
      context.lineWidth = 0.8
      context.stroke()
      context.restore()
    }

    preview.terrains.forEach((terrain) => {
      const { rows, cols, points } = terrain
      if (rows < 2 || cols < 2 || points.length < rows * cols) {
        drawPolygon(points.map(projectIsoPoint), '#d9e4d0', '#8ea08b', 0.42)
        return
      }

      const stride = Math.max(1, Math.ceil(Math.max(rows, cols) / 28))
      const heightRange = Math.max(terrain.maxY - terrain.minY, 0.001)
      for (let row = 0; row < rows - 1; row += stride) {
        for (let col = 0; col < cols - 1; col += stride) {
          const nextRow = Math.min(row + stride, rows - 1)
          const nextCol = Math.min(col + stride, cols - 1)
          const cell = [
            points[row * cols + col],
            points[row * cols + nextCol],
            points[nextRow * cols + nextCol],
            points[nextRow * cols + col],
          ].filter(Boolean)
          if (cell.length < 4) continue
          const heightWeight =
            cell.reduce((sum, point) => sum + (point[1] - terrain.minY) / heightRange, 0) /
            cell.length
          const green = Math.round(188 + heightWeight * 22)
          const blue = Math.round(176 - heightWeight * 18)
          drawPolygon(cell.map(projectIsoPoint), `rgb(206,${green},${blue})`, '#9aae92', 0.48)
        }
      }

      for (let row = 0; row < rows; row += stride * 2) {
        drawPolyline(
          Array.from({ length: cols }, (_, col) =>
            projectIsoPoint(points[row * cols + col])
          ).filter(Boolean)
        )
      }
      for (let col = 0; col < cols; col += stride * 2) {
        drawPolyline(
          Array.from({ length: rows }, (_, row) =>
            projectIsoPoint(points[row * cols + col])
          ).filter(Boolean)
        )
      }
    })

    preview.solids.forEach((solid) => {
      const base = solid.base.map(projectIsoPoint)
      const top = solid.top.map(projectIsoPoint)
      for (let index = 0; index < base.length; index += 1) {
        const next = (index + 1) % base.length
        drawPolygon(
          [base[index], base[next], top[next], top[index]],
          index % 2 === 0 ? '#b8c2cf' : '#aab6c4',
          '#7b8794',
          0.92
        )
      }
      drawPolygon(top, '#dce5ef', '#475569', 1)
    })
  }, [preview])

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #eef3f8 0%, #f8fafc 100%)',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
        width: '100%',
      }}
    >
      <canvas
        aria-label="GIS 白模轻量预览"
        ref={canvasRef}
        style={{ display: 'block', height: '100%', width: '100%' }}
      />
      <div
        style={{
          background: 'rgba(255,255,255,0.88)',
          border: '1px solid #d8dee8',
          boxShadow: '0 12px 36px rgba(15,23,42,0.12)',
          left: 18,
          padding: '14px 16px',
          position: 'absolute',
          top: 18,
        }}
      >
        <div
          style={{
            color: '#b7791f',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.08em',
            marginBottom: 6,
          }}
        >
          GIS 白模预览
        </div>
        <div style={{ color: '#0f172a', fontSize: 18, fontWeight: 800, marginBottom: 6 }}>
          {preview.solids.length} 个建筑实体
        </div>
        <div style={{ color: '#475569', fontSize: 13, lineHeight: 1.55, maxWidth: 310 }}>
          已加载 {preview.terrains.length} 个地形网格
          {preview.hiddenSolids > 0 ? `，隐藏 ${preview.hiddenSolids} 个异常 OSM 轮廓` : ''}。大范围
          GIS 场景默认使用轻量预览，避免 WebGL 首帧卡死。
        </div>
        <button
          onClick={onOpenInteractive}
          style={{
            background: '#111827',
            border: 0,
            color: '#fff',
            cursor: 'pointer',
            fontWeight: 700,
            marginTop: 12,
            padding: '9px 12px',
          }}
          type="button"
        >
          进入完整 3D 编辑
        </button>
      </div>
    </div>
  )
}

function computeDocumentSceneBounds(document, initialScene = null) {
  const fallback = {
    width: Math.max((initialScene?.warehouse?.dimensions_mm?.width_mm || 24000) / 1000, 8),
    depth: Math.max((initialScene?.warehouse?.dimensions_mm?.depth_mm || 18000) / 1000, 8),
    height: Math.max((initialScene?.warehouse?.dimensions_mm?.height_mm || 9000) / 1000, 4),
  }
  const bounds = {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY,
  }
  const includePoint = (x, y, z) => {
    const nextX = Number(x)
    const nextY = Number(y)
    const nextZ = Number(z)
    if (!Number.isFinite(nextX) || !Number.isFinite(nextY) || !Number.isFinite(nextZ)) return
    bounds.minX = Math.min(bounds.minX, nextX)
    bounds.maxX = Math.max(bounds.maxX, nextX)
    bounds.minY = Math.min(bounds.minY, nextY)
    bounds.maxY = Math.max(bounds.maxY, nextY)
    bounds.minZ = Math.min(bounds.minZ, nextZ)
    bounds.maxZ = Math.max(bounds.maxZ, nextZ)
  }

  document?.vertices?.forEach((vertex) => includePoint(vertex.x, vertex.y, vertex.z))
  document?.solids?.forEach((solid) => {
    includePoint(0, Number(solid.baseElevation) || 0, 0)
    includePoint(0, (Number(solid.baseElevation) || 0) + Math.max(Number(solid.height) || 0, 0), 0)
  })
  document?.terrainMeshes?.forEach((mesh) => {
    for (let index = 0; index < (mesh.vertices || []).length; index += 3) {
      includePoint(mesh.vertices[index], mesh.vertices[index + 1], mesh.vertices[index + 2])
    }
  })
  document?.instances?.forEach((instance) => {
    const [x = 0, y = 0, z = 0] = instance.position || []
    const [width = 1, height = 1, depth = 1] = instance.size || []
    includePoint(x - width / 2, y - height / 2, z - depth / 2)
    includePoint(x + width / 2, y + height / 2, z + depth / 2)
  })

  if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.maxX)) {
    return {
      ...fallback,
      centerX: fallback.width / 2,
      centerY: 0,
      centerZ: fallback.depth / 2,
    }
  }

  const width = Math.max(bounds.maxX - bounds.minX, fallback.width, 8)
  const depth = Math.max(bounds.maxZ - bounds.minZ, fallback.depth, 8)
  const height = Math.max(bounds.maxY - bounds.minY, fallback.height, 4)
  return {
    width,
    depth,
    height,
    centerX: (bounds.minX + bounds.maxX) / 2,
    centerY: (bounds.minY + bounds.maxY) / 2,
    centerZ: (bounds.minZ + bounds.maxZ) / 2,
  }
}

export default function Studio3DApp({
  sceneKey,
  initialScene,
  sceneType = 'warehouse',
  warehouseMeta = {},
  sourceContext,
  siteBackdrop = null,
  siteBackdropReloadToken = 0,
  onSiteBackdropImageryRuntimeChange,
  focusZoneContext = null,
  focusZoneObjectsContext = [],
  focusZoneObjectSummary = null,
  focusZoneSceneImportState = null,
  compactChrome = false,
  embedded = false,
  onSceneChange,
  onSave,
  onSaveTemplate,
  onSaveAsset,
  onBack,
  autoSaveDelayMs = 0,
  saveRevision = 0,
  onSaveStateChange,
  externalSaveConflict = false,
  externalMutationRef,
}) {
  const canSave = Boolean(onSave)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState(canSave ? 'saved' : 'readonly')
  const [saveError, setSaveError] = useState(null)
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [activeRevision, setActiveRevision] = useState(Number(saveRevision) || 0)
  const [operationLocked, setOperationLocked] = useState(false)
  const sceneLoadedRef = useRef(false)
  const previousSceneKeyRef = useRef(null)
  const lastSceneChangeDocumentRef = useRef(null)
  const saveInFlightRef = useRef(false)
  const savePromiseRef = useRef(null)
  const pendingSaveEnvelopeRef = useRef(null)
  const queuedSaveRef = useRef(false)
  const autoSaveTimerRef = useRef(null)
  const handleSaveRef = useRef(null)
  const saveStatusRef = useRef(canSave ? 'saved' : 'readonly')
  const revisionRef = useRef(Number(saveRevision) || 0)
  const operationLockRef = useRef(false)
  const sceneGenerationRef = useRef(0)
  const setScene = useScene((state) => state.setScene)
  const clearScene = useScene((state) => state.clearScene)

  const activeTool = useEditor((state) => state.activeTool)
  const sketchMode = useEditor((state) => state.sketchMode)
  const dirty = useEditor((state) => state.dirty)
  const changeVersion = useEditor((state) => state.changeVersion)
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
  const markSaved = useEditor((state) => state.markSaved)
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
  const sceneViewportBounds = useMemo(
    () => computeDocumentSceneBounds(document, initialScene),
    [document, initialScene]
  )
  // 场地模式下 OSM 白模走只读底图层（不进 editorDocument），故按可编辑实体计数；
  // 同时底图存在时强制交互视图，避免因地形网格顶点数触发静态 2D 退化。
  const useLightweightViewer =
    !siteBackdrop && (geometryStats.solidCount > 120 || geometryStats.vertexCount > 1500)
  const [forceInteractiveViewer, setForceInteractiveViewer] = useState(false)
  const showStaticGisPreview = useLightweightViewer && !forceInteractiveViewer
  const enableViewerBvh = !useLightweightViewer
  const focusZoneObjectCount = focusZoneObjectSummary?.total ?? focusZoneObjectsContext.length
  const focusZoneSceneSource =
    initialScene?.editorDocument?.metadata?.source || initialScene?.metadata?.source || null
  const focusZoneImportLabel = focusZoneSceneImportState
    ? FOCUS_ZONE_IMPORT_LABELS[focusZoneSceneImportState] || focusZoneSceneImportState
    : null
  const activeSketchPlane = useMemo(
    () => resolveSketchPlaneForSelection(document, selectedGeometry),
    [document, selectedGeometry]
  )

  useEffect(() => {
    useViewer.getState().setProjectId(sceneKey || warehouseMeta.id || 'studio-direct')
    return () => useViewer.getState().setProjectId(null)
  }, [sceneKey, warehouseMeta.id])

  const updateSaveStatus = useCallback((nextStatus) => {
    saveStatusRef.current = nextStatus
    setSaveStatus(nextStatus)
  }, [])

  useEffect(() => {
    const nextRevision = Number(saveRevision) || 0
    revisionRef.current = nextRevision
    setActiveRevision(nextRevision)
  }, [saveRevision])

  useEffect(() => {
    if (!externalSaveConflict) return
    window.clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = null
    queuedSaveRef.current = false
    pendingSaveEnvelopeRef.current = null
    setSaveError('远端项目已有新版本')
    updateSaveStatus('conflict')
  }, [externalSaveConflict, updateSaveStatus])

  useEffect(() => {
    onSaveStateChange?.({
      status: saveStatus,
      revision: activeRevision,
      lastSavedAt,
      error: saveError,
      dirty,
      changeVersion,
    })
  }, [activeRevision, changeVersion, dirty, lastSavedAt, onSaveStateChange, saveError, saveStatus])

  useEffect(() => {
    if (sceneLoadedRef.current && previousSceneKeyRef.current === sceneKey) return
    previousSceneKeyRef.current = sceneKey
    sceneGenerationRef.current += 1
    sceneLoadedRef.current = true
    lastSceneChangeDocumentRef.current = null
    clearScene()
    clearSceneHistory()
    setScene({}, [])
    resetEditor()
    loadFromScene(initialScene || { editorDocument: createEditorDocumentFromWarehouseScene(null) })
    setProjectName(warehouseMeta.name || initialScene?.warehouse?.name || '未命名项目')
    setSceneType(sceneType)
    setViewportView('iso')
    setCameraMode('perspective')
    updateSaveStatus(canSave ? 'saved' : 'readonly')
    setSaveError(null)
    setLastSavedAt(null)
    queuedSaveRef.current = false
    pendingSaveEnvelopeRef.current = null
    setLoading(false)
  }, [
    clearScene,
    canSave,
    initialScene,
    loadFromScene,
    resetEditor,
    sceneKey,
    sceneType,
    setCameraMode,
    setProjectName,
    setScene,
    setSceneType,
    setViewportView,
    updateSaveStatus,
    warehouseMeta.name,
  ])

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
  }, [
    document,
    initialScene?.activeLevelId,
    initialScene?.warehouse,
    projectName,
    sceneType,
    warehouseMeta,
  ])

  useEffect(() => {
    if (!sceneLoadedRef.current || !onSceneChange || !dirty) return
    if (lastSceneChangeDocumentRef.current === document) return
    lastSceneChangeDocumentRef.current = document
    const timer = setTimeout(() => {
      onSceneChange(buildSnapshot())
    }, 250)
    return () => clearTimeout(timer)
  }, [buildSnapshot, dirty, document, onSceneChange])

  const handleSave = useCallback(({ allowWhileLocked = false } = {}) => {
    if (!onSave || saveStatusRef.current === 'conflict') return null
    if (operationLockRef.current && !allowWhileLocked) return null
    if (saveInFlightRef.current) {
      if (!allowWhileLocked) queuedSaveRef.current = true
      return savePromiseRef.current
    }

    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = null
    }

    const saveTask = (async () => {
      const nextEnvelope = {
        sceneGeneration: sceneGenerationRef.current,
        saveVersion: useEditor.getState().changeVersion,
        snapshotJson: buildSnapshot(),
        expectedRevision: revisionRef.current,
        clientMutationId:
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `studio-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      }
      const saveEnvelope = pickStudioSaveEnvelope(
        pendingSaveEnvelopeRef.current,
        nextEnvelope,
      )
      let allowQueuedSave = true
      saveInFlightRef.current = true
      setSaving(true)
      setSaveError(null)
      updateSaveStatus('saving')
      try {
        const result = await onSave({
          snapshotJson: saveEnvelope.snapshotJson,
          expectedRevision: saveEnvelope.expectedRevision,
          clientMutationId: saveEnvelope.clientMutationId,
        })
        if (saveEnvelope.sceneGeneration !== sceneGenerationRef.current) {
          return result
        }
        if (pendingSaveEnvelopeRef.current === saveEnvelope) {
          pendingSaveEnvelopeRef.current = null
        }
        const nextRevision = Number(result?.revision ?? result?.project?.revision)
        if (Number.isFinite(nextRevision)) {
          revisionRef.current = nextRevision
          setActiveRevision(nextRevision)
        }
        const savedAt = result?.savedAt || new Date().toISOString()
        setLastSavedAt(savedAt)
        const successPlan = planStudioSaveSuccess(
          saveEnvelope,
          useEditor.getState().changeVersion,
          autoSaveDelayMs,
        )
        markSaved(successPlan.savedVersion)
        if (successPlan.queueLatest) queuedSaveRef.current = true
        updateSaveStatus(successPlan.hasNewerEdits ? 'dirty' : 'saved')
        return result
      } catch (error) {
        if (saveEnvelope.sceneGeneration !== sceneGenerationRef.current) {
          return null
        }
        const conflict = isRevisionConflictError(error)
        if (shouldRetainStudioSaveEnvelope(error)) {
          pendingSaveEnvelopeRef.current = saveEnvelope
        } else if (pendingSaveEnvelopeRef.current === saveEnvelope) {
          pendingSaveEnvelopeRef.current = null
        }
        allowQueuedSave = !conflict
        setSaveError(error?.message || '保存失败')
        updateSaveStatus(conflict ? 'conflict' : 'error')
        return null
      } finally {
        saveInFlightRef.current = false
        setSaving(false)
        const shouldRunQueuedSave =
          queuedSaveRef.current && allowQueuedSave && !operationLockRef.current
        queuedSaveRef.current = false
        if (shouldRunQueuedSave) {
          autoSaveTimerRef.current = window.setTimeout(() => {
            void handleSaveRef.current?.()
          }, Math.max(Number(autoSaveDelayMs) || 0, 250))
        }
      }
    })()
    savePromiseRef.current = saveTask
    void saveTask.finally(() => {
      if (savePromiseRef.current === saveTask) {
        savePromiseRef.current = null
      }
    })
    return saveTask
  }, [autoSaveDelayMs, buildSnapshot, markSaved, onSave, updateSaveStatus])

  useEffect(() => {
    handleSaveRef.current = handleSave
  }, [handleSave])

  const pauseAndFlush = useCallback(async () => {
    operationLockRef.current = true
    setOperationLocked(true)
    window.clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = null
    queuedSaveRef.current = false

    const activeSave = savePromiseRef.current
    if (activeSave) await activeSave

    window.clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = null
    queuedSaveRef.current = false
    if (saveStatusRef.current === 'conflict') return false

    if (useEditor.getState().dirty) {
      await handleSaveRef.current?.({ allowWhileLocked: true })
    }

    return (
      !useEditor.getState().dirty &&
      saveStatusRef.current !== 'error' &&
      saveStatusRef.current !== 'conflict'
    )
  }, [])

  const resumeAfterExternalMutation = useCallback(() => {
    operationLockRef.current = false
    setOperationLocked(false)
  }, [])

  useImperativeHandle(externalMutationRef, () => ({
    pauseAndFlush,
    resume: resumeAfterExternalMutation,
  }), [pauseAndFlush, resumeAfterExternalMutation])

  useEffect(() => {
    const plan = planDirtySave({
      hasSaveHandler: Boolean(onSave),
      dirty,
      saveStatus: saveStatusRef.current,
      autoSaveDelayMs,
      saveInFlight: saveInFlightRef.current,
      savePaused: operationLocked,
    })
    if (plan.markDirty) {
      updateSaveStatus('dirty')
    }
    if (plan.queueAfterFlight) {
      queuedSaveRef.current = true
      return undefined
    }
    if (!plan.scheduleAutoSave) return undefined

    window.clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = window.setTimeout(() => {
      void handleSaveRef.current?.()
    }, Number(autoSaveDelayMs))
    return () => window.clearTimeout(autoSaveTimerRef.current)
  }, [autoSaveDelayMs, changeVersion, dirty, onSave, operationLocked, updateSaveStatus])

  useEffect(() => () => {
    window.clearTimeout(autoSaveTimerRef.current)
  }, [])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (operationLockRef.current) {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
          event.preventDefault()
        }
        return
      }
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName)) return
      const key = event.key.toLowerCase()
      const chord = event.ctrlKey || event.metaKey
      if (chord && (key === 'y' || (event.shiftKey && key === 'z'))) {
        event.preventDefault()
        if (redo()) setDirty(true)
      } else if (chord && key === 'z') {
        event.preventDefault()
        if (undo()) setDirty(true)
      } else if (chord && key === 's') {
        event.preventDefault()
        handleSave()
      } else if (!chord && key === 'v') setTool(TOOL_TYPES.SELECT)
      else if (!chord && key === 'l') {
        setTool(TOOL_TYPES.SKETCH)
        setSketchMode('line')
      } else if (!chord && key === 'r') {
        setTool(TOOL_TYPES.SKETCH)
        setSketchMode('rect')
      } else if (!chord && key === 'a') {
        setTool(TOOL_TYPES.SKETCH)
        setSketchMode('arc')
      } else if (!chord && key === 'c') {
        setTool(TOOL_TYPES.SKETCH)
        setSketchMode('circle')
      } else if (!chord && key === 'b') {
        setTool(TOOL_TYPES.SKETCH)
        setSketchMode('bezier')
      } else if (!chord && key === 'p') setTool(TOOL_TYPES.PUSHPULL)
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

  const selectionItems =
    selectedGeometry?.meta?.entityType === 'multi'
    ? selectedGeometry.meta.items || []
      : selectedGeometry
        ? [selectedGeometry]
        : []
  const selectedProfileIds = selectionItems
    .map(
      (item) => item.meta?.profileId || (item.meta?.entityType === 'profile' ? item.entityId : null)
    )
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
    <div
      className={`studio-shell ${operationLocked ? 'is-operation-locked' : ''}`.trim()}
      aria-busy={operationLocked}
      inert={operationLocked ? true : undefined}
    >
      <header className={`studio-toolbar ${compactChrome ? 'is-compact' : ''}`.trim()}>
        <div className="studio-toolbar__left">
          {onBack && !embedded ? (
            <button className="studio-link-btn" onClick={onBack} type="button">
              返回
            </button>
          ) : null}
          <div className="studio-title-block">
            <strong>{projectName}</strong>
            <span className={`studio-save-state is-${saveStatus}`} role="status" aria-live="polite">
              {getSaveStatusLabel({
                status: saveStatus,
                revision: activeRevision,
                lastSavedAt,
                sourceContext,
              })}
            </span>
          </div>
        </div>

        <div className="studio-toolbar__center">
          <div className="studio-toolbar__cluster">
            <span className="studio-toolbar__cluster-label">选择</span>
            <div className="studio-toolbar__group">
              <ToolButton
                active={activeTool === TOOL_TYPES.SELECT}
                label="选择"
                onClick={() => setTool(TOOL_TYPES.SELECT)}
              />
            </div>
          </div>

          <div className="studio-toolbar__cluster">
            <span className="studio-toolbar__cluster-label">绘制</span>
            <div className="studio-toolbar__group">
              <ToolButton
                active={activeTool === TOOL_TYPES.SKETCH && sketchMode === 'line'}
                label="线"
                onClick={() => {
                  setTool(TOOL_TYPES.SKETCH)
                  setSketchMode('line')
                }}
              />
              <ToolButton
                active={activeTool === TOOL_TYPES.SKETCH && sketchMode === 'rect'}
                label="矩形"
                onClick={() => {
                  setTool(TOOL_TYPES.SKETCH)
                  setSketchMode('rect')
                }}
                secondary
              />
              <ToolButton
                active={activeTool === TOOL_TYPES.SKETCH && sketchMode === 'arc'}
                label="圆弧"
                onClick={() => {
                  setTool(TOOL_TYPES.SKETCH)
                  setSketchMode('arc')
                }}
                secondary
              />
              <ToolButton
                active={activeTool === TOOL_TYPES.SKETCH && sketchMode === 'circle'}
                label="圆"
                onClick={() => {
                  setTool(TOOL_TYPES.SKETCH)
                  setSketchMode('circle')
                }}
                secondary
              />
              <ToolButton
                active={activeTool === TOOL_TYPES.SKETCH && sketchMode === 'bezier'}
                label="贝塞尔"
                onClick={() => {
                  setTool(TOOL_TYPES.SKETCH)
                  setSketchMode('bezier')
                }}
                secondary
              />
            </div>
          </div>

          <div className="studio-toolbar__cluster">
            <span className="studio-toolbar__cluster-label">成型</span>
            <div className="studio-toolbar__group">
              <ToolButton
                active={activeTool === TOOL_TYPES.PUSHPULL}
                label="推拉"
                onClick={() => setTool(TOOL_TYPES.PUSHPULL)}
              />
              <ToolButton active={false} label="扫掠" onClick={handleSweep} secondary />
              <ToolButton active={false} label="放样" onClick={handleLoft} secondary />
            </div>
          </div>

          <div className="studio-toolbar__cluster">
            <span className="studio-toolbar__cluster-label">变换</span>
            <div className="studio-toolbar__group">
              <ToolButton
                active={activeTool === TOOL_TYPES.MOVE}
                label="移动"
                onClick={() => setTool(TOOL_TYPES.MOVE)}
              />
              <ToolButton
                active={activeTool === TOOL_TYPES.ROTATE}
                label="旋转"
                onClick={() => setTool(TOOL_TYPES.ROTATE)}
              />
            </div>
          </div>

          <div className="studio-toolbar__cluster">
            <span className="studio-toolbar__cluster-label">测量</span>
            <div className="studio-toolbar__group">
              <ToolButton
                active={activeTool === TOOL_TYPES.MEASURE}
                label="测量"
                onClick={() => setTool(TOOL_TYPES.MEASURE)}
              />
            </div>
          </div>

          <div className="studio-toolbar__cluster">
            <span className="studio-toolbar__cluster-label">视图</span>
            <div className="studio-toolbar__group">
              {VIEW_PRESETS.map((view) => (
                <ToolButton
                  key={view.id}
                  active={viewportView === view.id}
                  label={view.label}
                  onClick={() => {
                    setViewportView(view.id)
                    setCameraMode(view.id === 'top' ? 'orthographic' : 'perspective')
                  }}
                />
              ))}
              <ToolButton
                active={cameraMode === 'orthographic'}
                label={cameraMode === 'orthographic' ? '平行' : '透视'}
                onClick={handleProjectionToggle}
              />
              <ToolButton active={showGrid} label="网格" onClick={() => setShowGrid(!showGrid)} />
            </div>
          </div>
        </div>

        <div className="studio-toolbar__right">
          <div className="studio-toolbar__cluster">
            <span className="studio-toolbar__cluster-label">选择级别</span>
            <div className="studio-toolbar__group">
              <ToolButton
                active={selectionMode === 'object'}
                label="对象"
                onClick={() => setSelectionMode('object')}
              />
              <ToolButton
                active={selectionMode === 'face'}
                label="面"
                onClick={() => setSelectionMode('face')}
              />
              <ToolButton
                active={selectionMode === 'edge'}
                label="边"
                onClick={() => setSelectionMode('edge')}
              />
              <ToolButton
                active={selectionMode === 'vertex'}
                label="点"
                onClick={() => setSelectionMode('vertex')}
              />
            </div>
          </div>
          <button className="studio-link-btn" onClick={toggleSceneTree} type="button">
            {sceneTreeOpen ? '隐藏树' : '场景树'}
          </button>
          <button className="studio-link-btn" onClick={toggleInspector} type="button">
            {inspectorOpen ? '隐藏属性' : '属性'}
          </button>
          {onSaveTemplate ? (
            <button
              className="studio-link-btn"
              onClick={() => onSaveTemplate({ snapshotJson: buildSnapshot() })}
              type="button"
            >
              标件
            </button>
          ) : null}
          {onSaveAsset ? (
            <button
              className="studio-link-btn"
              onClick={() => onSaveAsset({ snapshotJson: buildSnapshot() })}
              type="button"
            >
              资产
            </button>
          ) : null}
          {onSave ? (
            <button
              className="studio-save-btn"
              disabled={saving || saveStatus === 'conflict' || operationLocked}
              onClick={() => void handleSave()}
              type="button"
            >
              {saving ? '保存中...' : saveStatus === 'error' ? '重试保存' : '保存'}
            </button>
          ) : null}
        </div>
      </header>

      <div className="studio-main">
        <SceneTreePanel />

        <div className="studio-canvas-shell">
          {focusZoneContext ? (
            <div
              className={`studio-focus-chip ${focusZoneSceneImportState === 'stale' ? 'is-stale' : ''}`.trim()}
            >
              <strong>GIS 固定区域 · {focusZoneContext.name || '未命名'}</strong>
              <span>
                {Math.round(focusZoneContext.boundsMeters?.width || 0)}m ×{' '}
                {Math.round(focusZoneContext.boundsMeters?.depth || 0)}m
              </span>
              <span>{Math.round(focusZoneContext.approximateAreaSqm || 0)}㎡</span>
              <span>已导入 {focusZoneObjectCount} 个对象</span>
              {focusZoneSceneSource ? (
                <span>
                  {focusZoneSceneSource === 'gis-focus-zone'
                    ? 'GIS 初始白模'
                    : focusZoneSceneSource}
                </span>
              ) : null}
              {focusZoneImportLabel ? <span>{focusZoneImportLabel}</span> : null}
            </div>
          ) : null}

          {inferenceHint ? (
            <div className="studio-hint" style={{ left: inferenceHint.x, top: inferenceHint.y }}>
              {inferenceHint.label}
            </div>
          ) : null}

          <div className="studio-canvas">
            {showStaticGisPreview ? (
              <GisWhiteModelPreview
                document={document}
                onOpenInteractive={() => setForceInteractiveViewer(true)}
              />
            ) : (
              <PascalViewer
                backdrop={siteBackdrop ? (
                  <SiteBackdrop
                    data={siteBackdrop}
                    imageryReloadToken={siteBackdropReloadToken}
                    onImageryRuntimeChange={onSiteBackdropImageryRuntimeChange}
                  />
                ) : null}
                defaultView="iso"
                enableBvh={enableViewerBvh}
                enableShadows={!useLightweightViewer}
                lightweight={useLightweightViewer}
                preferWebGpu={!useLightweightViewer && !siteBackdrop}
                referenceMode="bounded"
                sceneBounds={sceneViewportBounds}
                selectionManager="none"
                showAxisGizmo
                showGroundPlane
                toolOverlays={<StudioTools />}
              >
                <GeometryRenderer document={document} lightweight={useLightweightViewer} />
              </PascalViewer>
            )}
          </div>

          <div className="studio-status-bar">
            <span>草图平面: {activeSketchPlane?.name || 'Ground'}</span>
            <span>{geometryStats.vertexCount} 顶点</span>
            <span>{geometryStats.edgeCount} 边</span>
            <span>{geometryStats.faceCount} 面</span>
            <span>{geometryStats.solidCount} 实体</span>
            <span>{geometryStats.surfaceCount} 曲面</span>
            {openingPlacement ? (
              <span>
                开洞放置: {openingPlacement.type === 'door' ? '门洞' : '窗洞'} · 侧面单击落位
              </span>
            ) : null}
            <span>{selectedGeometry ? `已选: ${selectedGeometry.label}` : '未选择对象'}</span>
          </div>
        </div>

        <PropertyInspector />
      </div>

      {operationLocked ? (
        <div className="studio-operation-lock">正在保存当前修改并重新生成卫星场地…</div>
      ) : null}

      <style>{`
        .studio-shell { position: relative; display: flex; flex-direction: column; height: 100%; background: var(--layer-bg-secondary, var(--bg-secondary, #f0eded)); color: var(--layer-text-primary, var(--text-primary, #1b1c1c)); }
        .studio-shell.is-operation-locked { cursor: wait; }
        .studio-operation-lock { position: absolute; inset: 0; z-index: 80; display: grid; place-items: center; background: rgba(237, 241, 246, 0.72); color: #263b52; font-size: 13px; font-weight: 800; backdrop-filter: blur(2px); }
        .studio-loading { display: grid; place-items: center; height: 100%; color: var(--layer-text-primary, var(--text-primary, #1b1c1c)); font-weight: 700; }
        .studio-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 10px; border-bottom: 1px solid var(--layer-border, var(--border, #e7e5e4)); background: linear-gradient(180deg, var(--layer-surface, var(--surface, #fff)), var(--layer-bg-secondary, var(--bg-secondary, #f0eded))); }
        .studio-toolbar.is-compact { padding: 6px 8px; gap: 8px; }
        .studio-toolbar__left, .studio-toolbar__center, .studio-toolbar__right { display: flex; align-items: center; gap: 8px; }
        .studio-toolbar__center { flex: 1; align-items: stretch; justify-content: center; flex-wrap: wrap; }
        .studio-toolbar__cluster { display: grid; align-content: center; gap: 3px; padding-right: 8px; border-right: 1px solid var(--layer-border, var(--border, #e7e5e4)); }
        .studio-toolbar__cluster:last-child { border-right: none; padding-right: 0; }
        .studio-toolbar__cluster-label { color: var(--layer-text-muted, var(--text-muted, #78716c)); font-family: var(--font-headline, sans-serif); font-size: 9px; font-weight: 800; letter-spacing: 0.1em; line-height: 1; text-transform: uppercase; }
        .studio-toolbar__group { display: flex; align-items: center; gap: 4px; }
        .studio-title-block { display: grid; gap: 2px; }
        .studio-title-block strong { font-size: 14px; }
        .studio-title-block span { font-size: 11px; color: var(--layer-text-secondary, var(--text-secondary, #454747)); }
        .studio-save-state.is-dirty, .studio-save-state.is-saving { color: var(--warning, #b45309); }
        .studio-save-state.is-error, .studio-save-state.is-conflict { color: var(--danger, #b91c1c); }
        .studio-save-state.is-saved { color: var(--success, #047857); }
        .studio-tool-btn, .studio-link-btn, .studio-save-btn { border: 1px solid var(--layer-border-strong, var(--border-strong, #d6d3d1)); border-radius: 0; background: var(--layer-surface, var(--surface, #fff)); color: var(--layer-text-primary, var(--text-primary, #1b1c1c)); min-height: 30px; padding: 0 9px; cursor: pointer; font-size: 12px; font-weight: 700; }
        .studio-tool-btn:hover, .studio-link-btn:hover { border-color: var(--layer-border-accent, var(--border-accent)); background: var(--layer-surface-hover, var(--surface-hover)); }
        .studio-tool-btn:focus-visible, .studio-link-btn:focus-visible, .studio-save-btn:focus-visible { outline: 2px solid color-mix(in srgb, var(--layer-accent, var(--accent)) 72%, white 28%); outline-offset: 2px; }
        .studio-tool-btn.is-active { background: var(--layer-accent, var(--accent)); border-color: var(--layer-accent, var(--accent)); color: var(--layer-text-on-accent, var(--text-on-accent, #fff)); }
        .studio-tool-btn.is-secondary { opacity: 0.92; }
        .studio-save-btn { background: var(--success-soft, #ecfdf5); border-color: color-mix(in srgb, var(--success, #059669) 35%, var(--layer-border, var(--border))); color: var(--success, #059669); }
        .studio-main { display: flex; flex: 1; min-height: 0; }
        .studio-canvas-shell { position: relative; flex: 1; min-width: 0; }
        .studio-canvas { height: 100%; background: linear-gradient(180deg, #f1f4f8, #e7ebf0); }
        .studio-focus-chip { position: absolute; top: 12px; left: 12px; z-index: 20; display: flex; align-items: center; gap: 8px; max-width: calc(100% - 24px); padding: 8px 10px; background: rgba(245, 249, 241, 0.94); border: 1px solid rgba(82, 108, 92, 0.24); color: #263b2e; box-shadow: 0 8px 24px rgba(27, 42, 32, 0.12); backdrop-filter: blur(8px); font-size: 11px; font-weight: 700; }
        .studio-focus-chip span { color: #4d6355; font-weight: 700; }
        .studio-focus-chip.is-stale { border-color: rgba(168, 105, 39, 0.38); background: rgba(255, 247, 232, 0.96); color: #6b4218; }
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
