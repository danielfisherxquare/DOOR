/**
 * MeasurementPanel — 测量结果面板
 * 显示所有测量结果，支持删除和清除
 */
export default function MeasurementPanel({
    measurements = [],
    onClear,
    onDelete,
    measurementMode,
    onModeChange,
}) {
    const typeLabels = {
        distance: '距离',
        area: '面积',
        angle: '角度',
    }

    return (
        <div className="measurement-panel">
            <div className="measurement-panel__header">
                <h3>测量</h3>
                <div className="measurement-panel__modes">
                    <button
                        className={`measurement-panel__mode-btn ${measurementMode === 'distance' ? 'active' : ''}`}
                        onClick={() => onModeChange?.('distance')}
                        title="距离测量"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M4 12h16" />
                            <circle cx="4" cy="12" r="2" />
                            <circle cx="20" cy="12" r="2" />
                        </svg>
                    </button>
                    <button
                        className={`measurement-panel__mode-btn ${measurementMode === 'area' ? 'active' : ''}`}
                        onClick={() => onModeChange?.('area')}
                        title="面积测量"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polygon points="12,2 22,8.5 22,15.5 12,22 2,15.5 2,8.5" />
                        </svg>
                    </button>
                    <button
                        className={`measurement-panel__mode-btn ${measurementMode === 'angle' ? 'active' : ''}`}
                        onClick={() => onModeChange?.('angle')}
                        title="角度测量"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M4 20 L20 20 L12 4 Z" />
                        </svg>
                    </button>
                </div>
                {measurements.length > 0 && (
                    <button onClick={onClear} className="measurement-panel__clear">
                        清除
                    </button>
                )}
            </div>

            {measurements.length === 0 ? (
                <div className="measurement-panel__empty">
                    <p>点击场景进行测量</p>
                    <p className="measurement-panel__hint">
                        {measurementMode === 'distance' && '点击添加测量点，Enter确认'}
                        {measurementMode === 'area' && '点击添加顶点，Enter确认多边形'}
                        {measurementMode === 'angle' && '依次点击三点测量角度'}
                    </p>
                </div>
            ) : (
                <div className="measurement-panel__list">
                    {measurements.map((m) => (
                        <div key={m.id} className="measurement-panel__item">
                            <span className="measurement-panel__type">
                                {typeLabels[m.type] || m.type}
                            </span>
                            <span className="measurement-panel__value">{m.label}</span>
                            <button
                                onClick={() => onDelete(m.id)}
                                className="measurement-panel__delete"
                                title="删除"
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}