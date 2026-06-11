import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import {
  buildAdminHref,
  getAdminNavGroups,
  getAdminRouteMeta,
} from './adminConfig'
import { AdminEmptyState, AdminSurface } from './AdminWorkbench'
import WorkspaceContextDisplay from '../../features/workspace/WorkspaceContextDisplay'
import useSurfaceWorkspace from '../../features/workspace/useSurfaceWorkspace'
import useSidebarMotion from '../shared/useSidebarMotion'
import '../app/app-layout.css'
import '../../styles/admin-extras.css'

import AdminDashboard from '../../views/admin/AdminDashboard'
import BibTrackingPage from '../../views/admin/BibTrackingPage'
import DatabaseBackupPage from '../../views/admin/DatabaseBackupPage'
import OrgCreatePage from '../../views/admin/OrgCreatePage'
import OrgDetailPage from '../../views/admin/OrgDetailPage'
import OrgListPage from '../../views/admin/OrgListPage'
import RaceManagementPage from '../../views/admin/RaceManagementPage'
import TeamListPage from '../../views/admin/TeamListPage'
import IdentityAccessCenterPage from '../../views/admin/IdentityAccessCenterPage'
import AdminReimbursementPage from '../../views/admin/finance/AdminReimbursementPage'
import ColorSchemePage from '../../views/admin/branding/ColorSchemePage'

const InterviewList = lazy(() => import('../../views/interview/InterviewList'))
const InterviewCompare = lazy(() => import('../../views/interview/InterviewCompare'))
const InterviewForm = lazy(() => import('../../views/interview/InterviewForm'))
const DesignRequestWorkspace = lazy(() => import('../../views/design-requests/DesignRequestWorkspace'))
const CredentialCenterPage = lazy(() => import('../../views/admin/credential/CredentialCenterPage'))
const CredentialSelectRacePage = lazy(() => import('../../views/admin/credential/CredentialSelectRacePage'))
const CredentialZonePage = lazy(() => import('../../views/admin/credential/CredentialZonePage'))
const CredentialRolePage = lazy(() => import('../../views/admin/credential/CredentialRolePage'))
const CredentialStylePage = lazy(() => import('../../views/admin/credential/CredentialStylePage'))
const CredentialApplicationPage = lazy(() => import('../../views/admin/credential/CredentialApplicationPage'))
const CredentialReviewPage = lazy(() => import('../../views/admin/credential/CredentialReviewPage'))
const CredentialIssuePage = lazy(() => import('../../views/admin/credential/CredentialIssuePage'))

function AdminRouteLoader() {
  return (
    <div className="workspace-main__route-loader">
      <div className="route-loader__content">
        <div className="route-loader__spinner" aria-hidden="true" />
        <span>载入当前工作区…</span>
      </div>
    </div>
  )
}

function AdminDeprecatedRoute({
  title = '入口已下线',
  description = '该页面不再作为管理层独立工作台。请从当前入口导航或启动台进入新的归属入口。',
} = {}) {
  return (
    <AdminSurface title="入口已下线" subtitle={description}>
      <AdminEmptyState
        title={title}
        description={description}
      />
    </AdminSurface>
  )
}

function LegacyIdentityRoute() {
  return (
    <AdminDeprecatedRoute
      title="请改用身份中心"
      description="组织与授权相关能力已经统一收敛到身份中心。请从侧边栏进入身份中心，再切换到对应治理视图。"
    />
  )
}

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
    () => getAdminNavGroups({ isSuperAdmin }),
    [isSuperAdmin],
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
          <Routes>
            <Route index element={<AdminDashboard />} />
            <Route path="orgs" element={<OrgListPage />} />
            <Route path="orgs/new" element={<OrgCreatePage />} />
            <Route path="orgs/:orgId" element={<OrgDetailPage />} />
            <Route path="identity-center" element={<IdentityAccessCenterPage />} />
            <Route path="members" element={<Navigate to={buildAdminHref('/team', currentContext)} replace />} />
            <Route path="members/new" element={<Navigate to={buildAdminHref('/team', currentContext)} replace />} />
            <Route path="team" element={<TeamListPage />} />
            <Route path="races" element={<RaceManagementPage />} />
            <Route path="design-requests" element={<Suspense fallback={<AdminRouteLoader />}><DesignRequestWorkspace surface="admin" mode="manager" /></Suspense>} />
            <Route path="import" element={<AdminDeprecatedRoute description="导入、记录处理、抽签、号码布和服装作业已从后台移出。请从启动台进入应用层继续处理赛事业务。" />} />
            <Route path="records" element={<AdminDeprecatedRoute description="记录处理已从后台移出。请从启动台进入应用层继续处理赛事业务。" />} />
            <Route path="processing" element={<AdminDeprecatedRoute description="赛事处理中心已从后台移出。请从启动台进入应用层继续处理赛事业务。" />} />
            <Route path="lottery" element={<AdminDeprecatedRoute description="抽签作业已从后台移出。请从启动台进入应用层继续处理赛事业务。" />} />
            <Route path="bib" element={<AdminDeprecatedRoute description="号码布编排作业已从后台移出。请从启动台进入应用层继续处理赛事业务。" />} />
            <Route path="clothing" element={<AdminDeprecatedRoute description="服装配置作业已从后台移出。请从启动台进入应用层继续处理赛事业务。" />} />
            <Route path="db-backups" element={<DatabaseBackupPage />} />
            <Route path="bib-tracking" element={<BibTrackingPage />} />

            <Route path="interview" element={<Suspense fallback={<AdminRouteLoader />}><InterviewForm /></Suspense>} />
            <Route path="interview/records" element={<Suspense fallback={<AdminRouteLoader />}><InterviewList /></Suspense>} />
            <Route path="interview/compare" element={<Suspense fallback={<AdminRouteLoader />}><InterviewCompare /></Suspense>} />

            <Route path="credential-center" element={<Suspense fallback={<AdminRouteLoader />}><CredentialCenterPage /></Suspense>} />
            <Route path="credential" element={<Navigate to={buildAdminHref('/credential-center', currentContext)} replace />} />
            <Route path="credential/select-race" element={<Suspense fallback={<AdminRouteLoader />}><CredentialSelectRacePage /></Suspense>} />
            <Route path="credential/zones" element={<Navigate to={buildAdminHref('/credential/access-areas', currentContext)} replace />} />
            <Route path="credential/roles" element={<Navigate to={buildAdminHref('/credential/categories', currentContext)} replace />} />
            <Route path="credential/access-areas" element={<Suspense fallback={<AdminRouteLoader />}><CredentialZonePage /></Suspense>} />
            <Route path="credential/categories" element={<Suspense fallback={<AdminRouteLoader />}><CredentialRolePage /></Suspense>} />
            <Route path="credential/styles" element={<Suspense fallback={<AdminRouteLoader />}><CredentialStylePage /></Suspense>} />
            <Route path="credential/applications" element={<Navigate to={buildAdminHref('/credential/requests', currentContext)} replace />} />
            <Route path="credential/requests" element={<Suspense fallback={<AdminRouteLoader />}><CredentialApplicationPage /></Suspense>} />
            <Route path="credential/review" element={<Suspense fallback={<AdminRouteLoader />}><CredentialReviewPage /></Suspense>} />
            <Route path="credential/issue" element={<Suspense fallback={<AdminRouteLoader />}><CredentialIssuePage /></Suspense>} />

            <Route path="app-manager" element={<Navigate to={buildAdminHref('', currentContext)} replace />} />
            <Route path="reimbursements" element={<AdminReimbursementPage />} />
            <Route path="branding/colors" element={<ColorSchemePage />} />

            <Route path="inventory" element={<AdminDeprecatedRoute description="后台仓储治理页还未迁入新入口；一线入库、出库、绑定和盘点请从启动台进入执行层。" />} />
            <Route path="inventory/inbound" element={<AdminDeprecatedRoute description="入库动作已归入执行层。请从启动台进入执行层仓库入口。" />} />
            <Route path="inventory/outbound" element={<AdminDeprecatedRoute description="出库动作已归入执行层。请从启动台进入执行层仓库入口。" />} />
            <Route path="inventory/space" element={<AdminDeprecatedRoute description="仓库空间治理页还未迁入新入口；当前不再从后台跳转到应用层。" />} />
            <Route path="inventory/control" element={<AdminDeprecatedRoute description="盘点与异常处理已归入执行层。请从启动台进入执行层仓库入口。" />} />
            <Route path="inventory/analytics" element={<AdminDeprecatedRoute description="仓储复盘报表还未迁入新入口；当前不再从后台跳转到应用层。" />} />
            <Route path="inventory/twin/designer" element={<Navigate to={`/asset-designer${location.search}`} replace />} />
            <Route path="users" element={<LegacyIdentityRoute />} />
            <Route path="module-permissions" element={<LegacyIdentityRoute />} />
            <Route path="race-permissions" element={<LegacyIdentityRoute />} />
            <Route path="org-race-permissions" element={<LegacyIdentityRoute />} />
            <Route path="*" element={<AdminDeprecatedRoute />} />
          </Routes>
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
