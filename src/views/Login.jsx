import { useEffect, useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import useAuthStore from '../stores/authStore'

function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const { login, isAuthenticated, isLoading, error, clearError, user } = useAuthStore()

  useEffect(() => {
    if (isAuthenticated) {
      if (user?.mustChangePassword) {
        navigate('/change-password', { replace: true })
        return
      }
      const params = new URLSearchParams(location.search)
      const redirect = params.get('redirect')
      const from = location.state?.from?.pathname || (redirect && redirect.startsWith('/') ? redirect : null) || '/'
      navigate(from, { replace: true })
    }
  }, [isAuthenticated, navigate, location, user])

  useEffect(() => () => clearError(), [clearError])

  useEffect(() => {
    const savedUsername = localStorage.getItem('rememberedUsername')
    if (savedUsername) {
      setUsername(savedUsername)
      setRememberMe(true)
    }
  }, [])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!username.trim() || !password.trim()) return

    if (rememberMe) localStorage.setItem('rememberedUsername', username)
    else localStorage.removeItem('rememberedUsername')

    await login(username, password, rememberMe)
    // 导航逻辑由 useEffect 根据 isAuthenticated 状态统一处理，避免重复导航
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card__header">
          <div className="login-card__logo">TP</div>
          <h1 className="login-card__title">工具门户</h1>
          <p className="login-card__subtitle">登录以访问您的工具</p>
        </div>

        <form className="login-card__form" onSubmit={handleSubmit}>
          {error && (
            <div className="login-card__error">
              {error}
            </div>
          )}

          <div className="input-group">
            <label htmlFor="username" className="login-card__label">用户名或邮箱</label>
            <input
              id="username"
              type="text"
              className="input"
              placeholder="请输入用户名或邮箱"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              disabled={isLoading}
              autoComplete="username"
            />
          </div>

          <div className="input-group">
            <label htmlFor="password" className="login-card__label">密码</label>
            <input
              id="password"
              type="password"
              className="input"
              placeholder="请输入密码"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={isLoading}
              autoComplete="current-password"
            />
          </div>

          <div className="login-card__options">
            <label className="login-card__remember">
              <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} disabled={isLoading} />
              记住我
            </label>
            <Link to="/forgot-password" className="login-card__forgot">忘记密码？</Link>
          </div>

          <button type="submit" className="btn btn--primary btn--large login-card__submit" disabled={isLoading}>
            {isLoading ? '登录中...' : '登录'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default Login
