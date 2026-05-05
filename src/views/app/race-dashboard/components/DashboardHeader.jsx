/**
 * DashboardHeader - Top header with race name, date, and controls
 */
import { useNavigate, useSearchParams } from 'react-router-dom';

function DashboardHeader({ raceName, raceDate, masked, onRefresh, refreshing }) {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const isFullscreen = searchParams.get('fullscreen') === 'true';

    const toggleFullscreen = () => {
        const nextParams = new URLSearchParams(searchParams);
        if (isFullscreen) {
            nextParams.delete('fullscreen');
        } else {
            nextParams.set('fullscreen', 'true');
        }
        navigate({ search: nextParams.toString() }, { replace: true });
    };

    return (
        <header className="race-dashboard__header">
            <div className="race-dashboard__header-left">
                <span className="race-dashboard__eyebrow">赛事数据大屏</span>
                <h1 className="race-dashboard__title">{raceName}</h1>
                {raceDate && (
                    <span className="race-dashboard__date">{raceDate}</span>
                )}
                {masked && (
                    <span className="race-dashboard__masked-badge">
                        <span className="material-symbols-outlined">visibility_off</span>
                        脱敏模式
                    </span>
                )}
            </div>

            <div className="race-dashboard__header-right">
                <button
                    type="button"
                    className="btn btn--ghost race-dashboard__btn"
                    onClick={onRefresh}
                    disabled={refreshing}
                    title="刷新数据"
                >
                    <span className="material-symbols-outlined">
                        {refreshing ? 'sync' : 'refresh'}
                    </span>
                    {refreshing ? '刷新中...' : '刷新'}
                </button>

                <button
                    type="button"
                    className="btn btn--secondary race-dashboard__btn"
                    onClick={toggleFullscreen}
                    title={isFullscreen ? '退出全屏' : '全屏模式'}
                >
                    <span className="material-symbols-outlined">
                        {isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
                    </span>
                    {isFullscreen ? '退出全屏' : '全屏'}
                </button>
            </div>
        </header>
    );
}

export default DashboardHeader;