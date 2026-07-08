import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import useAuthStore from '../../../stores/authStore';
import useWorkspaceStore from '../../../features/workspace/workspaceStore';
import racesApi from '../../../api/races';
import { resolveSurfaceOrgId, resolveSurfaceRaceId } from '../../../utils/surfaceContext';
import { useDashboardData } from './hooks/useDashboardData';
import StatCardGrid from './components/StatCardGrid';
import EventDistribution from './components/EventDistribution';
import BibProgress from './components/BibProgress';
import InventoryOverview from './components/InventoryOverview';
import CredentialStats from './components/CredentialStats';
import ActivityTimeline from './components/ActivityTimeline';
import DashboardHeader from './components/DashboardHeader';
import './race-dashboard.css';

const REFRESH_INTERVAL = 30000; // 30 seconds

function RaceDashboardPage() {
    const { user } = useAuthStore();
    const session = useWorkspaceStore((state) => state.session);
    const [searchParams] = useSearchParams();

    const selectedOrgId = resolveSurfaceOrgId(searchParams, user, session);
    const selectedRaceId = resolveSurfaceRaceId(searchParams, user, selectedOrgId, session);
    const fullscreenParam = searchParams.get('fullscreen') === 'true';

    const [races, setRaces] = useState([]);
    const [loadingRaces, setLoadingRaces] = useState(true);
    const [selectedRace, setSelectedRace] = useState(null);

    // Determine masked mode based on capability
    const hasDashboardCapability = user?.scopedCapabilities?.race_dashboard?.includes('view');
    const masked = !hasDashboardCapability;

    // Fetch dashboard data
    const { data, loading, error, refresh } = useDashboardData(
        selectedRaceId,
        masked,
        REFRESH_INTERVAL
    );

    // Fetch races list for selector
    useEffect(() => {
        let cancelled = false;
        setLoadingRaces(true);

        const params = user?.role === 'super_admin' && selectedOrgId
            ? { orgId: selectedOrgId }
            : undefined;

        racesApi.getAll(params)
            .then((res) => {
                if (cancelled || !res.success) return;
                setRaces(res.data || []);
            })
            .catch((err) => {
                if (!cancelled) console.error('加载赛事失败:', err);
            })
            .finally(() => {
                if (!cancelled) setLoadingRaces(false);
            });

        return () => { cancelled = true; };
    }, [user?.role, selectedOrgId]);

    // Find selected race name
    useEffect(() => {
        if (races.length > 0 && selectedRaceId) {
            const race = races.find((r) => String(r.id) === String(selectedRaceId));
            setSelectedRace(race);
        } else {
            setSelectedRace(null);
        }
    }, [races, selectedRaceId]);

    // Check if we have a valid race
    const hasValidRace = selectedRaceId && races.some((race) => String(race.id) === String(selectedRaceId));

    // Calculate completion rates
    const bibCompletionRate = data?.bibStatus?.totalTracked > 0
        ? Math.round((data.bibStatus.finished / data.bibStatus.totalTracked) * 100)
        : 0;

    const inventoryCompletionRate = data?.inventory?.totalUnits > 0
        ? Math.round((data.inventory.pickedUnits / data.inventory.totalUnits) * 100)
        : 0;

    // Core metrics for stat cards
    const coreMetrics = [
        {
            key: 'participants',
            label: '参赛人数',
            value: data?.participants?.total || 0,
            meta: '总报名人数',
            icon: 'groups',
        },
        {
            key: 'checkedIn',
            label: '已检录',
            value: data?.participants?.checkedIn || 0,
            meta: '检录入场人数',
            icon: 'how_to_reg',
        },
        {
            key: 'finished',
            label: '已完赛',
            value: data?.participants?.finished || 0,
            meta: '完成比赛人数',
            icon: 'emoji_events',
        },
        {
            key: 'bibPickup',
            label: 'Bib 发放率',
            value: `${bibCompletionRate}%`,
            meta: '号码布发放进度',
            icon: 'confirmation_number',
            highlight: bibCompletionRate >= 80,
        },
        {
            key: 'inventory',
            label: '物资发放率',
            value: `${inventoryCompletionRate}%`,
            meta: '物资领取进度',
            icon: 'inventory_2',
            highlight: inventoryCompletionRate >= 80,
        },
        {
            key: 'credentials',
            label: '证件已发放',
            value: data?.credentials?.issued || 0,
            meta: '证件发放数量',
            icon: 'badge',
        },
    ];

    if (!selectedRaceId || !hasValidRace) {
        return (
            <div className="race-dashboard race-dashboard--empty">
                <DashboardHeader
                    raceName={loadingRaces ? '加载中...' : '请选择赛事'}
                    raceDate=""
                    masked={masked}
                    onRefresh={refresh}
                    refreshing={loading}
                />
                <div className="race-dashboard__empty-state">
                    <span className="material-symbols-outlined race-dashboard__empty-icon">emoji_events</span>
                    <h2>{loadingRaces ? '正在加载赛事列表...' : '请先选择一个赛事'}</h2>
                    <p>{loadingRaces ? '控制台正在同步可查看赛事。' : (races.length === 0 ? '当前机构下没有可查看的赛事。' : '请在赛事上下文切换器中选择目标赛事。')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`race-dashboard ${fullscreenParam ? 'race-dashboard--fullscreen' : ''}`}>
            <DashboardHeader
                raceName={selectedRace?.name || data?.race?.name || '赛事大屏'}
                raceDate={data?.race?.date || selectedRace?.date || ''}
                masked={masked}
                onRefresh={refresh}
                refreshing={loading}
            />

            {error && (
                <div className="race-dashboard__error">
                    <span className="material-symbols-outlined">error</span>
                    <span>{error}</span>
                </div>
            )}

            {loading && !data ? (
                <div className="race-dashboard__loading">
                    <div className="race-dashboard__spinner" />
                    <span>正在加载赛事数据...</span>
                </div>
            ) : (
                <>
                    {/* Core Metrics */}
                    <StatCardGrid metrics={coreMetrics} />

                    {/* Charts Grid */}
                    <div className="race-dashboard__charts-grid">
                        {/* Event Distribution */}
                        <section className="race-dashboard__panel">
                            <div className="race-dashboard__panel-header">
                                <h3>项目分布</h3>
                                <span className="race-dashboard__panel-meta">
                                    {data?.eventDistribution?.length || 0} 个项目
                                </span>
                            </div>
                            <EventDistribution data={data?.eventDistribution || []} />
                        </section>

                        {/* Bib Progress */}
                        <section className="race-dashboard__panel">
                            <div className="race-dashboard__panel-header">
                                <h3>Bib 状态追踪</h3>
                                <span className="race-dashboard__panel-meta">
                                    总追踪 {data?.bibStatus?.totalTracked || 0} 人
                                </span>
                            </div>
                            <BibProgress data={data?.bibStatus || {}} />
                        </section>
                    </div>

                    {/* Secondary Stats Grid */}
                    <div className="race-dashboard__secondary-grid">
                        {/* Inventory Overview */}
                        <section className="race-dashboard__panel">
                            <div className="race-dashboard__panel-header">
                                <h3>物资库存</h3>
                                <span className="race-dashboard__panel-meta">
                                    {data?.inventory?.byType?.length || 0} 种类型
                                </span>
                            </div>
                            <InventoryOverview data={data?.inventory || {}} />
                        </section>

                        {/* Credential Stats */}
                        <section className="race-dashboard__panel">
                            <div className="race-dashboard__panel-header">
                                <h3>证件统计</h3>
                                <span className="race-dashboard__panel-meta">
                                    申请 {data?.credentials?.totalApplied || 0} 份
                                </span>
                            </div>
                            <CredentialStats data={data?.credentials || {}} />
                        </section>
                    </div>

                    {/* Activity Timeline */}
                    <section className="race-dashboard__panel race-dashboard__panel--wide">
                        <div className="race-dashboard__panel-header">
                            <h3>实时动态</h3>
                            <span className="race-dashboard__panel-meta">
                                最近 {data?.recentActivities?.length || 0} 条
                            </span>
                        </div>
                        <ActivityTimeline activities={data?.recentActivities || []} />
                    </section>

                    {/* Reserved for future extensions */}
                    <div className="race-dashboard__reserved">
                        <div className="race-dashboard__reserved-slot">
                            <span className="material-symbols-outlined">videocam</span>
                            <span>监控画面（待接入）</span>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

export default RaceDashboardPage;
