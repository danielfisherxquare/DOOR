/**
 * FloatingInspector — 右侧浮动属性检查器
 * 选中对象时展开，显示属性字段和操作按钮
 */
import { CommandDetailPane } from '../command/CommandPrimitives'

function readValue(record, ...keys) {
    for (const key of keys) {
        if (record?.[key] !== undefined && record?.[key] !== null) return record[key]
    }
    return null
}

function dimensionsOf(record) {
    const dims = readValue(record, 'dimensions_mm', 'dimensionsMm', 'outer_dimensions_mm', 'outerDimensionsMm', 'bounds_mm', 'boundsMm') || {}
    return {
        widthMm: Number(readValue(dims, 'widthMm', 'width_mm') || 0),
        depthMm: Number(readValue(dims, 'depthMm', 'depth_mm') || 0),
        heightMm: Number(readValue(dims, 'heightMm', 'height_mm') || 0),
    }
}

function positionOf(record) {
    const pos = readValue(record, 'position', 'position_mm', 'positionMm', 'bounds_mm', 'boundsMm') || {}
    return {
        x: Number(readValue(pos, 'x') || 0),
        y: Number(readValue(pos, 'y') || 0),
        z: Number(readValue(pos, 'z') || 0),
    }
}

const TYPE_LABELS = {
    warehouse: '仓库',
    zone: '区域',
    rack: '货架',
    location: '库位',
    prefab: '预制物',
    site: '场地',
    area: '功能区',
}

export default function FloatingInspector({ selection, entity, onClose }) {
    if (!entity || !selection) return null

    const typeLabel = TYPE_LABELS[selection.type] || selection.type
    const code = readValue(entity, 'code') || ''
    const name = readValue(entity, 'name') || ''
    const dims = dimensionsOf(entity)
    const pos = positionOf(entity)

    const titleText = `✏️ ${typeLabel} ${code || name}`
    const headerActions = (
        <button type="button" className="floating-inspector__close" onClick={onClose} title="关闭">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
        </button>
    )

    const footerActions = (
        <div className="floating-inspector__actions" style={{ padding: 0 }}>
            {selection.type === 'rack' && (
                <button type="button" className="floating-inspector__action-btn floating-inspector__action-btn--primary">
                    生成库位
                </button>
            )}
            <button type="button" className="floating-inspector__action-btn">复制</button>
            <button type="button" className="floating-inspector__action-btn">锁定</button>
            <button type="button" className="floating-inspector__action-btn floating-inspector__action-btn--danger">
                删除
            </button>
        </div>
    )

    return (
        <CommandDetailPane 
            className="floating-panel floating-inspector"
            title={titleText}
            actions={headerActions}
            footer={footerActions}
        >
            {/* 基本信息 */}
            <div className="floating-inspector__section" style={{ padding: 0, border: 'none' }}>
                <div className="floating-inspector__section-title">📋 基本信息</div>
                <div className="floating-inspector__field">
                    <span className="floating-inspector__field-label">编码</span>
                    <input className="floating-inspector__field-input" value={code} readOnly />
                </div>
                <div className="floating-inspector__field">
                    <span className="floating-inspector__field-label">名称</span>
                    <input className="floating-inspector__field-input" value={name} readOnly />
                </div>
                {selection.type === 'zone' && (
                    <div className="floating-inspector__field">
                        <span className="floating-inspector__field-label">类型</span>
                        <input className="floating-inspector__field-input" value={readValue(entity, 'zone_type', 'zoneType') || ''} readOnly />
                    </div>
                )}
            </div>

            {/* 位置 */}
            {(selection.type === 'zone' || selection.type === 'rack' || selection.type === 'prefab') && (
                <div className="floating-inspector__section" style={{ padding: 0, border: 'none' }}>
                    <div className="floating-inspector__section-title">📐 位置</div>
                    <div className="floating-inspector__field">
                        <span className="floating-inspector__field-label">X</span>
                        <input className="floating-inspector__field-input" value={pos.x} readOnly />
                        <span className="floating-inspector__field-unit">mm</span>
                    </div>
                    <div className="floating-inspector__field">
                        <span className="floating-inspector__field-label">Z</span>
                        <input className="floating-inspector__field-input" value={pos.z} readOnly />
                        <span className="floating-inspector__field-unit">mm</span>
                    </div>
                    {selection.type === 'prefab' && (
                        <div className="floating-inspector__field">
                            <span className="floating-inspector__field-label">旋转</span>
                            <input className="floating-inspector__field-input" value={readValue(entity, 'rotationDeg') || 0} readOnly />
                            <span className="floating-inspector__field-unit">°</span>
                        </div>
                    )}
                </div>
            )}

            {/* 尺寸 */}
            <div className="floating-inspector__section" style={{ padding: 0, border: 'none' }}>
                <div className="floating-inspector__section-title">📏 尺寸</div>
                <div className="floating-inspector__field">
                    <span className="floating-inspector__field-label">宽</span>
                    <input className="floating-inspector__field-input" value={dims.widthMm} readOnly />
                    <span className="floating-inspector__field-unit">mm</span>
                </div>
                <div className="floating-inspector__field">
                    <span className="floating-inspector__field-label">深</span>
                    <input className="floating-inspector__field-input" value={dims.depthMm} readOnly />
                    <span className="floating-inspector__field-unit">mm</span>
                </div>
                <div className="floating-inspector__field">
                    <span className="floating-inspector__field-label">高</span>
                    <input className="floating-inspector__field-input" value={dims.heightMm} readOnly />
                    <span className="floating-inspector__field-unit">mm</span>
                </div>
            </div>
        </CommandDetailPane>
    )
}
