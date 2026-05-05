import { Link, useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'

/**
 * 公开页导航栏 — 仅用于登录/找回密码等公开页面
 * 应用层已有侧边栏，不再依赖此组件
 */
function Navbar() {
  const { user, isAuthenticated, logout, getDefaultLandingPath } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <nav className="surface-public navbar">
      <Link to={isAuthenticated ? getDefaultLandingPath() : '/'} className="navbar__brand">
        <div className="navbar__logo">TP</div>
        <span className="navbar__brand-text">Powered by Xquare</span>
      </Link>

      <div className="navbar__menu hidden-mobile">
        {isAuthenticated ? (
          <>
            <Link to={getDefaultLandingPath()} className="btn btn--ghost">进入工作区</Link>
            <div className="navbar__user">
              <div className="navbar__avatar">
                {user?.username?.charAt(0).toUpperCase() || 'U'}
              </div>
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>
                {user?.username || '用户'}
              </span>
            </div>
            <button className="btn btn--ghost" onClick={handleLogout} title="退出登录">
              退出
            </button>
          </>
        ) : (
          <Link to="/login" className="btn btn--ghost">登录</Link>
        )}
      </div>
    </nav>
  )
}

export default Navbar
