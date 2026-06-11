import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import profileApi from '../../api/profile'
import {
  buildAdminHref,
  getAdminNavGroups,
  getAdminRouteMeta,
  getPriorityShortcuts,
} from './adminConfig'
import { AdminEmptyState, AdminSurface } from './AdminWorkbench'
import { buildAppHref } from '../app/appConfig'
import { buildOpsHref } from '../ops/opsConfig'
import ContextSquareEntry from '../shared/ContextSquareEntry'
import useSidebarMotion from '../shared/useSidebarMotion'
import { resolveSurfaceOrgId, resolveSurfaceRaceId } from '../../utils/surfaceContext'
import { showInfo } from '../../utils/toast'
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

function AdminDeprecatedRoute() {
  return (
    <AdminSurface title="入口已下线" subtitle="该页面已经收敛进身份中心，不再保留独立工作台。">
      <AdminEmptyState
        title="请改用身份中心"
        description="组织与授权相关能力已经统一收敛到身份中心。请从侧边栏进入身份中心，再切换到对应治理视图。"
      />
    </AdminSurface>
  )
}

export default function AdminLayout() {
  const { user, logout, updatePreferences } = useAuthStore()
  const canAccessOps = useAuthStore((state) => state.canAccessOps)
  const isSuperAdmin = user?.role === 'super_admin'

  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { sidebarCollapsed, sidebarMotionClass, toggleSidebar } = useSidebarMotion()
  const [contextOptions, setContextOptions] = useState(null)
  const [contextLoading, setContextLoading] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState(() => {
    try {
      const saved = localStorage.getItem('admin-nav-collapsed')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [scrollState, setScrollState] = useState({ scrolled: false, atBottom: true })
  const navRef = useRef(null)

  const requestedRaceId = searchParams.get('raceId') || ''
  const selectedOrgId = resolveSurfaceOrgId(searchParams, user)
  const selectedRaceId = resolveSurfaceRaceId(searchParams, user, selectedOrgId)

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

  const syncSearchParams = useCallback((nextOrgId, nextRaceId, options = {}) => {
    const nextParams = new URLSearchParams(searchParams)
    if (nextOrgId) nextParams.set('orgId', String(nextOrgId))
    else nextParams.delete('orgId')
    if (nextRaceId) nextParams.set('raceId', String(nextRaceId))
    else nextParams.delete('raceId')
    setSearchParams(nextParams, { replace: Boolean(options.replace) })
  }, [searchParams, setSearchParams])

  useEffect(() => {
    let active = true
    setContextLoading(true)

    profileApi.getContextOptions({
      orgId: selectedOrgId || undefined,
      raceId: selectedRaceId || undefined,
    })
      .then((res) => {
        if (!active || !res?.success) return
        const payload = res.data || {}
        setContextOptions(payload)

        const resolvedOrgId = payload?.current?.orgId ? String(payload.current.orgId) : ''
        const resolvedRaceId = payload?.current?.raceId ? String(payload.current.raceId) : ''
        const orgChanged = resolvedOrgId !== selectedOrgId
        const raceChanged = resolvedRaceId !== selectedRaceId

        if (orgChanged || raceChanged) {
          syncSearchParams(resolvedOrgId, resolvedRaceId, { replace: true })
          if (requestedRaceId && raceChanged && !orgChanged) {
            showInfo(resolvedRaceId
              ? '当前赛事已失效，已自动回退到可用赛事。'
              : '当前赛事已失效，已自动清空赛事上下文。')
          }
        }
      })
      .catch(() => { })
      .finally(() => {
        if (active) setContextLoading(false)
      })

    return () => {
      active = false
    }
  }, [requestedRaceId, selectedOrgId, selectedRaceId, syncSearchParams])

  // 保存偏好
  useEffect(() => {
    if (!user) return
    const currentPrefs = user?.preferences || {}
    const normalizedOrgId = selectedOrgId || null
    const normalizedRaceId = selectedRaceId ? Number(selectedRaceId) : null

    if (currentPrefs.lastOrgId === normalizedOrgId && currentPrefs.lastRaceId === normalizedRaceId) {
      return
    }

    const timer = setTimeout(() => {
      updatePreferences({
        lastOrgId: normalizedOrgId,
        lastRaceId: normalizedRaceId,
      })
    }, 500)

    return () => clearTimeout(timer)
  }, [selectedOrgId, selectedRaceId, updatePreferences, user])

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

  const shortcuts = useMemo(
    () => getPriorityShortcuts({ selectedOrgId, selectedRaceId }),
    [selectedOrgId, selectedRaceId],
  )

  const handleOrgChange = useCallback((nextOrgId) => {
    if (
      location.pathname.startsWith('/admin/identity-center') &&
      window.__ARCSPRO_IDENTITY_CENTER_DIRTY__ &&
      !window.confirm('身份中心存在未保存的矩阵改动。切换机构会丢弃这些改动，是否继续？')
    ) {
      return
    }
    syncSearchParams(nextOrgId, '')
  }, [location.pathname, syncSearchParams])

  const handleRaceChange = useCallback((nextRaceId) => {
    syncSearchParams(selectedOrgId, nextRaceId)
  }, [selectedOrgId, syncSearchParams])

  const handleLogout = useCallback(async () => {
    await logout()
    navigate('/login')
  }, [logout, navigate])

  const needsRaceNotice = routeMeta.needsRace && !selectedRaceId
  const groupTitle = currentGroup?.label || '后台'
  const groupCaption = currentGroup?.caption || '当前工作区'
  const currentContext = { selectedOrgId, selectedRaceId }

  const roleName = useMemo(() => {
    if (!user) return '管理员'
    if (user.role === 'super_admin') return '平台管理员'
    if (user.role === 'org_admin') return '机构管理员'
    if (user.role === 'race_admin') return '赛事管理员'
    if (user.role === 'user') return '普通用户'
    return '管理员'
  }, [user])

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
                    const active = location.pathname === `/admin${item.path}` || location.pathname.startsWith(`/admin${item.path}/`)

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

        {/* ── 跨层入口 ── */}
        <div className="workspace-sidebar__switch-stack">
          <Link to={buildAppHref('', { orgId: selectedOrgId, raceId: selectedRaceId })} className="workspace-sidebar__switch-link" title="返回应用层">
            <span className="workspace-sidebar__switch-icon">APP</span>
            <span>返回应用层</span>
          </Link>

          {canAccessOps() && (
            <Link to={buildOpsHref('', { orgId: selectedOrgId, raceId: selectedRaceId })} className="workspace-sidebar__switch-link" title="进入执行端">
              <span className="workspace-sidebar__switch-icon">OPS</span>
              <span>进入执行端</span>
            </Link>
          )}
        </div>

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
            <ContextSquareEntry
              roleName={roleName}
              contextOptions={contextOptions}
              selectedOrgId={selectedOrgId}
              selectedRaceId={selectedRaceId}
              onOrgChange={handleOrgChange}
              onRaceChange={handleRaceChange}
              shortcuts={shortcuts}
              loading={contextLoading}
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
            <Link to={buildAppHref('/credential/select-race', { orgId: selectedOrgId, raceId: selectedRaceId })} style={{ marginInline: 6 }}>
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
            <Route path="import" element={<Navigate to={buildAppHref('/events/import', { orgId: selectedOrgId, raceId: selectedRaceId })} replace />} />
            <Route path="records" element={<Navigate to={buildAppHref('/events/processing', { orgId: selectedOrgId, raceId: selectedRaceId })} replace />} />
            <Route path="processing" element={<Navigate to={buildAppHref('/events/processing', { orgId: selectedOrgId, raceId: selectedRaceId })} replace />} />
            <Route path="lottery" element={<Navigate to={buildAppHref('/events/lottery', { orgId: selectedOrgId, raceId: selectedRaceId })} replace />} />
            <Route path="bib" element={<Navigate to={buildAppHref('/events/bib', { orgId: selectedOrgId, raceId: selectedRaceId })} replace />} />
            <Route path="clothing" element={<Navigate to={buildAppHref('/events/clothing', { orgId: selectedOrgId, raceId: selectedRaceId })} replace />} />
            <Route path="db-backups" element={<DatabaseBackupPage />} />
            <Route path="bib-tracking" element={<BibTrackingPage />} />

            <Route path="interview" element={<Suspense fallback={<AdminRouteLoader />}><InterviewForm /></Suspense>} />
            <Route path="interview/records" element={<Suspense fallback={<AdminRouteLoader />}><InterviewList /></Suspense>} />
            <Route path="interview/compare" element={<Suspense fallback={<AdminRouteLoader />}><InterviewCompare /></Suspense>} />

            <Route path="credential-center" element={<Navigate to={buildAppHref('/credential-center', { orgId: selectedOrgId, raceId: selectedRaceId })} replace />} />
            <Route path="credential" element={<Navigate to={buildAppHref('/credential-center', { orgId: selectedOrgId, raceId: selectedRaceId })} replace />} />
            <Route path="credential/select-race" element={<Navigate to={buildAppHref('/credential/select-race', { orgId: selectedOrgId, raceId: selectedRaceId })} replace />} />
            <Route path="credential/zones" element={<Navigate to={buildAppHref('/credential/access-areas', { orgId: selectedOrgId, raceId: selectedRaceId })} replace />} />
            <Route path="credential/roles" element={<Navigate to={buildAppHref('/credential/categories', { orgId: selectedOrgId, raceId: selectedRaceId })} replace />} />
            <Route path="credential/access-areas" element={<Navigate to={buildAppHref('/credential/access-areas', { orgId: selectedOrgId, raceId: selectedRaceId })} replace />} />
            <Route path="credential/categories" element={<Navigate to={buildAppHref('/credential/categories', { orgId: selectedOrgId, raceId: selectedRaceId })} replace />} />
            <Route path="credential/styles" element={<Navigate to={buildAppHref('/credential/styles', { orgId: selectedOrgId, raceId: selectedRaceId })} replace />} />
            <Route path="credential/applications" element={<Navigate to={buildAppHref('/credential/requests', { orgId: selectedOrgId, raceId: selectedRaceId })} replace />} />
            <Route path="credential/requests" element={<Navigate to={buildAppHref('/credential/requests', { orgId: selectedOrgId, raceId: selectedRaceId })} replace />} />
            <Route path="credential/review" element={<Navigate to={buildAppHref('/credential/review', { orgId: selectedOrgId, raceId: selectedRaceId })} replace />} />
            <Route path="credential/issue" element={<Navigate to={buildAppHref('/credential/issue', { orgId: selectedOrgId, raceId: selectedRaceId })} replace />} />

            <Route path="app-manager" element={<Navigate to={buildAdminHref('', currentContext)} replace />} />
            <Route path="reimbursements" element={<AdminReimbursementPage />} />
            <Route path="branding/colors" element={<ColorSchemePage />} />

            <Route path="inventory" element={<Navigate to={buildAppHref('/inventory', { orgId: selectedOrgId, raceId: selectedRaceId })} replace />} />
            <Route path="inventory/inbound" element={<Navigate to={buildAppHref('/inventory/inbound', { orgId: selectedOrgId, raceId: selectedRaceId })} replace />} />
            <Route path="inventory/outbound" element={<Navigate to={buildAppHref('/inventory/outbound', { orgId: selectedOrgId, raceId: selectedRaceId })} replace />} />
            <Route path="inventory/space" element={<Navigate to={buildAppHref('/inventory/space', { orgId: selectedOrgId, raceId: selectedRaceId })} replace />} />
            <Route path="inventory/control" element={<Navigate to={buildAppHref('/inventory/control', { orgId: selectedOrgId, raceId: selectedRaceId })} replace />} />
            <Route path="inventory/analytics" element={<Navigate to={buildAppHref('/inventory/analytics', { orgId: selectedOrgId, raceId: selectedRaceId })} replace />} />
            <Route path="inventory/twin/designer" element={<Navigate to={`/asset-designer${location.search}`} replace />} />
            <Route path="users" element={<AdminDeprecatedRoute />} />
            <Route path="module-permissions" element={<AdminDeprecatedRoute />} />
            <Route path="race-permissions" element={<AdminDeprecatedRoute />} />
            <Route path="org-race-permissions" element={<AdminDeprecatedRoute />} />
            <Route path="*" element={<AdminDeprecatedRoute />} />
          </Routes>
        </section>
      </main>
    </div>
  )
}
