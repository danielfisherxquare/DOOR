import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import useEditor from '../store/useEditor'
import useModelingDocument from '../store/useModelingDocument'
import { findNearestEdgePoint, findNearestMidpoint, findNearestVertex, findOverlappingSegment, localPointToWorld, resolveSketchPlaneForSelection, sampleSegment3D, worldPointToLocal } from '../model/editorDocument'
import { projectPointerToVerticalAxis, useSketchPlaneProjection } from '../utils/workbenchPlane'

const SKETCH_COLOR = '#3767cf'
const CLOSE_COLOR = '#22c55e'
const ERROR_COLOR = '#dc2626'
const SCREEN_CLOSE_TOLERANCE = 18
const VERTICAL_FALLBACK_SCALE = 0.04
const VERTICAL_INFER_MIN_PIXELS = 24
const VERTICAL_INFER_RATIO = 1.6

function closestPointOnScreenSegment(point, start, end) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared < 0.0001) return { t: 0, distance: Math.hypot(point.x - start.x, point.y - start.y) }
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
  const x = start.x + dx * t
  const y = start.y + dy * t
  return { t, distance: Math.hypot(point.x - x, point.y - y) }
}

function pointY(point) {
  return point.length >= 3 ? point[1] : 0
}

function pointZ(point) {
  return point.length >= 3 ? point[2] : point[1]
}

function distance2D(left, right) {
  return Math.hypot(left[0] - right[0], left[1] - right[1])
}

function isHorizontalSegment(start, end) {
  return Math.abs(pointY(start) - pointY(end)) < 0.001
}

function buildLineGeometry(points) {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(points.flatMap((point) => [point[0], pointY(point) + 0.12, pointZ(point)]))
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  return geometry
}

function shouldInferVerticalAxis(originScreen, pointer, viewportView) {
  if (!originScreen || !pointer || viewportView === 'top') return false
  const dx = Math.abs(pointer.x - originScreen[0])
  const dy = Math.abs(pointer.y - originScreen[1])
  return dy >= VERTICAL_INFER_MIN_PIXELS && dy >= dx * VERTICAL_INFER_RATIO
}

export default function SketchTool() {
  const sketchMode = useEditor((state) => state.sketchMode)
  const selectedGeometry = useEditor((state) => state.selectedGeometry)
  const setDirty = useEditor((state) => state.setDirty)
  const setInferenceHint = useEditor((state) => state.setInferenceHint)
  const clearInferenceHint = useEditor((state) => state.clearInferenceHint)
  const document = useModelingDocument((state) => state.document)
  const viewportView = useEditor((state) => state.viewportView)
  const createPath = useModelingDocument((state) => state.insertSketchPath)
  const createRectangle = useModelingDocument((state) => state.insertRectangleProfile)
  const createSegment3D = useModelingDocument((state) => state.insertSketchSegment3D)
  const createArc = useModelingDocument((state) => state.insertArcSegment)
  const createBezier = useModelingDocument((state) => state.insertBezierSegment)
  const createCircle = useModelingDocument((state) => state.insertCircleProfile)
  const projectToSketchPlane = useSketchPlaneProjection()
  const { camera, gl, raycaster } = useThree((state) => ({ camera: state.camera, gl: state.gl, raycaster: state.raycaster }))
  const [points, setPoints] = useState([])
  const [screenPoints, setScreenPoints] = useState([])
  const [previewPoint, setPreviewPoint] = useState(null)
  const [axisLock, setAxisLock] = useState(null)
  const [segmentLength, setSegmentLength] = useState(null)

  // Use refs for frequently-changing values to avoid useEffect rebuilds
  const pointsRef = useRef(points)
  const screenPointsRef = useRef(screenPoints)
  const previewPointRef = useRef(previewPoint)
  const axisLockRef = useRef(axisLock)
  const sketchModeRef = useRef(sketchMode)
  const documentRef = useRef(document)
  const selectedGeometryRef = useRef(selectedGeometry)
  const viewportViewRef = useRef(viewportView)

  useEffect(() => { pointsRef.current = points }, [points])
  useEffect(() => { screenPointsRef.current = screenPoints }, [screenPoints])
  useEffect(() => { previewPointRef.current = previewPoint }, [previewPoint])
  useEffect(() => { axisLockRef.current = axisLock }, [axisLock])
  useEffect(() => { sketchModeRef.current = sketchMode }, [sketchMode])
  useEffect(() => { documentRef.current = document }, [document])
  useEffect(() => { selectedGeometryRef.current = selectedGeometry }, [selectedGeometry])
  useEffect(() => { viewportViewRef.current = viewportView }, [viewportView])

  const sketchPlane = useMemo(() => resolveSketchPlaneForSelection(document, selectedGeometry), [document, selectedGeometry])
  const sketchPlaneId = sketchPlane?.id || 'plane-ground'
  const sketchPlaneElevation = sketchPlane?.origin?.[1] || 0

  useEffect(() => () => clearInferenceHint(), [clearInferenceHint])

  useEffect(() => {
    setPoints([])
    setScreenPoints([])
    setPreviewPoint(null)
    setAxisLock(null)
    clearInferenceHint()
  }, [clearInferenceHint, sketchMode])

  const allPreviewPoints = useMemo(() => (
    previewPoint ? [...points, previewPoint] : points
  ), [points, previewPoint])

  // Stable callback for creating paths
  const stableCreatePath = useCallback((pts, opts) => createPath(pts, opts), [createPath])
  const stableCreateRectangle = useCallback((a, b, opts) => createRectangle(a, b, opts), [createRectangle])
  const stableCreateSegment3D = useCallback((a, b, opts) => createSegment3D(a, b, opts), [createSegment3D])
  const stableCreateArc = useCallback((a, b, c, opts) => createArc(a, b, c, opts), [createArc])
  const stableCreateBezier = useCallback((a, b, c, d, opts) => createBezier(a, b, c, d, opts), [createBezier])
  const stableCreateCircle = useCallback((a, b, opts) => createCircle(a, b, opts), [createCircle])

  useEffect(() => {
    const canvas = gl?.domElement
    if (!canvas) return undefined

    const toSketchPoint = (point) => worldPointToLocal(sketchPlane, point)
    const pointFromProjection = (projection) => projection.worldPoint || [projection.snapped[0], sketchPlaneElevation, projection.snapped[1]]
    const pointsMatchOnPlane = (left, right, tolerance = 0.2) => distance2D(toSketchPoint(left), toSketchPoint(right)) <= tolerance
    const isPlanarSketchSegment = (start, end) => sketchPlane.kind === 'solid-side' || isHorizontalSegment(start, end)

    const findNearestScreenVertex = (pointer, tolerance = 24) => {
      const rect = canvas.getBoundingClientRect()
      const vector = new THREE.Vector3()
      let nearest = null
      let nearestDistance = tolerance
      const doc = documentRef.current
      doc.vertices.forEach((vertex) => {
        if (vertex.metadata?.planeId && vertex.metadata.planeId !== sketchPlaneId) return
        vector.set(vertex.x, vertex.y ?? sketchPlaneElevation, vertex.z).project(camera)
        const screenX = ((vector.x + 1) / 2) * rect.width
        const screenY = ((-vector.y + 1) / 2) * rect.height
        const distance = Math.hypot(screenX - pointer.x, screenY - pointer.y)
        if (distance <= nearestDistance) {
          nearest = vertex
          nearestDistance = distance
        }
      })
      return nearest
    }

    const findNearestScreenEdge = (pointer, tolerance = 22) => {
      const rect = canvas.getBoundingClientRect()
      const doc = documentRef.current
      const lookup = new Map(doc.vertices.map((vertex) => [vertex.id, vertex]))
      const startVector = new THREE.Vector3()
      const endVector = new THREE.Vector3()
      let nearest = null
      let nearestDistance = tolerance
      doc.segments.forEach((segment) => {
        if (sketchPlaneId && segment.planeId && segment.planeId !== sketchPlaneId) return
        const start = lookup.get(segment.startVertexId)
        const end = lookup.get(segment.endVertexId)
        if (!start || !end) return
        const sampled = segment.kind === 'line' ? [
          [start.x, start.y ?? sketchPlaneElevation, start.z],
          [end.x, end.y ?? sketchPlaneElevation, end.z],
        ] : sampleSegment3D(doc, segment)
        sampled.slice(0, -1).forEach((point, index) => {
          const next = sampled[index + 1]
          if (!next) return
          startVector.set(point[0], point[1], point[2]).project(camera)
          endVector.set(next[0], next[1], next[2]).project(camera)
          const screenStart = { x: ((startVector.x + 1) / 2) * rect.width, y: ((-startVector.y + 1) / 2) * rect.height }
          const screenEnd = { x: ((endVector.x + 1) / 2) * rect.width, y: ((-endVector.y + 1) / 2) * rect.height }
          const projected = closestPointOnScreenSegment(pointer, screenStart, screenEnd)
          const globalT = sampled.length <= 1 ? 0 : (index + projected.t) / (sampled.length - 1)
          if (globalT <= 0.001 || globalT >= 0.999) return
          if (projected.distance <= nearestDistance) {
            nearest = {
              x: point[0] + (next[0] - point[0]) * projected.t,
              y: point[1] + (next[1] - point[1]) * projected.t,
              z: point[2] + (next[2] - point[2]) * projected.t,
              segmentId: segment.id,
              t: globalT,
            }
            nearestDistance = projected.distance
          }
        })
      })
      return nearest
    }

    const activeAxisLock = (projection) => {
      if (axisLockRef.current) return axisLockRef.current
      const currentPoints = pointsRef.current
      if (!currentPoints.length) return null
      const originScreen = screenPointsRef.current[screenPointsRef.current.length - 1]
      return shouldInferVerticalAxis(originScreen, projection.pointer, viewportViewRef.current) ? 'vertical' : null
    }

    const verticalPointFromProjection = (event, projection) => {
      const currentPoints = pointsRef.current
      const origin = currentPoints[currentPoints.length - 1]
      const projected = projectPointerToVerticalAxis({
        event,
        camera,
        domElement: canvas,
        raycaster,
        origin,
        snapDisabled: event.altKey,
      })
      if (projected && !projected.degenerate) return projected.snapped
      const originScreen = screenPointsRef.current[screenPointsRef.current.length - 1] || [projection.pointer.x, projection.pointer.y]
      const heightDelta = (originScreen[1] - projection.pointer.y) * VERTICAL_FALLBACK_SCALE
      return [origin[0], Math.max(0, pointY(origin) + heightDelta), pointZ(origin)]
    }

    const resolvePoint = (projection, event) => {
      if (activeAxisLock(projection) === 'vertical' && pointsRef.current.length) {
        return verticalPointFromProjection(event, projection)
      }

      if (sketchModeRef.current === 'line' && pointsRef.current.length >= 3 && pointsMatchOnPlane(pointsRef.current[0], pointFromProjection(projection), 0.75)) {
        return pointsRef.current[0]
      }

      const curveEndpointSnap = (
        (sketchModeRef.current === 'arc' && (pointsRef.current.length === 0 || pointsRef.current.length >= 2))
        || (sketchModeRef.current === 'bezier' && (pointsRef.current.length === 0 || pointsRef.current.length >= 3))
      )
      const canSnapVertex = sketchModeRef.current === 'line' || sketchModeRef.current === 'rect' || curveEndpointSnap
      if (canSnapVertex) {
        const screenVertex = findNearestScreenVertex(projection.pointer, curveEndpointSnap ? 24 : 18)
        if (screenVertex) return [screenVertex.x, screenVertex.y, screenVertex.z]
        const nearestVertex = findNearestVertex(documentRef.current, projection.snapped, curveEndpointSnap ? 1 : 0.4, { planeId: sketchPlaneId })
        if (nearestVertex) return [nearestVertex.x, nearestVertex.y, nearestVertex.z]
      }

      if (sketchModeRef.current === 'line') {
        const screenEdge = findNearestScreenEdge(projection.pointer)
        if (screenEdge) return [screenEdge.x, screenEdge.y, screenEdge.z]
      }

      if (sketchModeRef.current === 'line' || sketchModeRef.current === 'rect') {
        const nearestMid = findNearestMidpoint(documentRef.current, projection.snapped, 0.35, { planeId: sketchPlaneId })
        if (nearestMid) return localPointToWorld(sketchPlane, [nearestMid.x, nearestMid.z])
      }

      if (sketchModeRef.current === 'line') {
        const nearestEdge = findNearestEdgePoint(documentRef.current, projection.snapped, 0.45, { planeId: sketchPlaneId })
        if (nearestEdge) return localPointToWorld(sketchPlane, [nearestEdge.x, nearestEdge.z])
      }

      return pointFromProjection(projection)
    }

    const commitLine = (closeLoop = false) => {
      const currentPoints = pointsRef.current
      if (currentPoints.length < 2) return
      const result = stableCreatePath(currentPoints.map(toSketchPoint), {
        close: closeLoop,
        compatType: closeLoop ? 'zone' : 'sketch',
        sketchMode: 'line',
        plane: sketchPlane,
      })
      if (!result.error) setDirty(true)
      setPoints([])
      setScreenPoints([])
      setPreviewPoint(null)
      setAxisLock(null)
      clearInferenceHint()
    }

    const isNearFirstScreenPoint = (projection) => (
      sketchModeRef.current === 'line'
      && pointsRef.current.length >= 3
      && screenPointsRef.current[0]
      && Math.hypot(screenPointsRef.current[0][0] - projection.pointer.x, screenPointsRef.current[0][1] - projection.pointer.y) <= SCREEN_CLOSE_TOLERANCE
    )

    const project = (event) => projectToSketchPlane(event, {
      plane: sketchPlane,
      origin: pointsRef.current.length > 0 ? toSketchPoint(pointsRef.current[pointsRef.current.length - 1]) : null,
      axisLock: axisLockRef.current === 'x' || axisLockRef.current === 'z' ? axisLockRef.current : event.shiftKey ? 'infer' : null,
      snapDisabled: event.altKey,
      planeElevation: sketchPlaneElevation,
    })

    const handleMouseMove = (event) => {
      const projection = project(event)
      if (!projection) {
        clearInferenceHint()
        return
      }
      const nextPoint = isNearFirstScreenPoint(projection) ? pointsRef.current[0] : resolvePoint(projection, event)
      setPreviewPoint(nextPoint)

      // Compute and display segment length during drawing
      const currentPoints = pointsRef.current
      if (currentPoints.length > 0 && nextPoint) {
        const lastPoint = currentPoints[currentPoints.length - 1]
        const dx = nextPoint[0] - lastPoint[0]
        const dy = pointY(nextPoint) - pointY(lastPoint)
        const dz = pointZ(nextPoint) - pointZ(lastPoint)
        setSegmentLength(Math.hypot(dx, dy, dz).toFixed(2))
      } else {
        setSegmentLength(null)
      }
      if (!currentPoints.length) {
        const mode = sketchModeRef.current
        const startLabel = mode === 'rect'
          ? `点击设定矩形起点 · ${sketchPlane.name}`
          : mode === 'arc'
            ? `点击圆弧起点 · ${sketchPlane.name}`
            : mode === 'circle'
              ? `点击圆心 · ${sketchPlane.name}`
              : mode === 'bezier'
                ? `点击贝塞尔起点 · ${sketchPlane.name}`
                : `点击开始草图 · ${sketchPlane.name}`
        setInferenceHint({
          x: projection.pointer.x,
          y: projection.pointer.y,
          label: startLabel,
          color: SKETCH_COLOR,
        })
        return
      }

      const previousPoint = currentPoints[currentPoints.length - 1]
      const closing = sketchModeRef.current === 'line' && currentPoints.length >= 3 && pointsMatchOnPlane(currentPoints[0], nextPoint)
      const overlapping = sketchModeRef.current === 'line'
        && isPlanarSketchSegment(previousPoint, nextPoint)
        && findOverlappingSegment(documentRef.current, toSketchPoint(previousPoint), toSketchPoint(nextPoint), { planeId: sketchPlaneId })

      setInferenceHint({
        x: projection.pointer.x,
        y: projection.pointer.y,
        label: closing
          ? `点击闭合成面 · ${sketchPlane.name}`
          : overlapping
            ? '边已存在'
            : sketchModeRef.current === 'rect'
              ? `点击完成矩形 · ${sketchPlane.name}`
              : sketchModeRef.current === 'arc'
                ? (currentPoints.length === 1 ? '点击圆弧中点' : '点击圆弧终点')
                : sketchModeRef.current === 'circle'
                  ? '点击设定半径并成面'
                  : sketchModeRef.current === 'bezier'
                    ? (currentPoints.length === 1 ? '点击第一控制点' : currentPoints.length === 2 ? '点击第二控制点' : '点击终点生成贝塞尔')
              : activeAxisLock(projection) === 'vertical'
                ? `点 ${currentPoints.length + 1} · Z/蓝轴锁定`
                : axisLockRef.current === 'z'
                  ? `点 ${currentPoints.length + 1} · 地面 Z 轴锁定`
                  : axisLockRef.current === 'x'
                    ? `点 ${currentPoints.length + 1} · X 轴锁定`
                : `点 ${currentPoints.length + 1} · ${sketchPlane.name}`,
        color: closing ? CLOSE_COLOR : SKETCH_COLOR,
      })
    }

    const handleMouseDown = (event) => {
      if (event.button !== 0) return
      const projection = project(event)
      if (!projection) return
      const pointerPoint = [projection.pointer.x, projection.pointer.y]
      const nextPoint = isNearFirstScreenPoint(projection) ? pointsRef.current[0] : resolvePoint(projection, event)
      const currentPoints = pointsRef.current
      if (sketchModeRef.current === 'rect') {
        if (!currentPoints.length) {
          setPoints([nextPoint])
          setScreenPoints([pointerPoint])
          setPreviewPoint(nextPoint)
          return
        }
        const result = stableCreateRectangle(toSketchPoint(currentPoints[0]), toSketchPoint(nextPoint), { compatType: 'zone', plane: sketchPlane })
        if (!result.error) {
          setDirty(true)
        } else {
          setInferenceHint({ x: projection.pointer.x, y: projection.pointer.y, label: result.error, color: ERROR_COLOR })
        }
        setPoints([])
        setScreenPoints([])
        setPreviewPoint(null)
        setAxisLock(null)
        if (!result.error) clearInferenceHint()
        return
      }

      if (!currentPoints.length) {
        setPoints([nextPoint])
        setScreenPoints([pointerPoint])
        setPreviewPoint(nextPoint)
        return
      }

      if (sketchModeRef.current === 'circle') {
        const result = stableCreateCircle(toSketchPoint(currentPoints[0]), toSketchPoint(nextPoint), {
          compatType: 'zone',
          plane: sketchPlane,
          historyLabel: '圆形轮廓',
        })
        if (!result.error) setDirty(true)
        else {
          setInferenceHint({ x: projection.pointer.x, y: projection.pointer.y, label: result.error, color: ERROR_COLOR })
          return
        }
        setPoints([])
        setScreenPoints([])
        setPreviewPoint(null)
        setAxisLock(null)
        clearInferenceHint()
        return
      }

      if (sketchModeRef.current === 'arc') {
        if (currentPoints.length === 1) {
          setPoints((c) => [...c, nextPoint])
          setScreenPoints((c) => [...c, pointerPoint])
          setPreviewPoint(nextPoint)
          return
        }
        const result = stableCreateArc(toSketchPoint(currentPoints[0]), toSketchPoint(currentPoints[1]), toSketchPoint(nextPoint), {
          compatType: 'sketch',
          plane: sketchPlane,
          historyLabel: '圆弧',
        })
        if (!result.error) setDirty(true)
        else {
          setInferenceHint({ x: projection.pointer.x, y: projection.pointer.y, label: result.error, color: ERROR_COLOR })
          return
        }
        setPoints([])
        setScreenPoints([])
        setPreviewPoint(null)
        setAxisLock(null)
        clearInferenceHint()
        return
      }

      if (sketchModeRef.current === 'bezier') {
        if (currentPoints.length < 3) {
          setPoints((c) => [...c, nextPoint])
          setScreenPoints((c) => [...c, pointerPoint])
          setPreviewPoint(nextPoint)
          return
        }
        const result = stableCreateBezier(toSketchPoint(currentPoints[0]), toSketchPoint(currentPoints[1]), toSketchPoint(currentPoints[2]), toSketchPoint(nextPoint), {
          compatType: 'sketch',
          plane: sketchPlane,
          historyLabel: '贝塞尔曲线',
        })
        if (!result.error) setDirty(true)
        else {
          setInferenceHint({ x: projection.pointer.x, y: projection.pointer.y, label: result.error, color: ERROR_COLOR })
          return
        }
        setPoints([])
        setScreenPoints([])
        setPreviewPoint(null)
        setAxisLock(null)
        clearInferenceHint()
        return
      }

      if (currentPoints.length >= 3 && pointsMatchOnPlane(currentPoints[0], nextPoint)) {
        commitLine(true)
        return
      }

      const previousPoint = currentPoints[currentPoints.length - 1]
      if (
        isPlanarSketchSegment(previousPoint, nextPoint)
        && findOverlappingSegment(documentRef.current, toSketchPoint(previousPoint), toSketchPoint(nextPoint), { planeId: sketchPlaneId })
      ) {
        return
      }

      const result = isPlanarSketchSegment(previousPoint, nextPoint)
        ? stableCreatePath([toSketchPoint(previousPoint), toSketchPoint(nextPoint)], {
            close: false,
            compatType: 'sketch',
            sketchMode: 'line',
            plane: sketchPlane,
            historyLabel: '草图线段',
          })
        : stableCreateSegment3D(previousPoint, nextPoint, {
            compatType: 'sketch',
            sketchMode: 'line',
            planeId: sketchPlaneId,
            axisLock: activeAxisLock(projection),
            historyLabel: '草图竖直线段',
          })

      if (!result.error) {
        setDirty(true)
      } else {
        setInferenceHint({ x: projection.pointer.x, y: projection.pointer.y, label: result.error, color: ERROR_COLOR })
        return
      }

      setPoints((c) => [...c, nextPoint])
      setScreenPoints((c) => [...c, pointerPoint])
      setPreviewPoint(nextPoint)
      if (axisLockRef.current === 'vertical') setAxisLock(null)
    }

    const handleKeyDown = (event) => {
      if (event.ctrlKey || event.metaKey) return
      if (event.key === 'Escape') {
        setPoints([])
        setScreenPoints([])
        setPreviewPoint(null)
        setAxisLock(null)
        clearInferenceHint()
      } else if (event.key === 'Enter' && sketchModeRef.current === 'line') {
        commitLine(pointsRef.current.length >= 3)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setAxisLock((current) => (current === 'vertical' ? null : 'vertical'))
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        setAxisLock((current) => (current === 'x' ? null : 'x'))
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setAxisLock((current) => (current === 'z' ? null : 'z'))
      } else if (event.key.toLowerCase() === 'z') {
        event.preventDefault()
        setAxisLock((current) => (current === 'vertical' ? null : 'vertical'))
      }
    }

    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [camera, clearInferenceHint, gl, projectToSketchPlane, raycaster, setDirty, setInferenceHint, sketchPlane, sketchPlaneElevation, sketchPlaneId, stableCreateArc, stableCreateBezier, stableCreateCircle, stableCreatePath, stableCreateRectangle, stableCreateSegment3D])

  const previewGeometry = useMemo(() => (
    allPreviewPoints.length >= 2 ? buildLineGeometry(allPreviewPoints) : null
  ), [allPreviewPoints])

  return (
    <>
      <group>
        {previewGeometry ? (
          <line geometry={previewGeometry}>
            <lineBasicMaterial color={axisLock === 'vertical' ? '#2563eb' : SKETCH_COLOR} depthTest={false} />
          </line>
        ) : null}
        {allPreviewPoints.map((point, index) => (
          <mesh key={`${point[0]}:${pointY(point)}:${pointZ(point)}:${index}`} position={[point[0], pointY(point) + 0.12, pointZ(point)]}>
            <sphereGeometry args={[index === 0 ? 0.1 : 0.075, 12, 12]} />
            <meshBasicMaterial color={index === 0 ? CLOSE_COLOR : SKETCH_COLOR} depthTest={false} />
          </mesh>
        ))}
      </group>
      {segmentLength && previewPoint ? <DimensionLabelDOM camera={camera} point={previewPoint} value={`${segmentLength}m`} /> : null}
    </>
  )
}

function DimensionLabelDOM({ camera, point, value }) {
  const labelRef = useRef(null)

  useEffect(() => {
    const el = document.createElement('div')
    Object.assign(el.style, {
      position: 'fixed',
      padding: '2px 8px',
      background: 'rgba(15, 23, 42, 0.88)',
      color: '#f8fafc',
      fontSize: '12px',
      fontWeight: '700',
      borderRadius: '4px',
      pointerEvents: 'none',
      zIndex: '10000',
      whiteSpace: 'nowrap',
      fontFamily: 'ui-monospace, SFMono-Regular, monospace',
    })
    document.body.appendChild(el)
    labelRef.current = el
    return () => {
      if (el.parentElement) el.parentElement.removeChild(el)
      labelRef.current = null
    }
  }, [])

  useEffect(() => {
    if (labelRef.current) labelRef.current.textContent = value
  }, [value])

  useEffect(() => {
    if (!labelRef.current || !camera) return
    const vector = new THREE.Vector3(point[0], pointY(point) + 0.4, pointZ(point)).project(camera)
    if (!Number.isFinite(vector.x)) return
    const rect = document.documentElement.getBoundingClientRect()
    const x = ((vector.x + 1) / 2) * rect.width
    const y = ((-vector.y + 1) / 2) * rect.height
    labelRef.current.style.left = `${x - 30}px`
    labelRef.current.style.top = `${y - 12}px`
  })

  return null
}
