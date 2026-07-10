import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import {
  buildAdminHref,
  getAdminNavGroups,
  getAdminRouteMeta,
} from './adminConfig'
import WorkspaceContextDisplay from '../../features/workspace/WorkspaceContextDisplay'
import useSurfaceWorkspace from '../../features/workspace/useSurfaceWorkspace'
import useSidebarMotion from '../shared/useSidebarMotion'
import AdminSurfaceRoutes from '../../routes/adminRoutes'
import '../app/app-layout.css'
import '../../styles/admin-extras.css'

export default function AdminLayout() {
  const { user, logout } = useAuthStore()
  const isSuperAdmin = user?.role === 'super_admin'

  const location = useLocation()
  const navigate = useNavigate()
  const { sidebarCollapsed, sidebarMotionClass, toggleSidebar } = useSidebarMotion()
  const [collapsedGroups, setCollapsedGroups] = useState(() => {
    try {
      const saved = localStorage.getItem('admin-nav-collapsed')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [scrollState, setScrollState] = useState({ scrolled: false, atBottom: true })
  const navRef = useRef(null)
  const { session, selectedOrgId, selectedRaceId, switchWorkspace, workspaceMissing } = useSurfaceWorkspace('admin')

  useEffect(() => {
    setMobileDrawerOpen(false)
  }, [location.pathname])

  // 滚动监听
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = nav
      setScrollState({
        scrolled: scrollTop > 10,
        atBottom: scrollTop + clientHeight >= scrollHeight - 10,
      })
    }

    nav.addEventListener('scroll', handleScroll)
    handleScroll()
    return () => nav.removeEventListener('scroll', handleScroll)
  }, [])

  // 切换分组折叠
  const toggleGroupCollapse = useCallback((groupKey) => {
    setCollapsedGroups((prev) => {
      const next = prev.includes(groupKey)
        ? prev.filter((k) => k !== groupKey)
        : [...prev, groupKey]
      localStorage.setItem('admin-nav-collapsed', JSON.stringify(next))
      return next
    })
  }, [])

  const navGroups = useMemo(
    () => getAdminNavGroups({ isSuperAdmin, user }),
    [isSuperAdmin, user],
  )

  const routeMeta = useMemo(
    () => getAdminRouteMeta(location.pathname),
    [location.pathname],
  )

  const currentGroup = useMemo(
    () => navGroups.find((group) => group.key === routeMeta.groupKey) || navGroups[0],
    [navGroups, routeMeta.groupKey],
  )

  const handleLogout = useCallback(async () => {
    await logout()
    navigate('/login')
  }, [logout, navigate])

  const handleSwitchWorkspace = useCallback(() => {
    if (
      location.pathname.startsWith('/admin/identity-center') &&
      window.__ARCSPRO_IDENTITY_CENTER_DIRTY__ &&
      !window.confirm('身份中心存在未保存的矩阵改动。切换工作区会丢弃这些改动，是否继续？')
    ) {
      return
    }
    switchWorkspace()
  }, [location.pathname, switchWorkspace])

  const needsRaceNotice = routeMeta.needsRace && !selectedRaceId
  const groupTitle = currentGroup?.label || '后台'
  const groupCaption = currentGroup?.caption || '当前工作区'
  const currentContext = { selectedOrgId, selectedRaceId }
  const isNavItemActive = useCallback((item) => {
    return item.path === ''
      ? location.pathname === '/admin'
      : location.pathname === `/admin${item.path}` || location.pathname.startsWith(`/admin${item.path}/`)
  }, [location.pathname])

  const roleName = useMemo(() => {
    if (!user) return '管理员'
    if (user.role === 'super_admin') return '平台管理员'
    if (user.role === 'org_admin') return '机构管理员'
    if (user.role === 'race_admin') return '赛事管理员'
    if (user.role === 'user') return '普通用户'
    return '管理员'
  }, [user])

  if (workspaceMissing) {
    return <Navigate to={`/workspaces?redirect=${encodeURIComponent(location.pathname)}`} replace />
  }

  return (
    <div className={`layout--admin workspace-layout ${sidebarCollapsed ? 'workspace-layout--collapsed' : ''} ${sidebarMotionClass}`.trim()}>
      {/* ═══════════ 侧边栏 ═══════════ */}
      <aside className="workspace-sidebar">
        {/* ── 品牌区 ── */}
        <div className="workspace-sidebar__brand-row">
          <Link to={buildAdminHref('', currentContext)} className="workspace-sidebar__brand">
            <div className="workspace-sidebar__logo-box">
              <span className="material-symbols-outlined">emergency</span>
            </div>
            <div className="workspace-sidebar__brand-text">
              <span className="workspace-sidebar__eyebrow">中奥致远</span>
              <span className="workspace-sidebar__title">ADMIN</span>
            </div>
          </Link>

          <button
            type="button"
            className="workspace-sidebar__collapse"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? '展开导航' : '收起导航'}
            aria-label={sidebarCollapsed ? '展开导航' : '收起导航'}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              {sidebarCollapsed ? 'chevron_right' : 'chevron_left'}
            </span>
          </button>
        </div>

        {/* ── 导航 ── */}
        <nav
          ref={navRef}
          className={`workspace-sidebar__nav ${scrollState.scrolled ? 'admin-sidebar__nav--scrolled' : ''} ${scrollState.atBottom ? '' : 'admin-sidebar__nav--has-more'}`}
        >
          {navGroups.map((group) => {
            const isCollapsible = group.key !== 'home'
            const isCollapsed = isCollapsible && !sidebarCollapsed && collapsedGroups.includes(group.key)
            return (
              <section
                key={group.key}
                className={`workspace-nav-section ${isCollapsed ? 'admin-nav-section--collapsed' : ''}`}
              >
                <div className="workspace-nav-section__header">
                  {isCollapsible ? (
                    <button
                      type="button"
                      className="admin-nav-section__toggle"
                      onClick={() => toggleGroupCollapse(group.key)}
                      aria-expanded={!isCollapsed}
                    >
                      <div>
                        <span className="workspace-nav-section__title">{group.label}</span>
                      </div>
                      <span className="admin-nav-section__chevron">
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>expand_more</span>
                      </span>
                    </button>
                  ) : (
                    <div className="admin-nav-section__toggle admin-nav-section__toggle--static">
                      <div>
                        <span className="workspace-nav-section__title">{group.label}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="workspace-nav-list">
                  {group.items.map((item) => {
                    const href = buildAdminHref(item.path, currentContext)
                    const active = isNavItemActive(item)

                    return (
                      <Link key={item.key} to={href} className={`workspace-nav-item ${active ? 'workspace-nav-item--active' : ''}`}>
                        <span className="workspace-nav-item__icon">
                          <span className="material-symbols-outlined">{item.icon || 'circle'}</span>
                        </span>
                        <span className="workspace-nav-item__title">{item.label}</span>
                      </Link>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </nav>

        {/* ── 底部 ── */}
        <div className="workspace-sidebar__footer">
          <div className="workspace-sidebar__user-card">
            <span className="workspace-sidebar__avatar">{user?.username?.slice(0, 2)?.toUpperCase() || 'AD'}</span>
            <span className="workspace-sidebar__user-meta">
              <span className="workspace-sidebar__user-name">{user?.username || '管理员'}</span>
              <span className="workspace-sidebar__user-role">{roleName}</span>
            </span>
          </div>

          <div className="workspace-sidebar__actions">
            <button type="button" className="workspace-sidebar__action" onClick={handleLogout}>
              退出登录
            </button>
          </div>
        </div>
      </aside>

      {/* ═══════════ 主区域 ═══════════ */}
      <main className="workspace-main">
        {/* ── 顶栏 ── */}
        <header className="workspace-main__topbar">
          <div className="workspace-main__topbar-left">
            <button
              type="button"
              className="workspace-main__mobile-menu-btn"
              onClick={() => setMobileDrawerOpen(true)}
              aria-label="打开后台菜单"
              aria-expanded={mobileDrawerOpen}
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
            <span className="workspace-main__topbar-title">{groupTitle}</span>
          </div>
          <div className="workspace-main__topbar-right">
            <div className="workspace-main__topbar-search">
              <input type="text" placeholder="搜索..." />
              <span className="material-symbols-outlined">search</span>
            </div>
            <button type="button" className="workspace-main__topbar-btn" title="通知">
              <span className="material-symbols-outlined">notifications</span>
            </button>
            <WorkspaceContextDisplay
              roleName={roleName}
              session={session}
              selectedOrgId={selectedOrgId}
              selectedRaceId={selectedRaceId}
              onSwitch={handleSwitchWorkspace}
            />
            <div className="workspace-main__topbar-user">
              <span className="workspace-main__topbar-avatar">{user?.username?.slice(0, 2)?.toUpperCase() || 'AD'}</span>
            </div>
          </div>
        </header>

        {/* ── 页面头部 ── */}
        <section className="workspace-main__page-header">
          <div className="workspace-main__page-header-inner">
            <div className="workspace-main__eyebrow-row">
              <span className="workspace-kicker">{groupTitle}</span>
              <span className="workspace-role-pill">{roleName}</span>
              <span className="workspace-kicker">{groupCaption}</span>
            </div>
            <h1 className="workspace-main__title">{routeMeta.title}</h1>
          </div>
        </section>

        {needsRaceNotice && (
          <div className="admin-state-banner">
            当前页面依赖赛事上下文。请先在右上角“方形上下文入口”中锁定赛事，或者前往
            <Link to={buildAdminHref('/credential/select-race', { selectedOrgId, selectedRaceId })} style={{ marginInline: 6 }}>
              证件流程入口
            </Link>
            选择赛事后再继续操作。
          </div>
        )}

        <section className="workspace-main__content">
          <AdminSurfaceRoutes currentContext={currentContext} locationSearch={location.search} />
        </section>
      </main>
      {mobileDrawerOpen && (
        <div className="workspace-mobile-menu" role="presentation">
          <button
            type="button"
            className="workspace-mobile-menu__backdrop"
            onClick={() => setMobileDrawerOpen(false)}
            aria-label="关闭后台菜单"
          />
          <aside className="workspace-mobile-menu__panel" aria-label="后台菜单">
            <div className="workspace-mobile-menu__header">
              <div>
                <span className="workspace-mobile-menu__eyebrow">中奥致远 ADMIN</span>
                <h2 className="workspace-mobile-menu__title">后台管理</h2>
              </div>
              <button
                type="button"
                className="workspace-mobile-menu__close"
                onClick={() => setMobileDrawerOpen(false)}
                aria-label="关闭后台菜单"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <nav className="workspace-mobile-menu__nav">
              {navGroups.map((group) => (
                <section key={group.key} className="workspace-mobile-menu__section">
                  <span className="workspace-mobile-menu__section-title">{group.label}</span>
                  <div className="workspace-mobile-menu__links">
                    {group.items.map((item) => {
                      const active = isNavItemActive(item)
                      return (
                        <Link
                          key={item.key}
                          to={buildAdminHref(item.path, currentContext)}
                          className={'workspace-mobile-menu__link ' + (active ? 'workspace-mobile-menu__link--active' : '')}
                        >
                          <span className="material-symbols-outlined">{item.icon || 'circle'}</span>
                          <span>{item.label}</span>
                        </Link>
                      )
                    })}
                  </div>
                </section>
              ))}
            </nav>

            <div className="workspace-mobile-menu__footer">
              <span>{user?.username || '管理员'} · {roleName}</span>
              <button type="button" onClick={handleLogout}>退出登录</button>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
