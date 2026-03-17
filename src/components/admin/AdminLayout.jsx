import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import adminApi from '../../api/adminApi'
import useAuthStore from '../../stores/authStore'

import AdminDashboard from '../../views/admin/AdminDashboard'
import AppManagerPage from '../../views/admin/AppManagerPage'
import BibTrackingPage from '../../views/admin/BibTrackingPage'
import DatabaseBackupPage from '../../views/admin/DatabaseBackupPage'
import OrgCreatePage from '../../views/admin/OrgCreatePage'
import OrgDetailPage from '../../views/admin/OrgDetailPage'
import OrgListPage from '../../views/admin/OrgListPage'
import OrgRacePermissionsPage from '../../views/admin/OrgRacePermissionsPage'
import RaceManagementPage from '../../views/admin/RaceManagementPage'
import RacePermissionsPage from '../../views/admin/RacePermissionsPage'
import TeamListPage from '../../views/admin/TeamListPage'
import UserListPage from '../../views/admin/UserListPage'
import ProjectListPage from '../../views/admin/projects/ProjectListPage'
import ProjectDetail from '../../views/admin/projects/ProjectDetail'

const AssessmentCampaignListPage = lazy(() => import('../../views/admin/assessment/AssessmentCampaignListPage'))
const AssessmentCampaignDetailPage = lazy(() => import('../../views/admin/assessment/AssessmentCampaignDetailPage'))

// Credential Pages
const CredentialSelectRacePage = lazy(() => import('../../views/admin/credential/CredentialSelectRacePage'))
const CredentialZonePage = lazy(() => import('../../views/admin/credential/CredentialZonePage'))
const CredentialRolePage = lazy(() => import('../../views/admin/credential/CredentialRolePage'))
const CredentialStylePage = lazy(() => import('../../views/admin/credential/CredentialStylePage'))
const CredentialApplicationPage = lazy(() => import('../../views/admin/credential/CredentialApplicationPage'))
const CredentialReviewPage = lazy(() => import('../../views/admin/credential/CredentialReviewPage'))
const CredentialIssuePage = lazy(() => import('../../views/admin/credential/CredentialIssuePage'))

function AdminRouteLoader() {
  return <div style={{ padding: 24 }}>加载中...</div>
}

export default function AdminLayout() {
  const { user, logout } = useAuthStore()
  const canAccessAdmin = useAuthStore((state) => state.canAccessAdmin)
  const isSuperAdmin = user?.role === 'super_admin'

  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [orgs, setOrgs] = useState([])

  const selectedOrgId = searchParams.get('orgId') || ''
  const selectedRaceId = searchParams.get('raceId') || ''

  useEffect(() => {
    if (!isSuperAdmin) return
    adminApi.getOrgs({ limit: 200 })
      .then((res) => {
        if (res.success) setOrgs(res.data.items || [])
      })
      .catch(() => { })
  }, [isSuperAdmin])

  const isActive = (routePath) => location.pathname === `/admin${routePath}` || location.pathname.startsWith(`/admin${routePath}/`)

  const handleOrgChange = (event) => {
    const nextParams = new URLSearchParams(searchParams)
    if (event.target.value) nextParams.set('orgId', event.target.value)
    else nextParams.delete('orgId')
    setSearchParams(nextParams)
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const superAdminMenus = useMemo(() => ([
    { path: '/orgs', label: '机构管理', icon: 'O' },
    { path: '/users', label: '用户管理', icon: 'U' },
    { path: '/races', label: '赛事管理', icon: 'R' },
    { path: '/assessment', label: '考评管理', icon: 'S' },
    { path: '/projects', label: '项目计划', icon: 'P' },
    { path: '/db-backups', label: '数据库备份', icon: 'B' },
    { path: '/app-manager', label: '应用管理', icon: 'A' },
  ]), [])

  const orgMenus = useMemo(() => ([
    { path: '/team', label: '团队管理', icon: 'T' },
    { path: '/bib-tracking', label: '号牌布控', icon: '#' },
    {
      path: '/credential', label: '证件管理', icon: 'C', children: [
        { path: '/access-areas', label: '通行区域' },
        { path: '/categories', label: '证件类别' },
        { path: '/requests', label: '证件申请与直建' },
        { path: '/review', label: '证件审核', superOnly: true },
        { path: '/issue', label: '领取管理' },
        { path: '/styles', label: '证件样式' },
      ]
    },
    { path: '/org-race-permissions', label: '机构赛事授权', icon: 'G', superOnly: true },
    { path: '/race-permissions', label: '赛事授权', icon: 'P' },
  ]), [])

  const linkWithContext = (routePath) => {
    const params = new URLSearchParams()
    if (selectedOrgId) params.set('orgId', selectedOrgId)
    // Only preserve raceId when navigating within credential module or other race-dependent modules
    if (selectedRaceId && (routePath.includes('/credential') || routePath.includes('/bib-tracking'))) {
      params.set('raceId', selectedRaceId)
    }
    const queryString = params.toString()
    return `/admin${routePath}${queryString ? `?${queryString}` : ''}`
  }

  return (
    <div className="admin-layout">
      <aside className={`admin-sidebar ${sidebarCollapsed ? 'admin-sidebar--collapsed' : ''}`}>
        <div className="admin-sidebar__header">
          <Link to="/admin" className="admin-sidebar__brand">
            {sidebarCollapsed ? 'DA' : 'DOOR 管理后台'}
          </Link>
          <button
            className="admin-sidebar__toggle"
            onClick={() => setSidebarCollapsed((value) => !value)}
            title={sidebarCollapsed ? '展开' : '收起'}
          >
            {sidebarCollapsed ? '>' : '<'}
          </button>
        </div>

        <nav className="admin-sidebar__nav">
          <Link to="/admin" className={`admin-nav-item ${location.pathname === '/admin' ? 'admin-nav-item--active' : ''}`}>
            <span className="admin-nav-item__icon">D</span>
            {!sidebarCollapsed && <span>仪表盘</span>}
          </Link>

          {isSuperAdmin && (
            <>
              <div className="admin-nav-divider">{!sidebarCollapsed && '平台管理'}</div>
              {superAdminMenus.map((menu) => (
                <Link key={menu.path} to={`/admin${menu.path}`} className={`admin-nav-item ${isActive(menu.path) ? 'admin-nav-item--active' : ''}`}>
                  <span className="admin-nav-item__icon">{menu.icon}</span>
                  {!sidebarCollapsed && <span>{menu.label}</span>}
                </Link>
              ))}
            </>
          )}

          {canAccessAdmin() && (
            <>
              <div className="admin-nav-divider">{!sidebarCollapsed && '机构视角'}</div>
              {isSuperAdmin && !sidebarCollapsed && (
                <div style={{ padding: '4px 12px 8px' }}>
                  <select
                    value={selectedOrgId}
                    onChange={handleOrgChange}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      borderRadius: 6,
                      border: '1px solid #d1d5db',
                      fontSize: 13,
                      background: '#f9fafb',
                    }}
                  >
                    <option value="">自动选择机构</option>
                    {orgs.map((org) => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {orgMenus.filter((item) => !item.superOnly || isSuperAdmin).map((menu) => {
                const isMenuActive = isActive(menu.path)
                // 仅当是证件管理且没有选择赛事时，不显示子菜单
                const shouldShowChildren = menu.children && (!menu.path.includes('credential') || searchParams.get('raceId'))

                return (
                  <div key={menu.path} className="admin-nav-group">
                    <Link to={linkWithContext(menu.path)} className={`admin-nav-item ${isMenuActive ? 'admin-nav-item--active' : ''}`}>
                      <span className="admin-nav-item__icon">{menu.icon}</span>
                      {!sidebarCollapsed && <span>{menu.label}</span>}
                    </Link>
                    {isMenuActive && !sidebarCollapsed && shouldShowChildren && (
                      <div className="admin-nav-children">
                        {menu.children.filter(child => !child.superOnly || isSuperAdmin).map((child) => (
                          <Link
                            key={child.path}
                            to={linkWithContext(`${menu.path}${child.path}`)}
                            className={`admin-nav-child-item ${location.pathname.includes(child.path) ? 'admin-nav-child-item--active' : ''}`}
                          >
                            <span>{child.label}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </nav>

        <div className="admin-sidebar__footer">
          {!sidebarCollapsed && (
            <div className="admin-sidebar__user">
              <div className="admin-sidebar__avatar">{user?.username?.charAt(0).toUpperCase() || 'A'}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{user?.username}</div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>{user?.role === 'super_admin' ? '超级管理员' : '机构管理员'}</div>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to="/" className="btn btn--ghost btn--sm">首页</Link>
            <button className="btn btn--ghost btn--sm" onClick={handleLogout}>退出</button>
          </div>
        </div>
      </aside>

      <main className="admin-main">
        <Routes>
          <Route index element={<AdminDashboard />} />
          <Route path="orgs" element={<OrgListPage />} />
          <Route path="orgs/new" element={<OrgCreatePage />} />
          <Route path="orgs/:orgId" element={<OrgDetailPage />} />
          <Route path="users" element={<UserListPage />} />
          <Route path="members" element={<Navigate to={`/admin/team${selectedOrgId ? `?orgId=${selectedOrgId}` : ''}`} replace />} />
          <Route path="members/new" element={<Navigate to={`/admin/team${selectedOrgId ? `?orgId=${selectedOrgId}` : ''}`} replace />} />
          <Route path="team" element={<TeamListPage />} />
          <Route path="races" element={<RaceManagementPage />} />
          <Route path="assessment" element={<Suspense fallback={<AdminRouteLoader />}><AssessmentCampaignListPage /></Suspense>} />
          <Route path="assessment/:id" element={<Suspense fallback={<AdminRouteLoader />}><AssessmentCampaignDetailPage /></Suspense>} />
          <Route path="projects" element={<ProjectListPage />} />
          <Route path="projects/:id" element={<ProjectDetail />} />
          <Route path="db-backups" element={<DatabaseBackupPage />} />
          <Route path="bib-tracking" element={<BibTrackingPage />} />

          {/* Credential Routes */}
          <Route path="credential" element={<Navigate to={`/admin/credential/select-race${selectedOrgId ? `?orgId=${selectedOrgId}` : ''}`} replace />} />
          <Route path="credential/select-race" element={<Suspense fallback={<AdminRouteLoader />}><CredentialSelectRacePage /></Suspense>} />
          <Route path="credential/zones" element={<Navigate to={`/admin/credential/access-areas${location.search || ''}`} replace />} />
          <Route path="credential/roles" element={<Navigate to={`/admin/credential/categories${location.search || ''}`} replace />} />
          <Route path="credential/access-areas" element={<Suspense fallback={<AdminRouteLoader />}><CredentialZonePage /></Suspense>} />
          <Route path="credential/categories" element={<Suspense fallback={<AdminRouteLoader />}><CredentialRolePage /></Suspense>} />
          <Route path="credential/styles" element={<Suspense fallback={<AdminRouteLoader />}><CredentialStylePage /></Suspense>} />
          <Route path="credential/applications" element={<Navigate to={`/admin/credential/requests${location.search || ''}`} replace />} />
          <Route path="credential/requests" element={<Suspense fallback={<AdminRouteLoader />}><CredentialApplicationPage /></Suspense>} />
          <Route path="credential/review" element={<Suspense fallback={<AdminRouteLoader />}><CredentialReviewPage /></Suspense>} />
          <Route path="credential/issue" element={<Suspense fallback={<AdminRouteLoader />}><CredentialIssuePage /></Suspense>} />

          <Route path="org-race-permissions" element={<OrgRacePermissionsPage />} />
          <Route path="race-permissions" element={<RacePermissionsPage />} />
          <Route path="app-manager" element={<AppManagerPage />} />
        </Routes>
      </main>

      <style>{`
        .admin-layout {
          display: flex;
          min-height: 100vh;
          background: var(--color-bg-secondary, #f5f5f5);
        }
        .admin-sidebar {
          width: 240px;
          background: var(--color-bg-primary, #ffffff);
          border-right: 1px solid var(--color-border, #e5e7eb);
          display: flex;
          flex-direction: column;
          transition: width 200ms ease;
          flex-shrink: 0;
        }
        .admin-sidebar--collapsed { width: 64px; }
        .admin-sidebar__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px;
          border-bottom: 1px solid var(--color-border, #e5e7eb);
          min-height: 56px;
        }
        .admin-sidebar__brand {
          text-decoration: none;
          font-weight: 700;
          font-size: 15px;
          color: var(--color-text-primary, #111);
          white-space: nowrap;
        }
        .admin-sidebar__toggle {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 16px;
          color: var(--color-text-secondary, #666);
          padding: 4px;
        }
        .admin-sidebar__nav {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
        }
        .admin-nav-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 8px;
          text-decoration: none;
          color: var(--color-text-primary, #333);
          font-size: 14px;
          transition: all 150ms ease;
          margin-bottom: 2px;
        }
        .admin-nav-item:hover { background: var(--color-bg-secondary, #f3f4f6); }
        .admin-nav-item--active {
          background: var(--color-primary) !important;
          color: var(--color-text-on-dark) !important;
          font-weight: 600;
        }
        .admin-nav-item__icon {
          font-size: 18px;
          flex-shrink: 0;
          width: 18px;
          text-align: center;
          font-weight: 700;
        }
        .admin-nav-divider {
          font-size: 11px;
          font-weight: 600;
          color: var(--color-text-muted, #999);
          padding: 16px 12px 6px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .admin-sidebar__footer {
          padding: 12px;
          border-top: 1px solid var(--color-border, #e5e7eb);
        }
        .admin-sidebar__user {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 8px;
        }
        .admin-sidebar__avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: var(--color-primary);
          color: var(--color-text-on-dark);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 14px;
          flex-shrink: 0;
        }
        .admin-main {
          flex: 1;
          padding: 24px 32px;
          overflow-y: auto;
          min-height: 100vh;
        }
        .admin-nav-group {
          display: flex;
          flex-direction: column;
        }
        .admin-nav-children {
          padding-left: 36px;
          margin-top: 2px;
          margin-bottom: 4px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .admin-nav-child-item {
          display: block;
          padding: 8px 12px;
          border-radius: 6px;
          text-decoration: none;
          color: var(--color-text-secondary, #666);
          font-size: 13px;
          transition: all 150ms ease;
        }
        .admin-nav-child-item:hover { background: var(--color-bg-secondary, #f3f4f6); color: var(--color-text-primary, #333); }
        .admin-nav-child-item--active {
          color: var(--color-primary) !important;
          font-weight: 600;
          background: rgba(var(--color-primary-rgb, 59, 130, 246), 0.1);
        }
        .btn--sm { padding: 4px 8px; font-size: 14px; }
        @media (max-width: 768px) {
          .admin-layout { flex-direction: column; }
          .admin-sidebar {
            width: 100%;
            height: auto;
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            z-index: 100;
            border-right: none;
            border-top: 1px solid var(--color-border, #e5e7eb);
            flex-direction: row;
            padding: 0;
          }
          .admin-sidebar--collapsed { width: 100%; }
          .admin-sidebar__header,
          .admin-sidebar__footer,
          .admin-nav-divider { display: none; }
          .admin-sidebar__nav {
            display: flex;
            flex-direction: row;
            overflow-x: auto;
            padding: 8px;
            gap: 4px;
          }
          .admin-nav-item { flex-shrink: 0; padding: 8px 12px; margin-bottom: 0; }
          .admin-nav-item span:not(.admin-nav-item__icon) { display: none; }
          .admin-main { padding: 16px; padding-bottom: 80px; min-height: auto; }
          .admin-nav-children { display: none; }
        }
      `}</style>
    </div>
  )
}
