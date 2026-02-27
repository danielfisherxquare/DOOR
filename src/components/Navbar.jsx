import { Link, useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'

function Navbar() {
  const { user, isAuthenticated, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  // 未登录时导航栏不显示用户信息
  if (!isAuthenticated) {
    return (
      <nav className="navbar">
        <Link to="/" className="navbar__brand">
          <div className="navbar__logo">TP</div>
          <span>工具门户</span>
        </Link>
      </nav>
    )
  }

  return (
    <nav className="navbar">
      <Link to="/" className="navbar__brand">
        <div className="navbar__logo">TP</div>
        <span>工具门户</span>
      </Link>

      <div className="navbar__menu">
        <div className="navbar__user">
          <div className="navbar__avatar">
            {user?.username?.charAt(0).toUpperCase() || 'U'}
          </div>
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>
            {user?.username || '用户'}
          </span>
        </div>
        
        <button 
          className="btn btn--ghost" 
          onClick={handleLogout}
          title="退出登录"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
        </button>
      </div>
    </nav>
  )
}

export default Navbar