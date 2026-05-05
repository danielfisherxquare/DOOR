/**
 * AssetCatalog — 底部浮动资产目录
 * 仓库模式：货架模板分类网格
 * 赛事模式：预制物分类网格
 */
import { useMemo, useState } from 'react'
import useAssetDesignerStore from '../../stores/assetDesignerStore'
import { getPrefabs, getPrefabsByCategory, PREFAB_CATEGORIES } from '../../data/prefabRegistry'

function readValue(record, ...keys) {
    for (const key of keys) {
        if (record?.[key] !== undefined && record?.[key] !== null) return record[key]
    }
    return null
}

export default function AssetCatalog({ rackTemplates = [], onSelectTemplate, sceneType = 'warehouse' }) {
    const [activeCategory, setActiveCategory] = useState('all')
    const setPlaceMode = useAssetDesignerStore((s) => s.setPlaceMode)
    const setPrefabPlaceMode = useAssetDesignerStore((s) => s.setPrefabPlaceMode)
    const activeTemplateId = useAssetDesignerStore((s) => s.activeTemplateId)
    const activePrefabId = useAssetDesignerStore((s) => s.activePrefabId)
    const mode = useAssetDesignerStore((s) => s.mode)

    const isEvent = sceneType === 'outdoor-event'
    const allPrefabs = useMemo(() => (isEvent ? getPrefabs() : []), [isEvent])

    // 分类标签
    const categories = useMemo(() => {
        if (isEvent) {
            return [
                { key: 'all', label: '全部', count: allPrefabs.length },
                ...PREFAB_CATEGORIES.map((cat) => ({
                    key: cat.id,
                    label: `${cat.icon} ${cat.label}`,
                    count: allPrefabs.filter((p) => p.category === cat.id).length,
                })).filter((c) => c.count > 0),
            ]
        }
        // 仓库模式 — 原有逻辑
        const types = new Set()
        rackTemplates.forEach((t) => {
            const type = readValue(t, 'shape_type', 'shapeType') || 'standard'
            types.add(type)
        })
        return [
            { key: 'all', label: 'All', count: rackTemplates.length },
            ...Array.from(types).map((type) => ({
                key: type,
                label: type === 'standard' ? '标准货架' : type === 'heavy' ? '重型货架' : type,
                count: rackTemplates.filter((t) => (readValue(t, 'shape_type', 'shapeType') || 'standard') === type).length,
            })),
        ]
    }, [isEvent, allPrefabs, rackTemplates])

    // 过滤列表
    const filteredItems = useMemo(() => {
        if (isEvent) {
            return activeCategory === 'all' ? allPrefabs : getPrefabsByCategory(activeCategory)
        }
        if (activeCategory === 'all') return rackTemplates
        return rackTemplates.filter((t) => (readValue(t, 'shape_type', 'shapeType') || 'standard') === activeCategory)
    }, [isEvent, allPrefabs, rackTemplates, activeCategory])

    return (
        <div className="floating-panel asset-catalog">
            {/* 分类标签 */}
            <div className="asset-catalog__tags">
                {categories.map((cat) => (
                    <button
                        key={cat.key}
                        type="button"
                        className={`asset-catalog__tag ${activeCategory === cat.key ? 'asset-catalog__tag--active' : ''}`}
                        onClick={() => setActiveCategory(cat.key)}
                    >
                        {cat.label}
                        <span className="asset-catalog__tag-count">{cat.count}</span>
                    </button>
                ))}
            </div>

            {/* 缩略图网格 */}
            <div className="asset-catalog__grid">
                {filteredItems.length === 0 && (
                    <div style={{ padding: '16px', color: '#64748B', fontSize: 12 }}>
                        {isEvent ? '该分类暂无预制物' : '暂无模板'}
                    </div>
                )}

                {isEvent
                    ? filteredItems.map((prefab) => (
                        <div
                            key={prefab.id}
                            className={`asset-catalog__item ${mode === 'place' && activePrefabId === prefab.id ? 'asset-catalog__item--active' : ''}`}
                            onClick={() => setPrefabPlaceMode(prefab.id)}
                        >
                            <div className="asset-catalog__thumb">{prefab.icon}</div>
                            <div className="asset-catalog__item-label">{prefab.name}</div>
                            <div className="asset-catalog__item-size" style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>
                                {(prefab.defaultDimensions.widthMm / 1000).toFixed(1)}×{(prefab.defaultDimensions.depthMm / 1000).toFixed(1)}m
                            </div>
                        </div>
                    ))
                    : filteredItems.map((template) => (
                        <div
                            key={template.id}
                            className={`asset-catalog__item ${mode === 'place' && activeTemplateId === template.id ? 'asset-catalog__item--active' : ''}`}
                            onClick={() => {
                                setPlaceMode(template.id)
                                onSelectTemplate?.(template.id)
                            }}
                        >
                            <div className="asset-catalog__thumb">📦</div>
                            <div className="asset-catalog__item-label">
                                {readValue(template, 'code') || readValue(template, 'name') || `T-${template.id}`}
                            </div>
                        </div>
                    ))}
            </div>
        </div>
    )
}
