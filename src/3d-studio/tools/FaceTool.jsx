/**
 * Face Tool
 * 面工具 - 选择3个或更多顶点创建面
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useScene } from '@pascal-app/core'
import { useThree } from '@react-three/fiber'
import { nanoid } from 'nanoid'
import * as THREE from 'three'
import useEditor from '../store/useEditor'

const FACE_COLOR = '#6366f1'
const VERTEX_HIGHLIGHT_COLOR = '#f59e0b'
const VERTEX_STROKE = '#1e293b'
const VERTEX_COLOR = '#f8fafc'
const MIN_VERTICES = 3

export default function FaceTool() {
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
    const seen = new Set()

    Object.values(nodes || {}).forEach((node) => {
      if (!node?.type) return

      // 从 wall 节点提取端点
      if (node.type === 'wall' && node.start && node.end) {
        const startKey = `${node.start[0]}:${node.start[1]}`
        const endKey = `${node.end[0]}:${node.end[1]}`

        if (!seen.has(startKey)) {
          seen.add(startKey)
          result.push({
            id: `vertex:${startKey}`,
            position: node.start,
            key: startKey,
          })
        }
        if (!seen.has(endKey)) {
          seen.add(endKey)
          result.push({
            id: `vertex:${endKey}`,
            position: node.end,
            key: endKey,
          })
        }
      }

      // 从 line 节点提取端点
      if (node.type === 'line' && node.start && node.end) {
        const startKey = `${node.start[0]}:${node.start[1]}`
        const endKey = `${node.end[0]}:${node.end[1]}`

        if (!seen.has(startKey)) {
          seen.add(startKey)
          result.push({
            id: `vertex:${startKey}`,
            position: node.start,
            key: startKey,
          })
        }
        if (!seen.has(endKey)) {
          seen.add(endKey)
          result.push({
            id: `vertex:${endKey}`,
            position: node.end,
            key: endKey,
          })
        }
      }

      // 从 zone 节点提取多边形顶点
      if (node.type === 'zone' && Array.isArray(node.polygon)) {
        node.polygon.forEach((point) => {
          const key = `${point[0]}:${point[1]}`
          if (!seen.has(key)) {
            seen.add(key)
            result.push({
              id: `vertex:${key}`,
              position: point,
              key,
            })
          }
        })
      }

      // 从 point 节点提取位置
      if (node.type === 'point' && node.position) {
        const key = `${node.position[0]}:${node.position[2]}`
        if (!seen.has(key)) {
          seen.add(key)
          result.push({
            id: `vertex:${key}`,
            position: [node.position[0], node.position[2]],
            key,
          })
        }
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

        // 如果选择了足够多的顶点，创建面
        if (next.length >= MIN_VERTICES && activeLevelId) {
          // 检查是否已存在相同的面
          const polygon = next.map((v) => v.position)
          const faceExists = Object.values(nodes || {}).some((node) => {
            if (node.type !== 'zone' || !Array.isArray(node.polygon)) return false
            if (node.polygon.length !== polygon.length) return false

            // 检查是否匹配（可能顺序不同）
            return polygon.every((point, i) => {
              return node.polygon.some((np) =>
                Math.abs(np[0] - point[0]) < 0.001 &&
                Math.abs(np[1] - point[1]) < 0.001
              )
            })
          })

          if (!faceExists) {
            // 验证多边形是否有效（不自相交）
            const isValid = validatePolygon(polygon)

            if (isValid) {
              createNode(
                {
                  id: `zone_${nanoid()}`,
                  type: 'zone',
                  object: 'node',
                  name: `区域-${Date.now().toString(36).slice(-4)}`,
                  visible: true,
                  polygon,
                  color: FACE_COLOR,
                  metadata: { zoneType: 'general' },
                },
                activeLevelId,
              )

              setDirty(true)
              setInferenceHint({
                x: 0,
                y: 0,
                label: '面已创建',
                color: FACE_COLOR,
              })

              return []
            }
          }
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

      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
      const intersection = new THREE.Vector3()
      raycaster.ray.intersectPlane(groundPlane, intersection)

      if (intersection) {
        const nearest = findNearestVertex(intersection.x, intersection.z)
        if (nearest) {
          setInferenceHint({
            x: event.clientX,
            y: event.clientY,
            label: `选择顶点 (${selectedVertices.length}/${MIN_VERTICES}+)`,
            color: VERTEX_HIGHLIGHT_COLOR,
          })
        } else if (selectedVertices.length > 0) {
          setInferenceHint({
            x: event.clientX,
            y: event.clientY,
            label: `已选择 ${selectedVertices.length} 个顶点`,
            color: FACE_COLOR,
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
      } else if (event.key === 'Enter' && selectedVertices.length >= MIN_VERTICES) {
        // 通过 Enter 键完成面
        handleVertexClick(selectedVertices[selectedVertices.length - 1])
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
    selectedVertices,
    setInferenceHint,
  ])

  // 预览多边形
  const previewGeometry = useMemo(() => {
    if (selectedVertices.length < 2) return null

    const pts = selectedVertices.map((v) => new THREE.Vector3(v.position[0], 0.11, v.position[1]))
    const positions = []
    pts.forEach((pt) => positions.push(pt.x, pt.y, pt.z))
    if (pts.length >= 3) positions.push(pts[0].x, pts[0].y, pts[0].z)

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return geo
  }, [selectedVertices])

  // 预览填充
  const fillGeometry = useMemo(() => {
    if (selectedVertices.length < 3) return null

    const shape = new THREE.Shape()
    shape.moveTo(selectedVertices[0].position[0], selectedVertices[0].position[1])
    for (let i = 1; i < selectedVertices.length; i++) {
      shape.lineTo(selectedVertices[i].position[0], selectedVertices[i].position[1])
    }
    shape.closePath()

    const geo = new THREE.ShapeGeometry(shape)
    geo.rotateX(-Math.PI / 2)
    geo.translate(0, 0.1, 0)
    return geo
  }, [selectedVertices])

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

      {/* 预览轮廓线 */}
      {previewGeometry && (
        <line geometry={previewGeometry} renderOrder={19}>
          <lineBasicMaterial
            color={FACE_COLOR}
            depthTest={false}
            opacity={0.9}
            transparent
          />
        </line>
      )}

      {/* 预览填充 */}
      {fillGeometry && (
        <mesh geometry={fillGeometry} renderOrder={18}>
          <meshBasicMaterial
            color={FACE_COLOR}
            depthTest={false}
            opacity={0.15}
            side={THREE.DoubleSide}
            transparent
          />
        </mesh>
      )}
    </group>
  )
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