function statusClass(status) {
    if (['critical', 'urgent', 'warning'].includes(status)) return 'warehouse-pill warehouse-pill--warning'
    if (['resolved', 'completed', 'done'].includes(status)) return 'warehouse-pill warehouse-pill--success'
    return 'warehouse-pill'
}

export default function WarehouseTaskQueue({ groups = [], onSelect, selectedId }) {
    return (
        <section className="warehouse-panel">
            <div className="warehouse-panel__header">
                <h3>作业队列</h3>
                <span className="warehouse-panel__subtitle">把待办按动作分组，不再回侧栏找入口</span>
            </div>

            {groups.map((group) => (
                <div key={group.key} className="warehouse-task-group">
                    <h4 className="warehouse-task-group__title">{group.label}</h4>
                    <div className="warehouse-task-list">
                        {group.items?.length ? group.items.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                className="warehouse-task-item"
                                onClick={() => onSelect?.(item)}
                                style={selectedId === item.id ? { borderColor: 'var(--accent)' } : undefined}
                            >
                                <div className="warehouse-task-item__top">
                                    <div className="warehouse-task-item__title">{item.title}</div>
                                    <span className={statusClass(item.status)}>{item.status}</span>
                                </div>
                                <div className="warehouse-task-item__meta">
                                    <span>{item.warehouseName}</span>
                                    {item.locationCode ? <span>{item.locationCode}</span> : null}
                                    {item.meta ? <span>{item.meta}</span> : null}
                                </div>
                            </button>
                        )) : <div className="warehouse-panel__subtitle">当前没有待处理项。</div>}
                    </div>
                </div>
            ))}
        </section>
    )
}
