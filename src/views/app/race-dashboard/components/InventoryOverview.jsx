/**
 * InventoryOverview - Inventory statistics display
 */
function InventoryOverview({ data }) {
    const {
        totalUnits = 0,
        pickedUnits = 0,
        pendingUnits = 0,
        byType = [],
    } = data;

    const completionRate = totalUnits > 0
        ? Math.round((pickedUnits / totalUnits) * 100)
        : 0;

    return (
        <div className="race-dashboard__inventory">
            {/* Summary */}
            <div className="race-dashboard__inventory-summary">
                <div className="race-dashboard__inventory-stat">
                    <span className="race-dashboard__inventory-label">总库存</span>
                    <strong className="race-dashboard__inventory-value">{totalUnits}</strong>
                </div>
                <div className="race-dashboard__inventory-stat">
                    <span className="race-dashboard__inventory-label">已发放</span>
                    <strong className="race-dashboard__inventory-value race-dashboard__inventory-value--success">{pickedUnits}</strong>
                </div>
                <div className="race-dashboard__inventory-stat">
                    <span className="race-dashboard__inventory-label">待发放</span>
                    <strong className="race-dashboard__inventory-value race-dashboard__inventory-value--warning">{pendingUnits}</strong>
                </div>
            </div>

            {/* Completion progress */}
            <div className="race-dashboard__inventory-progress">
                <div className="race-dashboard__progress-bar-wrapper">
                    <div className="race-dashboard__progress-bar race-dashboard__progress-bar--single">
                        <div
                            className="race-dashboard__progress-fill"
                            style={{ width: `${completionRate}%` }}
                        />
                    </div>
                    <span className="race-dashboard__progress-label">{completionRate}% 发放完成</span>
                </div>
            </div>

            {/* Type breakdown */}
            {byType.length > 0 && (
                <div className="race-dashboard__inventory-types">
                    {byType.map((type) => {
                        const typeRate = type.total > 0
                            ? Math.round((type.picked / type.total) * 100)
                            : 0;
                        return (
                            <div key={type.type} className="race-dashboard__inventory-type-item">
                                <span className="race-dashboard__inventory-type-name">{type.type}</span>
                                <div className="race-dashboard__inventory-type-bar">
                                    <div
                                        className="race-dashboard__progress-fill race-dashboard__progress-fill--thin"
                                        style={{ width: `${typeRate}%` }}
                                    />
                                </div>
                                <span className="race-dashboard__inventory-type-count">
                                    {type.picked}/{type.total}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}

            {totalUnits === 0 && (
                <div className="race-dashboard__empty-chart">
                    <span className="material-symbols-outlined">inventory_2</span>
                    <span>暂无物资库存数据</span>
                </div>
            )}
        </div>
    );
}

export default InventoryOverview;