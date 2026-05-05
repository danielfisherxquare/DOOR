/**
 * BibProgress - Progress bars showing Bib status breakdown
 */
function BibProgress({ data }) {
    const {
        totalTracked = 0,
        receiptPrinted = 0,
        pickedUp = 0,
        checkedIn = 0,
        finished = 0,
    } = data;

    const stages = [
        { key: 'receipt', label: '已出回执', count: receiptPrinted, color: '#fac858' },
        { key: 'pickup', label: '已领取', count: pickedUp, color: '#91cc75' },
        { key: 'checkin', label: '已检录', count: checkedIn, color: '#5470c6' },
        { key: 'finish', label: '已完赛', count: finished, color: '#73c0de' },
    ];

    return (
        <div className="race-dashboard__bib-progress">
            {/* Overall progress bar */}
            <div className="race-dashboard__progress-bar-wrapper">
                <div className="race-dashboard__progress-bar">
                    {stages.map((stage, index) => {
                        const percentage = totalTracked > 0
                            ? (stage.count / totalTracked) * 100
                            : 0;
                        return (
                            <div
                                key={stage.key}
                                className="race-dashboard__progress-segment"
                                style={{
                                    width: `${percentage}%`,
                                    backgroundColor: stage.color,
                                }}
                                title={`${stage.label}: ${stage.count}`}
                            />
                        );
                    })}
                </div>
            </div>

            {/* Stage breakdown */}
            <div className="race-dashboard__stage-list">
                {stages.map((stage) => {
                    const percentage = totalTracked > 0
                        ? Math.round((stage.count / totalTracked) * 100)
                        : 0;
                    return (
                        <div key={stage.key} className="race-dashboard__stage-item">
                            <div className="race-dashboard__stage-indicator" style={{ backgroundColor: stage.color }} />
                            <span className="race-dashboard__stage-label">{stage.label}</span>
                            <strong className="race-dashboard__stage-count">{stage.count}</strong>
                            <span className="race-dashboard__stage-percent">{percentage}%</span>
                        </div>
                    );
                })}
            </div>

            {totalTracked === 0 && (
                <div className="race-dashboard__empty-chart">
                    <span className="material-symbols-outlined">confirmation_number</span>
                    <span>暂无 Bib 追踪数据</span>
                </div>
            )}
        </div>
    );
}

export default BibProgress;