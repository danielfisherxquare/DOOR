function severityClass(severity) {
    if (severity === 'critical') return 'warehouse-pill warehouse-pill--critical'
    if (severity === 'warning') return 'warehouse-pill warehouse-pill--warning'
    if (severity === 'resolved') return 'warehouse-pill warehouse-pill--success'
    return 'warehouse-pill'
}

export default function WarehouseExceptionPanel({ items = [], onSelect, selectedId, title = '异常收件箱', subtitle = '优先处理会阻塞一线作业的异常' }) {
    return (
        <section className="warehouse-panel">
            <div className="warehouse-panel__header">
                <h3>{title}</h3>
                <span className="warehouse-panel__subtitle">{subtitle}</span>
            </div>

            <div className="warehouse-exception-list">
                {items.length ? items.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        className="warehouse-exception-item"
                        onClick={() => onSelect?.(item)}
                        style={selectedId === item.id ? { borderColor: 'var(--accent)' } : undefined}
                    >
                        <div className="warehouse-exception-item__top">
                            <div className="warehouse-exception-item__title">{item.title}</div>
                            <span className={severityClass(item.severity || item.status)}>{item.severity || item.status}</span>
                        </div>
                        <div className="warehouse-exception-item__meta">
                            <span>{item.warehouseName}</span>
                            {item.locationCode ? <span>{item.locationCode}</span> : null}
                            {item.meta ? <span>{item.meta}</span> : null}
                        </div>
                    </button>
                )) : <div className="warehouse-panel__subtitle">当前没有未处理异常。</div>}
            </div>
        </section>
    )
}
