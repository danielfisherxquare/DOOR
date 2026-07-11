/**
 * Measure Tool
 * 测量工具 — 两点测距，显示距离标注
 */

import { useEffect, useMemo, useState } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import useEditor from '../store/useEditor'
import { useWorkbenchPlane } from '../utils/workbenchPlane'

const MEASURE_COLOR = '#f59e0b'

export default function MeasureTool() {
  const [startPoint, setStartPoint] = useState(null)
  const [endPoint, setEndPoint] = useState(null)
  const [isDrawing, setIsDrawing] = useState(false)

  const {
    measurements,
    addMeasurement,
    setInferenceHint,
    clearInferenceHint,
  } = useEditor()

  const projectToGround = useWorkbenchPlane()
  const gl = useThree((state) => state.gl)

  useEffect(() => {
    const canvas = gl?.domElement
    if (!canvas) return undefined

    const handleMouseMove = (event) => {
      if (!isDrawing || !startPoint) return

      const projection = projectToGround(event, {
        origin: startPoint,
        axisLock: event.shiftKey ? 'infer' : null,
        snapDisabled: event.altKey,
      })
      if (!projection) return

      setEndPoint(projection.snapped)

      const dist = Math.hypot(
        projection.snapped[0] - startPoint[0],
        projection.snapped[1] - startPoint[1],
      )

      setInferenceHint({
        x: projection.pointer.x,
        y: projection.pointer.y,
        label: `${dist.toFixed(2)} m`,
        color: MEASURE_COLOR,
      })
    }

    const handleMouseDown = (event) => {
      if (event.button !== 0) return

      const projection = projectToGround(event, {
        origin: isDrawing ? startPoint : null,
        axisLock: event.shiftKey ? 'infer' : null,
        snapDisabled: event.altKey,
      })
      if (!projection) return

      if (!isDrawing) {
        // 第一次点击：设置起点
        setStartPoint(projection.snapped)
        setEndPoint(projection.snapped)
        setIsDrawing(true)
        setInferenceHint({
          x: projection.pointer.x,
          y: projection.pointer.y,
          label: '测量起点已锁定',
          color: MEASURE_COLOR,
        })
      } else {
        // 第二次点击：完成测量
        const dist = Math.hypot(
          projection.snapped[0] - startPoint[0],
          projection.snapped[1] - startPoint[1],
        )

        if (dist > 0.01) {
          addMeasurement({
            type: 'distance',
            start: [...startPoint],
            end: [...projection.snapped],
            value: dist,
          })
        }

        setIsDrawing(false)
        setStartPoint(null)
        setEndPoint(null)
        clearInferenceHint()
      }
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsDrawing(false)
        setStartPoint(null)
        setEndPoint(null)
        clearInferenceHint()
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
    addMeasurement,
    clearInferenceHint,
    gl,
    isDrawing,
    projectToGround,
    setInferenceHint,
    startPoint,
  ])

  return (
    <group>
      {/* 当前正在绘制的测量线 */}
      {isDrawing && startPoint && endPoint && (
        <MeasureLine start={startPoint} end={endPoint} active />
      )}

      {/* 已完成的测量 */}
      {measurements
        .filter((m) => m.visible && m.type === 'distance')
        .map((m) => (
          <MeasureLine key={m.id} start={m.start} end={m.end} value={m.value} />
        ))}
    </group>
  )
}

// ──────────────────────────────────────────────────
// 测量线组件
// ──────────────────────────────────────────────────

function MeasureLine({ start, end, value, active = false }) {
  const distance = value ?? Math.hypot(end[0] - start[0], end[1] - start[1])
  const midX = (start[0] + end[0]) / 2
  const midZ = (start[1] + end[1]) / 2

  const lineGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const positions = new Float32Array([
      start[0], 0.15, start[1],
      end[0], 0.15, end[1],
    ])
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return geo
  }, [start, end])

  const color = active ? '#fb923c' : MEASURE_COLOR

  return (
    <group>
      {/* 测量线 */}
      <line geometry={lineGeo}>
        <lineBasicMaterial
          color={color}
          depthTest={false}
          linewidth={2}
          opacity={active ? 1 : 0.7}
          transparent
        />
      </line>

      {/* 端点标记 */}
      <mesh position={[start[0], 0.15, start[1]]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshBasicMaterial color={color} depthTest={false} />
      </mesh>
      <mesh position={[end[0], 0.15, end[1]]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshBasicMaterial color={color} depthTest={false} />
      </mesh>

      {/* 距离标签（使用 3D sprite） */}
      <MeasureLabel
        distance={distance}
        position={[midX, 0.4, midZ]}
        color={color}
      />
    </group>
  )
}

// ──────────────────────────────────────────────────
// 距离标签（Canvas Sprite）
// ──────────────────────────────────────────────────

function MeasureLabel({ distance, position }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 40
    const ctx = canvas.getContext('2d')

    // 背景
    ctx.fillStyle = 'rgba(0,0,0,0.75)'
    ctx.beginPath()
    ctx.roundRect(4, 4, 120, 32, 6)
    ctx.fill()

    // 文字
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 18px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${distance.toFixed(2)} m`, 64, 20)

    const tex = new THREE.CanvasTexture(canvas)
    tex.needsUpdate = true
    return tex
  }, [distance])

  return (
    <sprite position={position} scale={[1.2, 0.4, 1]}>
      <spriteMaterial
        depthTest={false}
        map={texture}
        opacity={0.95}
        transparent
      />
    </sprite>
  )
}
