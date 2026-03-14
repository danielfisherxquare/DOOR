import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bars3Icon, XMarkIcon, ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline'
import useAuthStore from '../stores/authStore'

function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { user, isAuthenticated, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  // 未登录时导航栏只显示登录按钮
  if (!isAuthenticated) {
    return (
      <nav className="navbar">
        <Link to="/" className="navbar__brand">
          <div className="navbar__logo">TP</div>
          <span className="navbar__brand-text">工具门户</span>
        </Link>
        
        <button
          className="navbar__hamburger md:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="切换菜单"
        >
          <Bars3Icon className="w-6 h-6" />
        </button>
        
        <div className="navbar__menu hidden-mobile">
          <Link to="/login" className="btn btn--ghost">
            登录
          </Link>
        </div>
        
        {mobileMenuOpen && (
          <div className="navbar__mobile-menu">
            <Link 
              to="/login" 
              className="btn btn--primary"
              style={{ width: '100%', marginBottom: '8px' }}
              onClick={() => setMobileMenuOpen(false)}
            >
              登录
            </Link>
          </div>
        )}
      </nav>
    )
  }

  return (
    <nav className="navbar">
      <Link to="/" className="navbar__brand">
        <div className="navbar__logo">TP</div>
        <span className="navbar__brand-text">工具门户</span>
      </Link>
      
      <button
        className="navbar__hamburger md:hidden"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        aria-label="切换菜单"
      >
        {mobileMenuOpen ? (
          <XMarkIcon className="w-6 h-6" />
        ) : (
          <Bars3Icon className="w-6 h-6" />
        )}
      </button>

      <div className="navbar__menu hidden-mobile">
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
          <ArrowRightOnRectangleIcon className="w-5 h-5" />
        </button>
      </div>
      
      {mobileMenuOpen && (
        <div className="navbar__mobile-menu">
          <div className="navbar__mobile-user">
            <div className="navbar__avatar">
              {user?.username?.charAt(0).toUpperCase() || 'U'}
            </div>
            <span>{user?.username || '用户'}</span>
          </div>
          <button
            className="btn btn--primary"
            onClick={() => {
              handleLogout()
              setMobileMenuOpen(false)
            }}
            style={{ width: '100%' }}
          >
            退出登录
          </button>
        </div>
      )}
    </nav>
  )
}

export default Navbar