import { Link } from 'react-router-dom'
import SidebarBrand from './SidebarBrand'
import SidebarNav from './SidebarNav'
import SidebarUserCard from './SidebarUserCard'
import './Sidebar.css'

export default function Sidebar({
  layer,
  collapsed,
  onToggleCollapse,
  navGroups,
  collapsedGroups,
  onToggleGroup,
  buildHref,
  currentPath,
  user,
  onLogout,
  features,
  shortcuts,
  context,
}) {
  const layerConfig = {
    admin: { name: '管理总后台', shortName: 'DG' },
    app: { name: '应用指挥台', shortName: 'AP' },
    ops: { name: '执行指挥台', shortName: 'OP' },
  }

  const { name, shortName } = layerConfig[layer] || layerConfig.app

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>
      <SidebarBrand
        name={name}
        shortName={shortName}
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
        layer={layer}
      />

      <nav className="sidebar__nav">
        {navGroups.map((group) => (
          <SidebarNav
            key={group.key}
            group={group}
            collapsed={collapsedGroups?.includes(group.key)}
            onToggle={onToggleGroup ? () => onToggleGroup(group.key) : undefined}
            buildHref={buildHref}
            currentPath={currentPath}
            isCollapsible={features.collapsibleNav}
            sidebarCollapsed={collapsed}
          />
        ))}
      </nav>

      {features.shortcuts && shortcuts && !collapsed && (
        <div className="sidebar__shortcuts">
          <div className="sidebar__shortcuts-title">快捷入口</div>
          {shortcuts.map((item) => (
            <Link key={item.label} to={item.path} className="sidebar__shortcut">
              {item.label}
            </Link>
          ))}
        </div>
      )}

      <SidebarUserCard
        user={user}
        collapsed={collapsed}
        onLogout={onLogout}
        layer={layer}
        features={features}
      />
    </aside>
  )
}
