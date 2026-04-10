/**
 * 门窗预设配置
 */

export const DOOR_PRESETS = [
    {
        id: 'door_single_wood',
        name: '单开门 (木门)',
        width: 0.9,
        height: 2.1,
        sillHeight: 0,
        thickness: 0.05,
        color: '#8B5A2B',
        swingAngle: 90,
    },
    {
        id: 'door_single_metal',
        name: '单开门 (金属)',
        width: 0.9,
        height: 2.1,
        sillHeight: 0,
        thickness: 0.04,
        color: '#64748B',
        swingAngle: 90,
    },
    {
        id: 'door_double_glass',
        name: '双开门 (玻璃)',
        width: 1.6,
        height: 2.4,
        sillHeight: 0,
        thickness: 0.06,
        color: '#60A5FA',
        swingAngle: 90,
        isDouble: true,
    },
    {
        id: 'door_sliding',
        name: '推拉门',
        width: 1.8,
        height: 2.2,
        sillHeight: 0,
        thickness: 0.04,
        color: '#94A3B8',
        swingAngle: 0,
        isSliding: true,
    },
]

export const WINDOW_PRESETS = [
    {
        id: 'window_single',
        name: '单窗',
        width: 1.0,
        height: 1.2,
        sillHeight: 0.9,
        thickness: 0.05,
        frameColor: '#F5F5F5',
        glassColor: '#87CEEB',
    },
    {
        id: 'window_double',
        name: '双窗',
        width: 1.8,
        height: 1.2,
        sillHeight: 0.9,
        thickness: 0.05,
        frameColor: '#F5F5F5',
        glassColor: '#87CEEB',
    },
    {
        id: 'window_floor_to_ceiling',
        name: '落地窗',
        width: 2.0,
        height: 2.4,
        sillHeight: 0.3,
        thickness: 0.06,
        frameColor: '#374151',
        glassColor: '#60A5FA',
    },
    {
        id: 'window_small',
        name: '小窗',
        width: 0.6,
        height: 0.8,
        sillHeight: 1.2,
        thickness: 0.04,
        frameColor: '#F5F5F5',
        glassColor: '#87CEEB',
    },
]

/**
 * 获取开口预设
 */
export function getOpeningPreset(id) {
    return [...DOOR_PRESETS, ...WINDOW_PRESETS].find(p => p.id === id)
}

/**
 * 获取所有门预设
 */
export function getDoorPresets() {
    return DOOR_PRESETS
}

/**
 * 获取所有窗预设
 */
export function getWindowPresets() {
    return WINDOW_PRESETS
}

/**
 * 判断预设是否为门
 */
export function isDoorPreset(preset) {
    return DOOR_PRESETS.some(p => p.id === preset?.id)
}

/**
 * 判断预设是否为窗
 */
export function isWindowPreset(preset) {
    return WINDOW_PRESETS.some(p => p.id === preset?.id)
}