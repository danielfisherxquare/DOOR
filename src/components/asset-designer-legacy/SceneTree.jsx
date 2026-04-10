/**
 * SceneTree — 左侧浮动树状资产管理器
 * 仓库 > 区域/货架 层级 + 结构/资产/分区 三Tab
 */
import { CommandPanel } from '../command/CommandPrimitives'

export default function SceneTree({
    warehouseName = '未选择仓库',
    activeTab = 'structure',
    onTabChange,
    nodes = [],
    selectedId,
    onSelectNode,
    onAddAsset,
    onBack,
}) {
    const titleNode = (
        <div className="scene-tree__title-wrap">
            <span className="scene-tree__site-label">空间目录</span>
        </div>
    )
    
    const subtitleNode = (
        <div className="scene-tree__warehouse-name">
            <svg className="scene-tree__warehouse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 21V8l9-5 9 5v13" />
                <path d="M9 21V12h6v9" />
            </svg>
            {warehouseName}
        </div>
    )

    const actionNode = onBack ? (
        <button
            className="scene-tree__back-btn"
            onClick={onBack}
            title="返回空间中心"
        >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
            </svg>
        </button>
    ) : null

    return (
        <CommandPanel 
            className="floating-panel scene-tree"
            title={titleNode}
            subtitle={subtitleNode}
            actions={actionNode}
        >
            <div className="scene-tree__tabs">
                {[
                    {
                        key: 'structure', label: '结构', icon: (
                            <svg className="scene-tree__tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <rect x="3" y="3" width="7" height="7" rx="1" />
                                <rect x="14" y="3" width="7" height="7" rx="1" />
                                <rect x="3" y="14" width="7" height="7" rx="1" />
                                <rect x="14" y="14" width="7" height="7" rx="1" />
                            </svg>
                        )
                    },
                    {
                        key: 'furnish', label: '资产', icon: (
                            <svg className="scene-tree__tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M20 21V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v16" />
                                <path d="M4 15h16" />
                                <path d="M8 21v-4" />
                                <path d="M16 21v-4" />
                            </svg>
                        )
                    },
                    {
                        key: 'zones', label: '分区', icon: (
                            <svg className="scene-tree__tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                                <path d="M2 17l10 5 10-5" />
                                <path d="M2 12l10 5 10-5" />
                            </svg>
                        )
                    },
                ].map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        className={`scene-tree__tab ${activeTab === tab.key ? 'scene-tree__tab--active' : ''}`}
                        onClick={() => onTabChange?.(tab.key)}
                    >
                        {tab.icon}
                        <span>{tab.label}</span>
                    </button>
                ))}
            </div>

            <div className="scene-tree__body">
                {nodes.length === 0 && (
                    <div className="scene-tree__empty">
                        {activeTab === 'furnish' ? '暂无资产' : '暂无元素'}
                    </div>
                )}
                {nodes.map((node) => (
                    <div
                        key={node.id}
                        className={`scene-tree__node ${selectedId === node.id ? 'scene-tree__node--selected' : ''}`}
                        onClick={() => onSelectNode?.(node.type, node.id)}
                    >
                        <span className="scene-tree__node-dot" style={{ background: node.color || 'var(--accent)' }} />
                        <span className="scene-tree__node-label">{node.label}</span>
                    </div>
                ))}

                <button type="button" className="scene-tree__add-btn" onClick={onAddAsset}>
                    + {activeTab === 'furnish' ? '进入摆放' : '添加区域'}
                </button>
            </div>
        </CommandPanel>
    )
}
