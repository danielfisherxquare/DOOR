/**
 * ActivityTimeline - Recent activities display with auto-scroll
 */
import { useEffect, useRef } from 'react';

function formatTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    return date.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

function getActivityIcon(type) {
    const iconMap = {
        bib_event: 'confirmation_number',
        bib_pickup: 'confirmation_number',
        checkin: 'how_to_reg',
        finish: 'emoji_events',
        credential: 'badge',
    };
    return iconMap[type] || 'activity';
}

function ActivityTimeline({ activities }) {
    const containerRef = useRef(null);

    // Auto-scroll to show latest (optional)
    useEffect(() => {
        if (containerRef.current && activities.length > 0) {
            // Scroll to top to show latest activities
            containerRef.current.scrollTop = 0;
        }
    }, [activities]);

    if (!activities || activities.length === 0) {
        return (
            <div className="race-dashboard__empty-chart">
                <span className="material-symbols-outlined">activity</span>
                <span>暂无实时动态</span>
            </div>
        );
    }

    return (
        <div className="race-dashboard__activities" ref={containerRef}>
            {activities.map((activity, index) => (
                <div key={index} className="race-dashboard__activity-item">
                    <div className="race-dashboard__activity-icon">
                        <span className="material-symbols-outlined">
                            {getActivityIcon(activity.type)}
                        </span>
                    </div>
                    <div className="race-dashboard__activity-content">
                        <span className="race-dashboard__activity-time">
                            {formatTime(activity.time)}
                        </span>
                        <span className="race-dashboard__activity-bib">
                            {activity.bib}
                        </span>
                        <span className="race-dashboard__activity-name">
                            {activity.name || '-'}
                        </span>
                    </div>
                    <div className="race-dashboard__activity-action">
                        <span className="race-dashboard__activity-action-text">
                            {activity.action}
                        </span>
                    </div>
                </div>
            ))}
        </div>
    );
}

export default ActivityTimeline;