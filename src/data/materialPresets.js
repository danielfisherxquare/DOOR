/**
 * 材质预设数据 — 3D 资产管理器油漆桶系统
 */

export const zoneColorPresets = [
    { id: 'storage', name: '存储区', color: '#1d4ed8' },
    { id: 'aisle', name: '通道', color: '#d97706' },
    { id: 'buffer', name: '缓冲区', color: '#0f766e' },
    { id: 'inbound', name: '入库区', color: '#7c3aed' },
    { id: 'outbound', name: '出库区', color: '#be123c' },
    { id: 'safety', name: '安全区', color: '#475569' },
]

export const floorMaterialPresets = [
    { id: 'concrete', name: '混凝土地面', color: '#C0C0C0', roughness: 0.8, metalness: 0.1 },
    { id: 'epoxy', name: '环氧地坪', color: '#E8E8E0', roughness: 0.3, metalness: 0.05 },
    { id: 'antislip', name: '防滑地面', color: '#4A90D9', roughness: 0.9, metalness: 0.05 },
    { id: 'marking', name: '标线区域', color: '#FF8C00', roughness: 0.5, metalness: 0.05 },
]

export const rackFinishPresets = [
    { id: 'galvanized', name: '镀锌', color: '#B0B0B0', roughness: 0.4, metalness: 0.7 },
    { id: 'yellow', name: '喷塑黄', color: '#FFD700', roughness: 0.5, metalness: 0.3 },
    { id: 'blue', name: '喷塑蓝', color: '#1E90FF', roughness: 0.5, metalness: 0.3 },
    { id: 'orange', name: '喷塑橙', color: '#FF6347', roughness: 0.5, metalness: 0.3 },
]

// 赛事场景区域预设
export const eventAreaPresets = [
    { id: 'stage', name: '舞台区', color: '#DC2626' },
    { id: 'audience', name: '观众区', color: '#2563EB' },
    { id: 'checkin', name: '签到区', color: '#7C3AED' },
    { id: 'backstage', name: '后勤区', color: '#475569' },
    { id: 'catering', name: '餐饮区', color: '#D97706' },
    { id: 'medical', name: '医疗区', color: '#EF4444' },
    { id: 'parking', name: '停车区', color: '#64748B' },
    { id: 'start-finish', name: '起终点', color: '#059669' },
    { id: 'aid-station', name: '补给站', color: '#0891B2' },
]

// 户外地面预设
export const outdoorGroundPresets = [
    { id: 'grass', name: '草地', color: '#4ADE80', roughness: 0.9 },
    { id: 'dirt', name: '泥地', color: '#92400E', roughness: 0.95 },
    { id: 'asphalt', name: '柏油路', color: '#374151', roughness: 0.7 },
    { id: 'concrete', name: '水泥地', color: '#9CA3AF', roughness: 0.8 },
    { id: 'sand', name: '沙地', color: '#FCD34D', roughness: 0.95 },
]

export function getPresetById(category, id) {
    const presets = { zoneColor: zoneColorPresets, floorMaterial: floorMaterialPresets, rackFinish: rackFinishPresets }
    return (presets[category] || []).find((p) => p.id === id) || null
}

export function getZoneColor(zoneType) {
    const all = [...zoneColorPresets, ...eventAreaPresets]
    return all.find((p) => p.id === zoneType)?.color || '#1d4ed8'
}
