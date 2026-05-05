/**
 * SceneAdapter — 前端场景适配层
 * 不改后端 API，根据 sceneType 映射 UI 标签/图标
 */

export const SCENE_TYPES = {
    warehouse: {
        label: '仓库场景',
        siteLabel: '仓库',
        areaLabel: '分区',
        prefabLabel: '货架',
        defaultGround: 'concrete',
        defaultSkybox: null,
    },
    'outdoor-event': {
        label: '户外赛事',
        siteLabel: '场地',
        areaLabel: '功能区',
        prefabLabel: '预制物',
        defaultGround: 'grass',
        defaultSkybox: 'day',
    },
}

export function getSceneConfig(sceneType) {
    return SCENE_TYPES[sceneType] || SCENE_TYPES.warehouse
}

/**
 * 根据 sceneType 返回对应的 TYPE_LABELS 映射
 */
export function getTypeLabels(sceneType) {
    const config = getSceneConfig(sceneType)
    return {
        warehouse: config.siteLabel,
        zone: config.areaLabel,
        rack: config.prefabLabel,
        prefab: config.prefabLabel,
        location: '槽位',
    }
}

/**
 * 根据 sceneType 返回工具栏应显示的模式列表
 */
export function getToolModes(sceneType) {
    const isEvent = sceneType === 'outdoor-event'
    return {
        selectLabel: '选择',
        zoneLabel: isEvent ? '画功能区' : '画区域',
        placeLabel: isEvent ? '放预制物' : '放货架',
        placeKey: isEvent ? 'prefab' : 'rack',
        deleteLabel: '删除',
    }
}
