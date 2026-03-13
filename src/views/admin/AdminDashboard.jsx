import { useEffect, useState } from 'react'
import adminApi from '../../api/adminApi'
import useAuthStore from '../../stores/authStore'

const QUICK_ACTIONS = [
  { href: '/admin/orgs', label: '机构管理', superAdminOnly: true },
  { href: '/admin/users', label: '用户管理', superAdminOnly: true },
  { href: '/admin/races', label: '赛事管理', superAdminOnly: true },
  { href: '/admin/assessment', label: '考评管理', superAdminOnly: true },
  { href: '/admin/members', label: '成员管理', superAdminOnly: false },
  { href: '/admin/race-permissions', label: '赛事授权', superAdminOnly: false },
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
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [isSuperAdmin])

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>欢迎回来，{user?.username}</h1>
        <div style={{ color: 'var(--color-text-secondary)' }}>使用左侧菜单进入管理模块。</div>
      </div>

      {isSuperAdmin && !loading && stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16 }}>
          <StatCard label="机构总数" value={stats.orgCount} />
          <StatCard label="用户总数" value={stats.userCount} />
          <StatCard label="活跃用户" value={stats.activeUserCount} />
          <StatCard label="赛事总数" value={stats.raceCount} />
        </div>
      )}

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0, marginBottom: 16 }}>快捷操作</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {QUICK_ACTIONS.filter((item) => item.superAdminOnly ? isSuperAdmin : true).map((item) => (
            <a key={item.href} href={item.href} className="btn btn--ghost">{item.label}</a>
          ))}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div style={cardStyle}>
      <div style={{ color: 'var(--color-text-secondary)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
    </div>
  )
}

const cardStyle = {
  background: 'var(--color-bg-card, #fff)',
  borderRadius: 12,
  padding: 20,
  boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.06))',
}

export default AdminDashboard
