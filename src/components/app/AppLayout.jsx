import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useMatch, useNavigate } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import { getAppNavGroups, getAppRouteMeta, buildAppHref } from './appConfig'
import AppMapLayout from './AppMapLayout'
import CapabilityProtectedRoute from '../CapabilityProtectedRoute'
import ModuleProtectedRoute from '../ModuleProtectedRoute'
import WorkspaceContextDisplay from '../../features/workspace/WorkspaceContextDisplay'
import useSurfaceWorkspace from '../../features/workspace/useSurfaceWorkspace'
import useSidebarMotion from '../shared/useSidebarMotion'
import { showInfo } from '../../utils/toast'
import './app-layout.css'
import '../../styles/command-console.css'

const Home = lazy(() => import('../../views/Home'))
const ReimbursementTool = lazy(() => import('../../views/reimbursement/ReimbursementTool'))
const ChangePassword = lazy(() => import('../../views/ChangePassword'))
const StudioProjectsPage = lazy(() => import('../../views/app/StudioProjectsPage'))
const StudioProjectPage = lazy(() => import('../../views/app/StudioProjectPage'))
const SiteModePage = lazy(() => import('../../views/app/SiteModePage'))
const TerrainModelPage = lazy(() => import('../../views/app/terrain-model/TerrainModelPage'))
const ProfilePage = lazy(() => import('../../views/profile/ProfilePage'))
const ImportPage = lazy(() => import('../../views/app/events/import/ImportPage'))
const ProcessingCenterPage = lazy(
  () => import('../../views/app/events/processing/ProcessingCenterPage')
)
const RecordsPage = lazy(() => import('../../views/app/events/records/RecordsPage'))
const LotteryPage = lazy(() => import('../../views/app/events/lottery/LotteryPage'))
const BibPage = lazy(() => import('../../views/app/events/bib/BibPage'))
const ClothingPage = lazy(() => import('../../views/app/events/clothing/ClothingPage'))
const WmsDashboard = lazy(() => import('../../views/inventory/WmsDashboard'))
const InboundCenter = lazy(() => import('../../views/inventory/InboundCenter'))
const OutboundCenter = lazy(() => import('../../views/inventory/OutboundCenter'))
const SpaceCenter = lazy(() => import('../../views/inventory/SpaceCenter'))
const ControlCenter = lazy(() => import('../../views/inventory/ControlCenter'))
const Reports = lazy(() => import('../../views/inventory/Reports'))
const CredentialCenterPage = lazy(
  () => import('../../features/credential/app/CredentialCenterPage')
)
const CredentialApplicationPage = lazy(
  () => import('../../features/credential/app/CredentialApplicationPage')
)
const CredentialReviewPage = lazy(
  () => import('../../features/credential/app/CredentialReviewPage')
)
const MechanicalClock = lazy(() => import('../tools/MechanicalClock'))
const MechanicalClock3D = lazy(() => import('../tools/MechanicalClock3D'))
const InterviewList = lazy(() => import('../../views/interview/InterviewList'))
const InterviewCompare = lazy(() => import('../../views/interview/InterviewCompare'))
const InterviewForm = lazy(() => import('../../views/interview/InterviewForm'))
const ProjectListPage = lazy(() => import('../../views/app/projects/ProjectListPage'))
const ProjectDetailPage = lazy(() => import('../../views/app/projects/ProjectDetailPage'))
const AssessmentCampaignListPage = lazy(
  () => import('../../views/app/assessment/AssessmentCampaignListPage')
)
const AssessmentCampaignDetailPage = lazy(
  () => import('../../views/app/assessment/AssessmentCampaignDetailPage')
)
const BibTrackingPage = lazy(() => import('../../views/app/events/bib-tracking/BibTrackingPage'))
const RaceDashboardPage = lazy(() => import('../../views/app/race-dashboard/RaceDashboardPage'))
const DesignRequestWorkspace = lazy(
  () => import('../../views/design-requests/DesignRequestWorkspace')
)

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
  // === 布局类验证 ===
  useEffect(() => {
    document.body.classList.add('layout--app')
    return () => {
      document.body.classList.remove('layout--app')
    }
  }, [])

  const { user, logout } = useAuthStore()
  const hasCapability = useAuthStore((state) => state.hasCapability)
  const location = useLocation()
  const navigate = useNavigate()
  const { sidebarCollapsed, sidebarMotionClass, toggleSidebar } = useSidebarMotion()
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [installPromptState, setInstallPromptState] = useState({
    canPrompt: false,
    isInstalled: false,
    isIos: false,
    promptEvent: null,
  })
  const navRef = useRef(null)
  const {
    session,
    selectedOrgId,
    selectedRaceId,
    currentContext,
    switchWorkspace,
    workspaceMissing,
  } = useSurfaceWorkspace('app')

  useEffect(() => {
    setMobileDrawerOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const displayModeQuery = window.matchMedia?.('(display-mode: standalone)')
    const detectInstallState = () => {
      const isStandalone = Boolean(
        displayModeQuery?.matches ||
        window.navigator.standalone ||
        window.matchMedia?.('(display-mode: fullscreen)')?.matches
      )
      const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent || '')
      setInstallPromptState((state) => ({
        ...state,
        isInstalled: isStandalone,
        isIos,
        canPrompt: Boolean(window.__arcsproInstallPrompt && !isStandalone),
        promptEvent: window.__arcsproInstallPrompt || state.promptEvent,
      }))
    }

    const handleInstallPrompt = (event) => {
      const promptEvent = event.detail?.promptEvent || window.__arcsproInstallPrompt || null
      setInstallPromptState((state) => ({
        ...state,
        canPrompt: Boolean(promptEvent),
        promptEvent,
      }))
    }

    const handleAppInstalled = () => {
      setInstallPromptState((state) => ({
        ...state,
        canPrompt: false,
        isInstalled: true,
        promptEvent: null,
      }))
    }

    detectInstallState()
    window.addEventListener('arcspro:installprompt', handleInstallPrompt)
    window.addEventListener('arcspro:appinstalled', handleAppInstalled)
    displayModeQuery?.addEventListener?.('change', detectInstallState)

    return () => {
      window.removeEventListener('arcspro:installprompt', handleInstallPrompt)
      window.removeEventListener('arcspro:appinstalled', handleAppInstalled)
      displayModeQuery?.removeEventListener?.('change', detectInstallState)
    }
  }, [])

  const handleImmersiveBack = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate(buildAppHref('', currentContext))
  }, [currentContext, navigate])

  const isMapRoute = location.pathname === '/app/map' || location.pathname.startsWith('/app/map/')
  const isSiteModeRoute = location.pathname === '/app/3d-studio/site'
  const isStudioImmersiveRoute =
    !isSiteModeRoute &&
    (location.pathname === '/app/3d-studio/new' ||
      /^\/app\/3d-studio\/[^/]+$/.test(location.pathname))
  const studioProjectMatch = useMatch('/app/3d-studio/:projectId')
  const immersiveToolComponent = useMemo(() => {
    if (location.pathname === '/app/tools/mechanical-clock') return MechanicalClock
    if (location.pathname === '/app/tools/mechanical-clock-3d') return MechanicalClock3D
    return null
  }, [location.pathname])

  const navGroups = useMemo(
    () => getAppNavGroups({ user, hasCapability, raceId: selectedRaceId }),
    [hasCapability, selectedRaceId, user]
  )
  const routeMeta = useMemo(() => getAppRouteMeta(location.pathname), [location.pathname])

  const currentGroup = useMemo(
    () => navGroups.find((group) => group.key === routeMeta.groupKey) || navGroups[0],
    [navGroups, routeMeta.groupKey]
  )

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const handleInstallClick = useCallback(async () => {
    const promptEvent = installPromptState.promptEvent || window.__arcsproInstallPrompt

    if (promptEvent?.prompt) {
      promptEvent.prompt()
      await promptEvent.userChoice.catch(() => null)
      window.__arcsproInstallPrompt = null
      setInstallPromptState((state) => ({
        ...state,
        canPrompt: false,
        promptEvent: null,
      }))
      return
    }

    showInfo(
      installPromptState.isIos
      ? '在 Safari 中点分享按钮，然后选择“添加到主屏幕”。'
        : '在浏览器菜单中选择“添加到主屏幕”或“安装应用”。'
    )
  }, [installPromptState])

  const roleName = useMemo(() => {
    if (!user) return '用户'
    if (user.role === 'super_admin') return '超级管理员'
    if (user.role === 'org_admin') return '机构管理员'
    if (user.role === 'race_admin') return '赛事管理员'
    if (user.role === 'user') return '普通用户'
    return '普通用户'
  }, [user])

  const groupTitle = currentGroup?.label || '应用层'
  const requireAppModule = useCallback(
    (moduleId, element, options = {}) => {
    if (options.needsRace && !selectedRaceId) {
      const redirect = encodeURIComponent(`${location.pathname}${location.search}`)
      return <Navigate to={`/workspaces?redirect=${redirect}`} replace />
    }

    return (
      <ModuleProtectedRoute surface="app" moduleId={moduleId}>
        {element}
      </ModuleProtectedRoute>
    )
    },
    [location.pathname, location.search, selectedRaceId]
  )
  const isNavItemActive = useCallback(
    (item) => {
    return item.path === ''
      ? location.pathname === '/app'
        : location.pathname === '/app' + item.path ||
            location.pathname.startsWith('/app' + item.path + '/')
    },
    [location.pathname]
  )
  const flatNavItems = useMemo(
    () =>
      navGroups.flatMap((group) =>
        group.items.map((item) => ({ ...item, groupLabel: group.label }))
      ),
    [navGroups]
  )
  const mobileDockItems = useMemo(() => {
    const primaryKeys = ['dashboard', 'reimbursement', 'import', 'inventory-workbench']
    const primaryItems = primaryKeys
      .map((key) => flatNavItems.find((item) => item.key === key))
      .filter(Boolean)

    return (primaryItems.length >= 4 ? primaryItems : flatNavItems).slice(0, 4)
  }, [flatNavItems])
  const shouldShowInstallAction = !installPromptState.isInstalled
  const installCopy = installPromptState.isIos
    ? '添加到主屏幕'
    : installPromptState.canPrompt
      ? '一键安装到桌面'
      : '添加到桌面'
  const installHint = installPromptState.isIos
    ? 'Safari 分享菜单'
    : installPromptState.canPrompt
      ? '浏览器安装提示'
      : '浏览器菜单'

  if (workspaceMissing) {
    return <Navigate to={`/workspaces?redirect=${encodeURIComponent(location.pathname)}`} replace />
  }

  return (
    <>
      {isMapRoute ? (
        requireAppModule('map', <AppMapLayout context={currentContext} />)
      ) : isSiteModeRoute ? (
        requireAppModule(
          '3d-studio',
          <Suspense fallback={<AppRouteLoader />}>
            <CapabilityProtectedRoute scope="inventory" capability="3d_studio">
              <SiteModePage />
            </CapabilityProtectedRoute>
          </Suspense>
        )
      ) : isStudioImmersiveRoute ? (
        requireAppModule(
          '3d-studio',
          <Suspense fallback={<AppRouteLoader />}>
            <CapabilityProtectedRoute scope="inventory" capability="3d_studio">
              <StudioProjectPage
                mode={location.pathname === '/app/3d-studio/new' ? 'new' : 'existing'}
                routeProjectId={studioProjectMatch?.params?.projectId || null}
              />
            </CapabilityProtectedRoute>
          </Suspense>
        )
      ) : immersiveToolComponent ? (
        <main className="command-tool-fullscreen" aria-label="沉浸式工具视图">
          <button
            type="button"
            className="command-tool-back"
            onClick={handleImmersiveBack}
            title="返回工作台"
            aria-label="返回工作台"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
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
        <div
          className={`layout--app workspace-layout ${sidebarCollapsed ? 'workspace-layout--collapsed' : ''} ${sidebarMotionClass}`.trim()}
        >
          {/* ═══════════ 侧边栏 ═══════════ */}
          <aside className="workspace-sidebar">
        {/* ── 品牌区 ── */}
        <div className="workspace-sidebar__brand-row">
          <Link to={buildAppHref('', currentContext)} className="workspace-sidebar__brand">
            <div className="workspace-sidebar__logo-box">
              <span className="material-symbols-outlined">hub</span>
            </div>
            <div className="workspace-sidebar__brand-text">
              <span className="workspace-sidebar__eyebrow">中奥致远</span>
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
                  const active = isNavItemActive(item)

                  return (
                        <Link
                          key={item.key}
                          to={href}
                          className={`workspace-nav-item ${active ? 'workspace-nav-item--active' : ''}`}
                        >
                      <span className="workspace-nav-item__icon">
                            <span className="material-symbols-outlined">
                              {item.icon || 'circle'}
                            </span>
                      </span>
                      <span className="workspace-nav-item__title">{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </section>
          ))}
        </nav>

        {/* ── 底部 ── */}
        <div className="workspace-sidebar__footer">
          <div className="workspace-sidebar__user-card">
                <span className="workspace-sidebar__avatar">
                  {user?.username?.slice(0, 2)?.toUpperCase() || 'U'}
                </span>
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
            <button
              type="button"
              className="workspace-main__mobile-menu-btn"
              onClick={() => setMobileDrawerOpen(true)}
              aria-label="打开应用菜单"
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
            {shouldShowInstallAction && (
              <button
                type="button"
                className="workspace-main__install-btn"
                onClick={handleInstallClick}
                    title={
                      installPromptState.isIos
                        ? '在 Safari 分享菜单中选择“添加到主屏幕”'
                        : '添加到桌面'
                    }
                    aria-label={
                      installPromptState.isIos
                        ? '在 Safari 分享菜单中选择添加到主屏幕'
                        : installCopy
                    }
              >
                <span className="material-symbols-outlined">add_to_home_screen</span>
                <span className="workspace-main__install-text">
                  <span className="workspace-main__install-copy">{installCopy}</span>
                  <span className="workspace-main__install-hint">{installHint}</span>
                </span>
              </button>
            )}
            <button type="button" className="workspace-main__topbar-btn" title="通知">
              <span className="material-symbols-outlined">notifications</span>
            </button>
            <WorkspaceContextDisplay
              roleName={roleName}
              session={session}
              selectedOrgId={selectedOrgId}
              selectedRaceId={selectedRaceId}
              onSwitch={switchWorkspace}
            />
            <div className="workspace-main__topbar-user">
                  <span className="workspace-main__topbar-avatar">
                    {user?.username?.slice(0, 2)?.toUpperCase() || 'U'}
                  </span>
            </div>
          </div>
        </header>

        {/* ── 页面头部 ── */}
        <section className="workspace-main__page-header">
          <div className="workspace-main__page-header-inner">
            <div className="workspace-main__eyebrow-row">
                  <span className="workspace-kicker">
                    {routeMeta.sectionLabel || currentGroup?.label || '应用层'}
                  </span>
              <span className="workspace-role-pill">{roleName}</span>
              <span className="workspace-kicker">{routeMeta.surfaceCode || 'APP'}</span>
            </div>
            <h1 className="workspace-main__title">{routeMeta.title}</h1>
            {routeMeta.summary ? (
              <p className="workspace-main__summary">{routeMeta.summary}</p>
            ) : null}
          </div>
        </section>

        {/* ── 内容区 ── */}
        <section className="workspace-main__content">
          <Suspense fallback={<AppRouteLoader />}>
            <Routes>
              <Route index element={<Home />} />
                  <Route
                    path="events/import"
                    element={requireAppModule('events', <ImportPage />, { needsRace: true })}
                  />
                  <Route
                    path="events/processing"
                    element={requireAppModule('events', <ProcessingCenterPage />, {
                      needsRace: true,
                    })}
                  />
                  <Route
                    path="events/records"
                    element={requireAppModule('events', <RecordsPage />, { needsRace: true })}
                  />
                  <Route
                    path="events/lottery"
                    element={requireAppModule('events', <LotteryPage />, { needsRace: true })}
                  />
                  <Route
                    path="events/bib"
                    element={requireAppModule('events', <BibPage />, { needsRace: true })}
                  />
                  <Route
                    path="events/clothing"
                    element={requireAppModule('events', <ClothingPage />, { needsRace: true })}
                  />
                  <Route
                    path="design-requests"
                    element={
                <ModuleProtectedRoute surface="app" moduleId="design-requests">
                  <DesignRequestWorkspace surface="app" mode="designer" />
                </ModuleProtectedRoute>
                    }
                  />
                  <Route
                    path="credential-center"
                    element={
                <ModuleProtectedRoute surface="app" moduleId="credentials">
                  <CredentialCenterPage />
                </ModuleProtectedRoute>
                    }
                  />
                  <Route
                    path="credential"
                    element={
                      <Navigate to={buildAppHref('/credential-center', currentContext)} replace />
                    }
                  />
                  <Route
                    path="credential/select-race"
                    element={
                      <Navigate to={buildAppHref('/credential-center', currentContext)} replace />
                    }
                  />
                  <Route
                    path="credential/zones"
                    element={
                      <Navigate to={buildAppHref('/credential-center', currentContext)} replace />
                    }
                  />
                  <Route
                    path="credential/roles"
                    element={
                      <Navigate to={buildAppHref('/credential-center', currentContext)} replace />
                    }
                  />
                  <Route
                    path="credential/access-areas"
                    element={
                      <Navigate to={buildAppHref('/credential-center', currentContext)} replace />
                    }
                  />
                  <Route
                    path="credential/categories"
                    element={
                      <Navigate to={buildAppHref('/credential-center', currentContext)} replace />
                    }
                  />
                  <Route
                    path="credential/styles"
                    element={
                      <Navigate to={buildAppHref('/credential-center', currentContext)} replace />
                    }
                  />
                  <Route
                    path="credential/applications"
                    element={
                      <Navigate to={buildAppHref('/credential/requests', currentContext)} replace />
                    }
                  />
                  <Route
                    path="credential/requests"
                    element={
                <ModuleProtectedRoute surface="app" moduleId="credentials">
                  <CredentialApplicationPage />
                </ModuleProtectedRoute>
                    }
                  />
                  <Route
                    path="credential/review"
                    element={
                <ModuleProtectedRoute surface="app" moduleId="credentials">
                  <CredentialReviewPage />
                </ModuleProtectedRoute>
                    }
                  />
                  <Route
                    path="credential/issue"
                    element={
                      <Navigate to={buildAppHref('/credential-center', currentContext)} replace />
                    }
                  />
                  <Route
                    path="inventory"
                    element={
                <ModuleProtectedRoute surface="app" moduleId="inventory">
                  <WmsDashboard />
                </ModuleProtectedRoute>
                    }
                  />
                  <Route
                    path="inventory/inbound"
                    element={
                <ModuleProtectedRoute surface="app" moduleId="inventory">
                  <InboundCenter />
                </ModuleProtectedRoute>
                    }
                  />
                  <Route
                    path="inventory/outbound"
                    element={
                <ModuleProtectedRoute surface="app" moduleId="inventory">
                  <OutboundCenter />
                </ModuleProtectedRoute>
                    }
                  />
                  <Route
                    path="inventory/space"
                    element={
                <ModuleProtectedRoute surface="app" moduleId="inventory">
                  <SpaceCenter />
                </ModuleProtectedRoute>
                    }
                  />
                  <Route
                    path="inventory/control"
                    element={
                <ModuleProtectedRoute surface="app" moduleId="inventory">
                  <ControlCenter />
                </ModuleProtectedRoute>
                    }
                  />
                  <Route
                    path="inventory/analytics"
                    element={
                <ModuleProtectedRoute surface="app" moduleId="inventory">
                  <Reports />
                </ModuleProtectedRoute>
                    }
                  />
                  <Route
                    path="inventory/twin/designer"
                    element={<Navigate to={`/asset-designer${location.search}`} replace />}
                  />
              <Route path="tools/mechanical-clock" element={<MechanicalClock />} />
              <Route path="tools/mechanical-clock-3d" element={<MechanicalClock3D />} />
                  <Route
                    path="interview"
                    element={
                <ModuleProtectedRoute surface="app" moduleId="interview">
                  <InterviewForm />
                </ModuleProtectedRoute>
                    }
                  />
                  <Route
                    path="interview/records"
                    element={
                <ModuleProtectedRoute surface="app" moduleId="interview">
                  <InterviewList />
                </ModuleProtectedRoute>
                    }
                  />
                  <Route
                    path="interview/compare"
                    element={
                <ModuleProtectedRoute surface="app" moduleId="interview">
                  <InterviewCompare />
                </ModuleProtectedRoute>
                    }
                  />
                  <Route
                    path="reimbursements/*"
                    element={
                <ModuleProtectedRoute surface="app" moduleId="reimbursements">
                  <ReimbursementTool />
                </ModuleProtectedRoute>
                    }
                  />
                  <Route
                    path="downloads"
                    element={<Navigate to={buildAppHref('', currentContext)} replace />}
                  />
              <Route
                path="3d-studio"
                    element={requireAppModule(
                      '3d-studio',
                    <CapabilityProtectedRoute scope="inventory" capability="3d_studio">
                      <StudioProjectsPage />
                    </CapabilityProtectedRoute>
                )}
              />
                  <Route
                    path="terrain-model"
                    element={requireAppModule('3d-studio', <TerrainModelPage />)}
                  />
              <Route
                path="3d-studio/new"
                    element={requireAppModule(
                      '3d-studio',
                    <CapabilityProtectedRoute scope="inventory" capability="3d_studio">
                      <StudioProjectPage mode="new" />
                    </CapabilityProtectedRoute>
                )}
              />
              <Route
                path="3d-studio/:projectId"
                    element={requireAppModule(
                      '3d-studio',
                    <CapabilityProtectedRoute scope="inventory" capability="3d_studio">
                      <StudioProjectPage mode="existing" />
                    </CapabilityProtectedRoute>
                )}
              />
                  <Route
                    path="projects"
                    element={requireAppModule('events', <ProjectListPage />, { needsRace: true })}
                  />
                  <Route
                    path="projects/:id"
                    element={requireAppModule('events', <ProjectDetailPage />, { needsRace: true })}
                  />
                  <Route
                    path="assessment"
                    element={requireAppModule('events', <AssessmentCampaignListPage />, {
                      needsRace: true,
                    })}
                  />
                  <Route
                    path="assessment/:id"
                    element={requireAppModule('events', <AssessmentCampaignDetailPage />, {
                      needsRace: true,
                    })}
                  />
                  <Route
                    path="bib-tracking"
                    element={requireAppModule('events', <BibTrackingPage />, { needsRace: true })}
                  />
                  <Route
                    path="race-dashboard"
                    element={requireAppModule('events', <RaceDashboardPage />, { needsRace: true })}
                  />
              <Route path="settings" element={<ChangePassword />} />
              <Route path="profile" element={<ProfilePage />} />
                  <Route
                    path="*"
                    element={<Navigate to={buildAppHref('', currentContext)} replace />}
                  />
            </Routes>
          </Suspense>
        </section>
      </main>
      {mobileDrawerOpen && (
        <div className="workspace-mobile-menu" role="presentation">
          <button
            type="button"
            className="workspace-mobile-menu__backdrop"
            onClick={() => setMobileDrawerOpen(false)}
            aria-label="关闭应用菜单"
          />
          <aside className="workspace-mobile-menu__panel" aria-label="应用菜单">
            <div className="workspace-mobile-menu__header">
              <div>
                <span className="workspace-mobile-menu__eyebrow">中奥致远 APP</span>
                <h2 className="workspace-mobile-menu__title">应用层</h2>
              </div>
              <button
                type="button"
                className="workspace-mobile-menu__close"
                onClick={() => setMobileDrawerOpen(false)}
                aria-label="关闭应用菜单"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {shouldShowInstallAction && (
              <button
                type="button"
                className="workspace-mobile-menu__install"
                onClick={handleInstallClick}
              >
                <span className="material-symbols-outlined">add_to_home_screen</span>
                <span>
                  <strong>{installCopy}</strong>
                      <small>
                        {installPromptState.isIos
                          ? 'Safari 分享菜单 -> 添加到主屏幕'
                          : `${installHint} · 保存成主屏幕 H5 app`}
                      </small>
                </span>
              </button>
            )}

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
                          to={buildAppHref(item.path, currentContext)}
                              className={
                                'workspace-mobile-menu__link ' +
                                (active ? 'workspace-mobile-menu__link--active' : '')
                              }
                        >
                              <span className="material-symbols-outlined">
                                {item.icon || 'circle'}
                              </span>
                          <span>{item.label}</span>
                        </Link>
                      )
                    })}
                  </div>
                </section>
              ))}
            </nav>

            <div className="workspace-mobile-menu__footer">
                  <span>
                    {user?.username || '用户'} · {roleName}
                  </span>
                  <button type="button" onClick={handleLogout}>
                    退出登录
                  </button>
            </div>
          </aside>
        </div>
      )}

      <nav className="workspace-mobile-dock" aria-label="应用层快捷导航">
        {mobileDockItems.map((item) => {
          const active = isNavItemActive(item)
          return (
            <Link
              key={item.key}
              to={buildAppHref(item.path, currentContext)}
                  className={
                    'workspace-mobile-dock__item ' +
                    (active ? 'workspace-mobile-dock__item--active' : '')
                  }
            >
              <span className="material-symbols-outlined">{item.icon || 'circle'}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
        <button
          type="button"
          className="workspace-mobile-dock__item workspace-mobile-dock__item--button"
          onClick={() => setMobileDrawerOpen(true)}
        >
          <span className="material-symbols-outlined">apps</span>
          <span>全部</span>
        </button>
      </nav>
    </div>
      )}
    </>
  )
}
