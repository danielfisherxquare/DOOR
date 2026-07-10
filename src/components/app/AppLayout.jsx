import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useMatch, useNavigate } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import { getAppNavGroups, getAppRouteMeta, buildAppHref } from './appConfig'
import AppMapLayout from './AppMapLayout'
import WorkspaceContextDisplay from '../../features/workspace/WorkspaceContextDisplay'
import useSurfaceWorkspace from '../../features/workspace/useSurfaceWorkspace'
import useSidebarMotion from '../shared/useSidebarMotion'
import { showInfo } from '../../utils/toast'
import AppSurfaceRoutes, { AppRouteGuard } from '../../routes/appRoutes'
import './app-layout.css'

const StudioProjectPage = lazy(() => import('../../views/app/StudioProjectPage'))
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

  useEffect(() => {
    setMobileDrawerOpen(false)
  }, [location.pathname])

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
  const isStudioImmersiveRoute = location.pathname === '/app/3d-studio/new'
    || /^\/app\/3d-studio\/[^/]+$/.test(location.pathname)
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
      setInstallPromptState((state) => ({
        ...state,
        canPrompt: false,
        promptEvent: null,
      }))
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

  const groupTitle = currentGroup?.label || '应用层'
  const isNavItemActive = useCallback((item) => {
    return item.path === ''
      ? location.pathname === '/app'
      : location.pathname === '/app' + item.path || location.pathname.startsWith('/app' + item.path + '/')
  }, [location.pathname])
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
        <AppRouteGuard
          routeKey="map"
          selectedRaceId={selectedRaceId}
          currentRequestPath={`${location.pathname}${location.search}`}
        >
          <AppMapLayout context={currentContext} />
        </AppRouteGuard>
      ) : isStudioImmersiveRoute ? (
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
                title={installPromptState.isIos ? '在 Safari 分享菜单中选择“添加到主屏幕”' : '添加到桌面'}
                aria-label={installPromptState.isIos ? '在 Safari 分享菜单中选择添加到主屏幕' : installCopy}
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
            {routeMeta.summary ? (
              <p className="workspace-main__summary">{routeMeta.summary}</p>
            ) : null}
          </div>
        </section>

        {/* ── 内容区 ── */}
        <section className="workspace-main__content">
          <AppSurfaceRoutes
            selectedRaceId={selectedRaceId}
            currentRequestPath={`${location.pathname}${location.search}`}
            currentContext={currentContext}
            locationSearch={location.search}
          />
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
                  <small>{installPromptState.isIos ? 'Safari 分享菜单 -> 添加到主屏幕' : `${installHint} · 保存成主屏幕 H5 app`}</small>
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
              <span>{user?.username || '用户'} · {roleName}</span>
              <button type="button" onClick={handleLogout}>退出登录</button>
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
              className={'workspace-mobile-dock__item ' + (active ? 'workspace-mobile-dock__item--active' : '')}
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
