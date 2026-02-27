import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import useAuthStore from '../stores/authStore'

function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  
  const { login, isAuthenticated, isLoading, error, clearError } = useAuthStore()

  // 已登录则跳转
  useEffect(() => {
    if (isAuthenticated) {
      const from = location.state?.from?.pathname || '/'
      navigate(from, { replace: true })
    }
  }, [isAuthenticated, navigate, location])

  // 清除错误
  useEffect(() => {
    return () => clearError()
  }, [clearError])

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!username.trim() || !password.trim()) {
      return
    }

    const result = await login(username, password)
    if (result.success) {
      const from = location.state?.from?.pathname || '/'
      navigate(from, { replace: true })
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card__header">
          <div className="navbar__logo" style={{ margin: '0 auto 16px', width: 56, height: 56, borderRadius: 16 }}>
            TP
          </div>
          <h1 className="login-card__title">工具门户</h1>
          <p className="login-card__subtitle">登录以访问您的工具</p>
        </div>

        <form className="login-card__form" onSubmit={handleSubmit}>
          {error && (
            <div style={{ 
              padding: '12px 16px', 
              borderRadius: 'var(--radius-md)', 
              background: 'rgba(239, 68, 68, 0.1)', 
              color: 'var(--color-danger)',
              fontSize: 'var(--font-size-sm)'
            }}>
              {error}
            </div>
          )}

          <div className="input-group">
            <label htmlFor="username" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
              用户名
            </label>
            <input
              id="username"
              type="text"
              className="input"
              placeholder="请输入用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoading}
              autoComplete="username"
            />
          </div>

          <div className="input-group">
            <label htmlFor="password" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
              密码
            </label>
            <input
              id="password"
              type="password"
              className="input"
              placeholder="请输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              autoComplete="current-password"
            />
          </div>

          <button 
            type="submit" 
            className="btn btn--primary btn--large"
            disabled={isLoading}
            style={{ marginTop: 8 }}
          >
            {isLoading ? (
              <>
                <span style={{ 
                  width: 16, 
                  height: 16, 
                  border: '2px solid rgba(255,255,255,0.3)', 
                  borderTopColor: 'white', 
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite'
                }}></span>
                登录中...
              </>
            ) : '登 录'}
          </button>
        </form>

        <p style={{ 
          marginTop: 16, 
          textAlign: 'center', 
          fontSize: 'var(--font-size-xs)', 
          color: 'var(--color-text-muted)' 
        }}>
          演示账号: admin / admin123
        </p>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

export default Login