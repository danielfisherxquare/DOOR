export function toPrintCoordinateVertex(vertex, verticalOffsetMm = 0) {
  return {
    x: Number.isFinite(vertex?.x) ? vertex.x : 0,
    y: Number.isFinite(vertex?.z) ? vertex.z : 0,
    z: (Number.isFinite(vertex?.y) ? vertex.y : 0) + verticalOffsetMm,
  }
}

export function toThreeYUpCoordinateVertex(vertex) {
  return {
    x: Number.isFinite(vertex?.x) ? vertex.x : 0,
    y: Number.isFinite(vertex?.y) ? vertex.y : 0,
    z: Number.isFinite(vertex?.z) ? -vertex.z : 0,
  }
}
