import { Link } from 'react-router-dom'

export default function SidebarUserCard({ user, collapsed, onLogout, layer, features }) {
  const switchLinks = {
    admin: [
      { to: '/ops', label: '进入执行端', icon: 'OPS', show: features.showOpsLink },
    ],
    app: [
      { to: '/ops', label: '进入执行端', icon: 'OPS', show: features.showOpsLink },
      { to: '/admin', label: '进入管理后台', icon: 'ADM', show: features.showAdminLink },
    ],
    ops: [
      { to: '/app', label: '返回应用层', icon: 'APP', show: true },
      { to: '/admin', label: '进入管理后台', icon: 'ADM', show: features.showAdminLink },
    ],
  }

  const links = (switchLinks[layer] || []).filter((l) => l.show)

  const getRoleName = (user) => {
    if (!user) return '用户'
    if (user.role === 'super_admin') return '超级管理员'
    if (user.role === 'org_admin') return '机构管理员'
    if (user.role === 'race_admin') return '赛事管理员'
    if (user.role === 'user') return '普通用户'
    return '普通用户'
  }

  return (
    <div className="sidebar__footer">
      <div className="sidebar__user-card">
        <span className="sidebar__avatar">
          {user?.username?.slice(0, 2)?.toUpperCase() || 'U'}
        </span>
        <span className="sidebar__user-meta">
          <span className="sidebar__user-name">{user?.username || '用户'}</span>
          <span className="sidebar__user-role">{getRoleName(user)}</span>
        </span>
      </div>

      {links.length > 0 && !collapsed && (
        <div className="sidebar__switch-links">
          {links.map((link) => (
            <Link key={link.to} to={link.to} className="sidebar__switch-link">
              <span className="sidebar__switch-icon">{link.icon}</span>
              <span>{link.label}</span>
            </Link>
          ))}
        </div>
      )}

      {!collapsed && (
        <div className="sidebar__actions">
          <button type="button" className="btn btn--danger sidebar__action" onClick={onLogout}>
            退出登录
          </button>
        </div>
      )}
    </div>
  )
}
