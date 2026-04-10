import { emitter, sceneRegistry, useScene } from '@pascal-app/core'
import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import useViewer from '../../../node_modules/@pascal-app/viewer/dist/store/use-viewer.js'
import useEditor from '../store/useEditor'
import useModelingDocument from '../store/useModelingDocument'

const SELECTABLE_TYPES = [
  'site',
  'building',
  'level',
  'zone',
  'line',
  'wall',
  'item',
  'slab',
  'ceiling',
  'roof',
  'roof-segment',
  'window',
  'door',
]

const MARQUEE_SELECTABLE_TYPES = SELECTABLE_TYPES.filter((type) => !['site', 'building', 'level'].includes(type))
const MARQUEE_DRAG_THRESHOLD = 6

function toggleSelection(selectedIds, nextId, event) {
  const isMeta = event?.metaKey || event?.nativeEvent?.metaKey
  const isCtrl = event?.ctrlKey || event?.nativeEvent?.ctrlKey

  if (!isMeta && !isCtrl) {
    return [nextId]
  }

  if (selectedIds.includes(nextId)) {
    return selectedIds.filter((id) => id !== nextId)
  }

  return [...selectedIds, nextId]
}

function mergeSelection(selectedIds, nextIds) {
  return [...new Set([...(selectedIds || []), ...(nextIds || [])])]
}

function normalizeMarqueeRect(startPoint, endPoint) {
  return {
    left: Math.min(startPoint.x, endPoint.x),
    top: Math.min(startPoint.y, endPoint.y),
    right: Math.max(startPoint.x, endPoint.x),
    bottom: Math.max(startPoint.y, endPoint.y),
  }
}

function rectIntersects(left, right) {
  return !(
    left.right < right.left
    || left.left > right.right
    || left.bottom < right.top
    || left.top > right.bottom
  )
}

function rectContains(outer, inner) {
  return (
    inner.left >= outer.left
    && inner.right <= outer.right
    && inner.top >= outer.top
    && inner.bottom <= outer.bottom
  )
}

function getPointerPoint(event, canvasRect) {
  return {
    x: event.clientX - canvasRect.left,
    y: event.clientY - canvasRect.top,
  }
}

function projectWorldPointToScreen(point, camera, canvasRect) {
  const projected = point.clone().project(camera)
  if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y)) return null

  return {
    x: ((projected.x + 1) / 2) * canvasRect.width,
    y: ((1 - projected.y) / 2) * canvasRect.height,
  }
}

function getObjectScreenRect(object, camera, canvasRect) {
  if (!object) return null

  object.updateWorldMatrix?.(true, true)

  const worldBox = new THREE.Box3().setFromObject(object)
  if (worldBox.isEmpty()) {
    const worldPosition = new THREE.Vector3()
    object.getWorldPosition(worldPosition)
    const screenPoint = projectWorldPointToScreen(worldPosition, camera, canvasRect)
    if (!screenPoint) return null
    return {
      left: screenPoint.x,
      top: screenPoint.y,
      right: screenPoint.x,
      bottom: screenPoint.y,
    }
  }

  const corners = [
    new THREE.Vector3(worldBox.min.x, worldBox.min.y, worldBox.min.z),
    new THREE.Vector3(worldBox.min.x, worldBox.min.y, worldBox.max.z),
    new THREE.Vector3(worldBox.min.x, worldBox.max.y, worldBox.min.z),
    new THREE.Vector3(worldBox.min.x, worldBox.max.y, worldBox.max.z),
    new THREE.Vector3(worldBox.max.x, worldBox.min.y, worldBox.min.z),
    new THREE.Vector3(worldBox.max.x, worldBox.min.y, worldBox.max.z),
    new THREE.Vector3(worldBox.max.x, worldBox.max.y, worldBox.min.z),
    new THREE.Vector3(worldBox.max.x, worldBox.max.y, worldBox.max.z),
  ]

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  corners.forEach((corner) => {
    const screenPoint = projectWorldPointToScreen(corner, camera, canvasRect)
    if (!screenPoint) return
    minX = Math.min(minX, screenPoint.x)
    minY = Math.min(minY, screenPoint.y)
    maxX = Math.max(maxX, screenPoint.x)
    maxY = Math.max(maxY, screenPoint.y)
  })

  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null

  return {
    left: minX,
    top: minY,
    right: maxX,
    bottom: maxY,
  }
}

function projectPointsToScreenRect(points, camera, canvasRect) {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  points.forEach((point) => {
    const screenPoint = projectWorldPointToScreen(point, camera, canvasRect)
    if (!screenPoint) return
    minX = Math.min(minX, screenPoint.x)
    minY = Math.min(minY, screenPoint.y)
    maxX = Math.max(maxX, screenPoint.x)
    maxY = Math.max(maxY, screenPoint.y)
  })

  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null

  return {
    left: minX,
    top: minY,
    right: maxX,
    bottom: maxY,
  }
}

function getWallNodeScreenRect(node, camera, canvasRect) {
  const start = node?.start
  const end = node?.end
  if (!Array.isArray(start) || !Array.isArray(end)) return null

  const [startX, startZ] = start
  const [endX, endZ] = end
  const dx = endX - startX
  const dz = endZ - startZ
  const length = Math.hypot(dx, dz)
  if (length <= 0.001) return null

  const halfThickness = Math.max(Number(node?.thickness) || 0.2, 0.05) / 2
  const height = Math.max(Number(node?.height) || 4.5, 0.1)
  const perpX = (-dz / length) * halfThickness
  const perpZ = (dx / length) * halfThickness

  return projectPointsToScreenRect([
    new THREE.Vector3(startX - perpX, 0, startZ - perpZ),
    new THREE.Vector3(startX + perpX, 0, startZ + perpZ),
    new THREE.Vector3(endX - perpX, 0, endZ - perpZ),
    new THREE.Vector3(endX + perpX, 0, endZ + perpZ),
    new THREE.Vector3(startX - perpX, height, startZ - perpZ),
    new THREE.Vector3(startX + perpX, height, startZ + perpZ),
    new THREE.Vector3(endX - perpX, height, endZ - perpZ),
    new THREE.Vector3(endX + perpX, height, endZ + perpZ),
  ], camera, canvasRect)
}

function getLineNodeScreenRect(node, camera, canvasRect) {
  const start = node?.start
  const end = node?.end
  if (!Array.isArray(start) || !Array.isArray(end)) return null

  const [startX, startZ] = start
  const [endX, endZ] = end
  return projectPointsToScreenRect([
    new THREE.Vector3(startX, 0.08, startZ),
    new THREE.Vector3(endX, 0.08, endZ),
  ], camera, canvasRect)
}

function getPolygonNodeScreenRect(node, camera, canvasRect) {
  const polygon = Array.isArray(node?.polygon) ? node.polygon : null
  if (!polygon?.length) return null

  const elevation = Number(node?.elevation) || 0.03
  return projectPointsToScreenRect(
    polygon
      .filter((point) => Array.isArray(point) && point.length >= 2)
      .map((point) => new THREE.Vector3(point[0], elevation, point[1])),
    camera,
    canvasRect,
  )
}

function getOpeningNodeScreenRect(node, nodes, camera, canvasRect) {
  const hostWall = node?.wallId ? nodes?.[node.wallId] : null
  if (!hostWall) return null

  const start = hostWall.start
  const end = hostWall.end
  if (!Array.isArray(start) || !Array.isArray(end)) return null

  const [startX, startZ] = start
  const [endX, endZ] = end
  const dx = endX - startX
  const dz = endZ - startZ
  const length = Math.hypot(dx, dz)
  if (length <= 0.001) return null

  const width = Math.max(Number(node?.width) || 0, 0.1)
  const height = Math.max(Number(node?.height) || 0, 0.1)
  const offset = Number(node?.position?.[0]) || 0
  const elevation = Number(node?.position?.[1]) || 0
  const wallThickness = Math.max(Number(hostWall?.thickness) || 0.2, 0.05)
  const halfDepth = Math.max(wallThickness * 0.18, 0.04)
  const perpX = (-dz / length) * halfDepth
  const perpZ = (dx / length) * halfDepth
  const nx = dx / length
  const nz = dz / length
  const openingStartX = startX + nx * offset
  const openingStartZ = startZ + nz * offset
  const openingEndX = openingStartX + nx * width
  const openingEndZ = openingStartZ + nz * width

  return projectPointsToScreenRect([
    new THREE.Vector3(openingStartX - perpX, elevation, openingStartZ - perpZ),
    new THREE.Vector3(openingStartX + perpX, elevation, openingStartZ + perpZ),
    new THREE.Vector3(openingEndX - perpX, elevation, openingEndZ - perpZ),
    new THREE.Vector3(openingEndX + perpX, elevation, openingEndZ + perpZ),
    new THREE.Vector3(openingStartX - perpX, elevation + height, openingStartZ - perpZ),
    new THREE.Vector3(openingStartX + perpX, elevation + height, openingStartZ + perpZ),
    new THREE.Vector3(openingEndX - perpX, elevation + height, openingEndZ - perpZ),
    new THREE.Vector3(openingEndX + perpX, elevation + height, openingEndZ + perpZ),
  ], camera, canvasRect)
}

function getNodeScreenRect(node, object, nodes, camera, canvasRect) {
  const objectRect = object?.visible ? getObjectScreenRect(object, camera, canvasRect) : null
  if (objectRect) return objectRect

  switch (node?.type) {
    case 'line':
      return getLineNodeScreenRect(node, camera, canvasRect)
    case 'wall':
      return getWallNodeScreenRect(node, camera, canvasRect)
    case 'zone':
    case 'slab':
      return getPolygonNodeScreenRect(node, camera, canvasRect)
    case 'door':
    case 'window':
      return getOpeningNodeScreenRect(node, nodes, camera, canvasRect)
    default:
      return null
  }
}

export default function DirectSelectionManager() {
  const gl = useThree((state) => state.gl)
  const camera = useThree((state) => state.camera)
  const nodes = useScene((state) => state.nodes)
  const activeTool = useEditor((state) => state.activeTool)
  const clearSelectedGeometry = useEditor((state) => state.clearSelectedGeometry)
  const selectionMode = useEditor((state) => state.selectionMode)
  const document = useModelingDocument((state) => state.document)
  const clickHandledRef = useRef(false)
  const overlayRef = useRef(null)
  const marqueeStateRef = useRef(null)

  // Only handle Pascal viewer node selection when there are no modeling entities.
  // When editorDocument has solids/profiles/segments, SelectTool takes over all geometry selection.
  const hasModelingEntities = document?.solids?.length > 0
    || document?.profiles?.length > 0
    || document?.segments?.length > 0

  useEffect(() => {
    const onEnter = (event) => {
      if (hasModelingEntities) return
      if (activeTool !== 'select') return
      if (selectionMode !== 'object') return
      if (!SELECTABLE_TYPES.includes(event.node?.type)) return
      event.stopPropagation()
      useViewer.getState().setHoveredId(event.node.id)
    }

    const onLeave = (event) => {
      if (hasModelingEntities) return
      if (activeTool !== 'select') return
      if (selectionMode !== 'object') return
      if (!SELECTABLE_TYPES.includes(event.node?.type)) return
      event.stopPropagation()
      if (useViewer.getState().hoveredId === event.node.id) {
        useViewer.getState().setHoveredId(null)
      }
    }

    const onClick = (event) => {
      if (hasModelingEntities) return
      if (activeTool !== 'select') return
      if (selectionMode !== 'object') return
      if (!SELECTABLE_TYPES.includes(event.node?.type)) return

      event.stopPropagation()
      clickHandledRef.current = true

      const { selectedIds } = useViewer.getState().selection
      useViewer.getState().setSelection({
        selectedIds: toggleSelection(selectedIds, event.node.id, event.nativeEvent),
      })
      useViewer.getState().setHoveredId(null)
    }

    for (const type of SELECTABLE_TYPES) {
      emitter.on(`${type}:enter`, onEnter)
      emitter.on(`${type}:leave`, onLeave)
      emitter.on(`${type}:click`, onClick)
    }

    return () => {
      for (const type of SELECTABLE_TYPES) {
        emitter.off(`${type}:enter`, onEnter)
        emitter.off(`${type}:leave`, onLeave)
        emitter.off(`${type}:click`, onClick)
      }
    }
  }, [activeTool, hasModelingEntities, selectionMode])

  useEffect(() => {
    const canvas = gl?.domElement
    const parent = canvas?.parentElement
    if (!canvas || !parent) return undefined

    if (window.getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative'
    }

    const overlay = window.document.createElement('div')
    overlay.dataset.studioMarquee = 'true'
    Object.assign(overlay.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: '0',
      height: '0',
      display: 'none',
      pointerEvents: 'none',
      border: '1px solid rgba(29, 78, 216, 0.9)',
      background: 'rgba(96, 165, 250, 0.14)',
      boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.28) inset',
      zIndex: '24',
    })
    parent.appendChild(overlay)
    overlayRef.current = overlay

    return () => {
      if (overlay.parentElement) {
        overlay.parentElement.removeChild(overlay)
      }
      if (overlayRef.current === overlay) {
        overlayRef.current = null
      }
    }
  }, [gl])

  useEffect(() => {
    const canvas = gl?.domElement
    if (!canvas) return undefined

    const hideOverlay = () => {
      if (!overlayRef.current) return
      overlayRef.current.style.display = 'none'
      overlayRef.current.style.width = '0'
      overlayRef.current.style.height = '0'
      overlayRef.current.dataset.mode = ''
    }

    const showOverlay = (rect) => {
      if (!overlayRef.current) return
      overlayRef.current.style.display = 'block'
      overlayRef.current.style.left = `${rect.left}px`
      overlayRef.current.style.top = `${rect.top}px`
      overlayRef.current.style.width = `${Math.max(rect.right - rect.left, 1)}px`
      overlayRef.current.style.height = `${Math.max(rect.bottom - rect.top, 1)}px`
    }

    const collectMarqueeSelection = (marqueeRect, additive, mode) => {
      const canvasRect = canvas.getBoundingClientRect()
      const selectedIds = []
      Object.values(nodes || {}).forEach((node) => {
        if (!MARQUEE_SELECTABLE_TYPES.includes(node?.type)) return
        if (node.visible === false) return

        const object = sceneRegistry.nodes.get(node.id)
        const screenRect = getNodeScreenRect(node, object, nodes, camera, canvasRect)
        if (!screenRect) return

        const matched = mode === 'contain'
          ? rectContains(marqueeRect, screenRect)
          : rectIntersects(marqueeRect, screenRect)

        if (!matched) return
        selectedIds.push(node.id)
      })

      const nextIds = additive
        ? mergeSelection(useViewer.getState().selection.selectedIds, selectedIds)
        : [...new Set(selectedIds)]

      clearSelectedGeometry()
      useViewer.getState().setHoveredId(null)
      useViewer.getState().setSelection({ selectedIds: nextIds })
    }

    const handleMouseDown = (event) => {
      if (hasModelingEntities) return
      if (activeTool !== 'select') return
      if (selectionMode !== 'object') return
      if (event.button !== 0) return
      if (useViewer.getState().cameraDragging) return

      marqueeStateRef.current = {
        startPoint: getPointerPoint(event, canvas.getBoundingClientRect()),
        additive: event.metaKey || event.ctrlKey,
        started: false,
      }
      hideOverlay()
    }

    const handleMouseMove = (event) => {
      const marqueeState = marqueeStateRef.current
      if (!marqueeState) return

      const currentPoint = getPointerPoint(event, canvas.getBoundingClientRect())
      const rect = normalizeMarqueeRect(marqueeState.startPoint, currentPoint)
      const width = rect.right - rect.left
      const height = rect.bottom - rect.top

      if (!marqueeState.started) {
        if (width < MARQUEE_DRAG_THRESHOLD && height < MARQUEE_DRAG_THRESHOLD) return
        marqueeState.started = true
        clickHandledRef.current = true
        useViewer.getState().setCameraDragging?.(true)
      }

      marqueeState.currentPoint = currentPoint
      marqueeState.mode = currentPoint.x >= marqueeState.startPoint.x ? 'contain' : 'intersect'
      if (overlayRef.current) {
        overlayRef.current.dataset.mode = marqueeState.mode
        overlayRef.current.style.borderStyle = marqueeState.mode === 'contain' ? 'solid' : 'dashed'
        overlayRef.current.style.background = marqueeState.mode === 'contain'
          ? 'rgba(96, 165, 250, 0.14)'
          : 'rgba(59, 130, 246, 0.18)'
      }
      showOverlay(rect)
    }

    const handleMouseUp = () => {
      const marqueeState = marqueeStateRef.current
      if (!marqueeState) return

      marqueeStateRef.current = null
      useViewer.getState().setCameraDragging?.(false)

      if (!marqueeState.started || !marqueeState.currentPoint) {
        hideOverlay()
        return
      }

      const rect = normalizeMarqueeRect(marqueeState.startPoint, marqueeState.currentPoint)
      hideOverlay()
      collectMarqueeSelection(rect, marqueeState.additive, marqueeState.mode || 'contain')
    }

    const handleClick = (event) => {
      if (hasModelingEntities) return
      if (activeTool !== 'select') return
      if (useViewer.getState().cameraDragging) return
      if (event.button !== 0) return

      const clickVersion = useEditor.getState().geometrySelectionVersion

      requestAnimationFrame(() => {
        if (clickHandledRef.current) {
          clickHandledRef.current = false
          return
        }

        if (selectionMode !== 'object') {
          if (useEditor.getState().geometrySelectionVersion === clickVersion) {
            clearSelectedGeometry()
          }
          return
        }

        useViewer.getState().setSelection({ selectedIds: [] })
        useViewer.getState().setHoveredId(null)
      })
    }

    canvas.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    canvas.addEventListener('click', handleClick)

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      canvas.removeEventListener('click', handleClick)
      hideOverlay()
      marqueeStateRef.current = null
      useViewer.getState().setCameraDragging?.(false)
    }
  }, [activeTool, camera, clearSelectedGeometry, gl, hasModelingEntities, nodes, selectionMode])

  return null
}
