import {
  asArray,
  asNumber,
  asOptionalNumber,
  asString,
  cloneValue,
  roundCoord,
} from './value.js'

function inferTerrainGrid(rawVertices, mesh) {
  const vertexCount = rawVertices.length
  const explicitRows = Math.max(Math.floor(asNumber(mesh?.rows ?? mesh?.metadata?.rows, 0)), 0)
  const explicitCols = Math.max(Math.floor(asNumber(mesh?.cols ?? mesh?.metadata?.cols, 0)), 0)
  if (explicitRows >= 2 && explicitCols >= 2 && explicitRows * explicitCols === vertexCount) {
    return { rows: explicitRows, cols: explicitCols }
  }

  const squareSize = Math.sqrt(vertexCount)
  if (Number.isInteger(squareSize) && squareSize >= 2) {
    return { rows: squareSize, cols: squareSize }
  }

  return { rows: explicitRows, cols: explicitCols }
}

function terrainBounds(mesh) {
  const bounds = mesh?.boundsMeters || mesh?.metadata?.boundsMeters || {}
  const width = Math.max(asNumber(bounds.width, asNumber(bounds.maxX, 0) - asNumber(bounds.minX, 0)), 1)
  const depth = Math.max(asNumber(bounds.depth, asNumber(bounds.maxZ, 0) - asNumber(bounds.minZ, 0)), 1)
  return {
    minX: asNumber(bounds.minX, -width / 2),
    maxX: asNumber(bounds.maxX, width / 2),
    minZ: asNumber(bounds.minZ, -depth / 2),
    maxZ: asNumber(bounds.maxZ, depth / 2),
    width,
    depth,
  }
}

function normalizeTerrainMeshVertices(mesh) {
  const rawVertices = asArray(mesh?.vertices)
  if (!rawVertices.length) return []
  if (rawVertices.every((item) => typeof item === 'number' || typeof item === 'string')) {
    return rawVertices.map((item) => asNumber(item, 0))
  }

  const { rows, cols } = inferTerrainGrid(rawVertices, mesh)
  const bounds = terrainBounds(mesh)
  const stepX = (bounds.maxX - bounds.minX) / Math.max(cols - 1, 1)
  const stepZ = (bounds.maxZ - bounds.minZ) / Math.max(rows - 1, 1)

  const vertices = []
  rawVertices.forEach((rawVertex, index) => {
    const tuple = Array.isArray(rawVertex) ? rawVertex : null
    const xValue = tuple ? tuple[0] : rawVertex?.x
    const yValue = tuple ? tuple[1] : rawVertex?.y ?? rawVertex?.height
    const zValue = tuple ? tuple[2] : rawVertex?.z
    let x = asOptionalNumber(xValue, Number.NaN)
    const y = asOptionalNumber(yValue, 0)
    let z = asOptionalNumber(zValue, Number.NaN)

    if ((!Number.isFinite(x) || !Number.isFinite(z)) && rows >= 2 && cols >= 2) {
      const row = Math.floor(index / cols)
      const col = index % cols
      x = bounds.minX + stepX * col
      z = bounds.minZ + stepZ * row
    }

    vertices.push(roundCoord(x), roundCoord(y), roundCoord(z))
  })
  return vertices.filter((item) => Number.isFinite(item))
}

function normalizeTerrainMeshIndices(indices) {
  const normalized = []
  asArray(indices).forEach((item) => {
    if (Array.isArray(item)) {
      item.forEach((part) => normalized.push(Math.max(0, Math.floor(asNumber(part, 0)))))
      return
    }
    normalized.push(Math.max(0, Math.floor(asNumber(item, 0))))
  })
  return normalized
}

export function normalizeTerrainMeshRecord(mesh, index) {
  const rawVertices = asArray(mesh?.vertices)
  const grid = inferTerrainGrid(rawVertices, mesh)
  const metadata = {
    ...(mesh?.metadata || {}),
    source: mesh?.metadata?.source || mesh?.source || null,
    boundsMeters: mesh?.metadata?.boundsMeters || mesh?.boundsMeters || null,
    rows: mesh?.metadata?.rows || mesh?.rows || grid.rows || null,
    cols: mesh?.metadata?.cols || mesh?.cols || grid.cols || null,
    elevationOffsetMeters: mesh?.metadata?.elevationOffsetMeters ?? mesh?.elevationOffsetMeters ?? null,
  }
  return {
    id: asString(mesh?.id, `terrain-mesh:${index + 1}`),
    kind: asString(mesh?.kind, 'terrain-grid'),
    name: asString(mesh?.name, `地形网格 ${index + 1}`),
    color: asString(mesh?.color, '#d9e4d0'),
    vertices: normalizeTerrainMeshVertices(mesh),
    indices: normalizeTerrainMeshIndices(mesh?.indices),
    metadata: cloneValue(metadata),
  }
}
