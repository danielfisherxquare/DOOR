/**
 * 楼层工具函数
 */

/**
 * 获取实体的楼层 ID
 */
export function getEntityLevelId(entity) {
    return entity?.levelId || null
}

/**
 * 过滤当前楼层的实体
 */
export function filterByLevel(entities, levelId, viewMode, activeLevelId, levels = []) {
    if (!entities) return []

    if (viewMode === 'single') {
        // 只显示当前楼层
        return entities.filter(e => !e.levelId || e.levelId === activeLevelId)
    }

    if (viewMode === 'slice') {
        // 切片视图：显示当前楼层及以下
        const activeLevel = levels.find(l => l.id === activeLevelId)
        if (!activeLevel) return entities

        const activeElevation = activeLevel.elevation + activeLevel.height
        return entities.filter(e => {
            const entityLevel = levels.find(l => l.id === e.levelId)
            if (!entityLevel) return true
            return entityLevel.elevation < activeElevation
        })
    }

    // viewMode === 'all': 显示所有
    return entities
}

/**
 * 计算实体的世界 Y 坐标（考虑楼层标高）
 */
export function getWorldY(entity, levels, activeLevelId) {
    const levelId = entity?.levelId || activeLevelId
    const level = levels?.find(l => l.id === levelId)
    const baseElevation = level?.elevation || 0
    const localY = entity?.position?.y || entity?.y || 0
    return baseElevation + localY
}

/**
 * 生成楼层颜色（用于区分不同楼层）
 */
export function getLevelColor(levelId, isActive) {
    if (isActive) return null // 使用原始颜色

    // 非活动楼层使用淡色
    const colors = [
        '#94A3B8', // slate
        '#A5B4FC', // indigo
        '#86EFAC', // green
        '#FCD34D', // yellow
        '#F9A8D4', // pink
    ]

    const index = parseInt(String(levelId).replace(/\D/g, ''), 10) || 0
    return colors[index % colors.length]
}

/**
 * 验证楼层名称唯一性
 */
export function isLevelNameUnique(levels, name, excludeId = null) {
    return !levels.some(l => l.name === name && l.id !== excludeId)
}

/**
 * 计算楼层总高度范围
 */
export function getLevelBounds(levels) {
    if (!levels || levels.length === 0) {
        return { min: 0, max: 10 }
    }

    const max = levels.reduce((acc, l) => {
        return Math.max(acc, l.elevation + l.height)
    }, 0)

    return { min: 0, max }
}

/**
 * 获取楼层实体数量统计
 */
export function getLevelEntityCount(levelId, scene) {
    if (!scene) return 0

    let count = 0
    const entityArrays = ['zones', 'racks', 'walls', 'structures', 'prefabs']

    for (const key of entityArrays) {
        const entities = scene[key] || []
        count += entities.filter(e => !e.levelId || e.levelId === levelId).length
    }

    return count
}