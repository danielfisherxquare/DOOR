import NavItem from '../NavItem'

export default function SidebarNav({
  group,
  collapsed,
  onToggle,
  buildHref,
  currentPath,
  isCollapsible,
  sidebarCollapsed,
}) {
  const isCollapsed = collapsed && !sidebarCollapsed

  return (
    <section className={`nav-section ${isCollapsed ? 'nav-section--collapsed' : ''}`}>
      {!sidebarCollapsed && (
        <div className="nav-section__header">
          {isCollapsible ? (
            <button
              type="button"
              className="nav-section__toggle"
              onClick={onToggle}
              aria-expanded={!isCollapsed}
            >
              <span className="nav-section__title">{group.label}</span>
              <span className="nav-section__chevron">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </button>
          ) : (
            <span className="nav-section__title">{group.label}</span>
          )}
        </div>
      )}

      <div className="nav-section__list">
        {group.items.map((item) => {
          const href = buildHref(item.path)
          const active = item.path === ''
            ? currentPath === `/${group.key === 'overview' ? 'admin' : 'app'}`
            : currentPath === href || currentPath.startsWith(`${href}/`)

          return (
            <NavItem
              key={item.key}
              item={item}
              href={href}
              active={active}
              collapsed={sidebarCollapsed}
            />
          )
        })}
      </div>
    </section>
  )
}