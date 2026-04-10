import { useState, useMemo } from 'react'
import Sidebar from '../Sidebar'
import PageHeader from '../PageHeader'
import './LayoutShell.css'

/**
 * 统一布局外壳组件
 *
 * @param {Object} props
 * @param {'admin'|'app'|'ops'} props.layer - 层级标识
 * @param {Array} props.navGroups - 导航分组配置
 * @param {Function} props.buildHref - 构建链接的函数
 * @param {Function} props.getRouteMeta - 获取路由元数据的函数
 * @param {Object} props.user - 当前用户
 * @param {Function} props.onLogout - 登出回调
 * @param {Object} props.features - 功能开关
 * @param {React.ReactNode} props.contextControls - 上下文控制器（Admin用）
 * @param {Array} props.shortcuts - 快捷入口（Admin用）
 * @param {Object} props.context - 上下文参数 { selectedOrgId, selectedRaceId }
 */
export default function LayoutShell({
  layer,
  navGroups,
  buildHref,
  getRouteMeta,
  user,
  onLogout,
  features = {},
  contextControls,
  shortcuts,
  context = {},
  children,
}) {
  const location = window.location
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState(() => {
    try {
      const saved = localStorage.getItem(`${layer}-nav-collapsed`)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  const routeMeta = useMemo(
    () => getRouteMeta(location.pathname),
    [getRouteMeta, location.pathname]
  )

  const currentGroup = useMemo(
    () => navGroups.find((group) => group.key === routeMeta.groupKey) || navGroups[0],
    [navGroups, routeMeta.groupKey]
  )

  const toggleGroupCollapse = (groupKey) => {
    setCollapsedGroups((prev) => {
      const next = prev.includes(groupKey)
        ? prev.filter((k) => k !== groupKey)
        : [...prev, groupKey]
      localStorage.setItem(`${layer}-nav-collapsed`, JSON.stringify(next))
      return next
    })
  }

  const layerClass = `layout--${layer}`
  const collapsedClass = sidebarCollapsed ? 'layout-shell--collapsed' : ''

  return (
    <div className={`layout-shell ${layerClass} ${collapsedClass}`}>
      <Sidebar
        layer={layer}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        navGroups={navGroups}
        collapsedGroups={collapsedGroups}
        onToggleGroup={features.collapsibleNav ? toggleGroupCollapse : undefined}
        buildHref={buildHref}
        currentPath={location.pathname}
        user={user}
        onLogout={onLogout}
        features={features}
        shortcuts={shortcuts}
        context={context}
      />

      <main className="layout-main">
        {features.contextSelector && contextControls && (
          <div className="layout-main__context-bar">
            {contextControls}
          </div>
        )}

        <PageHeader
          groupLabel={currentGroup?.label}
          groupCaption={currentGroup?.caption}
          routeMeta={routeMeta}
          user={user}
        />

        <section className="layout-main__content">
          {children}
        </section>
      </main>
    </div>
  )
}