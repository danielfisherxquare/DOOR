import { useEffect, useState } from 'react'
import adminApi from '../../api/adminApi'
import useAuthStore from '../../stores/authStore'

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
            .catch(() => {})
            .finally(() => setLoading(false))
    }, [isSuperAdmin])

    const cardStyle = {
        background: 'white',
        borderRadius: 12,
        padding: '24px 28px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        flex: '1 1 200px',
    }

    const numStyle = { fontSize: 32, fontWeight: 700, color: 'var(--color-accent, #6366f1)' }
    const labelStyle = { fontSize: 13, color: 'var(--color-text-secondary, #666)', marginTop: 4 }

    return (
        <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>
                欢迎回来，{user?.username}
            </h1>

            {isSuperAdmin && !loading && stats && (
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 32 }}>
                    <div style={cardStyle}>
                        <div style={numStyle}>{stats.orgCount}</div>
                        <div style={labelStyle}>机构总数</div>
                    </div>
                    <div style={cardStyle}>
                        <div style={numStyle}>{stats.userCount}</div>
                        <div style={labelStyle}>用户总数</div>
                    </div>
                    <div style={cardStyle}>
                        <div style={numStyle}>{stats.activeUserCount}</div>
                        <div style={labelStyle}>活跃用户</div>
                    </div>
                    <div style={cardStyle}>
                        <div style={numStyle}>{stats.raceCount}</div>
                        <div style={labelStyle}>赛事总数</div>
                    </div>
                </div>
            )}

            <div style={cardStyle}>
                <h3 style={{ marginBottom: 12 }}>快捷操作</h3>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {isSuperAdmin && (
                        <>
                            <a href="/admin/orgs" className="btn btn--primary">🏢 管理机构</a>
                            <a href="/admin/users" className="btn btn--secondary">👤 管理用户</a>
                        </>
                    )}
                    <a href="/admin/members" className="btn btn--secondary">👥 管理成员</a>
                    <a href="/admin/races" className="btn btn--secondary">🏁 赛事管理</a>
                    <a href="/admin/race-permissions" className="btn btn--secondary">🔑 赛事授权</a>
                </div>
            </div>
        </div>
    )
}

export default AdminDashboard
