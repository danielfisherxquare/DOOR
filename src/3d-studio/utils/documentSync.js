/**
 * EditorDocument 同步工具
 * 确保 Pascal Nodes 和 EditorDocument 数据一致性
 */

import { createEmptyEditorDocument, normalizeEditorDocument } from '../model/editorDocument'

/**
 * 从 Pascal Nodes 提取顶点信息
 * @param {Object} nodes - Pascal Nodes
 * @returns {Array} 顶点列表
 */
export function extractVerticesFromNodes(nodes) {
  const vertexMap = new Map()
  const vertices = []

  Object.values(nodes || {}).forEach((node) => {
    if (!node?.type) return

    // 从 wall 节点提取端点
    if (node.type === 'wall' && node.start && node.end) {
      const startKey = `${node.start[0]}:${node.start[1]}`
      const endKey = `${node.end[0]}:${node.end[1]}`

      if (!vertexMap.has(startKey)) {
        const vertex = {
          id: `vertex:wall:${node.id}:start`,
          x: node.start[0],
          y: 0,
          z: node.start[1],
          metadata: { source: 'wall', nodeId: node.id, role: 'start' }
        }
        vertexMap.set(startKey, vertex)
        vertices.push(vertex)
      }

      if (!vertexMap.has(endKey)) {
        const vertex = {
          id: `vertex:wall:${node.id}:end`,
          x: node.end[0],
          y: 0,
          z: node.end[1],
          metadata: { source: 'wall', nodeId: node.id, role: 'end' }
        }
        vertexMap.set(endKey, vertex)
        vertices.push(vertex)
      }
    }

    // 从 line 节点提取端点
    if (node.type === 'line' && node.start && node.end) {
      const startKey = `${node.start[0]}:${node.start[1]}`
      const endKey = `${node.end[0]}:${node.end[1]}`

      if (!vertexMap.has(startKey)) {
        const vertex = {
          id: `vertex:line:${node.id}:start`,
          x: node.start[0],
          y: 0,
          z: node.start[1],
          metadata: { source: 'line', nodeId: node.id, role: 'start' }
        }
        vertexMap.set(startKey, vertex)
        vertices.push(vertex)
      }

      if (!vertexMap.has(endKey)) {
        const vertex = {
          id: `vertex:line:${node.id}:end`,
          x: node.end[0],
          y: 0,
          z: node.end[1],
          metadata: { source: 'line', nodeId: node.id, role: 'end' }
        }
        vertexMap.set(endKey, vertex)
        vertices.push(vertex)
      }
    }

    // 从 zone 节点提取多边形顶点
    if (node.type === 'zone' && Array.isArray(node.polygon)) {
      node.polygon.forEach((point, index) => {
        const key = `${point[0]}:${point[1]}`
        if (!vertexMap.has(key)) {
          const vertex = {
            id: `vertex:zone:${node.id}:p${index}`,
            x: point[0],
            y: 0,
            z: point[1],
            metadata: { source: 'zone', nodeId: node.id, pointIndex: index }
          }
          vertexMap.set(key, vertex)
          vertices.push(vertex)
        }
      })
    }
  })

  return vertices
}

/**
 * 从 Pascal Nodes 提取边信息
 * @param {Object} nodes - Pascal Nodes
 * @param {Array} vertices - 顶点列表
 * @returns {Array} 边列表
 */
export function extractEdgesFromNodes(nodes, vertices) {
  const edges = []

  Object.values(nodes || {}).forEach((node) => {
    if (!node?.type) return

    // 从 wall 节点创建边
    if (node.type === 'wall' && node.start && node.end) {
      const startVertex = vertices.find(v =>
        v.metadata?.source === 'wall' &&
        v.metadata?.nodeId === node.id &&
        v.metadata?.role === 'start'
      )
      const endVertex = vertices.find(v =>
        v.metadata?.source === 'wall' &&
        v.metadata?.nodeId === node.id &&
        v.metadata?.role === 'end'
      )

      if (startVertex && endVertex) {
        edges.push({
          id: `edge:wall:${node.id}`,
          startVertexId: startVertex.id,
          endVertexId: endVertex.id,
          kind: 'wall',
          height: node.height || 0,
          thickness: node.thickness || 0,
          metadata: { source: 'wall', nodeId: node.id }
        })
      }
    }

    // 从 line 节点创建边
    if (node.type === 'line' && node.start && node.end) {
      const startVertex = vertices.find(v =>
        v.metadata?.source === 'line' &&
        v.metadata?.nodeId === node.id &&
        v.metadata?.role === 'start'
      )
      const endVertex = vertices.find(v =>
        v.metadata?.source === 'line' &&
        v.metadata?.nodeId === node.id &&
        v.metadata?.role === 'end'
      )

      if (startVertex && endVertex) {
        edges.push({
          id: `edge:line:${node.id}`,
          startVertexId: startVertex.id,
          endVertexId: endVertex.id,
          kind: 'line',
          height: 0,
          thickness: 0,
          metadata: { source: 'line', nodeId: node.id }
        })
      }
    }
  })

  return edges
}

/**
 * 从 Pascal Nodes 提取面信息
 * @param {Object} nodes - Pascal Nodes
 * @param {Array} vertices - 顶点列表
 * @returns {Array} 面列表
 */
export function extractFacesFromNodes(nodes, vertices) {
  const faces = []

  Object.values(nodes || {}).forEach((node) => {
    if (!node?.type) return

    // 从 zone 节点创建面
    if (node.type === 'zone' && Array.isArray(node.polygon) && node.polygon.length >= 3) {
      const vertexIds = node.polygon.map((point, index) => {
        const vertex = vertices.find(v =>
          v.metadata?.source === 'zone' &&
          v.metadata?.nodeId === node.id &&
          v.metadata?.pointIndex === index
        )
        return vertex?.id
      }).filter(Boolean)

      if (vertexIds.length >= 3) {
        faces.push({
          id: `face:zone:${node.id}`,
          vertexIds,
          kind: 'zone',
          name: node.name || '',
          elevation: 0,
          height: 0,
          metadata: { source: 'zone', nodeId: node.id }
        })
      }
    }
  })

  return faces
}

/**
 * 从 Pascal Nodes 同步到 EditorDocument
 * @param {Object} nodes - Pascal Nodes
 * @param {Object} existingDocument - 现有的 EditorDocument（可选）
 * @returns {Object} 同步后的 EditorDocument
 */
export function syncPascalToDocument(nodes, existingDocument = null) {
  const base = existingDocument || createEmptyEditorDocument()

  // 提取顶点、边、面
  const vertices = extractVerticesFromNodes(nodes)
  const edges = extractEdgesFromNodes(nodes, vertices)
  const faces = extractFacesFromNodes(nodes, vertices)

  // 合并现有数据（保留非同步来源的数据）
  const mergedVertices = [
    ...vertices,
    ...base.vertices.filter(v => !v.metadata?.source)
  ]

  const mergedEdges = [
    ...edges,
    ...base.edges.filter(e => !e.metadata?.source)
  ]

  const mergedFaces = [
    ...faces,
    ...base.faces.filter(f => !f.metadata?.source)
  ]

  return normalizeEditorDocument({
    ...base,
    vertices: mergedVertices,
    edges: mergedEdges,
    faces: mergedFaces
  })
}

/**
 * 同步 EditorDocument 变更到 Pascal Nodes
 * @param {Object} editorDocument - EditorDocument
 * @param {Object} nodes - 现有的 Pascal Nodes
 * @param {Function} updateNode - 更新节点的函数
 */
export function syncDocumentToPascal(editorDocument, nodes, updateNode) {
  const normalized = normalizeEditorDocument(editorDocument)

  // 更新顶点关联的节点
  normalized.vertices.forEach((vertex) => {
    const { source, nodeId, role, pointIndex } = vertex.metadata || {}

    if (!source || !nodeId) return

    const node = nodes[nodeId]
    if (!node) return

    if (source === 'wall' || source === 'line') {
      if (role === 'start') {
        updateNode(nodeId, { start: [vertex.x, vertex.z] })
      } else if (role === 'end') {
        updateNode(nodeId, { end: [vertex.x, vertex.z] })
      }
    } else if (source === 'zone' && Array.isArray(node.polygon)) {
      const newPolygon = [...node.polygon]
      newPolygon[pointIndex] = [vertex.x, vertex.z]
      updateNode(nodeId, { polygon: newPolygon })
    }
  })
}

/**
 * 合并两个 EditorDocument
 * @param {Object} base - 基础文档
 * @param {Object} changes - 变更文档
 * @returns {Object} 合并后的文档
 */
export function mergeEditorDocuments(base, changes) {
  const baseNorm = normalizeEditorDocument(base)
  const changesNorm = normalizeEditorDocument(changes)

  // 合并顶点（按 ID 去重）
  const vertexMap = new Map()
  baseNorm.vertices.forEach(v => vertexMap.set(v.id, v))
  changesNorm.vertices.forEach(v => vertexMap.set(v.id, v))

  // 合并边（按 ID 去重）
  const edgeMap = new Map()
  baseNorm.edges.forEach(e => edgeMap.set(e.id, e))
  changesNorm.edges.forEach(e => edgeMap.set(e.id, e))

  // 合并面（按 ID 去重）
  const faceMap = new Map()
  baseNorm.faces.forEach(f => faceMap.set(f.id, f))
  changesNorm.faces.forEach(f => faceMap.set(f.id, f))

  return normalizeEditorDocument({
    ...baseNorm,
    vertices: Array.from(vertexMap.values()),
    edges: Array.from(edgeMap.values()),
    faces: Array.from(faceMap.values())
  })
}

/**
 * 查找给定位置的顶点
 * @param {Array} vertices - 顶点列表
 * @param {Array} position - 位置 [x, z]
 * @param {Number} tolerance - 容差
 * @returns {Object|null} 找到的顶点或 null
 */
export function findVertexAtPosition(vertices, position, tolerance = 0.001) {
  const [x, z] = position
  return vertices.find(v =>
    Math.abs(v.x - x) < tolerance &&
    Math.abs(v.z - z) < tolerance
  ) || null
}

/**
 * 查找共享顶点的边
 * @param {Array} edges - 边列表
 * @param {String} vertexId - 顶点 ID
 * @returns {Array} 共享该顶点的边列表
 */
export function findEdgesSharingVertex(edges, vertexId) {
  return edges.filter(e =>
    e.startVertexId === vertexId ||
    e.endVertexId === vertexId
  )
}

/**
 * 查找包含顶点的面
 * @param {Array} faces - 面列表
 * @param {String} vertexId - 顶点 ID
 * @returns {Array} 包含该顶点的面列表
 */
export function findFacesContainingVertex(faces, vertexId) {
  return faces.filter(f => f.vertexIds.includes(vertexId))
}