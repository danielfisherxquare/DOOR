/**
 * Column Tool
 * 柱子放置工具 — 点击地面放置柱子
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useScene } from '@pascal-app/core'
import { useThree } from '@react-three/fiber'
import { nanoid } from 'nanoid'
import useEditor from '../store/useEditor'
import { useWorkbenchPlane } from '../utils/workbenchPlane'

const DEFAULT_COLUMN = {
  width: 0.4,
  depth: 0.4,
  height: 3.0,
}

export default function ColumnTool() {
  const [previewPos, setPreviewPos] = useState(null)

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
        snapDisabled: event.altKey,
      })
      if (!projection) {
        clearInferenceHint()
        setPreviewPos(null)
        return
      }

      setPreviewPos(projection.snapped)
      setInferenceHint({
        x: projection.pointer.x,
        y: projection.pointer.y,
        label: `放置柱 (${projection.snapped[0].toFixed(1)}, ${projection.snapped[1].toFixed(1)})`,
        color: '#8b5cf6',
      })
    }

    const handleMouseDown = (event) => {
      if (event.button !== 0 || !activeLevelId) return

      const projection = projectToGround(event, {
        snapDisabled: event.altKey,
      })
      if (!projection) return

      createNode(
        {
          id: `column_${nanoid()}`,
          type: 'column',
          object: 'node',
          visible: true,
          position: [projection.snapped[0], 0, projection.snapped[1]],
          rotation: [0, 0, 0],
          width: DEFAULT_COLUMN.width,
          depth: DEFAULT_COLUMN.depth,
          height: DEFAULT_COLUMN.height,
          children: [],
        },
        activeLevelId,
      )
      setDirty(true)
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setPreviewPos(null)
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

  if (!previewPos) return null

  return (
    <group>
      {/* 柱预览 */}
      <mesh
        position={[previewPos[0], DEFAULT_COLUMN.height / 2, previewPos[1]]}
      >
        <boxGeometry
          args={[DEFAULT_COLUMN.width, DEFAULT_COLUMN.height, DEFAULT_COLUMN.depth]}
        />
        <meshBasicMaterial color="#8b5cf6" opacity={0.35} transparent />
      </mesh>

      {/* 底部十字标记 */}
      <mesh position={[previewPos[0], 0.05, previewPos[1]]}>
        <ringGeometry args={[0.15, 0.2, 16]} />
        <meshBasicMaterial
          color="#8b5cf6"
          depthTest={false}
          opacity={0.7}
          transparent
          rotation-x={-Math.PI / 2}
        />
      </mesh>
    </group>
  )
}
