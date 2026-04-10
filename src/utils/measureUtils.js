/**
 * 测量工具函数
 * 提供距离、面积、角度计算功能
 */
import { distance } from './snapEngine'

/**
 * 计算多点组成的折线总长度
 * @param {Array} points - 点数组 [{ x, z }, ...]
 * @returns {number} 总长度 (米)
 */
export function calculatePathLength(points) {
    if (!points || points.length < 2) return 0
    let total = 0
    for (let i = 0; i < points.length - 1; i++) {
        total += distance(points[i], points[i + 1])
    }
    return total
}

/**
 * 计算多边形面积 (Shoelace公式)
 * @param {Array} points - 多边形顶点 [{ x, z }, ...]
 * @returns {number} 面积 (平方米)
 */
export function calculatePolygonArea(points) {
    if (!points || points.length < 3) return 0

    let area = 0
    const n = points.length

    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n
        area += points[i].x * points[j].z
        area -= points[j].x * points[i].z
    }

    return Math.abs(area / 2)
}

/**
 * 计算三点角度 (度)
 * @param {Object} p1 - 第一点 { x, z }
 * @param {Object} vertex - 顶点 { x, z }
 * @param {Object} p2 - 第二点 { x, z }
 * @returns {number} 角度 (度)
 */
export function calculateAngle(p1, vertex, p2) {
    if (!p1 || !vertex || !p2) return 0

    // 向量 v1 = vertex -> p1
    const v1x = p1.x - vertex.x
    const v1z = p1.z - vertex.z

    // 向量 v2 = vertex -> p2
    const v2x = p2.x - vertex.x
    const v2z = p2.z - vertex.z

    // 点积
    const dot = v1x * v2x + v1z * v2z

    // 模长
    const len1 = Math.sqrt(v1x * v1x + v1z * v1z)
    const len2 = Math.sqrt(v2x * v2x + v2z * v2z)

    if (len1 === 0 || len2 === 0) return 0

    // 夹角余弦值
    const cos = dot / (len1 * len2)

    // 转换为角度
    return Math.acos(Math.max(-1, Math.min(1, cos))) * (180 / Math.PI)
}

/**
 * 格式化距离显示
 * @param {number} meters - 距离 (米)
 * @param {number} precision - 小数位数
 * @returns {string} 格式化字符串
 */
export function formatDistance(meters, precision = 2) {
    if (meters >= 1000) {
        return `${(meters / 1000).toFixed(precision)}km`
    }
    return `${meters.toFixed(precision)}m`
}

/**
 * 格式化面积显示
 * @param {number} squareMeters - 面积 (平方米)
 * @param {number} precision - 小数位数
 * @returns {string} 格式化字符串
 */
export function formatArea(squareMeters, precision = 2) {
    if (squareMeters >= 10000) {
        return `${(squareMeters / 10000).toFixed(precision)}ha`
    }
    return `${squareMeters.toFixed(precision)}m²`
}

/**
 * 格式化角度显示
 * @param {number} degrees - 角度 (度)
 * @param {number} precision - 小数位数
 * @returns {string} 格式化字符串
 */
export function formatAngle(degrees, precision = 1) {
    return `${degrees.toFixed(precision)}°`
}

/**
 * 获取线段中点
 * @param {Object} p1 - { x, z }
 * @param {Object} p2 - { x, z }
 * @returns {Object} { x, z }
 */
export function getMidpoint(p1, p2) {
    return {
        x: (p1.x + p2.x) / 2,
        z: (p1.z + p2.z) / 2,
    }
}

/**
 * 获取多边形中心点
 * @param {Array} points - 多边形顶点
 * @returns {Object} { x, z }
 */
export function getCentroid(points) {
    if (!points || points.length === 0) return { x: 0, z: 0 }
    const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, z: acc.z + p.z }), { x: 0, z: 0 })
    return {
        x: sum.x / points.length,
        z: sum.z / points.length,
    }
}