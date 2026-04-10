export default function WarehouseContextBar({
    warehouseOptions = [],
    warehouseId = '',
    onWarehouseChange,
    search = '',
    onSearchChange,
    status = '',
    onStatusChange,
    statusOptions = [],
    extra = null,
}) {
    return (
        <section className="warehouse-context-bar">
            {onWarehouseChange ? (
                <label className="warehouse-context-bar__field">
                    <span>仓库上下文</span>
                    <select className="input" value={warehouseId} onChange={(event) => onWarehouseChange(event.target.value)}>
                        <option value="">全部仓库</option>
                        {warehouseOptions.map((option) => (
                            <option key={option.id} value={option.id}>{option.name} · {option.code}</option>
                        ))}
                    </select>
                </label>
            ) : null}

            {onSearchChange ? (
                <label className="warehouse-context-bar__field warehouse-context-bar__field--grow">
                    <span>搜索</span>
                    <input
                        className="input"
                        value={search}
                        placeholder="搜索批次号、二维码、库位码..."
                        onChange={(event) => onSearchChange(event.target.value)}
                    />
                </label>
            ) : null}

            {onStatusChange ? (
                <label className="warehouse-context-bar__field">
                    <span>状态筛选</span>
                    <select className="input" value={status} onChange={(event) => onStatusChange(event.target.value)}>
                        <option value="">全部状态</option>
                        {statusOptions.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                </label>
            ) : null}

            {extra}
        </section>
    )
}

