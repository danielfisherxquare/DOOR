import { useEffect, useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useWorkspaceStore from '../features/workspace/workspaceStore'
import { createWorkspaceSession } from '../features/workspace/workspaceSession'
import { resolveLoginDestination } from '../features/workspace/workspaceNavigation'
import { requestRaw } from '../utils/request'

const SERVICE_STATUS_LABELS = {
  checking: '正在检查服务',
  online: '服务连接正常',
  offline: '服务暂不可用',
}

function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [serviceStatus, setServiceStatus] = useState('checking')
  const navigate = useNavigate()
  const location = useLocation()

  const { login, isAuthenticated, isLoading, error, clearError, user, getDefaultLandingPath } = useAuthStore()
  const setWorkspaceSession = useWorkspaceStore((state) => state.setWorkspaceSession)

  useEffect(() => {
    if (isAuthenticated) {
      if (user?.mustChangePassword) {
        navigate('/change-password', { replace: true })
        return
      }
      const params = new URLSearchParams(location.search)
      const redirect = params.get('redirect')
      const hasPlatformProfile = user?.role === 'super_admin' && user?.authzProfile?.scopeType === 'platform'
      if (hasPlatformProfile) {
        setWorkspaceSession(createWorkspaceSession({ scopeType: 'platform', surface: 'admin' }))
      }
      const defaultLanding = hasPlatformProfile ? getDefaultLandingPath() : '/workspaces'
      const fromLocation = location.state?.from
      const protectedRouteReturn = fromLocation?.pathname
        ? `${fromLocation.pathname}${fromLocation.search || ''}${fromLocation.hash || ''}`
        : null
      const from = resolveLoginDestination({
        protectedRouteReturn,
        redirect,
        hasPlatformProfile,
        defaultLanding,
      })
      navigate(from, { replace: true })
    }
  }, [getDefaultLandingPath, isAuthenticated, navigate, location, setWorkspaceSession, user])

  useEffect(() => () => clearError(), [clearError])

  useEffect(() => {
    const savedUsername = localStorage.getItem('rememberedUsername')
    if (savedUsername) {
      setUsername(savedUsername)
      setRememberMe(true)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    requestRaw
      .get('/health/live', {
      signal: controller.signal,
        timeout: 3500,
      })
      .then((response) => setServiceStatus(response.status >= 200 && response.status < 300 ? 'online' : 'offline'))
      .catch(() => setServiceStatus('offline'))

    return () => {
      controller.abort()
    }
  }, [])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!username.trim() || !password.trim()) return

    if (rememberMe) localStorage.setItem('rememberedUsername', username)
    else localStorage.removeItem('rememberedUsername')

    await login(username, password, rememberMe)
  }

  return (
    <div className="login-canvas">
      <div className="login-canvas__aside" aria-hidden="true" />

      <div className="login-module">
        <div className="login-brand">
          <div className="login-brand__content">
            <div className="login-brand__header">
              <div className="login-brand__icon-box">
                <span className="material-symbols-outlined">event_available</span>
              </div>
              <div>
                <span className="login-brand__name">中奥致远赛事管理系统</span>
                <span className="login-brand__subname">赛事运营管理平台</span>
              </div>
            </div>

            <div>
              <p className="login-brand__eyebrow">赛事运营中台</p>
              <h1 className="login-brand__title">统一登录</h1>
              <p className="login-brand__description">
                使用组织账号进入管理后台、应用工作台或现场执行端。权限范围会按当前组织与赛事自动生效。
              </p>
            </div>
          </div>

          <div className="login-brand__status">
            <div className="login-brand__status-row">
              <div className={`login-brand__status-dot login-brand__status-dot--${serviceStatus}`} />
              <span className="login-brand__status-text" role="status">
                {SERVICE_STATUS_LABELS[serviceStatus]}
              </span>
            </div>
            <div className="login-brand__status-panel">
              <span>管理后台</span>
              <span>应用工作台</span>
              <span>执行端</span>
            </div>
          </div>
        </div>

        <div className="login-form-side">
          <div className="login-form-side__header">
            <p>账号登录</p>
            <span>内部系统</span>
          </div>

          <form onSubmit={handleSubmit}>
            {error ? <div className="login-error">{error}</div> : null}

            <div className="login-field">
              <label htmlFor="username" className="login-field__label">账号</label>
              <div className="login-field__wrapper">
                <input
                  id="username"
                  type="text"
                  className="login-field__input"
                  placeholder="请输入用户名"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isLoading}
                  autoComplete="username"
                />
                <span className="login-field__icon material-symbols-outlined">person</span>
              </div>
            </div>

            <div className="login-field">
              <label htmlFor="password" className="login-field__label">密码</label>
              <div className="login-field__wrapper">
                <input
                  id="password"
                  type="password"
                  className="login-field__input"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  autoComplete="current-password"
                />
                <span className="login-field__icon material-symbols-outlined">lock</span>
              </div>
            </div>

            <div className="login-form-options">
              <label className="login-remember-row" htmlFor="remember-me">
                <input
                  id="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  disabled={isLoading}
                />
                <span>记住账号</span>
              </label>
              <Link to="/forgot-password">忘记密码？</Link>
            </div>

            <button type="submit" className="login-submit" disabled={isLoading}>
              <span className="login-submit__text">
                {isLoading ? '正在登录...' : '登录'}
              </span>
              <span className="login-submit__icon material-symbols-outlined">arrow_forward</span>
            </button>

            <div className="login-footer-row">
              <span>请使用已分配的组织账号登录。</span>
              <span>需要权限变更时联系管理员。</span>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default Login
