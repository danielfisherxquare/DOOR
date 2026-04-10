/**
 * CSG 工具函数
 * 封装 three-bvh-csg 用于墙体开口
 */
import * as THREE from 'three'
import { SUBTRACTION, Brush, Evaluator } from 'three-bvh-csg/src/index.js'

/**
 * 在墙体上切割开口
 * @param {Object} wallGeometry - 墙体几何参数 { length, height, thickness }
 * @param {Array} openings - 开口配置数组
 * @returns {THREE.BufferGeometry} 切割后的几何体
 */
export function cutWallOpenings(wallGeometry, openings = []) {
  const { length, height, thickness } = wallGeometry

  // 创建墙体基础几何体
  const wallBrush = new Brush(
    new THREE.BoxGeometry(length, height, thickness)
  )
  wallBrush.updateMatrixWorld(true)

  if (!openings || openings.length === 0) {
    return wallBrush.geometry.clone()
  }

  const evaluator = new Evaluator()
  let resultBrush = wallBrush

  for (const opening of openings) {
    // position 是相对位置 (0-1)，转换为墙体中心坐标系
    const openingX = (opening.position - 0.5) * length
    const sillHeight = opening.sillHeight || 0
    const correctedY = sillHeight + opening.height / 2 - height / 2

    // 稍大于墙厚确保穿透
    const openingBrush = new Brush(
      new THREE.BoxGeometry(
        opening.width,
        opening.height,
        thickness * 1.5
      )
    )
    openingBrush.position.set(openingX, correctedY, 0)
    openingBrush.updateMatrixWorld(true)

    try {
      resultBrush = evaluator.evaluate(resultBrush, openingBrush, SUBTRACTION)
      resultBrush.updateMatrixWorld(true)
    } catch (error) {
      console.warn('CSG 开口切割失败:', error)
    }
  }

  return resultBrush.geometry.clone()
}

/**
 * 创建墙体基础几何体
 */
export function createWallGeometry(length, height, thickness) {
    return new THREE.BoxGeometry(length, height, thickness)
}

/**
 * 检查开口是否有效
 */
export function validateOpening(opening, wallLength) {
    if (!opening) return false

    const width = opening.width || 0.9
    const position = opening.position || 0.5

    // 开口不能超出墙体边界
    const halfWidth = width / 2
    const minPos = halfWidth / wallLength
    const maxPos = 1 - halfWidth / wallLength

    if (position < minPos || position > maxPos) {
        return false
    }

    return true
}

/**
 * 检查两个开口是否重叠
 */
export function openingsOverlap(op1, op2, wallLength) {
    const pos1 = op1.position
    const pos2 = op2.position
    const halfWidth1 = (op1.width || 0.9) / 2 / wallLength
    const halfWidth2 = (op2.width || 0.9) / 2 / wallLength

    const distance = Math.abs(pos1 - pos2)
    const minDistance = halfWidth1 + halfWidth2 + 0.05 // 最小间距 5cm

    return distance < minDistance
}

/**
 * 查找墙上的有效放置位置
 */
export function findValidPosition(wall, openingWidth, preferredPosition) {
    if (!wall || !openingWidth) return 0.5

    const length = Math.sqrt(
        Math.pow(wall.end.x - wall.start.x, 2) +
        Math.pow(wall.end.z - wall.start.z, 2)
    )

    const halfWidth = openingWidth / 2 / length
    const minPos = halfWidth + 0.05
    const maxPos = 1 - halfWidth - 0.05

    // 检查与其他开口的碰撞
    const existingOpenings = wall.openings || []

    let position = Math.max(minPos, Math.min(maxPos, preferredPosition))

    // 尝试找到不重叠的位置
    for (let attempt = 0; attempt < 10; attempt++) {
        let hasOverlap = false
        for (const op of existingOpenings) {
            if (openingsOverlap({ position, width: openingWidth }, op, length)) {
                hasOverlap = true
                // 尝试向右或向左移动
                const opHalfWidth = (op.width || 0.9) / 2 / length
                position = op.position + opHalfWidth + halfWidth + 0.1
                if (position > maxPos) {
                    position = op.position - opHalfWidth - halfWidth - 0.1
                }
                break
            }
        }
        if (!hasOverlap) break
    }

    return Math.max(minPos, Math.min(maxPos, position))
}
