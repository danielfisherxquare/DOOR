/**
 * FloatingTopbar — 精简浮动顶栏
 * 仓库选择 + 撤销/重做 + 保存
 */
import { CommandPanel } from '../command/CommandPrimitives'

export default function FloatingTopbar({
    warehouses = [],
    selectedWarehouseId = '',
    onWarehouseChange,
    projectName = '',
    onProjectNameChange,
    dirty = false,
    canUndo = false,
    canRedo = false,
    onUndo,
    onRedo,
    onSave,
    theme = 'dark',
    onToggleTheme,
    showThemeToggle = true,
    saveTitle = '保存当前布局',
}) {
    const showWarehouseSelect = warehouses.length > 0 || typeof onWarehouseChange === 'function'

    return (
        <div className="floating-topbar">
            <CommandPanel className="floating-topbar__panel">
                <div className="floating-topbar__inner">
                    {showWarehouseSelect ? (
                        <select
                            className="floating-topbar__warehouse-select"
                            value={selectedWarehouseId}
                            onChange={(e) => onWarehouseChange?.(e.target.value)}
                        >
                            <option value="">选择仓库...</option>
                            {warehouses.map((w) => (
                                <option key={w.id} value={w.id}>{w.name || w.code || `仓库 ${w.id}`}</option>
                            ))}
                        </select>
                    ) : (
                        <input
                            className="floating-topbar__warehouse-select"
                            value={projectName}
                            onChange={(e) => onProjectNameChange?.(e.target.value)}
                            placeholder="输入项目名称"
                        />
                    )}

                    {dirty && <span className="floating-topbar__dirty-dot" title="有未保存的更改" />}

                    <div className="floating-topbar__divider" />

                    <button
                        type="button"
                        className={`floating-topbar__btn ${!canUndo ? 'floating-topbar__btn--disabled' : ''}`}
                        onClick={onUndo}
                        title="撤销操作 (Ctrl+Z)"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="1 4 1 10 7 10" />
                            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                        </svg>
                    </button>

                    <button
                        type="button"
                        className={`floating-topbar__btn ${!canRedo ? 'floating-topbar__btn--disabled' : ''}`}
                        onClick={onRedo}
                        title="重做操作 (Ctrl+Shift+Z)"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="23 4 23 10 17 10" />
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                        </svg>
                    </button>

                    <div className="floating-topbar__divider" />

                    {showThemeToggle ? (
                        <button
                            type="button"
                            className="floating-topbar__btn"
                            onClick={onToggleTheme}
                            title={theme === 'dark' ? '切换为浅色壳层' : '切换为深色壳层'}
                        >
                            {theme === 'dark' ? (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="5" />
                                    <line x1="12" y1="1" x2="12" y2="3" />
                                    <line x1="12" y1="21" x2="12" y2="23" />
                                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                                    <line x1="1" y1="12" x2="3" y2="12" />
                                    <line x1="21" y1="12" x2="23" y2="12" />
                                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                                </svg>
                            ) : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                                </svg>
                            )}
                        </button>
                    ) : null}

                    <button
                        type="button"
                        className="floating-topbar__btn floating-topbar__btn--primary"
                        onClick={onSave}
                        title={saveTitle}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                            <polyline points="17 21 17 13 7 13 7 21" />
                            <polyline points="7 3 7 8 15 8" />
                        </svg>
                    </button>
                </div>
            </CommandPanel>
        </div>
    )
}
