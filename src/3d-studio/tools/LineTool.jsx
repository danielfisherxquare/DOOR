/**
 * Line Tool
 * SketchUp风格连续绘制工具 - 支持自动成面
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useScene } from '@pascal-app/core'
import { useThree } from '@react-three/fiber'
import { nanoid } from 'nanoid'
import * as THREE from 'three'
import useEditor from '../store/useEditor'
import { useWorkbenchPlane } from '../utils/workbenchPlane'

const AXIS_META = {
  x: { color: '#d14343', label: '沿红轴' },
  z: { color: '#2b8a57', label: '沿绿轴' },
  y: { color: '#2f71da', label: '沿蓝轴' },
}

const LINE_COLOR = '#3767cf'
const FACE_COLOR = '#6366f1'
const SNAP_THRESHOLD = 0.5 // 吸附到起始点的阈值

function formatHintLabel({ axisLock, snapEnabled, snapStep, pointCount }) {
  const parts = []
  if (pointCount > 0) {
    parts.push(`点 ${pointCount}`)
  }
  if (axisLock && AXIS_META[axisLock]) {
    parts.push(AXIS_META[axisLock].label)
  }
  if (snapEnabled) {
    parts.push(`吸附 ${snapStep}m`)
  }
  return parts.join(' | ')
}

/**
 * 检查点是否可以形成闭合多边形
 */
function canClosePolygon(points, currentPoint, threshold = SNAP_THRESHOLD) {
  if (points.length < 3) return false
  const firstPoint = points[0]
  const dx = currentPoint[0] - firstPoint[0]
  const dz = currentPoint[1] - firstPoint[1]
  return Math.hypot(dx, dz) < threshold
}

/**
 * 验证多边形是否有效（不自相交）
 */
function validatePolygon(polygon) {
  if (polygon.length < 3) return false

  const n = polygon.length

  for (let i = 0; i < n; i++) {
    const p1 = polygon[i]
    const p2 = polygon[(i + 1) % n]

    for (let j = i + 2; j < n; j++) {
      if (j === n - 1 && i === 0) continue

      const p3 = polygon[j]
      const p4 = polygon[(j + 1) % n]

      if (doSegmentsIntersect(p1, p2, p3, p4)) {
        return false
      }
    }
  }

  return true
}

function doSegmentsIntersect(p1, p2, p3, p4) {
  const d1 = direction(p3, p4, p1)
  const d2 = direction(p3, p4, p2)
  const d3 = direction(p1, p2, p3)
  const d4 = direction(p1, p2, p4)

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true
  }

  return false
}

function direction(pi, pj, pk) {
  return (pk[0] - pi[0]) * (pj[1] - pi[1]) - (pj[0] - pi[0]) * (pk[1] - pi[1])
}

export default function LineTool() {
  const [points, setPoints] = useState([]) // 已确认的点列表
  const [previewPoint, setPreviewPoint] = useState(null) // 预览点
  const [isDrawing, setIsDrawing] = useState(false)
  const [manualAxisLock, setManualAxisLock] = useState(null)
  const [isSnappingToStart, setIsSnappingToStart] = useState(false)

  const createNode = useScene((state) => state.createNode)
  const nodes = useScene((state) => state.nodes)
  const setDirty = useEditor((state) => state.setDirty)
  const setInferenceHint = useEditor((state) => state.setInferenceHint)
  const clearInferenceHint = useEditor((state) => state.clearInferenceHint)
  const projectToGround = useWorkbenchPlane()
  const gl = useThree((state) => state.gl)

  const activeLevelId = useMemo(() => (
    Object.values(nodes || {}).find((node) => node?.type === 'level')?.id || null
  ), [nodes])

  // 检测是否可以闭合
  const canClose = useMemo(() => {
    if (!previewPoint || points.length < 3) return false
    return canClosePolygon(points, previewPoint)
  }, [points, previewPoint])

  // 完成绘制并创建线段和面
  const finishDrawing = useCallback(() => {
    if (points.length < 2 || !activeLevelId) return

    // 创建所有线段
    for (let i = 0; i < points.length - 1; i++) {
      createNode({
        id: `line_${nanoid()}`,
        type: 'line',
        object: 'node',
        start: points[i],
        end: points[i + 1],
        color: LINE_COLOR,
        visible: true,
        children: [],
      }, activeLevelId)
    }

    // 如果闭合且有3个以上点，创建面
    if (points.length >= 3) {
      const polygon = [...points]
      if (validatePolygon(polygon)) {
        createNode({
          id: `zone_${nanoid()}`,
          type: 'zone',
          object: 'node',
          name: `区域-${Date.now().toString(36).slice(-4)}`,
          visible: true,
          polygon,
          color: FACE_COLOR,
          metadata: { zoneType: 'general' },
        }, activeLevelId)
      }
    }

    setDirty(true)
    setPoints([])
    setPreviewPoint(null)
    setIsDrawing(false)
    clearInferenceHint()
  }, [points, activeLevelId, createNode, setDirty, clearInferenceHint])

  // 添加点
  const addPoint = useCallback((point) => {
    // 检查是否闭合到起点
    if (points.length >= 3 && canClosePolygon(points, point)) {
      setPoints((prev) => [...prev, prev[0]]) // 闭合到起点
      setTimeout(() => finishDrawing(), 0)
      return
    }

    setPoints((prev) => [...prev, point])
  }, [points, finishDrawing])

  useEffect(() => {
    const canvas = gl?.domElement
    if (!canvas) return undefined

    const handleMouseMove = (event) => {
      if (!isDrawing) return

      const lastPoint = points.length > 0 ? points[points.length - 1] : null
      const projection = projectToGround(event, {
        origin: lastPoint,
        axisLock: manualAxisLock || (event.shiftKey ? 'infer' : null),
        snapDisabled: event.altKey,
      })

      if (!projection) {
        clearInferenceHint()
        return
      }

      // 检测是否吸附到起点
      const snapping = points.length >= 3 && canClosePolygon(points, projection.snapped)
      setIsSnappingToStart(snapping)

      setPreviewPoint(projection.snapped)
      setInferenceHint({
        x: projection.pointer.x,
        y: projection.pointer.y,
        label: snapping
          ? '点击闭合'
          : formatHintLabel({ ...projection, pointCount: points.length }) || '自由画线',
        color: snapping ? '#22c55e' : (AXIS_META[projection.axisLock]?.color || LINE_COLOR),
      })
    }

    const handleMouseDown = (event) => {
      if (event.button !== 0 || !activeLevelId) return

      const projection = projectToGround(event, {
        origin: points.length > 0 ? points[points.length - 1] : null,
        axisLock: manualAxisLock || (event.shiftKey ? 'infer' : null),
        snapDisabled: event.altKey,
      })

      if (!projection) return

      if (!isDrawing) {
        // 开始绘制
        setPoints([projection.snapped])
        setPreviewPoint(projection.snapped)
        setIsDrawing(true)
        setInferenceHint({
          x: projection.pointer.x,
          y: projection.pointer.y,
          label: '起点已锁定，继续点击',
          color: LINE_COLOR,
        })
        return
      }

      // 添加点
      addPoint(projection.snapped)
    }

    const handleKeyDown = (event) => {
      const key = event.key.toLowerCase()
      if (key === 'escape') {
        // 取消绘制
        setPoints([])
        setPreviewPoint(null)
        setIsDrawing(false)
        setIsSnappingToStart(false)
        setManualAxisLock(null)
        clearInferenceHint()
      } else if (key === 'enter') {
        // 完成绘制
        if (points.length >= 2) {
          finishDrawing()
        }
      } else if (key === 'x') {
        setManualAxisLock((current) => (current === 'x' ? null : 'x'))
      } else if (key === 'z') {
        setManualAxisLock((current) => (current === 'z' ? null : 'z'))
      } else if (key === 'y') {
        setManualAxisLock((current) => (current === 'y' ? null : 'y'))
      }
    }

    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('keydown', handleKeyDown)
      clearInferenceHint()
    }
  }, [
    activeLevelId,
    addPoint,
    clearInferenceHint,
    finishDrawing,
    gl,
    isDrawing,
    manualAxisLock,
    points,
    projectToGround,
    setInferenceHint,
  ])

  const previewColor = isSnappingToStart
    ? '#22c55e'
    : (manualAxisLock && AXIS_META[manualAxisLock]
      ? AXIS_META[manualAxisLock].color
      : LINE_COLOR)

  return (
    <group>
      {/* 已确认的点 */}
      {points.map((point, index) => (
        <mesh key={index} position={[point[0], 0.12, point[1]]}>
          <sphereGeometry args={[index === 0 ? 0.12 : 0.08, 16, 16]} />
          <meshBasicMaterial
            color={index === 0 ? '#f59e0b' : LINE_COLOR}
            depthTest={false}
          />
        </mesh>
      ))}

      {/* 预览点 */}
      {isDrawing && previewPoint && !points.some(p =>
        Math.abs(p[0] - previewPoint[0]) < 0.001 && Math.abs(p[1] - previewPoint[1]) < 0.001
      ) && (
        <mesh position={[previewPoint[0], 0.12, previewPoint[1]]}>
          <sphereGeometry args={[0.08, 12, 12]} />
          <meshBasicMaterial
            color={isSnappingToStart ? '#22c55e' : '#60a5fa'}
            depthTest={false}
            opacity={0.7}
            transparent
          />
        </mesh>
      )}

      {/* 已确认的线段预览 */}
      {points.length >= 2 && (
        <LineSegmentsPreview points={points} color={LINE_COLOR} />
      )}

      {/* 当前绘制的线段预览 */}
      {isDrawing && points.length > 0 && previewPoint && (
        <LinePreview
          start={points[points.length - 1]}
          end={previewPoint}
          color={previewColor}
        />
      )}

      {/* 闭合预览 - 轮廓线 */}
      {canClose && points.length >= 3 && (
        <LinePreview
          start={previewPoint}
          end={points[0]}
          color="#22c55e"
        />
      )}

      {/* 面预览 */}
      {isDrawing && points.length >= 3 && previewPoint && (
        <FacePreview points={[...points, previewPoint]} />
      )}
    </group>
  )
}

/**
 * 已确认线段预览
 */
function LineSegmentsPreview({ points, color }) {
  const geometry = useMemo(() => {
    const positions = []
    for (let i = 0; i < points.length - 1; i++) {
      positions.push(
        points[i][0], 0.1, points[i][1],
        points[i + 1][0], 0.1, points[i + 1][1]
      )
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return geo
  }, [points])

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={color} depthTest={false} opacity={0.95} transparent />
    </lineSegments>
  )
}

/**
 * 单条线段预览
 */
function LinePreview({ start, end, color }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute([
      start[0], 0.1, start[1],
      end[0], 0.1, end[1],
    ], 3))
    return geo
  }, [end, start])

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <line geometry={geometry}>
      <lineBasicMaterial color={color} depthTest={false} opacity={0.95} transparent />
    </line>
  )
}

/**
 * 面预览
 */
function FacePreview({ points }) {
  const geometry = useMemo(() => {
    if (points.length < 3) return null

    const shape = new THREE.Shape()
    shape.moveTo(points[0][0], points[0][1])
    for (let i = 1; i < points.length; i++) {
      shape.lineTo(points[i][0], points[i][1])
    }
    shape.closePath()

    const geo = new THREE.ShapeGeometry(shape)
    geo.rotateX(-Math.PI / 2)
    geo.translate(0, 0.08, 0)
    return geo
  }, [points])

  useEffect(() => () => geometry?.dispose(), [geometry])

  if (!geometry) return null

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial
        color={FACE_COLOR}
        depthTest={false}
        opacity={0.12}
        side={THREE.DoubleSide}
        transparent
      />
    </mesh>
  )
}
