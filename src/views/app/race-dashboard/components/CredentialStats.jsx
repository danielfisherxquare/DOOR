/**
 * CredentialStats - Credential statistics display
 */
function CredentialStats({ data }) {
    const {
        totalApplied = 0,
        approved = 0,
        issued = 0,
        byCategory = [],
    } = data;

    return (
        <div className="race-dashboard__credentials">
            {/* Summary */}
            <div className="race-dashboard__credentials-summary">
                <div className="race-dashboard__credentials-stat">
                    <span className="material-symbols-outlined">edit_note</span>
                    <div className="race-dashboard__credentials-stat-content">
                        <span className="race-dashboard__credentials-label">申请总数</span>
                        <strong className="race-dashboard__credentials-value">{totalApplied}</strong>
                    </div>
                </div>
                <div className="race-dashboard__credentials-stat">
                    <span className="material-symbols-outlined">grading</span>
                    <div className="race-dashboard__credentials-stat-content">
                        <span className="race-dashboard__credentials-label">已审核</span>
                        <strong className="race-dashboard__credentials-value">{approved}</strong>
                    </div>
                </div>
                <div className="race-dashboard__credentials-stat">
                    <span className="material-symbols-outlined">badge</span>
                    <div className="race-dashboard__credentials-stat-content">
                        <span className="race-dashboard__credentials-label">已发放</span>
                        <strong className="race-dashboard__credentials-value race-dashboard__credentials-value--success">{issued}</strong>
                    </div>
                </div>
            </div>

            {/* Category breakdown */}
            {byCategory.length > 0 && (
                <div className="race-dashboard__credentials-categories">
                    <div className="race-dashboard__credentials-categories-header">
                        <span>类别分布</span>
                    </div>
                    {byCategory.map((cat) => (
                        <div key={cat.category} className="race-dashboard__credentials-category-item">
                            <span className="race-dashboard__credentials-category-name">{cat.category}</span>
                            <strong className="race-dashboard__credentials-category-count">{cat.count}</strong>
                        </div>
                    ))}
                </div>
            )}

            {totalApplied === 0 && (
                <div className="race-dashboard__empty-chart">
                    <span className="material-symbols-outlined">badge</span>
                    <span>暂无证件统计数据</span>
                </div>
            )}
        </div>
    );
}

export default CredentialStats;