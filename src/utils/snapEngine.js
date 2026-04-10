/**
 * 吸附引擎
 * 处理端点吸附、角度吸附、网格吸附
 */

const SNAP_THRESHOLD = 0.2  // 端点吸附阈值 (米)
const ANGLE_STEP = 15       // 角度吸附步进 (度)
export const GRID_SIZE = 1  // 网格吸附大小 (米)

/**
 * 端点吸附
 * @param {Object} point - 当前点 { x, z }
 * @param {Array} existingPoints - 已有点数组 [{ x, z }, ...]
 * @param {number} threshold - 吸附阈值
 * @returns {Object} { snapped: boolean, point: { x, z } }
 */
export function snapToPoint(point, existingPoints, threshold = SNAP_THRESHOLD) {
    if (!existingPoints || existingPoints.length === 0) {
        return { snapped: false, point }
    }

    let closestDist = Infinity
    let closestPoint = null

    for (const ep of existingPoints) {
        const dx = point.x - ep.x
        const dz = point.z - ep.z
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist < closestDist && dist < threshold) {
            closestDist = dist
            closestPoint = ep
        }
    }

    if (closestPoint) {
        return { snapped: true, point: { ...closestPoint } }
    }

    return { snapped: false, point }
}

/**
 * 角度吸附
 * 将终点吸附到相对于起点的特定角度
 * @param {Object} start - 起点 { x, z }
 * @param {Object} end - 终点 { x, z }
 * @param {number} step - 角度步进 (度)
 * @returns {Object} { x, z, angle }
 */
export function snapToAngle(start, end, step = ANGLE_STEP) {
    if (!start || !end) return end

    const dx = end.x - start.x
    const dz = end.z - start.z
    const length = Math.sqrt(dx * dx + dz * dz)

    if (length < 0.01) return end

    // 计算原始角度 (度)
    let angle = Math.atan2(dz, dx) * (180 / Math.PI)

    // 吸附到最近的步进角度
    const snappedAngle = Math.round(angle / step) * step
    const rad = snappedAngle * (Math.PI / 180)

    return {
        x: start.x + length * Math.cos(rad),
        z: start.z + length * Math.sin(rad),
        angle: snappedAngle
    }
}

/**
 * 网格吸附
 * @param {Object} point - 当前点 { x, z }
 * @param {number} gridSize - 网格大小
 * @returns {Object} { x, z }
 */
export function snapToGrid(point, gridSize = GRID_SIZE) {
    return {
        x: Math.round(point.x / gridSize) * gridSize,
        z: Math.round(point.z / gridSize) * gridSize
    }
}

/**
 * 收集所有墙体的端点作为吸附候选
 * @param {Array} walls - 墙体数组
 * @returns {Array} 吸附点数组 [{ x, z }, ...]
 */
export function getAllSnapPoints(walls) {
    if (!walls || walls.length === 0) return []

    const points = []
    for (const wall of walls) {
        if (wall.start) {
            points.push({ x: wall.start.x, z: wall.start.z, wallId: wall.id, type: 'start' })
        }
        if (wall.end) {
            points.push({ x: wall.end.x, z: wall.end.z, wallId: wall.id, type: 'end' })
        }
    }
    return points
}

/**
 * 计算两点之间的距离
 * @param {Object} p1 - { x, z }
 * @param {Object} p2 - { x, z }
 * @returns {number} 距离
 */
export function distance(p1, p2) {
    if (!p1 || !p2) return Infinity
    const dx = p2.x - p1.x
    const dz = p2.z - p1.z
    return Math.sqrt(dx * dx + dz * dz)
}

/**
 * 计算墙体角度 (度)
 * @param {Object} wall - { start: { x, z }, end: { x, z } }
 * @returns {number} 角度 (度)
 */
export function getWallAngle(wall) {
    if (!wall?.start || !wall?.end) return 0
    const dx = wall.end.x - wall.start.x
    const dz = wall.end.z - wall.start.z
    return Math.atan2(dz, dx) * (180 / Math.PI)
}

/**
 * 计算墙体长度
 * @param {Object} wall - { start: { x, z }, end: { x, z } }
 * @returns {number} 长度 (米)
 */
export function getWallLength(wall) {
    return distance(wall?.start, wall?.end)
}

/**
 * 综合吸附计算
 * @param {Object} point - 当前点 { x, z }
 * @param {Object} options - 吸附选项
 * @param {Array} options.walls - 现有墙体
 * @param {Object} options.startPoint - 绘制起点
 * @param {boolean} options.snapEnabled - 是否启用端点吸附
 * @param {boolean} options.angleSnapEnabled - 是否启用角度吸附
 * @param {boolean} options.gridSnapEnabled - 是否启用网格吸附
 * @param {boolean} options.shiftKey - 是否按住 Shift 键
 * @returns {Object} { x, z, snapped }
 */
export function computeSnap(point, options = {}) {
    const {
        walls = [],
        startPoint = null,
        snapEnabled = true,
        angleSnapEnabled = true,
        gridSnapEnabled = false,
        shiftKey = false,
    } = options

    let result = { ...point }
    let snapped = false

    // 1. 网格吸附 (优先级最低)
    if (gridSnapEnabled) {
        result = snapToGrid(result)
    }

    // 2. 角度吸附 (Shift 键激活)
    if (angleSnapEnabled && shiftKey && startPoint) {
        const snappedAngle = snapToAngle(startPoint, result)
        result = { x: snappedAngle.x, z: snappedAngle.z }
        snapped = true
    }

    // 3. 端点吸附 (优先级最高)
    if (snapEnabled) {
        const snapPoints = getAllSnapPoints(walls)
        const snapResult = snapToPoint(result, snapPoints)
        if (snapResult.snapped) {
            result = snapResult.point
            snapped = true
        }
    }

    return { ...result, snapped }
}
