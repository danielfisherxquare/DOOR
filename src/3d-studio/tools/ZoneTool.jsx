/**
 * Zone Tool
 * 区域绘制工具 — 通过点击创建多边形区域
 *
 * 交互流程:
 * - 点击添加多边形顶点
 * - 双击或 Enter 完成区域创建（最少 3 个点）
 * - Escape 取消当前绘制
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useScene } from '@pascal-app/core'
import { useThree } from '@react-three/fiber'
import { nanoid } from 'nanoid'
import * as THREE from 'three'
import useEditor from '../store/useEditor'
import { useWorkbenchPlane } from '../utils/workbenchPlane'

const ZONE_PREVIEW_COLOR = '#6366f1'
const ZONE_FILL_OPACITY = 0.18
const ZONE_LINE_OPACITY = 0.85
const MIN_POINTS = 3

export default function ZoneTool() {
  const [points, setPoints] = useState([])
  const [previewPoint, setPreviewPoint] = useState(null)

  const createNode = useScene((state) => state.createNode)
  const nodes = useScene((state) => state.nodes)
  const setDirty = useEditor((state) => state.setDirty)
  const setInferenceHint = useEditor((state) => state.setInferenceHint)
  const clearInferenceHint = useEditor((state) => state.clearInferenceHint)
  const projectToGround = useWorkbenchPlane()
  const gl = useThree((state) => state.gl)

  // 查找当前 level
  const activeLevelId = useMemo(
    () => Object.values(nodes || {}).find((node) => node?.type === 'level')?.id || null,
    [nodes],
  )

  // 完成区域创建
  const finishZone = useCallback(() => {
    if (points.length < MIN_POINTS || !activeLevelId) return

    createNode(
      {
        id: `zone_${nanoid()}`,
        type: 'zone',
        object: 'node',
        name: `区域-${Date.now().toString(36).slice(-4)}`,
        visible: true,
        polygon: points.map((p) => [p[0], p[1]]),
        color: generateZoneColor(),
        metadata: { zoneType: 'general' },
      },
      activeLevelId,
    )

    setDirty(true)
    setPoints([])
    setPreviewPoint(null)
    clearInferenceHint()
  }, [points, activeLevelId, createNode, setDirty, clearInferenceHint])

  // 取消绘制
  const cancelDrawing = useCallback(() => {
    setPoints([])
    setPreviewPoint(null)
    clearInferenceHint()
  }, [clearInferenceHint])

  useEffect(() => {
    const canvas = gl?.domElement
    if (!canvas) return undefined

    let lastClickTime = 0

    const handleMouseMove = (event) => {
      const projection = projectToGround(event, {
        origin: points.length > 0 ? points[points.length - 1] : null,
        axisLock: event.shiftKey ? 'infer' : null,
        snapDisabled: event.altKey,
      })
      if (!projection) {
        clearInferenceHint()
        return
      }

      setPreviewPoint(projection.snapped)

      if (points.length > 0) {
        setInferenceHint({
          x: projection.pointer.x,
          y: projection.pointer.y,
          label: `顶点 ${points.length + 1}${points.length >= MIN_POINTS - 1 ? ' (双击完成)' : ''}`,
          color: ZONE_PREVIEW_COLOR,
        })
      }
    }

    const handleMouseDown = (event) => {
      if (event.button !== 0 || !activeLevelId) return

      const now = Date.now()
      const isDoubleClick = now - lastClickTime < 350
      lastClickTime = now

      const projection = projectToGround(event, {
        origin: points.length > 0 ? points[points.length - 1] : null,
        axisLock: event.shiftKey ? 'infer' : null,
        snapDisabled: event.altKey,
      })

      if (!projection) return

      if (isDoubleClick && points.length >= MIN_POINTS) {
        finishZone()
        return
      }

      const newPoint = projection.snapped
      // 避免重复点
      const lastPoint = points[points.length - 1]
      if (
        lastPoint &&
        Math.abs(newPoint[0] - lastPoint[0]) < 0.001 &&
        Math.abs(newPoint[1] - lastPoint[1]) < 0.001
      ) {
        return
      }

      setPoints((prev) => [...prev, newPoint])
      setInferenceHint({
        x: projection.pointer.x,
        y: projection.pointer.y,
        label: `顶点 ${points.length + 1} 已锁定`,
        color: ZONE_PREVIEW_COLOR,
      })
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        cancelDrawing()
      } else if (event.key === 'Enter' && points.length >= MIN_POINTS) {
        finishZone()
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
    cancelDrawing,
    clearInferenceHint,
    finishZone,
    gl,
    points,
    projectToGround,
    setInferenceHint,
  ])

  // 构建预览多边形的点
  const allPoints = useMemo(() => {
    const pts = [...points]
    if (previewPoint) pts.push(previewPoint)
    return pts
  }, [points, previewPoint])

  return (
    <group>
      {/* 已确认的顶点标记 */}
      {points.map((pt, i) => (
        <mesh key={i} position={[pt[0], 0.12, pt[1]]}>
          <sphereGeometry args={[0.1, 12, 12]} />
          <meshBasicMaterial
            color={i === 0 ? '#f59e0b' : ZONE_PREVIEW_COLOR}
            depthTest={false}
          />
        </mesh>
      ))}

      {/* 轮廓线 */}
      {allPoints.length >= 2 && (
        <ZoneOutline points={allPoints} closed={allPoints.length >= MIN_POINTS} />
      )}

      {/* 填充预览 */}
      {allPoints.length >= MIN_POINTS && <ZoneFill points={allPoints} />}

      {/* 预览点（鼠标位置） */}
      {previewPoint && (
        <mesh position={[previewPoint[0], 0.12, previewPoint[1]]}>
          <sphereGeometry args={[0.08, 12, 12]} />
          <meshBasicMaterial
            color={ZONE_PREVIEW_COLOR}
            depthTest={false}
            opacity={0.6}
            transparent
          />
        </mesh>
      )}
    </group>
  )
}

// ──────────────────────────────────────────────────
// 区域轮廓线
// ──────────────────────────────────────────────────

function ZoneOutline({ points, closed }) {
  const linePoints = useMemo(() => {
    const pts = points.map((p) => new THREE.Vector3(p[0], 0.11, p[1]))
    if (closed && pts.length >= 3) {
      pts.push(pts[0].clone()) // 闭合
    }
    return pts
  }, [points, closed])

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const positions = new Float32Array(linePoints.length * 3)
    linePoints.forEach((pt, i) => {
      positions[i * 3] = pt.x
      positions[i * 3 + 1] = pt.y
      positions[i * 3 + 2] = pt.z
    })
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return geo
  }, [linePoints])

  return (
    <line geometry={geometry}>
      <lineBasicMaterial
        color={ZONE_PREVIEW_COLOR}
        depthTest={false}
        linewidth={2}
        opacity={ZONE_LINE_OPACITY}
        transparent
      />
    </line>
  )
}

// ──────────────────────────────────────────────────
// 区域填充预览
// ──────────────────────────────────────────────────

function ZoneFill({ points }) {
  const geometry = useMemo(() => {
    if (points.length < 3) return null

    const shape = new THREE.Shape()
    shape.moveTo(points[0][0], points[0][1])
    for (let i = 1; i < points.length; i++) {
      shape.lineTo(points[i][0], points[i][1])
    }
    shape.closePath()

    const geo = new THREE.ShapeGeometry(shape)
    // 旋转到 XZ 平面
    geo.rotateX(-Math.PI / 2)
    geo.translate(0, 0.1, 0)

    return geo
  }, [points])

  if (!geometry) return null

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial
        color={ZONE_PREVIEW_COLOR}
        depthTest={false}
        opacity={ZONE_FILL_OPACITY}
        side={THREE.DoubleSide}
        transparent
      />
    </mesh>
  )
}

// ──────────────────────────────────────────────────
// 工具函数
// ──────────────────────────────────────────────────

const ZONE_COLORS = [
  '#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316',
]

let colorIndex = 0

function generateZoneColor() {
  const color = ZONE_COLORS[colorIndex % ZONE_COLORS.length]
  colorIndex++
  return color
}
