import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useMatch, useNavigate } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import { getAppNavGroups, getAppRouteMeta, buildAppHref } from './appConfig'
import AppMapLayout from './AppMapLayout'
import WorkspaceContextDisplay from '../../features/workspace/WorkspaceContextDisplay'
import useSurfaceWorkspace from '../../features/workspace/useSurfaceWorkspace'
import useSidebarMotion from '../shared/useSidebarMotion'
import SurfaceShell from '../surface/SurfaceShell'
import { showInfo } from '../../utils/toast'
import AppSurfaceRoutes, { AppRouteGuard } from '../../routes/appRoutes'
import '../../styles/command-console.css'
import './app-layout.css'

const StudioProjectPage = lazy(() => import('../../views/app/StudioProjectPage'))
const SiteModePage = lazy(() => import('../../views/app/SiteModePage'))
const MechanicalClock = lazy(() => import('../tools/MechanicalClock'))
const MechanicalClock3D = lazy(() => import('../tools/MechanicalClock3D'))

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
  const { session, selectedOrgId, selectedRaceId, currentContext, switchWorkspace, workspaceMissing } = useSurfaceWorkspace('app')

  useEffect(() => setMobileDrawerOpen(false), [location.pathname])
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const displayModeQuery = window.matchMedia?.('(display-mode: standalone)')
    const detectInstallState = () => {
      const isStandalone = Boolean(
        displayModeQuery?.matches
        || window.navigator.standalone
        || window.matchMedia?.('(display-mode: fullscreen)')?.matches,
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
      setInstallPromptState((state) => ({ ...state, canPrompt: Boolean(promptEvent), promptEvent }))
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
  const isStudioImmersiveRoute = !isSiteModeRoute && (location.pathname === '/app/3d-studio/new'
    || /^\/app\/3d-studio\/[^/]+$/.test(location.pathname)
  )
  const studioProjectMatch = useMatch('/app/3d-studio/:projectId')
  const immersiveToolComponent = useMemo(() => {
    if (location.pathname === '/app/tools/mechanical-clock') return MechanicalClock
    if (location.pathname === '/app/tools/mechanical-clock-3d') return MechanicalClock3D
    return null
  }, [location.pathname])
  const navGroups = useMemo(
    () => getAppNavGroups({ user, hasCapability, raceId: selectedRaceId }),
    [hasCapability, selectedRaceId, user],
  )
  const routeMeta = useMemo(() => getAppRouteMeta(location.pathname), [location.pathname])
  const currentGroup = useMemo(
    () => navGroups.find((group) => group.key === routeMeta.groupKey) || navGroups[0],
    [navGroups, routeMeta.groupKey],
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
      setInstallPromptState((state) => ({ ...state, canPrompt: false, promptEvent: null }))
      return
    }
    showInfo(installPromptState.isIos
      ? '在 Safari 中点分享按钮，然后选择“添加到主屏幕”。'
      : '在浏览器菜单中选择“添加到主屏幕”或“安装应用”。')
  }, [installPromptState])
  const roleName = useMemo(() => {
    if (!user) return '用户'
    if (user.role === 'super_admin') return '超级管理员'
    if (user.role === 'org_admin') return '机构管理员'
    if (user.role === 'race_admin') return '赛事管理员'
    if (user.role === 'user') return '普通用户'
    return '普通用户'
  }, [user])
  const isNavItemActive = useCallback((item) => (
    item.path === ''
      ? location.pathname === '/app'
      : location.pathname === `/app${item.path}` || location.pathname.startsWith(`/app${item.path}/`)
  ), [location.pathname])
  const getHref = useCallback((item) => buildAppHref(item.path, currentContext), [currentContext])
  const flatNavItems = useMemo(
    () => navGroups.flatMap((group) => group.items.map((item) => ({ ...item, groupLabel: group.label }))),
    [navGroups],
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
    : installPromptState.canPrompt ? '一键安装到桌面' : '添加到桌面'
  const installHint = installPromptState.isIos
    ? 'Safari 分享菜单'
    : installPromptState.canPrompt ? '浏览器安装提示' : '浏览器菜单'

  if (workspaceMissing) {
    return <Navigate to={`/workspaces?redirect=${encodeURIComponent(location.pathname)}`} replace />
  }
  if (isMapRoute) {
    return (
      <AppRouteGuard routeKey="map" selectedRaceId={selectedRaceId} currentRequestPath={`${location.pathname}${location.search}`}>
        <AppMapLayout context={currentContext} />
      </AppRouteGuard>
    )
  }
  if (isSiteModeRoute) {
    return (
      <AppRouteGuard
        routeKey="three-studio-site"
        selectedRaceId={selectedRaceId}
        currentRequestPath={`${location.pathname}${location.search}`}
      >
        <Suspense fallback={<AppRouteLoader />}>
          <SiteModePage />
        </Suspense>
      </AppRouteGuard>
    )
  }
  if (isStudioImmersiveRoute) {
    return (
      <AppRouteGuard
        routeKey={location.pathname === '/app/3d-studio/new' ? 'three-studio-new' : 'three-studio-project'}
        selectedRaceId={selectedRaceId}
        currentRequestPath={`${location.pathname}${location.search}`}
      >
        <Suspense fallback={<AppRouteLoader />}>
          <StudioProjectPage
            mode={location.pathname === '/app/3d-studio/new' ? 'new' : 'existing'}
            routeProjectId={studioProjectMatch?.params?.projectId || null}
          />
        </Suspense>
      </AppRouteGuard>
    )
  }
  if (immersiveToolComponent) {
    const ImmersiveToolComponent = immersiveToolComponent
    return (
      <main className="command-tool-fullscreen" aria-label="沉浸式工具视图">
        <button type="button" className="command-tool-back" onClick={handleImmersiveBack} title="返回工作台" aria-label="返回工作台">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <Suspense fallback={<AppRouteLoader />}><ImmersiveToolComponent /></Suspense>
      </main>
    )
  }

  const installTopbarAction = shouldShowInstallAction ? (
    <button
      type="button"
      className="workspace-main__install-btn"
      onClick={handleInstallClick}
      title={installPromptState.isIos ? '在 Safari 分享菜单中选择“添加到主屏幕”' : '添加到桌面'}
      aria-label={installPromptState.isIos ? '在 Safari 分享菜单中选择添加到主屏幕' : installCopy}
    >
      <span className="material-symbols-outlined">add_to_home_screen</span>
      <span className="workspace-main__install-text">
        <span className="workspace-main__install-copy">{installCopy}</span>
        <span className="workspace-main__install-hint">{installHint}</span>
      </span>
    </button>
  ) : null
  const installMobileAction = shouldShowInstallAction ? (
    <button type="button" className="workspace-mobile-menu__install" onClick={handleInstallClick}>
      <span className="material-symbols-outlined">add_to_home_screen</span>
      <span>
        <strong>{installCopy}</strong>
        <small>{installPromptState.isIos ? 'Safari 分享菜单 -> 添加到主屏幕' : `${installHint} · 保存成主屏幕 H5 app`}</small>
      </span>
    </button>
  ) : null
  const mobileDock = (
    <nav className="workspace-mobile-dock" aria-label="应用层快捷导航">
      {mobileDockItems.map((item) => (
        <Link
          key={item.key}
          to={getHref(item)}
          className={`workspace-mobile-dock__item ${isNavItemActive(item) ? 'workspace-mobile-dock__item--active' : ''}`}
        >
          <span className="material-symbols-outlined">{item.icon || 'circle'}</span>
          <span>{item.label}</span>
        </Link>
      ))}
      <button type="button" className="workspace-mobile-dock__item workspace-mobile-dock__item--button" onClick={() => setMobileDrawerOpen(true)}>
        <span className="material-symbols-outlined">apps</span>
        <span>全部</span>
      </button>
    </nav>
  )

  return (
    <SurfaceShell
      surface="app"
      sidebarCollapsed={sidebarCollapsed}
      sidebarMotionClass={sidebarMotionClass}
      sidebarProps={{
        homeHref: buildAppHref('', currentContext),
        brandIcon: 'hub',
        brandTitle: 'PORTAL',
        onToggleSidebar: toggleSidebar,
        navRef,
        navGroups,
        getHref,
        isActive: isNavItemActive,
        onLogout: handleLogout,
      }}
      mobileMenuOpen={mobileDrawerOpen}
      onOpenMobileMenu={() => setMobileDrawerOpen(true)}
      mobileMenuProps={{
        eyebrow: '中奥致远 APP',
        title: '应用层',
        menuLabel: '应用菜单',
        onClose: () => setMobileDrawerOpen(false),
        beforeNavigation: installMobileAction,
        navGroups,
        getHref,
        isActive: isNavItemActive,
        onLogout: handleLogout,
      }}
      topbarTitle={currentGroup?.label || '应用层'}
      topbarActions={installTopbarAction}
      contextControl={(
        <WorkspaceContextDisplay
          roleName={roleName}
          session={session}
          selectedOrgId={selectedOrgId}
          selectedRaceId={selectedRaceId}
          onSwitch={switchWorkspace}
        />
      )}
      user={user}
      userFallback="用户"
      roleName={roleName}
      pageKickers={[
        routeMeta.sectionLabel || currentGroup?.label || '应用层',
        routeMeta.surfaceCode || 'APP',
      ]}
      pageTitle={routeMeta.title}
      pageSummary={routeMeta.summary}
      footerOverlay={mobileDock}
    >
      <AppSurfaceRoutes
        selectedRaceId={selectedRaceId}
        currentRequestPath={`${location.pathname}${location.search}`}
        currentContext={currentContext}
        locationSearch={location.search}
      />
    </SurfaceShell>
  )
}
