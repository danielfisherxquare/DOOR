/**
 * MaterialPicker — 材质 / 油漆桶选择器
 * 区域颜色 + 地面材质 + 货架喷涂 三类预设
 */
import { zoneColorPresets, floorMaterialPresets, rackFinishPresets } from '../../data/materialPresets'

const PAINT_TABS = [
    { key: 'zoneColor', label: '区域颜色' },
    { key: 'floorMaterial', label: '地面材质' },
    { key: 'rackFinish', label: '货架材质' },
]

function getPresets(paintMode) {
    if (paintMode === 'zoneColor') return zoneColorPresets
    if (paintMode === 'floorMaterial') return floorMaterialPresets
    if (paintMode === 'rackFinish') return rackFinishPresets
    return []
}

export default function MaterialPicker({
    paintMode = 'zoneColor',
    activeMaterialId,
    onPaintModeChange,
    onMaterialSelect,
}) {
    const presets = getPresets(paintMode)

    return (
        <div className="floating-panel material-picker">
            {/* 类别切换 */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
                {PAINT_TABS.map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        className={`asset-catalog__tag ${paintMode === tab.key ? 'asset-catalog__tag--active' : ''}`}
                        onClick={() => onPaintModeChange?.(tab.key)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* 色板网格 */}
            <div className="material-picker__grid">
                {presets.map((preset) => (
                    <div
                        key={preset.id}
                        className={`material-picker__swatch ${activeMaterialId === preset.id ? 'material-picker__swatch--active' : ''}`}
                        style={{ background: preset.color }}
                        onClick={() => onMaterialSelect?.(preset.id)}
                        title={preset.name}
                    >
                        <span className="material-picker__swatch-label">{preset.name}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
