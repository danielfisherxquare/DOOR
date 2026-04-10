/**
 * Wall Tool
 * 墙体绘制工具
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useScene } from '@pascal-app/core'
import { useThree } from '@react-three/fiber'
import { nanoid } from 'nanoid'
import useEditor from '../store/useEditor'
import { useWorkbenchPlane } from '../utils/workbenchPlane'

const AXIS_META = {
  x: { color: '#d14343', label: '沿红轴' },
  z: { color: '#2b8a57', label: '沿绿轴' },
  y: { color: '#2f71da', label: '沿蓝轴' },
}

function formatHintLabel({ axisLock, snapEnabled, snapStep }) {
  const parts = []
  if (axisLock && AXIS_META[axisLock]) {
    parts.push(AXIS_META[axisLock].label)
  }
  if (snapEnabled) {
    parts.push(`吸附 ${snapStep}m`)
  }
  return parts.join(' | ')
}

export default function WallTool() {
  const [startPoint, setStartPoint] = useState(null)
  const [previewEnd, setPreviewEnd] = useState(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [manualAxisLock, setManualAxisLock] = useState(null)
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

  const updatePreview = useCallback((event) => {
    if (!isDrawing || !startPoint) return null

    const projection = projectToGround(event, {
      origin: startPoint,
      axisLock: manualAxisLock || (event.shiftKey ? 'infer' : null),
      snapDisabled: event.altKey,
    })
    if (!projection) {
      clearInferenceHint()
      return null
    }

    setPreviewEnd(projection.snapped)
    const hintLabel = formatHintLabel(projection)
    setInferenceHint({
      x: projection.pointer.x,
      y: projection.pointer.y,
      label: hintLabel || '自由绘制',
      color: AXIS_META[projection.axisLock]?.color || '#1d4ed8',
    })
    return projection
  }, [clearInferenceHint, isDrawing, manualAxisLock, projectToGround, setInferenceHint, startPoint])

  useEffect(() => {
    const canvas = gl?.domElement
    if (!canvas) return undefined

    const handleMouseMove = (event) => {
      updatePreview(event)
    }

    const handleMouseDown = (event) => {
      if (event.button !== 0 || !activeLevelId) return

      const projection = isDrawing && startPoint
        ? updatePreview(event)
        : projectToGround(event, {
            origin: null,
            axisLock: null,
            snapDisabled: event.altKey,
          })

      if (!projection) return

      if (!isDrawing) {
        setStartPoint(projection.snapped)
        setPreviewEnd(projection.snapped)
        setIsDrawing(true)
        setInferenceHint({
          x: projection.pointer.x,
          y: projection.pointer.y,
          label: formatHintLabel(projection) || '起点已锁定',
          color: AXIS_META[projection.axisLock]?.color || '#1d4ed8',
        })
        return
      }

      const nextEnd = projection.snapped
      if (!startPoint || !nextEnd) return

      if (Math.hypot(nextEnd[0] - startPoint[0], nextEnd[1] - startPoint[1]) < 0.001) {
        return
      }

      createNode({
        id: nanoid(),
        type: 'wall',
        start: startPoint,
        end: nextEnd,
        height: 3,
        thickness: 0.2,
        visible: true,
        children: [],
        frontSide: 'unknown',
        backSide: 'unknown',
      }, activeLevelId)
      setDirty(true)
      setStartPoint(nextEnd)
      setPreviewEnd(nextEnd)
    }

    const handleKeyDown = (event) => {
      const key = event.key.toLowerCase()
      if (key === 'escape') {
        setIsDrawing(false)
        setStartPoint(null)
        setPreviewEnd(null)
        setManualAxisLock(null)
        clearInferenceHint()
      } else if (key === 'x') {
        setManualAxisLock((current) => current === 'x' ? null : 'x')
      } else if (key === 'z') {
        setManualAxisLock((current) => current === 'z' ? null : 'z')
      } else if (key === 'y') {
        setManualAxisLock((current) => current === 'y' ? null : 'y')
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
    clearInferenceHint,
    createNode,
    isDrawing,
    projectToGround,
    setDirty,
    setInferenceHint,
    startPoint,
    updatePreview,
    gl,
  ])

  const previewColor = manualAxisLock && AXIS_META[manualAxisLock]
    ? AXIS_META[manualAxisLock].color
    : '#3767cf'

  return (
    <group>
      {startPoint ? (
        <mesh position={[startPoint[0], 0.14, startPoint[1]]}>
          <sphereGeometry args={[0.12, 18, 18]} />
          <meshBasicMaterial color="#f59e0b" />
        </mesh>
      ) : null}

      {startPoint && previewEnd ? (
        <WallPreview color={previewColor} start={startPoint} end={previewEnd} />
      ) : null}
    </group>
  )
}

function WallPreview({ start, end, color }) {
  const dx = end[0] - start[0]
  const dz = end[1] - start[1]
  const length = Math.sqrt(dx * dx + dz * dz)
  const angle = Math.atan2(dz, dx)

  return (
    <mesh
      position={[
        (start[0] + end[0]) / 2,
        1.5,
        (start[1] + end[1]) / 2,
      ]}
      rotation={[0, -angle, 0]}
    >
      <boxGeometry args={[length || 0.01, 3, 0.2]} />
      <meshBasicMaterial color={color} transparent opacity={0.42} />
    </mesh>
  )
}
