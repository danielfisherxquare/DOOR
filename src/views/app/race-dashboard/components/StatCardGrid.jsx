/**
 * StatCardGrid - Core metrics display in grid layout
 */
function StatCardGrid({ metrics }) {
    return (
        <div className="race-dashboard__stat-grid">
            {metrics.map((metric) => (
                <div
                    key={metric.key}
                    className={`race-dashboard__stat-card ${metric.highlight ? 'race-dashboard__stat-card--highlight' : ''}`}
                >
                    <span className="material-symbols-outlined race-dashboard__stat-icon">
                        {metric.icon || 'analytics'}
                    </span>
                    <div className="race-dashboard__stat-content">
                        <span className="race-dashboard__stat-label">{metric.label}</span>
                        <strong className="race-dashboard__stat-value">{metric.value}</strong>
                        <span className="race-dashboard__stat-meta">{metric.meta}</span>
                    </div>
                </div>
            ))}
        </div>
    );
}

export default StatCardGrid;