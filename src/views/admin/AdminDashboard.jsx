import { useEffect, useState } from 'react'
import adminApi from '../../api/adminApi'
import useAuthStore from '../../stores/authStore'

// SVG 图标组件
const Icons = {
    Org: () => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
    ),
    Users: () => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
    ),
    ActiveUsers: () => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
    ),
    Race: () => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
            <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
    ),
    Members: () => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="22" y1="11" x2="16" y2="11" />
        </svg>
    ),
    Key: () => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
        </svg>
    ),
    Settings: () => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
    ),
}

// 快捷操作配置
const QUICK_ACTIONS = [
    { href: '/admin/orgs', label: '管理机构', icon: Icons.Org, superAdminOnly: true, primary: true },
    { href: '/admin/users', label: '管理用户', icon: Icons.Users, superAdminOnly: true },
    { href: '/admin/org-race-permissions', label: '机构赛事授权', icon: Icons.Settings, superAdminOnly: true },
    { href: '/admin/members', label: '管理成员', icon: Icons.Members, superAdminOnly: false },
    { href: '/admin/races', label: '赛事管理', icon: Icons.Race, superAdminOnly: false },
    { href: '/admin/race-permissions', label: '赛事授权', icon: Icons.Key, superAdminOnly: false },
]

function AdminDashboard() {
    const { user } = useAuthStore()
    const isSuperAdmin = user?.role === 'super_admin'
    const [stats, setStats] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!isSuperAdmin) {
            setLoading(false)
            return
        }

        adminApi.getDashboardStats()
            .then((res) => {
                if (res.success) setStats(res.data)
            })
            .catch(() => { })
            .finally(() => setLoading(false))
    }, [isSuperAdmin])

    // 统计卡片配置
    const statCards = stats ? [
        { num: stats.orgCount, label: '机构总数', icon: Icons.Org, color: 'purple' },
        { num: stats.userCount, label: '用户总数', icon: Icons.Users, color: 'green' },
        { num: stats.activeUserCount, label: '活跃用户', icon: Icons.ActiveUsers, color: 'accent' },
        { num: stats.raceCount, label: '赛事总数', icon: Icons.Race, color: 'blue' },
    ] : []

    return (
        <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>
                欢迎回来，{user?.username}
            </h1>

            {isSuperAdmin && !loading && stats && (
                <div className="admin-stats-grid" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 32 }}>
                    {statCards.map((stat, idx) => {
                        const Icon = stat.icon
                        return (
                            <div key={idx} className="admin-stat-card">
                                <div className={`admin-stat-icon admin-stat-icon--${stat.color}`}>
                                    <Icon />
                                </div>
                                <div className="admin-stat-num">{stat.num}</div>
                                <div className="admin-stat-label">{stat.label}</div>
                            </div>
                        )
                    })}
                </div>
            )}

            <div className="admin-card" style={{ padding: '24px 28px' }}>
                <h3 style={{ marginBottom: 0, fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>快捷操作</h3>
                <div className="quick-actions">
                    {QUICK_ACTIONS
                        .filter(action => action.superAdminOnly ? isSuperAdmin : true)
                        .map((action, idx) => {
                            const Icon = action.icon
                            return (
                                <a key={idx} href={action.href} className={`quick-action-btn ${action.primary ? 'btn--primary' : ''}`}>
                                    <div className="quick-action-btn__icon">
                                        <Icon />
                                    </div>
                                    <span>{action.label}</span>
                                </a>
                            )
                        })}
                </div>
            </div>
        </div>
    )
}

export default AdminDashboard
