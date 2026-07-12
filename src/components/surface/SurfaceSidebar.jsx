import { Link } from 'react-router-dom'

function NavGroup({
  group,
  sidebarCollapsed,
  collapsedGroups,
  onToggleGroup,
  getHref,
  isActive,
}) {
  const isCollapsible = Boolean(onToggleGroup) && group.key !== 'home'
  const isCollapsed = isCollapsible && !sidebarCollapsed && collapsedGroups.includes(group.key)
  return (
    <section className={`workspace-nav-section ${isCollapsed ? 'admin-nav-section--collapsed' : ''}`}>
      <div className="workspace-nav-section__header">
        {isCollapsible ? (
          <button
            type="button"
            className="admin-nav-section__toggle"
            onClick={() => onToggleGroup(group.key)}
            aria-expanded={!isCollapsed}
          >
            <div><span className="workspace-nav-section__title">{group.label}</span></div>
            <span className="admin-nav-section__chevron">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>expand_more</span>
            </span>
          </button>
        ) : (
          <div className={onToggleGroup ? 'admin-nav-section__toggle admin-nav-section__toggle--static' : ''}>
            <span className="workspace-nav-section__title">{group.label}</span>
          </div>
        )}
      </div>
      <div className="workspace-nav-list">
        {group.items.map((item) => (
          <Link
            key={item.key}
            to={getHref(item)}
            className={`workspace-nav-item ${isActive(item) ? 'workspace-nav-item--active' : ''}`}
          >
            <span className="workspace-nav-item__icon">
              <span className="material-symbols-outlined">{item.icon || 'circle'}</span>
            </span>
            <span className="workspace-nav-item__title">{item.label}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

export default function SurfaceSidebar({
  homeHref,
  brandIcon,
  brandTitle,
  sidebarCollapsed,
  onToggleSidebar,
  navRef,
  navClassName = '',
  navGroups,
  getHref,
  isActive,
  collapsedGroups = [],
  onToggleGroup,
  user,
  userFallback,
  roleName,
  onLogout,
}) {
  const username = user?.username || userFallback
  const initials = user?.username?.slice(0, 2)?.toUpperCase() || userFallback.slice(0, 2).toUpperCase()
  return (
    <aside className="workspace-sidebar">
      <div className="workspace-sidebar__brand-row">
        <Link to={homeHref} className="workspace-sidebar__brand">
          <div className="workspace-sidebar__logo-box">
            <span className="material-symbols-outlined">{brandIcon}</span>
          </div>
          <div className="workspace-sidebar__brand-text">
            <span className="workspace-sidebar__eyebrow">中奥致远</span>
            <span className="workspace-sidebar__title">{brandTitle}</span>
          </div>
        </Link>
        <button
          type="button"
          className="workspace-sidebar__collapse"
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? '展开导航' : '收起导航'}
          aria-label={sidebarCollapsed ? '展开导航' : '收起导航'}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            {sidebarCollapsed ? 'chevron_right' : 'chevron_left'}
          </span>
        </button>
      </div>
      <nav ref={navRef} className={`workspace-sidebar__nav ${navClassName}`.trim()}>
        {navGroups.map((group) => (
          <NavGroup
            key={group.key}
            group={group}
            sidebarCollapsed={sidebarCollapsed}
            collapsedGroups={collapsedGroups}
            onToggleGroup={onToggleGroup}
            getHref={getHref}
            isActive={isActive}
          />
        ))}
      </nav>
      <div className="workspace-sidebar__footer">
        <div className="workspace-sidebar__user-card">
          <span className="workspace-sidebar__avatar">{initials}</span>
          <span className="workspace-sidebar__user-meta">
            <span className="workspace-sidebar__user-name">{username}</span>
            <span className="workspace-sidebar__user-role">{roleName}</span>
          </span>
        </div>
        <div className="workspace-sidebar__actions">
          <Link to="/launcher" className="workspace-sidebar__action">切换入口</Link>
          <button type="button" className="workspace-sidebar__action" onClick={onLogout}>退出登录</button>
        </div>
      </div>
    </aside>
  )
}
