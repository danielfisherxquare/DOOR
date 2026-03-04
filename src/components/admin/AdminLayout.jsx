import { useState } from 'react'
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'

// 管理页面
import AdminDashboard from '../../views/admin/AdminDashboard'
import OrgListPage from '../../views/admin/OrgListPage'
import OrgCreatePage from '../../views/admin/OrgCreatePage'
import UserListPage from '../../views/admin/UserListPage'
import MemberListPage from '../../views/admin/MemberListPage'
import MemberCreatePage from '../../views/admin/MemberCreatePage'
import RacePermissionsPage from '../../views/admin/RacePermissionsPage'

function AdminLayout() {
    const { user, logout } = useAuthStore()
    const canAccessAdmin = useAuthStore(s => s.canAccessAdmin)
    const isSuperAdmin = user?.role === 'super_admin'
    const location = useLocation()
    const navigate = useNavigate()
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

    const handleLogout = () => {
        logout()
        navigate('/login')
    }

    const isActive = (path) => location.pathname === `/admin${path}` || location.pathname.startsWith(`/admin${path}/`)

    // 导航菜单
    const superAdminMenus = [
        { path: '/orgs', label: '机构管理', icon: '🏢' },
        { path: '/users', label: '用户管理', icon: '👥' },
    ]
    const orgAdminMenus = [
        { path: '/members', label: '成员管理', icon: '👤' },
        { path: '/race-permissions', label: '赛事授权', icon: '🔑' },
    ]

    return (
        <div className="admin-layout">
            {/* Sidebar */}
            <aside className={`admin-sidebar ${sidebarCollapsed ? 'admin-sidebar--collapsed' : ''}`}>
                <div className="admin-sidebar__header">
                    <Link to="/admin" className="admin-sidebar__brand">
                        {!sidebarCollapsed && <span>⚙️ 管理后台</span>}
                        {sidebarCollapsed && <span>⚙️</span>}
                    </Link>
                    <button
                        className="admin-sidebar__toggle"
                        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                        title={sidebarCollapsed ? '展开' : '收起'}
                    >
                        {sidebarCollapsed ? '»' : '«'}
                    </button>
                </div>

                <nav className="admin-sidebar__nav">
                    <Link
                        to="/admin"
                        className={`admin-nav-item ${location.pathname === '/admin' ? 'admin-nav-item--active' : ''}`}
                    >
                        <span className="admin-nav-item__icon">📊</span>
                        {!sidebarCollapsed && <span>仪表板</span>}
                    </Link>

                    {/* Super Admin 菜单 */}
                    {isSuperAdmin && (
                        <>
                            <div className="admin-nav-divider">
                                {!sidebarCollapsed && '平台管理'}
                            </div>
                            {superAdminMenus.map(m => (
                                <Link
                                    key={m.path}
                                    to={`/admin${m.path}`}
                                    className={`admin-nav-item ${isActive(m.path) ? 'admin-nav-item--active' : ''}`}
                                >
                                    <span className="admin-nav-item__icon">{m.icon}</span>
                                    {!sidebarCollapsed && <span>{m.label}</span>}
                                </Link>
                            ))}
                        </>
                    )}

                    {/* Org Admin 菜单 */}
                    {canAccessAdmin() && (
                        <>
                            <div className="admin-nav-divider">
                                {!sidebarCollapsed && '机构管理'}
                            </div>
                            {orgAdminMenus.map(m => (
                                <Link
                                    key={m.path}
                                    to={`/admin${m.path}`}
                                    className={`admin-nav-item ${isActive(m.path) ? 'admin-nav-item--active' : ''}`}
                                >
                                    <span className="admin-nav-item__icon">{m.icon}</span>
                                    {!sidebarCollapsed && <span>{m.label}</span>}
                                </Link>
                            ))}
                        </>
                    )}
                </nav>

                {/* 底部用户信息 */}
                <div className="admin-sidebar__footer">
                    {!sidebarCollapsed && (
                        <div className="admin-sidebar__user">
                            <div className="admin-sidebar__avatar">
                                {user?.username?.charAt(0).toUpperCase() || 'A'}
                            </div>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 600 }}>{user?.username}</div>
                                <div style={{ fontSize: 11, opacity: 0.7 }}>
                                    {user?.role === 'super_admin' ? '超级管理员' : '机构管理员'}
                                </div>
                            </div>
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <Link to="/" className="btn btn--ghost btn--sm" title="返回门户">🏠</Link>
                        <button className="btn btn--ghost btn--sm" onClick={handleLogout} title="退出登录">
                            🚪
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="admin-main">
                <Routes>
                    <Route index element={<AdminDashboard />} />
                    {/* Super Admin */}
                    <Route path="orgs" element={<OrgListPage />} />
                    <Route path="orgs/new" element={<OrgCreatePage />} />
                    <Route path="users" element={<UserListPage />} />
                    {/* Org Admin */}
                    <Route path="members" element={<MemberListPage />} />
                    <Route path="members/new" element={<MemberCreatePage />} />
                    <Route path="race-permissions" element={<RacePermissionsPage />} />
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
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 16px; border-bottom: 1px solid var(--color-border, #e5e7eb);
                    min-height: 56px;
                }
                .admin-sidebar__brand {
                    text-decoration: none; font-weight: 700; font-size: 15px;
                    color: var(--color-text-primary, #111); white-space: nowrap;
                }
                .admin-sidebar__toggle {
                    background: none; border: none; cursor: pointer; font-size: 16px;
                    color: var(--color-text-secondary, #666); padding: 4px;
                }
                .admin-sidebar__nav {
                    flex: 1; overflow-y: auto; padding: 8px;
                }
                .admin-nav-item {
                    display: flex; align-items: center; gap: 10px;
                    padding: 10px 12px; border-radius: 8px;
                    text-decoration: none; color: var(--color-text-primary, #333);
                    font-size: 14px; transition: all 150ms ease;
                    margin-bottom: 2px;
                }
                .admin-nav-item:hover { background: var(--color-bg-secondary, #f3f4f6); }
                .admin-nav-item--active {
                    background: var(--color-accent, #6366f1) !important;
                    color: white !important; font-weight: 600;
                }
                .admin-nav-item__icon { font-size: 18px; flex-shrink: 0; }
                .admin-nav-divider {
                    font-size: 11px; font-weight: 600;
                    color: var(--color-text-muted, #999);
                    padding: 16px 12px 6px; text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                .admin-sidebar__footer {
                    padding: 12px; border-top: 1px solid var(--color-border, #e5e7eb);
                }
                .admin-sidebar__user {
                    display: flex; align-items: center; gap: 10px;
                    margin-bottom: 8px;
                }
                .admin-sidebar__avatar {
                    width: 32px; height: 32px; border-radius: 50%;
                    background: var(--color-accent, #6366f1);
                    color: white; display: flex; align-items: center;
                    justify-content: center; font-weight: 700; font-size: 14px;
                    flex-shrink: 0;
                }
                .admin-main {
                    flex: 1; padding: 24px 32px; overflow-y: auto;
                    min-height: 100vh;
                }
                .btn--sm { padding: 4px 8px; font-size: 14px; }
            `}</style>
        </div>
    )
}

export default AdminLayout
