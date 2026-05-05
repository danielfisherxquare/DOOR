import { Link } from 'react-router-dom'

export default function SidebarBrand({ name, shortName, collapsed, onToggleCollapse, layer }) {
  const homePath = {
    admin: '/admin',
    app: '/app',
    ops: '/ops',
  }[layer] || '/app'

  return (
    <div className="sidebar__brand-row">
      <Link to={homePath} className="sidebar__brand">
        <span className="sidebar__eyebrow">Powered by Xquare</span>
        <span className="sidebar__title">{collapsed ? shortName : name}</span>
      </Link>

      <button
        type="button"
        className="sidebar__collapse"
        onClick={onToggleCollapse}
        title={collapsed ? '展开导航' : '收起导航'}
        aria-label={collapsed ? '展开导航' : '收起导航'}
      >
        {collapsed ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        )}
      </button>
    </div>
  )
}
