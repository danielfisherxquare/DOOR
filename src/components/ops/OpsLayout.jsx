import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import profileApi from '../../api/profile'
import { getOpsNavGroups, getOpsRouteMeta, buildOpsHref } from './opsConfig'
import { buildAdminHref } from '../admin/adminConfig'
import { buildAppHref } from '../app/appConfig'
import ContextSquareEntry from '../shared/ContextSquareEntry'
import useSidebarMotion from '../shared/useSidebarMotion'
import { resolveSurfaceOrgId, resolveSurfaceRaceId } from '../../utils/surfaceContext'
import { showInfo } from '../../utils/toast'
import '../app/app-layout.css'

const OpsHome = lazy(() => import('../../views/ops/OpsHome'))
const ScanHome = lazy(() => import('../../views/scan/ScanHome'))
const ScanResult = lazy(() => import('../../views/scan/ScanResult'))
const BibPickupPage = lazy(() => import('../../views/ops/BibPickupPage'))
const InboundCenter = lazy(() => import('../../views/inventory/InboundCenter'))
const OutboundCenter = lazy(() => import('../../views/inventory/OutboundCenter'))
const ControlCenter = lazy(() => import('../../views/inventory/ControlCenter'))
const CredentialIssuePage = lazy(() => import('../../views/admin/credential/CredentialIssuePage'))

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
  const { user, logout, updatePreferences } = useAuthStore()
  const canAccessAdmin = useAuthStore((state) => state.canAccessAdmin)
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

  const navGroups = useMemo(() => getOpsNavGroups(), [])
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

  const groupTitle = currentGroup?.label || '执行端'

  return (
    <div className={`layout--ops workspace-layout ${sidebarCollapsed ? 'workspace-layout--collapsed' : ''} ${sidebarMotionClass}`.trim()}>
      {/* ═══════════ 侧边栏 ═══════════ */}
      <aside className="workspace-sidebar">
        {/* ── 品牌区 ── */}
        <div className="workspace-sidebar__brand-row">
          <Link to={buildOpsHref('', currentContext)} className="workspace-sidebar__brand">
            <div className="workspace-sidebar__logo-box">
              <span className="material-symbols-outlined">precision_manufacturing</span>
            </div>
            <div className="workspace-sidebar__brand-text">
              <span className="workspace-sidebar__eyebrow">DOOR</span>
              <span className="workspace-sidebar__title">EXECUTE</span>
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
                  const href = buildOpsHref(item.path, currentContext)
                  const active = item.path === ''
                    ? location.pathname === '/ops'
                    : location.pathname === `/ops${item.path}` || location.pathname.startsWith(`/ops${item.path}/`)

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
        <div className="workspace-sidebar__switch-stack">
          <Link to={buildAppHref('', currentContext)} className="workspace-sidebar__switch-link" title="返回应用层">
            <span className="workspace-sidebar__switch-icon">APP</span>
            <span>返回应用层</span>
          </Link>

          {canAccessAdmin() && (
            <Link to={buildAdminHref('', { selectedOrgId, selectedRaceId })} className="workspace-sidebar__switch-link" title="进入管理后台">
              <span className="workspace-sidebar__switch-icon">ADM</span>
              <span>进入管理后台</span>
            </Link>
          )}
        </div>

        {/* ── 底部 ── */}
        <div className="workspace-sidebar__footer">
          <div className="workspace-sidebar__user-card">
            <span className="workspace-sidebar__avatar">{user?.username?.slice(0, 2)?.toUpperCase() || 'OP'}</span>
            <span className="workspace-sidebar__user-meta">
              <span className="workspace-sidebar__user-name">{user?.username || '执行用户'}</span>
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
              <span className="workspace-main__topbar-avatar">{user?.username?.slice(0, 2)?.toUpperCase() || 'OP'}</span>
            </div>
          </div>
        </header>

        {/* ── 页面头部 ── */}
        <section className="workspace-main__page-header">
          <div className="workspace-main__page-header-inner">
            <div className="workspace-main__eyebrow-row">
              <span className="workspace-kicker">{routeMeta.sectionLabel || currentGroup?.label || '执行端'}</span>
              <span className="workspace-role-pill">{roleName}</span>
              <span className="workspace-kicker">{routeMeta.surfaceCode || 'OPS'}</span>
            </div>
            <h1 className="workspace-main__title">{routeMeta.title}</h1>
          </div>
        </section>

        {/* ── 内容区 ── */}
        <section className="workspace-main__content">
          <Suspense fallback={<OpsRouteLoader />}>
            <Routes>
              <Route index element={<OpsHome />} />
              <Route path="scan" element={<ScanHome />} />
              <Route path="scan/result" element={<ScanResult />} />
              <Route path="bibs/pickup" element={<BibPickupPage />} />
              <Route path="credentials/issue" element={<CredentialIssuePage />} />
              <Route path="warehouse/inbound" element={<InboundCenter />} />
              <Route path="warehouse/outbound" element={<OutboundCenter />} />
              <Route path="warehouse/count" element={<ControlCenter />} />
              <Route path="*" element={<Navigate to={buildOpsHref('', currentContext)} replace />} />
            </Routes>
          </Suspense>
        </section>
      </main>
    </div>
  )
}
