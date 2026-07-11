/**
 * Transform Gizmo
 * 变换控件 — 为选中的 item/zone/column 类型节点提供移动和旋转手柄
 * 不依赖 @react-three/drei，使用原生 Three.js 实现
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useScene } from '@pascal-app/core'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import useViewer from '../../../node_modules/@pascal-app/viewer/dist/store/use-viewer.js'
import useEditor from '../store/useEditor'
import { projectPointerToGround } from '../utils/workbenchPlane'

const GIZMO_COLORS = {
  x: '#d14343',
  z: '#2b8a57',
  y: '#2f71da',
  rotate: '#f59e0b',
}

// 可变换的节点类型
const TRANSFORMABLE_TYPES = ['item', 'zone', 'column']

// ──────────────────────────────────────────────────
// 移动轴箭头
// ──────────────────────────────────────────────────

function AxisArrow({ axis, color, onDragStart }) {
  const meshRef = useRef()
  const [hovered, setHovered] = useState(false)

  const direction = useMemo(() => {
    switch (axis) {
      case 'x': return [1, 0, 0]
      case 'y': return [0, 1, 0]
      case 'z': return [0, 0, 1]
      default: return [1, 0, 0]
    }
  }, [axis])

  const position = useMemo(
    () => direction.map((d) => d * 0.8),
    [direction],
  )

  const rotation = useMemo(() => {
    switch (axis) {
      case 'x': return [0, 0, -Math.PI / 2]
      case 'y': return [0, 0, 0]
      case 'z': return [Math.PI / 2, 0, 0]
      default: return [0, 0, 0]
    }
  }, [axis])

  return (
    <group>
      {/* 轴线 */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            args={[new Float32Array([0, 0, 0, ...direction.map((d) => d * 1.2)]), 3]}
            attach="attributes-position"
            count={2}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial
          color={hovered ? '#ffffff' : color}
          depthTest={false}
          linewidth={2}
        />
      </line>

      {/* 箭头锥体 */}
      <mesh
        position={position}
        ref={meshRef}
        rotation={rotation}
        onPointerDown={(e) => {
          e.stopPropagation()
          onDragStart(axis, e)
        }}
        onPointerEnter={(e) => {
          e.stopPropagation()
          setHovered(true)
          document.body.style.cursor = 'grab'
        }}
        onPointerLeave={() => {
          setHovered(false)
          document.body.style.cursor = 'default'
        }}
      >
        <coneGeometry args={[0.06, 0.24, 8]} />
        <meshBasicMaterial
          color={hovered ? '#ffffff' : color}
          depthTest={false}
        />
      </mesh>
    </group>
  )
}

// ──────────────────────────────────────────────────
// 旋转环
// ──────────────────────────────────────────────────

function RotateRing({ onDragStart }) {
  const [hovered, setHovered] = useState(false)

  return (
    <mesh
      rotation={[Math.PI / 2, 0, 0]}
      onPointerDown={(e) => {
        e.stopPropagation()
        onDragStart('rotateY', e)
      }}
      onPointerEnter={(e) => {
        e.stopPropagation()
        setHovered(true)
        document.body.style.cursor = 'grab'
      }}
      onPointerLeave={() => {
        setHovered(false)
        document.body.style.cursor = 'default'
      }}
    >
      <torusGeometry args={[0.6, 0.02, 8, 32]} />
      <meshBasicMaterial
        color={hovered ? '#ffffff' : GIZMO_COLORS.rotate}
        depthTest={false}
        opacity={0.8}
        transparent
      />
    </mesh>
  )
}

// ──────────────────────────────────────────────────
// TransformGizmo 主组件
// ──────────────────────────────────────────────────

export default function TransformGizmo() {
  const selectedIds = useViewer((state) => state.selection?.selectedIds || [])
  const nodes = useScene((state) => state.nodes)
  const updateNode = useScene((state) => state.updateNode)
  const setDirty = useEditor((state) => state.setDirty)
  const { camera, gl, raycaster } = useThree()

  const dragging = useRef(null)
  const dragStartPos = useRef(null)
  const nodeStartPos = useRef(null)
  const nodeStartRot = useRef(null)

  // 获取当前选中的可变换节点
  const selectedNode = useMemo(() => {
    if (selectedIds.length !== 1) return null
    const node = nodes[selectedIds[0]]
    if (!node || !TRANSFORMABLE_TYPES.includes(node.type)) return null
    return node
  }, [selectedIds, nodes])

  // 计算 Gizmo 位置
  const gizmoPosition = useMemo(() => {
    if (!selectedNode) return null

    if (selectedNode.type === 'item') {
      const pos = selectedNode.position || [0, 0, 0]
      return new THREE.Vector3(pos[0], pos[1] + 0.1, pos[2])
    }

    if (selectedNode.type === 'zone' && selectedNode.polygon) {
      const xs = selectedNode.polygon.map((p) => p[0])
      const zs = selectedNode.polygon.map((p) => p[1])
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2
      const cz = (Math.min(...zs) + Math.max(...zs)) / 2
      return new THREE.Vector3(cx, 0.1, cz)
    }

    if (selectedNode.type === 'column') {
      const pos = selectedNode.position || [0, 0, 0]
      return new THREE.Vector3(pos[0], pos[1] + 0.1, pos[2])
    }

    return null
  }, [selectedNode])

  // 拖拽开始
  const handleDragStart = useCallback(
    (axis, event) => {
      if (!selectedNode || !gizmoPosition) return

      event.stopPropagation()
      dragging.current = axis

      // 投影到地面获取起始坐标
      const projection = projectPointerToGround({
        event: event.nativeEvent,
        camera,
        domElement: gl.domElement,
        raycaster,
        snapDisabled: true,
      })

      if (projection) {
        dragStartPos.current = projection.world
      }

      if (selectedNode.type === 'item' || selectedNode.type === 'column') {
        nodeStartPos.current = [...(selectedNode.position || [0, 0, 0])]
        nodeStartRot.current = [...(selectedNode.rotation || [0, 0, 0])]
      } else if (selectedNode.type === 'zone') {
        nodeStartPos.current = selectedNode.polygon
          ? selectedNode.polygon.map((p) => [...p])
          : null
      }

      document.body.style.cursor = 'grabbing'

      // 禁用相机控制
      useViewer.getState().setCameraDragging?.(true)
    },
    [selectedNode, gizmoPosition, camera, gl, raycaster],
  )

  // 全局拖拽事件
  useEffect(() => {
    const canvas = gl?.domElement
    if (!canvas) return undefined

    const handleMouseMove = (event) => {
      if (!dragging.current || !selectedNode || !dragStartPos.current) return

      const projection = projectPointerToGround({
        event,
        camera,
        domElement: canvas,
        raycaster,
        snapDisabled: event.altKey,
      })

      if (!projection) return

      const dx = projection.snapped[0] - dragStartPos.current[0]
      const dz = projection.snapped[1] - dragStartPos.current[1]
      const axis = dragging.current

      if (axis === 'rotateY') {
        // 旋转：基于鼠标水平移动
        if (!nodeStartRot.current) return
        const newRotY = nodeStartRot.current[1] + dx * 0.5

        updateNode(selectedNode.id, {
          rotation: [nodeStartRot.current[0], newRotY, nodeStartRot.current[2]],
        })
        return
      }

      if (selectedNode.type === 'item' || selectedNode.type === 'column') {
        if (!nodeStartPos.current) return
        const newPos = [...nodeStartPos.current]
        if (axis === 'x') newPos[0] = nodeStartPos.current[0] + dx
        else if (axis === 'z') newPos[2] = nodeStartPos.current[2] + dz
        else if (axis === 'y') newPos[1] = nodeStartPos.current[1] - dz
        updateNode(selectedNode.id, { position: newPos })
      } else if (selectedNode.type === 'zone' && nodeStartPos.current) {
        // 移动区域的所有顶点
        const newPolygon = nodeStartPos.current.map((p) => {
          if (axis === 'x') return [p[0] + dx, p[1]]
          if (axis === 'z') return [p[0], p[1] + dz]
          return [p[0] + dx, p[1] + dz]
        })
        updateNode(selectedNode.id, { polygon: newPolygon })
      }
    }

    const handleMouseUp = () => {
      if (dragging.current) {
        dragging.current = null
        dragStartPos.current = null
        nodeStartPos.current = null
        nodeStartRot.current = null
        document.body.style.cursor = 'default'
        setDirty(true)

        // 恢复相机控制
        useViewer.getState().setCameraDragging?.(false)
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [selectedNode, camera, gl, raycaster, updateNode, setDirty])

  if (!selectedNode || !gizmoPosition) return null

  return (
    <group position={gizmoPosition} renderOrder={999}>
      {/* 移动轴 */}
      <AxisArrow axis="x" color={GIZMO_COLORS.x} onDragStart={handleDragStart} />
      <AxisArrow axis="z" color={GIZMO_COLORS.z} onDragStart={handleDragStart} />

      {/* 只有 item 才显示 Y 轴和旋转环 */}
      {selectedNode.type === 'item' && (
        <>
          <AxisArrow axis="y" color={GIZMO_COLORS.y} onDragStart={handleDragStart} />
          <RotateRing onDragStart={handleDragStart} />
        </>
      )}

      {/* 中心点 */}
      <mesh>
        <sphereGeometry args={[0.05, 12, 12]} />
        <meshBasicMaterial color="#ffffff" depthTest={false} />
      </mesh>
    </group>
  )
}
