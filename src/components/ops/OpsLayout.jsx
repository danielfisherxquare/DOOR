import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import { getOpsNavGroups, getOpsRouteMeta, buildOpsHref } from './opsConfig'
import WorkspaceContextDisplay from '../../features/workspace/WorkspaceContextDisplay'
import useSurfaceWorkspace from '../../features/workspace/useSurfaceWorkspace'
import useSidebarMotion from '../shared/useSidebarMotion'
import SurfaceShell from '../surface/SurfaceShell'
import OpsSurfaceRoutes from '../../routes/opsRoutes'
import '../app/app-layout.css'

function OpsRouteLoader() {
  return (
    <div className="workspace-main__route-loader">
      <div className="route-loader__content">
        <div className="route-loader__spinner" aria-hidden="true" />
        <span>载入执行工作台…</span>
      </div>
    </div>
  )
}

export default function OpsLayout() {
  const { user, logout } = useAuthStore()
  const location = useLocation()
  const navigate = useNavigate()
  const { sidebarCollapsed, sidebarMotionClass, toggleSidebar } = useSidebarMotion()
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const navRef = useRef(null)
  const { session, selectedOrgId, selectedRaceId, currentContext, switchWorkspace, workspaceMissing } = useSurfaceWorkspace('ops')

  useEffect(() => setMobileDrawerOpen(false), [location.pathname])

  const navGroups = useMemo(() => getOpsNavGroups({ user }), [user])
  const routeMeta = useMemo(() => getOpsRouteMeta(location.pathname), [location.pathname])
  const currentGroup = useMemo(
    () => navGroups.find((group) => group.key === routeMeta.groupKey) || navGroups[0],
    [navGroups, routeMeta.groupKey],
  )
  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }
  const roleName = useMemo(() => {
    if (!user) return '执行用户'
    if (user.role === 'super_admin') return '超级管理员'
    if (user.role === 'org_admin') return '机构管理员'
    if (user.role === 'race_admin') return '赛事管理员'
    if (user.role === 'user') return '普通用户'
    return '执行用户'
  }, [user])
  const isNavItemActive = useCallback((item) => (
    item.path === ''
      ? location.pathname === '/ops'
      : location.pathname === `/ops${item.path}` || location.pathname.startsWith(`/ops${item.path}/`)
  ), [location.pathname])
  const getHref = useCallback((item) => buildOpsHref(item.path, currentContext), [currentContext])

  if (workspaceMissing) {
    return <Navigate to={`/workspaces?redirect=${encodeURIComponent(location.pathname)}`} replace />
  }

  return (
    <SurfaceShell
      surface="ops"
      sidebarCollapsed={sidebarCollapsed}
      sidebarMotionClass={sidebarMotionClass}
      sidebarProps={{
        homeHref: buildOpsHref('', currentContext),
        brandIcon: 'precision_manufacturing',
        brandTitle: 'EXECUTE',
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
        eyebrow: '中奥致远 OPS',
        title: '执行端',
        menuLabel: '执行菜单',
        onClose: () => setMobileDrawerOpen(false),
        navGroups,
        getHref,
        isActive: isNavItemActive,
        onLogout: handleLogout,
      }}
      topbarTitle={currentGroup?.label || '执行端'}
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
      userFallback="执行用户"
      roleName={roleName}
      pageKickers={[
        routeMeta.sectionLabel || currentGroup?.label || '执行端',
        routeMeta.surfaceCode || 'OPS',
      ]}
      pageTitle={routeMeta.title}
    >
      <Suspense fallback={<OpsRouteLoader />}>
        <OpsSurfaceRoutes fallbackHref={buildOpsHref('', currentContext)} />
      </Suspense>
    </SurfaceShell>
  )
}
