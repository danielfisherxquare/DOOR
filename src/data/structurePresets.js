/**
 * 结构元素预设配置
 */

export const COLUMN_PRESETS = [
    {
        id: 'column_rectangular_40',
        name: '矩形柱 40x40cm',
        type: 'column',
        columnType: 'rectangular',
        dimensions: { width: 0.4, depth: 0.4, height: 3.0 },
        material: 'concrete',
        color: '#9CA3AF',
    },
    {
        id: 'column_rectangular_60',
        name: '矩形柱 60x60cm',
        type: 'column',
        columnType: 'rectangular',
        dimensions: { width: 0.6, depth: 0.6, height: 3.0 },
        material: 'concrete',
        color: '#9CA3AF',
    },
    {
        id: 'column_circular_50',
        name: '圆柱 直径50cm',
        type: 'column',
        columnType: 'circular',
        dimensions: { width: 0.5, depth: 0.5, height: 3.0 },
        material: 'concrete',
        color: '#9CA3AF',
    },
    {
        id: 'column_steel_h',
        name: 'H型钢柱',
        type: 'column',
        columnType: 'steel_h',
        dimensions: { width: 0.25, depth: 0.25, height: 3.0 },
        material: 'steel',
        color: '#64748B',
    },
]

export const BEAM_PRESETS = [
    {
        id: 'beam_rectangular_30x50',
        name: '矩形梁 30x50cm',
        type: 'beam',
        dimensions: { width: 0.3, height: 0.5, depth: 4.0 },
        material: 'concrete',
        color: '#9CA3AF',
    },
    {
        id: 'beam_rectangular_40x60',
        name: '矩形梁 40x60cm',
        type: 'beam',
        dimensions: { width: 0.4, height: 0.6, depth: 6.0 },
        material: 'concrete',
        color: '#9CA3AF',
    },
]

export const STAIR_PRESETS = [
    {
        id: 'stair_straight_120',
        name: '直跑楼梯 宽1.2m',
        type: 'stair',
        stairType: 'straight',
        stairWidth: 1.2,
        stairSteps: 12,
        stepHeight: 0.175,
        stepDepth: 0.28,
        dimensions: { width: 1.2, height: 2.1, depth: 3.36 },
        material: 'concrete',
        color: '#78716C',
    },
    {
        id: 'stair_straight_150',
        name: '直跑楼梯 宽1.5m',
        type: 'stair',
        stairType: 'straight',
        stairWidth: 1.5,
        stairSteps: 14,
        stepHeight: 0.175,
        stepDepth: 0.28,
        dimensions: { width: 1.5, height: 2.45, depth: 3.92 },
        material: 'concrete',
        color: '#78716C',
    },
]

export const RAMP_PRESETS = [
    {
        id: 'ramp_wheelchair_8',
        name: '无障碍坡道 8°',
        type: 'ramp',
        rampType: 'wheelchair',
        rampWidth: 1.2,
        rampSlope: 8,
        dimensions: { width: 1.2, height: 0.7, depth: 5.0 },
        material: 'concrete',
        color: '#A8A29E',
    },
    {
        id: 'ramp_vehicle_15',
        name: '车辆坡道 15°',
        type: 'ramp',
        rampType: 'vehicle',
        rampWidth: 3.0,
        rampSlope: 15,
        dimensions: { width: 3.0, height: 1.5, depth: 5.6 },
        material: 'concrete',
        color: '#A8A29E',
    },
]

/**
 * 获取结构预设
 */
export function getStructurePreset(id) {
    return [...COLUMN_PRESETS, ...BEAM_PRESETS, ...STAIR_PRESETS, ...RAMP_PRESETS]
        .find(p => p.id === id)
}

/**
 * 按类型获取结构预设
 */
export function getStructurePresetsByType(type) {
    switch (type) {
        case 'column': return COLUMN_PRESETS
        case 'beam': return BEAM_PRESETS
        case 'stair': return STAIR_PRESETS
        case 'ramp': return RAMP_PRESETS
        default: return []
    }
}

/**
 * 获取所有结构预设
 */
export function getAllStructurePresets() {
    return [...COLUMN_PRESETS, ...BEAM_PRESETS, ...STAIR_PRESETS, ...RAMP_PRESETS]
}