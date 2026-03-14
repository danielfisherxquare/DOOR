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
    <div className="admin-dashboard">
      <div className="admin-dashboard__header">
        <h1 className="page-title">欢迎回来，{user?.username}</h1>
        <p className="page-subtitle">使用左侧菜单进入管理模块。</p>
      </div>

      {isSuperAdmin && !loading && stats && (
        <div className="admin-stats-grid">
          <StatCard label="机构总数" value={stats.orgCount} />
          <StatCard label="用户总数" value={stats.userCount} />
          <StatCard label="活跃用户" value={stats.activeUserCount} />
          <StatCard label="赛事总数" value={stats.raceCount} />
        </div>
      )}

      <div className="quick-actions-card">
        <h3 className="quick-actions-card__title">快捷操作</h3>
        <div className="quick-actions">
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
    <div className="stat-card">
      <div className="stat-card__label">{label}</div>
      <div className="stat-card__value">{value}</div>
    </div>
  )
}

export default AdminDashboard
