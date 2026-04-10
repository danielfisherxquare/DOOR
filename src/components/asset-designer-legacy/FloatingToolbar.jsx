/**
 * FloatingToolbar — 底部浮动双排工具栏
 * 根据 sceneType 动态切换工具按钮标签
 */
import { getToolModes } from '../../utils/sceneAdapter'

export default function FloatingToolbar({ mode, onModeChange, onToggleCatalog, catalogOpen, sceneType = 'warehouse', onToggleExportPanel, onToggleShareDialog }) {
    const toolConfig = getToolModes(sceneType)

    const MODE_TOOLS = [
        {
            key: 'select', label: toolConfig.selectLabel, shortcut: 'V', icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" /></svg>
            )
        },
        {
            key: 'wall', label: '墙面', shortcut: 'W', icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 21h18" />
                    <path d="M3 7v14" />
                    <path d="M21 7v14" />
                    <path d="M3 7l9-4 9 4" />
                </svg>
            )
        },
        {
            key: 'zone', label: toolConfig.zoneLabel, shortcut: 'B', icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 3v18" /></svg>
            )
        },
        {
            key: toolConfig.placeKey, label: toolConfig.placeLabel, shortcut: 'F', icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v16" /><path d="M4 10h16" /><path d="M4 15h16" /></svg>
            )
        },
        {
            key: 'delete', label: toolConfig.deleteLabel, shortcut: 'D', icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>
            )
        },
    ]

    const EXTRA_TOOLS = [
        {
            key: 'door', label: '门', shortcut: 'E', icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="5" y="2" width="14" height="20" rx="2" />
                    <circle cx="15" cy="12" r="1.5" />
                </svg>
            )
        },
        {
            key: 'window', label: '窗', shortcut: 'Q', icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="4" y="4" width="16" height="16" rx="1" />
                    <line x1="12" y1="4" x2="12" y2="20" />
                    <line x1="4" y1="12" x2="20" y2="12" />
                </svg>
            )
        },
        {
            key: 'column', label: '柱', shortcut: 'C', icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="8" y="2" width="8" height="20" />
                </svg>
            )
        },
        {
            key: 'stair', label: '楼梯', shortcut: 'S', icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 20h4v-4h4v-4h4v-4h4" />
                </svg>
            )
        },
        {
            key: 'camera', label: '相机', icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
            )
        },
        {
            key: 'layers', label: '图层', icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
            )
        },
        {
            key: 'paint', label: '油漆桶', icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 11l-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2a2 2 0 0 0 2.8 0L19 11z" /><path d="M5 21a2 2 0 0 0 2-2" /><path d="M19 15c2 0 4 1 4 3s-2 3-4 3" /></svg>
            )
        },
        {
            key: 'measure', label: '测量', shortcut: 'M', icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M2 12h5" />
                    <path d="M17 12h5" />
                    <path d="M7 4v16" />
                    <path d="M17 4v16" />
                    <path d="M7 12h10" />
                </svg>
            )
        },
        {
            key: 'export', label: '导出', icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
            )
        },
        {
            key: 'share', label: '分享', icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
            )
        },
    ]

    return (
        <div className="floating-panel floating-toolbar">
            {/* 上排 — 模式专用工具 */}
            <div className="floating-toolbar__row">
                {MODE_TOOLS.map((tool) => (
                    <button
                        key={tool.key}
                        type="button"
                        className={`floating-toolbar__btn ${mode === tool.key ? 'floating-toolbar__btn--active' : ''}`}
                        onClick={() => {
                            onModeChange?.(tool.key)
                            if (tool.key === 'place' || tool.key === 'rack' || tool.key === 'prefab') {
                                if (!catalogOpen && onToggleCatalog) onToggleCatalog()
                            }
                        }}
                        title={`${tool.label} (${tool.shortcut})`}
                        aria-label={`${tool.label}，快捷键 ${tool.shortcut}`}
                        aria-pressed={mode === tool.key}
                    >
                        {tool.icon}
                        <span className="floating-toolbar__shortcut">{tool.shortcut}</span>
                    </button>
                ))}

                <div className="floating-toolbar__sep" />

                {EXTRA_TOOLS.map((tool) => (
                    <button
                        key={tool.key}
                        type="button"
                        className={`floating-toolbar__btn ${mode === tool.key ? 'floating-toolbar__btn--active' : ''}`}
                        onClick={() => {
                            if (tool.key === 'paint') onModeChange?.('paint')
                            else if (tool.key === 'layers') onToggleCatalog?.()
                            else if (tool.key === 'measure') onModeChange?.('measure')
                            else if (tool.key === 'export') onToggleExportPanel?.()
                            else if (tool.key === 'share') onToggleShareDialog?.()
                            else if (['door', 'window', 'column', 'stair', 'beam', 'ramp'].includes(tool.key)) {
                                onModeChange?.(tool.key)
                            }
                        }}
                        title={tool.shortcut ? `${tool.label} (${tool.shortcut})` : tool.label}
                        aria-label={tool.shortcut ? `${tool.label}，快捷键 ${tool.shortcut}` : tool.label}
                        aria-pressed={mode === tool.key}
                    >
                        {tool.icon}
                    </button>
                ))}
            </div>
        </div>
    )
}
