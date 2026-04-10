/**
 * 几何验证工具
 * 验证 EditorDocument 数据的完整性和有效性
 */

import { normalizeEditorDocument } from '../model/editorDocument'

/**
 * 验证 EditorDocument
 * @param {Object} doc - EditorDocument 数据
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateEditorDocument(doc) {
  const errors = []
  const warnings = []

  if (!doc || typeof doc !== 'object') {
    return { valid: false, errors: ['EditorDocument is not a valid object'], warnings: [] }
  }

  const normalized = normalizeEditorDocument(doc)

  // 检查所有 segment 的顶点是否存在
  normalized.segments.forEach((segment) => {
    if (!segment.startVertexId) {
      errors.push(`Segment ${segment.id} missing startVertexId`)
    } else if (!normalized.vertices.find(v => v.id === segment.startVertexId)) {
      errors.push(`Segment ${segment.id} references missing start vertex ${segment.startVertexId}`)
    }

    if (!segment.endVertexId) {
      errors.push(`Segment ${segment.id} missing endVertexId`)
    } else if (!normalized.vertices.find(v => v.id === segment.endVertexId)) {
      errors.push(`Segment ${segment.id} references missing end vertex ${segment.endVertexId}`)
    }

    if (segment.startVertexId && segment.endVertexId && segment.startVertexId === segment.endVertexId) {
      warnings.push(`Segment ${segment.id} has same start and end vertex (degenerate)`)
    }
  })

  // 检查所有 profile 的顶点是否存在
  normalized.profiles.forEach((profile) => {
    if (!profile.vertexIds || profile.vertexIds.length < 3) {
      errors.push(`Profile ${profile.id} has insufficient vertices (need at least 3)`)
      return
    }

    profile.vertexIds.forEach((vertexId, index) => {
      if (!vertexId) {
        errors.push(`Profile ${profile.id} has empty vertexId at index ${index}`)
      } else if (!normalized.vertices.find(v => v.id === vertexId)) {
        errors.push(`Profile ${profile.id} references missing vertex ${vertexId}`)
      }
    })

    const uniqueVertices = new Set(profile.vertexIds)
    if (uniqueVertices.size !== profile.vertexIds.length) {
      warnings.push(`Profile ${profile.id} has duplicate vertices`)
    }
  })

  // 检查 solid 引用的 profile 是否存在
  normalized.solids.forEach((solid) => {
    if (!solid.profileId) {
      errors.push(`Solid ${solid.id} missing profileId`)
    } else if (!normalized.profiles.find(p => p.id === solid.profileId)) {
      errors.push(`Solid ${solid.id} references missing profile ${solid.profileId}`)
    }
  })

  // 检查 opening 引用的 solid 是否存在
  normalized.openings.forEach((opening) => {
    if (!opening.solidId) {
      errors.push(`Opening ${opening.id} missing solidId`)
    } else if (!normalized.solids.find(s => s.id === opening.solidId)) {
      errors.push(`Opening ${opening.id} references missing solid ${opening.solidId}`)
    }
  })

  // 检查 profile 引用的 sketchPlane 是否存在
  normalized.profiles.forEach((profile) => {
    const planeId = profile.planeId || 'plane-ground'
    if (!normalized.sketchPlanes.find(p => p.id === planeId)) {
      warnings.push(`Profile ${profile.id} references missing sketch plane ${planeId}`)
    }
  })

  // 检查是否有孤立顶点
  normalized.vertices.forEach((vertex) => {
    const usedBySegment = normalized.segments.some(s =>
      s.startVertexId === vertex.id || s.endVertexId === vertex.id
    )
    const usedByProfile = normalized.profiles.some(p =>
      p.vertexIds.includes(vertex.id)
    )

    if (!usedBySegment && !usedByProfile) {
      warnings.push(`Vertex ${vertex.id} is orphaned`)
    }
  })

  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * 检查点是否共面
 * @param {Array} points - 点数组 [{x, y, z}, ...]
 * @returns {boolean}
 */
export function isCoplanar(points) {
  if (points.length < 4) return true

  const p1 = points[0]
  const p2 = points[1]
  const p3 = points[2]

  const v1 = { x: p2.x - p1.x, y: p2.y - p1.y, z: p2.z - p1.z }
  const v2 = { x: p3.x - p1.x, y: p3.y - p1.y, z: p3.z - p1.z }

  const normal = {
    x: v1.y * v2.z - v1.z * v2.y,
    y: v1.z * v2.x - v1.x * v2.z,
    z: v1.x * v2.y - v1.y * v2.x
  }

  for (let i = 3; i < points.length; i++) {
    const p = points[i]
    const v = { x: p.x - p1.x, y: p.y - p1.y, z: p.z - p1.z }
    const dot = normal.x * v.x + normal.y * v.y + normal.z * v.z

    if (Math.abs(dot) > 0.001) {
      return false
    }
  }

  return true
}

/**
 * 检查多边形是否为凸多边形
 * @param {Array} points - 二维点数组 [[x, z], ...]
 * @returns {boolean}
 */
export function isConvexPolygon(points) {
  if (points.length < 3) return true

  let sign = 0
  const n = points.length

  for (let i = 0; i < n; i++) {
    const p1 = points[i]
    const p2 = points[(i + 1) % n]
    const p3 = points[(i + 2) % n]

    const cross = (p2[0] - p1[0]) * (p3[1] - p2[1]) - (p2[1] - p1[1]) * (p3[0] - p2[0])

    if (cross !== 0) {
      if (sign === 0) {
        sign = cross > 0 ? 1 : -1
      } else if ((cross > 0 && sign < 0) || (cross < 0 && sign > 0)) {
        return false
      }
    }
  }

  return true
}

/**
 * 计算 profile 的法向量
 * @param {Array} vertices - 顶点数组 [{x, y, z}, ...]
 * @returns {{ x: number, y: number, z: number }}
 */
export function computeFaceNormal(vertices) {
  if (vertices.length < 3) {
    return { x: 0, y: 1, z: 0 }
  }

  const p0 = vertices[0]
  const p1 = vertices[1]
  const p2 = vertices[2]

  const v1 = { x: p1.x - p0.x, y: p1.y - p0.y, z: p1.z - p0.z }
  const v2 = { x: p2.x - p0.x, y: p2.y - p0.y, z: p2.z - p0.z }

  return {
    x: v1.y * v2.z - v1.z * v2.y,
    y: v1.z * v2.x - v1.x * v2.z,
    z: v1.x * v2.y - v1.y * v2.x
  }
}

/**
 * 修复 EditorDocument 中的常见问题
 * @param {Object} doc - EditorDocument 数据
 * @returns {Object} 修复后的 EditorDocument
 */
export function fixEditorDocument(doc) {
  const normalized = normalizeEditorDocument(doc)

  const usedVertexIds = new Set()
  normalized.segments.forEach(s => {
    usedVertexIds.add(s.startVertexId)
    usedVertexIds.add(s.endVertexId)
  })
  normalized.profiles.forEach(p => {
    p.vertexIds.forEach(vid => usedVertexIds.add(vid))
  })

  const fixedVertices = normalized.vertices.filter(v => usedVertexIds.has(v.id))

  const fixedSegments = normalized.segments.filter(s =>
    usedVertexIds.has(s.startVertexId) && usedVertexIds.has(s.endVertexId)
  )

  const fixedProfiles = normalized.profiles.filter(p =>
    p.vertexIds.every(vid => usedVertexIds.has(vid))
  )

  return {
    ...normalized,
    vertices: fixedVertices,
    segments: fixedSegments,
    profiles: fixedProfiles
  }
}

export default {
  validateEditorDocument,
  isCoplanar,
  isConvexPolygon,
  computeFaceNormal,
  fixEditorDocument
}
