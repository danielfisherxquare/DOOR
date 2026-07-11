/**
 * Edge Tool
 * 边工具 - 选择2个已有顶点创建边
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useScene } from '@pascal-app/core'
import { useThree } from '@react-three/fiber'
import { nanoid } from 'nanoid'
import * as THREE from 'three'
import useEditor from '../store/useEditor'

const EDGE_COLOR = '#2563eb'
const VERTEX_HIGHLIGHT_COLOR = '#f59e0b'
const VERTEX_STROKE = '#1e293b'
const VERTEX_COLOR = '#f8fafc'

export default function EdgeTool() {
  const [selectedVertices, setSelectedVertices] = useState([])
  const createNode = useScene((state) => state.createNode)
  const nodes = useScene((state) => state.nodes)
  const setDirty = useEditor((state) => state.setDirty)
  const setInferenceHint = useEditor((state) => state.setInferenceHint)
  const clearInferenceHint = useEditor((state) => state.clearInferenceHint)
  const gl = useThree((state) => state.gl)

  const activeLevelId = useMemo(
    () => Object.values(nodes || {}).find((node) => node?.type === 'level')?.id || null,
    [nodes],
  )

  // 获取当前场景中的所有顶点
  const vertices = useMemo(() => {
    const result = []
    Object.values(nodes || {}).forEach((node) => {
      if (!node?.type) return

      // 从 wall 节点提取端点
      if (node.type === 'wall' && node.start && node.end) {
        result.push({
          id: `${node.id}:start`,
          position: node.start,
          sourceNodeId: node.id,
          role: 'start',
        })
        result.push({
          id: `${node.id}:end`,
          position: node.end,
          sourceNodeId: node.id,
          role: 'end',
        })
      }

      // 从 line 节点提取端点
      if (node.type === 'line' && node.start && node.end) {
        result.push({
          id: `${node.id}:start`,
          position: node.start,
          sourceNodeId: node.id,
          role: 'start',
        })
        result.push({
          id: `${node.id}:end`,
          position: node.end,
          sourceNodeId: node.id,
          role: 'end',
        })
      }

      // 从 zone 节点提取多边形顶点
      if (node.type === 'zone' && Array.isArray(node.polygon)) {
        node.polygon.forEach((point, index) => {
          result.push({
            id: `${node.id}:p${index}`,
            position: point,
            sourceNodeId: node.id,
            role: `point${index}`,
          })
        })
      }

      // 从 point 节点提取位置
      if (node.type === 'point' && node.position) {
        result.push({
          id: node.id,
          position: [node.position[0], node.position[2]],
          sourceNodeId: node.id,
          role: 'position',
        })
      }
    })

    return result
  }, [nodes])

  // 查找最近的顶点
  const findNearestVertex = useCallback(
    (worldX, worldZ, maxDistance = 0.5) => {
      let nearest = null
      let minDist = maxDistance

      vertices.forEach((vertex) => {
        const dx = vertex.position[0] - worldX
        const dz = vertex.position[1] - worldZ
        const dist = Math.hypot(dx, dz)
        if (dist < minDist) {
          minDist = dist
          nearest = vertex
        }
      })

      return nearest
    },
    [vertices],
  )

  const handleVertexClick = useCallback(
    (vertex) => {
      setSelectedVertices((prev) => {
        const isSelected = prev.some((v) => v.id === vertex.id)

        if (isSelected) {
          return prev.filter((v) => v.id !== vertex.id)
        }

        const next = [...prev, vertex]

        // 如果选择了2个顶点，创建边
        if (next.length === 2 && activeLevelId) {
          const v1 = next[0]
          const v2 = next[1]

          // 检查是否已存在相同的边
          const edgeExists = Object.values(nodes || {}).some((node) => {
            if (node.type !== 'line') return false
            const sameStart =
              Math.abs(node.start[0] - v1.position[0]) < 0.001 &&
              Math.abs(node.start[1] - v1.position[1]) < 0.001
            const sameEnd =
              Math.abs(node.end[0] - v2.position[0]) < 0.001 &&
              Math.abs(node.end[1] - v2.position[1]) < 0.001
            const reverseStart =
              Math.abs(node.start[0] - v2.position[0]) < 0.001 &&
              Math.abs(node.start[1] - v2.position[1]) < 0.001
            const reverseEnd =
              Math.abs(node.end[0] - v1.position[0]) < 0.001 &&
              Math.abs(node.end[1] - v1.position[1]) < 0.001
            return (sameStart && sameEnd) || (reverseStart && reverseEnd)
          })

          if (!edgeExists) {
            createNode(
              {
                id: `edge_${nanoid()}`,
                type: 'line',
                object: 'node',
                start: v1.position,
                end: v2.position,
                color: EDGE_COLOR,
                visible: true,
                children: [],
              },
              activeLevelId,
            )

            setDirty(true)
            setInferenceHint({
              x: 0,
              y: 0,
              label: '边已创建',
              color: EDGE_COLOR,
            })
          }

          return []
        }

        return next
      })
    },
    [activeLevelId, createNode, nodes, setDirty, setInferenceHint],
  )

  useEffect(() => {
    const canvas = gl?.domElement
    if (!canvas) return undefined

    const handleMouseMove = (event) => {
      const rect = canvas.getBoundingClientRect()
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      )

      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(mouse, gl.userData?.camera)

      // 射线与地面相交
      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
      const intersection = new THREE.Vector3()
      raycaster.ray.intersectPlane(groundPlane, intersection)

      if (intersection) {
        const nearest = findNearestVertex(intersection.x, intersection.z)
        if (nearest) {
          setInferenceHint({
            x: event.clientX,
            y: event.clientY,
            label: `选择顶点 (${selectedVertices.length}/2)`,
            color: VERTEX_HIGHLIGHT_COLOR,
          })
        } else if (selectedVertices.length > 0) {
          setInferenceHint({
            x: event.clientX,
            y: event.clientY,
            label: `已选择 ${selectedVertices.length} 个顶点`,
            color: EDGE_COLOR,
          })
        } else {
          clearInferenceHint()
        }
      }
    }

    const handleMouseDown = (event) => {
      if (event.button !== 0) return

      const rect = canvas.getBoundingClientRect()
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      )

      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(mouse, gl.userData?.camera)

      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
      const intersection = new THREE.Vector3()
      raycaster.ray.intersectPlane(groundPlane, intersection)

      if (intersection) {
        const nearest = findNearestVertex(intersection.x, intersection.z)
        if (nearest) {
          handleVertexClick(nearest)
        }
      }
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setSelectedVertices([])
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
    clearInferenceHint,
    findNearestVertex,
    gl,
    handleVertexClick,
    selectedVertices.length,
    setInferenceHint,
  ])

  return (
    <group>
      {/* 顶点可视化 */}
      {vertices.map((vertex) => {
        const isSelected = selectedVertices.some((v) => v.id === vertex.id)
        return (
          <group
            key={vertex.id}
            position={[vertex.position[0], 0.08, vertex.position[1]]}
            onClick={(e) => {
              e.stopPropagation()
              handleVertexClick(vertex)
            }}
          >
            <mesh renderOrder={20}>
              <sphereGeometry args={[0.06, 10, 10]} />
              <meshBasicMaterial
                color={isSelected ? VERTEX_HIGHLIGHT_COLOR : VERTEX_STROKE}
                depthTest={false}
              />
            </mesh>
            <mesh renderOrder={21}>
              <sphereGeometry args={[0.04, 10, 10]} />
              <meshBasicMaterial
                color={isSelected ? VERTEX_HIGHLIGHT_COLOR : VERTEX_COLOR}
                depthTest={false}
              />
            </mesh>
          </group>
        )
      })}

      {/* 预览边 */}
      {selectedVertices.length === 1 && (
        <mesh position={[selectedVertices[0].position[0], 0.12, selectedVertices[0].position[1]]}>
          <sphereGeometry args={[0.1, 16, 16]} />
          <meshBasicMaterial color={VERTEX_HIGHLIGHT_COLOR} depthTest={false} />
        </mesh>
      )}
    </group>
  )
}
