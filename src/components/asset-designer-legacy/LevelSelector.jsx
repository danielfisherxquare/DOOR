/**
 * LevelSelector — 楼层选择器
 * 显示在左侧边栏或顶部，用于切换当前楼层
 */
import { useState } from 'react'
import useAssetDesignerStore from '../../stores/assetDesignerStore'

export default function LevelSelector() {
    const {
        levels,
        activeLevelId,
        viewMode,
        setActiveLevel,
        setViewMode,
        addLevel,
        updateLevel,
        deleteLevel,
    } = useAssetDesignerStore()

    const [editingId, setEditingId] = useState(null)
    const [editName, setEditName] = useState('')

    const activeLevel = levels.find(l => l.id === activeLevelId)

    const handleAddLevel = () => {
        addLevel()
    }

    const handleRename = (levelId, newName) => {
        if (newName.trim()) {
            updateLevel(levelId, { name: newName.trim() })
        }
        setEditingId(null)
        setEditName('')
    }

    return (
        <div className="level-selector">
            {/* 视图模式切换 */}
            <div className="level-selector__view-mode">
                <button
                    className={`level-selector__mode-btn ${viewMode === 'single' ? 'active' : ''}`}
                    onClick={() => setViewMode('single')}
                    title="仅当前楼层"
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                    </svg>
                </button>
                <button
                    className={`level-selector__mode-btn ${viewMode === 'all' ? 'active' : ''}`}
                    onClick={() => setViewMode('all')}
                    title="显示所有楼层"
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="5" />
                        <rect x="3" y="10" width="18" height="5" />
                        <rect x="3" y="17" width="18" height="5" />
                    </svg>
                </button>
                <button
                    className={`level-selector__mode-btn ${viewMode === 'slice' ? 'active' : ''}`}
                    onClick={() => setViewMode('slice')}
                    title="切片视图"
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 3h18v18H3z" />
                        <line x1="3" y1="12" x2="21" y2="12" strokeDasharray="2 2" />
                    </svg>
                </button>
            </div>

            {/* 楼层列表 */}
            <div className="level-selector__list">
                {levels.map((level) => (
                    <div
                        key={level.id}
                        className={`level-selector__item ${level.id === activeLevelId ? 'active' : ''}`}
                        onClick={() => setActiveLevel(level.id)}
                    >
                        {editingId === level.id ? (
                            <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                onBlur={() => handleRename(level.id, editName)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleRename(level.id, editName)
                                    if (e.key === 'Escape') setEditingId(null)
                                }}
                                autoFocus
                                className="level-selector__rename-input"
                                onClick={(e) => e.stopPropagation()}
                            />
                        ) : (
                            <>
                                <span className="level-selector__name">{level.name}</span>
                                <span className="level-selector__elevation">
                                    +{level.elevation.toFixed(1)}m
                                </span>
                            </>
                        )}

                        {/* 操作按钮 */}
                        <div className="level-selector__actions">
                            <button
                                className="level-selector__action-btn"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setEditingId(level.id)
                                    setEditName(level.name)
                                }}
                                title="重命名"
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                            </button>
                            {levels.length > 1 && (
                                <button
                                    className="level-selector__action-btn level-selector__action-btn--danger"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        if (confirm(`确定删除楼层 "${level.name}" 吗？该楼层上的实体将被删除。`)) {
                                            deleteLevel(level.id)
                                        }
                                    }}
                                    title="删除楼层"
                                >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <polyline points="3 6 5 6 21 6" />
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* 添加楼层按钮 */}
            <button className="level-selector__add-btn" onClick={handleAddLevel}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>添加楼层</span>
            </button>

            {/* 当前楼层信息 */}
            {activeLevel && (
                <div className="level-selector__info">
                    <div className="level-selector__info-row">
                        <span>层高</span>
                        <span>{activeLevel.height.toFixed(1)}m</span>
                    </div>
                    <div className="level-selector__info-row">
                        <span>标高</span>
                        <span>+{activeLevel.elevation.toFixed(1)}m</span>
                    </div>
                </div>
            )}
        </div>
    )
}