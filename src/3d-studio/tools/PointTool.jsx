/**
 * Point Tool
 * 点工具 - 创建独立顶点
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useScene } from '@pascal-app/core'
import { useThree } from '@react-three/fiber'
import { nanoid } from 'nanoid'
import * as THREE from 'three'
import useEditor from '../store/useEditor'
import { useWorkbenchPlane } from '../utils/workbenchPlane'

const POINT_COLOR = '#2563eb'
const POINT_PREVIEW_COLOR = '#60a5fa'

export default function PointTool() {
  const [previewPoint, setPreviewPoint] = useState(null)
  const createNode = useScene((state) => state.createNode)
  const nodes = useScene((state) => state.nodes)
  const setDirty = useEditor((state) => state.setDirty)
  const setInferenceHint = useEditor((state) => state.setInferenceHint)
  const clearInferenceHint = useEditor((state) => state.clearInferenceHint)
  const projectToGround = useWorkbenchPlane()
  const gl = useThree((state) => state.gl)

  const activeLevelId = useMemo(
    () => Object.values(nodes || {}).find((node) => node?.type === 'level')?.id || null,
    [nodes],
  )

  useEffect(() => {
    const canvas = gl?.domElement
    if (!canvas) return undefined

    const handleMouseMove = (event) => {
      const projection = projectToGround(event, {
        origin: null,
        axisLock: event.shiftKey ? 'infer' : null,
        snapDisabled: event.altKey,
      })
      if (!projection) {
        clearInferenceHint()
        return
      }

      setPreviewPoint(projection.snapped)
      setInferenceHint({
        x: projection.pointer.x,
        y: projection.pointer.y,
        label: '点击创建点',
        color: POINT_COLOR,
      })
    }

    const handleMouseDown = (event) => {
      if (event.button !== 0 || !activeLevelId) return

      const projection = projectToGround(event, {
        origin: null,
        axisLock: event.shiftKey ? 'infer' : null,
        snapDisabled: event.altKey,
      })

      if (!projection) return

      const [x, z] = projection.snapped

      createNode(
        {
          id: `point_${nanoid()}`,
          type: 'point',
          object: 'node',
          position: [x, 0, z],
          visible: true,
          color: POINT_COLOR,
          children: [],
        },
        activeLevelId,
      )

      setDirty(true)
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setPreviewPoint(null)
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
  }, [activeLevelId, clearInferenceHint, createNode, gl, projectToGround, setDirty, setInferenceHint])

  return (
    <group>
      {previewPoint && (
        <mesh position={[previewPoint[0], 0.12, previewPoint[1]]}>
          <sphereGeometry args={[0.08, 12, 12]} />
          <meshBasicMaterial
            color={POINT_PREVIEW_COLOR}
            depthTest={false}
            opacity={0.8}
            transparent
          />
        </mesh>
      )}
    </group>
  )
}