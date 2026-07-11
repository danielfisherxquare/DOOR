import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import { buildAdminHref, getAdminNavGroups, getAdminRouteMeta } from './adminConfig'
import WorkspaceContextDisplay from '../../features/workspace/WorkspaceContextDisplay'
import useSurfaceWorkspace from '../../features/workspace/useSurfaceWorkspace'
import useSidebarMotion from '../shared/useSidebarMotion'
import SurfaceShell from '../surface/SurfaceShell'
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

  useEffect(() => setMobileDrawerOpen(false), [location.pathname])
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return undefined
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

  const toggleGroupCollapse = useCallback((groupKey) => {
    setCollapsedGroups((previous) => {
      const next = previous.includes(groupKey)
        ? previous.filter((key) => key !== groupKey)
        : [...previous, groupKey]
      localStorage.setItem('admin-nav-collapsed', JSON.stringify(next))
      return next
    })
  }, [])
  const navGroups = useMemo(
    () => getAdminNavGroups({ isSuperAdmin, user }),
    [isSuperAdmin, user],
  )
  const routeMeta = useMemo(() => getAdminRouteMeta(location.pathname), [location.pathname])
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
      location.pathname.startsWith('/admin/identity-center')
      && window.__ARCSPRO_IDENTITY_CENTER_DIRTY__
      && !window.confirm('身份中心存在未保存的矩阵改动。切换工作区会丢弃这些改动，是否继续？')
    ) return
    switchWorkspace()
  }, [location.pathname, switchWorkspace])
  const currentContext = useMemo(
    () => ({ selectedOrgId, selectedRaceId }),
    [selectedOrgId, selectedRaceId],
  )
  const isNavItemActive = useCallback((item) => (
    item.path === ''
      ? location.pathname === '/admin'
      : location.pathname === `/admin${item.path}` || location.pathname.startsWith(`/admin${item.path}/`)
  ), [location.pathname])
  const getHref = useCallback((item) => buildAdminHref(item.path, currentContext), [currentContext])
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

  const needsRaceNotice = routeMeta.needsRace && !selectedRaceId
  const groupTitle = currentGroup?.label || '后台'
  const groupCaption = currentGroup?.caption || '当前工作区'
  const notice = needsRaceNotice ? (
    <div className="admin-state-banner">
      当前页面依赖赛事上下文。请先在右上角“方形上下文入口”中锁定赛事，或者前往
      <Link to={buildAdminHref('/credential/select-race', currentContext)} style={{ marginInline: 6 }}>
        证件流程入口
      </Link>
      选择赛事后再继续操作。
    </div>
  ) : null

  return (
    <SurfaceShell
      surface="admin"
      sidebarCollapsed={sidebarCollapsed}
      sidebarMotionClass={sidebarMotionClass}
      sidebarProps={{
        homeHref: buildAdminHref('', currentContext),
        brandIcon: 'emergency',
        brandTitle: 'ADMIN',
        onToggleSidebar: toggleSidebar,
        navRef,
        navClassName: `${scrollState.scrolled ? 'admin-sidebar__nav--scrolled' : ''} ${scrollState.atBottom ? '' : 'admin-sidebar__nav--has-more'}`,
        navGroups,
        getHref,
        isActive: isNavItemActive,
        collapsedGroups,
        onToggleGroup: toggleGroupCollapse,
        onLogout: handleLogout,
      }}
      mobileMenuOpen={mobileDrawerOpen}
      onOpenMobileMenu={() => setMobileDrawerOpen(true)}
      mobileMenuProps={{
        eyebrow: '中奥致远 ADMIN',
        title: '后台管理',
        menuLabel: '后台菜单',
        onClose: () => setMobileDrawerOpen(false),
        navGroups,
        getHref,
        isActive: isNavItemActive,
        onLogout: handleLogout,
      }}
      topbarTitle={groupTitle}
      contextControl={(
        <WorkspaceContextDisplay
          roleName={roleName}
          session={session}
          selectedOrgId={selectedOrgId}
          selectedRaceId={selectedRaceId}
          onSwitch={handleSwitchWorkspace}
        />
      )}
      user={user}
      userFallback="管理员"
      roleName={roleName}
      pageKickers={[groupTitle, groupCaption]}
      pageTitle={routeMeta.title}
      notice={notice}
    >
      <AdminSurfaceRoutes currentContext={currentContext} locationSearch={location.search} />
    </SurfaceShell>
  )
}
