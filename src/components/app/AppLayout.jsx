import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useMatch, useNavigate, useSearchParams } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import profileApi from '../../api/profile'
import { getAppNavGroups, getAppRouteMeta, buildAppHref } from './appConfig'
import { buildAdminHref } from '../admin/adminConfig'
import { buildOpsHref } from '../ops/opsConfig'
import AppMapLayout from './AppMapLayout'
import CapabilityProtectedRoute from '../CapabilityProtectedRoute'
import ModuleProtectedRoute from '../ModuleProtectedRoute'
import ContextSquareEntry from '../shared/ContextSquareEntry'
import useSidebarMotion from '../shared/useSidebarMotion'
import { resolveSurfaceOrgId, resolveSurfaceRaceId } from '../../utils/surfaceContext'
import { showInfo } from '../../utils/toast'
import './app-layout.css'

const Home = lazy(() => import('../../views/Home'))
const ReimbursementTool = lazy(() => import('../../views/reimbursement/ReimbursementTool'))
const ChangePassword = lazy(() => import('../../views/ChangePassword'))
const StudioProjectsPage = lazy(() => import('../../views/app/StudioProjectsPage'))
const StudioProjectPage = lazy(() => import('../../views/app/StudioProjectPage'))
const ProfilePage = lazy(() => import('../../views/profile/ProfilePage'))
const ImportPage = lazy(() => import('../../views/app/events/import/ImportPage'))
const ProcessingCenterPage = lazy(() => import('../../views/app/events/processing/ProcessingCenterPage'))
const LotteryPage = lazy(() => import('../../views/app/events/lottery/LotteryPage'))
const BibPage = lazy(() => import('../../views/app/events/bib/BibPage'))
const ClothingPage = lazy(() => import('../../views/app/events/clothing/ClothingPage'))
const WmsDashboard = lazy(() => import('../../views/inventory/WmsDashboard'))
const InboundCenter = lazy(() => import('../../views/inventory/InboundCenter'))
const OutboundCenter = lazy(() => import('../../views/inventory/OutboundCenter'))
const SpaceCenter = lazy(() => import('../../views/inventory/SpaceCenter'))
const ControlCenter = lazy(() => import('../../views/inventory/ControlCenter'))
const Reports = lazy(() => import('../../views/inventory/Reports'))
const CredentialSelectRacePage = lazy(() => import('../../views/admin/credential/CredentialSelectRacePage'))
const CredentialCenterPage = lazy(() => import('../../views/admin/credential/CredentialCenterPage'))
const CredentialZonePage = lazy(() => import('../../views/admin/credential/CredentialZonePage'))
const CredentialRolePage = lazy(() => import('../../views/admin/credential/CredentialRolePage'))
const CredentialStylePage = lazy(() => import('../../views/admin/credential/CredentialStylePage'))
const CredentialApplicationPage = lazy(() => import('../../views/admin/credential/CredentialApplicationPage'))
const CredentialReviewPage = lazy(() => import('../../views/admin/credential/CredentialReviewPage'))
const CredentialIssuePage = lazy(() => import('../../views/admin/credential/CredentialIssuePage'))
const MechanicalClock = lazy(() => import('../tools/MechanicalClock'))
const MechanicalClock3D = lazy(() => import('../tools/MechanicalClock3D'))
const InterviewList = lazy(() => import('../../views/interview/InterviewList'))
const InterviewCompare = lazy(() => import('../../views/interview/InterviewCompare'))
const InterviewForm = lazy(() => import('../../views/interview/InterviewForm'))
const ProjectListPage = lazy(() => import('../../views/app/projects/ProjectListPage'))
const ProjectDetailPage = lazy(() => import('../../views/app/projects/ProjectDetailPage'))
const AssessmentCampaignListPage = lazy(() => import('../../views/app/assessment/AssessmentCampaignListPage'))
const AssessmentCampaignDetailPage = lazy(() => import('../../views/app/assessment/AssessmentCampaignDetailPage'))
const BibTrackingPage = lazy(() => import('../../views/app/events/bib-tracking/BibTrackingPage'))

function AppRouteLoader() {
  return (
    <div className="workspace-main__route-loader">
      <div className="route-loader__content">
        <div className="route-loader__spinner" aria-hidden="true" />
        <span>载入当前工作区…</span>
      </div>
    </div>
  )
}

export default function AppLayout() {

// === 布局类验证 (自动添加) ===
useEffect(() => {
  // 确保body有正确的布局类
  document.body.classList.add('layout--app');
  
  // 验证CSS变量是否加载
  const requiredVars = ['--designer-shell', '--designer-panel', '--designer-text'];
  const missing = requiredVars.filter(v => 
    !getComputedStyle(document.documentElement).getPropertyValue(v)
  );
  
  if (missing.length > 0) {
    console.warn('[3D Studio] 缺少CSS变量:', missing);
  }
  
  return () => {
    // 清理（如果需要）
    // document.body.classList.remove('layout--app');
  };
}, []);

  const { user, logout, updatePreferences } = useAuthStore()
  const canAccessAdmin = useAuthStore((state) => state.canAccessAdmin)
  const canAccessOps = useAuthStore((state) => state.canAccessOps)
  const hasCapability = useAuthStore((state) => state.hasCapability)
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { sidebarCollapsed, sidebarMotionClass, toggleSidebar } = useSidebarMotion()
  const [contextOptions, setContextOptions] = useState(null)
  const [contextLoading, setContextLoading] = useState(false)
  const navRef = useRef(null)
  const requestedRaceId = searchParams.get('raceId') || ''
  const selectedOrgId = resolveSurfaceOrgId(searchParams, user)
  const selectedRaceId = resolveSurfaceRaceId(searchParams, user, selectedOrgId)
  const currentContext = useMemo(
    () => ({ orgId: selectedOrgId, raceId: selectedRaceId }),
    [selectedOrgId, selectedRaceId],
  )

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

  const handleOrgChange = useCallback((nextOrgId) => {
    syncSearchParams(nextOrgId, '')
  }, [syncSearchParams])

  const handleRaceChange = useCallback((nextRaceId) => {
    syncSearchParams(selectedOrgId, nextRaceId)
  }, [selectedOrgId, syncSearchParams])

  const handleImmersiveBack = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate(buildAppHref('', currentContext))
  }, [currentContext, navigate])

  const isMapRoute = location.pathname === '/app/map' || location.pathname.startsWith('/app/map/')
  const isStudioImmersiveRoute = location.pathname === '/app/3d-studio/new'
    || /^\/app\/3d-studio\/[^/]+$/.test(location.pathname)
  const studioProjectMatch = useMatch('/app/3d-studio/:projectId')
  const immersiveToolComponent = useMemo(() => {
    if (location.pathname === '/app/tools/mechanical-clock') return MechanicalClock
    if (location.pathname === '/app/tools/mechanical-clock-3d') return MechanicalClock3D
    return null
  }, [location.pathname])

  const navGroups = useMemo(() => getAppNavGroups(hasCapability), [hasCapability])
  const routeMeta = useMemo(() => getAppRouteMeta(location.pathname), [location.pathname])

  const currentGroup = useMemo(
    () => navGroups.find((group) => group.key === routeMeta.groupKey) || navGroups[0],
    [navGroups, routeMeta.groupKey],
  )

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const roleName = useMemo(() => {
    if (!user) return '用户'
    if (user.role === 'super_admin') return '超级管理员'
    if (user.role === 'org_admin') return '机构管理员'
    if (user.role === 'race_admin') return '赛事管理员'
    if (user.role === 'user') return '普通用户'
    return '普通用户'
  }, [user])

  const groupTitle = currentGroup?.label || '应用层'

  return (
    <>
      {isMapRoute ? (
        <AppMapLayout context={currentContext} />
      ) : isStudioImmersiveRoute ? (
        <Suspense fallback={<AppRouteLoader />}>
          <CapabilityProtectedRoute scope="inventory" capability="3d_studio">
            <StudioProjectPage
              mode={location.pathname === '/app/3d-studio/new' ? 'new' : 'existing'}
              routeProjectId={studioProjectMatch?.params?.projectId || null}
            />
          </CapabilityProtectedRoute>
        </Suspense>
      ) : immersiveToolComponent ? (
        <main className="command-tool-fullscreen" aria-label="沉浸式工具视图">
          <button
            type="button"
            className="command-tool-back"
            onClick={handleImmersiveBack}
            title="返回工作台"
            aria-label="返回工作台"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
          <Suspense fallback={<AppRouteLoader />}>
            {(() => {
              const ImmersiveToolComponent = immersiveToolComponent
              return <ImmersiveToolComponent />
            })()}
          </Suspense>
        </main>
      ) : (
        <div className={`layout--app workspace-layout ${sidebarCollapsed ? 'workspace-layout--collapsed' : ''} ${sidebarMotionClass}`.trim()}>
          {/* ═══════════ 侧边栏 ═══════════ */}
          <aside className="workspace-sidebar">
        {/* ── 品牌区 ── */}
        <div className="workspace-sidebar__brand-row">
          <Link to={buildAppHref('', currentContext)} className="workspace-sidebar__brand">
            <div className="workspace-sidebar__logo-box">
              <span className="material-symbols-outlined">hub</span>
            </div>
            <div className="workspace-sidebar__brand-text">
              <span className="workspace-sidebar__eyebrow">DOOR</span>
              <span className="workspace-sidebar__title">PORTAL</span>
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
        <nav ref={navRef} className="workspace-sidebar__nav">
          {navGroups.map((group) => (
            <section key={group.key} className="workspace-nav-section">
              <div className="workspace-nav-section__header">
                <span className="workspace-nav-section__title">{group.label}</span>
              </div>

              <div className="workspace-nav-list">
                {group.items.map((item) => {
                  const href = buildAppHref(item.path, currentContext)
                  const active = item.path === ''
                    ? location.pathname === '/app'
                    : location.pathname === `/app${item.path}` || location.pathname.startsWith(`/app${item.path}/`)

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
          ))}
        </nav>

        {/* ── 跨层入口 ── */}
        {(canAccessOps() || canAccessAdmin()) && (
          <div className="workspace-sidebar__switch-stack">
            {canAccessOps() && (
              <Link to={buildOpsHref('', currentContext)} className="workspace-sidebar__switch-link" title="进入执行端">
                <span className="workspace-sidebar__switch-icon">OPS</span>
                <span>进入执行端</span>
              </Link>
            )}

            {canAccessAdmin() && (
              <Link to={buildAdminHref('', { selectedOrgId, selectedRaceId })} className="workspace-sidebar__switch-link" title="进入管理后台">
                <span className="workspace-sidebar__switch-icon">ADM</span>
                <span>进入管理后台</span>
              </Link>
            )}
          </div>
        )}

        {/* ── 底部 ── */}
        <div className="workspace-sidebar__footer">
          <div className="workspace-sidebar__user-card">
            <span className="workspace-sidebar__avatar">{user?.username?.slice(0, 2)?.toUpperCase() || 'U'}</span>
            <span className="workspace-sidebar__user-meta">
              <span className="workspace-sidebar__user-name">{user?.username || '用户'}</span>
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
              loading={contextLoading}
            />
            <div className="workspace-main__topbar-user">
              <span className="workspace-main__topbar-avatar">{user?.username?.slice(0, 2)?.toUpperCase() || 'U'}</span>
            </div>
          </div>
        </header>

        {/* ── 页面头部 ── */}
        <section className="workspace-main__page-header">
          <div className="workspace-main__page-header-inner">
            <div className="workspace-main__eyebrow-row">
              <span className="workspace-kicker">{routeMeta.sectionLabel || currentGroup?.label || '应用层'}</span>
              <span className="workspace-role-pill">{roleName}</span>
              <span className="workspace-kicker">{routeMeta.surfaceCode || 'APP'}</span>
            </div>
            <h1 className="workspace-main__title">{routeMeta.title}</h1>
          </div>
        </section>

        {/* ── 内容区 ── */}
        <section className="workspace-main__content">
          <Suspense fallback={<AppRouteLoader />}>
            <Routes>
              <Route index element={<Home />} />
              <Route path="events/import" element={<ImportPage />} />
              <Route path="events/processing" element={<ProcessingCenterPage />} />
              <Route path="events/lottery" element={<LotteryPage />} />
              <Route path="events/bib" element={<BibPage />} />
              <Route path="events/clothing" element={<ClothingPage />} />
              <Route path="credential-center" element={
                <ModuleProtectedRoute surface="app" moduleId="credentials">
                  <CredentialCenterPage />
                </ModuleProtectedRoute>
              } />
              <Route path="credential" element={<Navigate to={buildAppHref('/credential-center', currentContext)} replace />} />
              <Route path="credential/select-race" element={
                <ModuleProtectedRoute surface="app" moduleId="credentials">
                  <CredentialSelectRacePage />
                </ModuleProtectedRoute>
              } />
              <Route path="credential/zones" element={<Navigate to={buildAppHref('/credential/access-areas', currentContext)} replace />} />
              <Route path="credential/roles" element={<Navigate to={buildAppHref('/credential/categories', currentContext)} replace />} />
              <Route path="credential/access-areas" element={
                <ModuleProtectedRoute surface="app" moduleId="credentials">
                  <CredentialZonePage />
                </ModuleProtectedRoute>
              } />
              <Route path="credential/categories" element={
                <ModuleProtectedRoute surface="app" moduleId="credentials">
                  <CredentialRolePage />
                </ModuleProtectedRoute>
              } />
              <Route path="credential/styles" element={
                <ModuleProtectedRoute surface="app" moduleId="credentials">
                  <CredentialStylePage />
                </ModuleProtectedRoute>
              } />
              <Route path="credential/applications" element={<Navigate to={buildAppHref('/credential/requests', currentContext)} replace />} />
              <Route path="credential/requests" element={
                <ModuleProtectedRoute surface="app" moduleId="credentials">
                  <CredentialApplicationPage />
                </ModuleProtectedRoute>
              } />
              <Route path="credential/review" element={
                <ModuleProtectedRoute surface="app" moduleId="credentials">
                  <CredentialReviewPage />
                </ModuleProtectedRoute>
              } />
              <Route path="credential/issue" element={
                <ModuleProtectedRoute surface="app" moduleId="credentials">
                  <CredentialIssuePage />
                </ModuleProtectedRoute>
              } />
              <Route path="inventory" element={
                <ModuleProtectedRoute surface="app" moduleId="inventory">
                  <WmsDashboard />
                </ModuleProtectedRoute>
              } />
              <Route path="inventory/inbound" element={
                <ModuleProtectedRoute surface="app" moduleId="inventory">
                  <InboundCenter />
                </ModuleProtectedRoute>
              } />
              <Route path="inventory/outbound" element={
                <ModuleProtectedRoute surface="app" moduleId="inventory">
                  <OutboundCenter />
                </ModuleProtectedRoute>
              } />
              <Route path="inventory/space" element={
                <ModuleProtectedRoute surface="app" moduleId="inventory">
                  <SpaceCenter />
                </ModuleProtectedRoute>
              } />
              <Route path="inventory/control" element={
                <ModuleProtectedRoute surface="app" moduleId="inventory">
                  <ControlCenter />
                </ModuleProtectedRoute>
              } />
              <Route path="inventory/analytics" element={
                <ModuleProtectedRoute surface="app" moduleId="inventory">
                  <Reports />
                </ModuleProtectedRoute>
              } />
              <Route path="inventory/twin/designer" element={<Navigate to={`/asset-designer${location.search}`} replace />} />
              <Route path="tools/mechanical-clock" element={<MechanicalClock />} />
              <Route path="tools/mechanical-clock-3d" element={<MechanicalClock3D />} />
              <Route path="interview" element={
                <ModuleProtectedRoute surface="app" moduleId="interview">
                  <InterviewForm />
                </ModuleProtectedRoute>
              } />
              <Route path="interview/records" element={
                <ModuleProtectedRoute surface="app" moduleId="interview">
                  <InterviewList />
                </ModuleProtectedRoute>
              } />
              <Route path="interview/compare" element={
                <ModuleProtectedRoute surface="app" moduleId="interview">
                  <InterviewCompare />
                </ModuleProtectedRoute>
              } />
              <Route path="reimbursements/*" element={
                <ModuleProtectedRoute surface="app" moduleId="reimbursements">
                  <ReimbursementTool />
                </ModuleProtectedRoute>
              } />
              <Route path="downloads" element={<Navigate to={buildAppHref('', currentContext)} replace />} />
              <Route
                path="3d-studio"
                element={(
                  <CapabilityProtectedRoute scope="inventory" capability="3d_studio">
                    <StudioProjectsPage />
                  </CapabilityProtectedRoute>
                )}
              />
              <Route
                path="3d-studio/new"
                element={(
                  <CapabilityProtectedRoute scope="inventory" capability="3d_studio">
                    <StudioProjectPage mode="new" />
                  </CapabilityProtectedRoute>
                )}
              />
              <Route
                path="3d-studio/:projectId"
                element={(
                  <CapabilityProtectedRoute scope="inventory" capability="3d_studio">
                    <StudioProjectPage mode="existing" />
                  </CapabilityProtectedRoute>
                )}
              />
              <Route path="projects" element={<ProjectListPage />} />
              <Route path="projects/:id" element={<ProjectDetailPage />} />
              <Route path="assessment" element={<AssessmentCampaignListPage />} />
              <Route path="assessment/:id" element={<AssessmentCampaignDetailPage />} />
              <Route path="bib-tracking" element={<BibTrackingPage />} />
              <Route path="settings" element={<ChangePassword />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="*" element={<Navigate to={buildAppHref('', currentContext)} replace />} />
            </Routes>
          </Suspense>
        </section>
      </main>
    </div>
      )}
    </>
  )
}
