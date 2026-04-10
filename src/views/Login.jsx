import { useEffect, useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import useAuthStore from '../stores/authStore'

function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const { login, isAuthenticated, isLoading, error, clearError, user, getDefaultLandingPath } = useAuthStore()

  useEffect(() => {
    if (isAuthenticated) {
      if (user?.mustChangePassword) {
        navigate('/app/settings', { replace: true })
        return
      }
      const params = new URLSearchParams(location.search)
      const redirect = params.get('redirect')
      const from = location.state?.from?.pathname || (redirect && redirect.startsWith('/') ? redirect : null) || getDefaultLandingPath()
      navigate(from, { replace: true })
    }
  }, [getDefaultLandingPath, isAuthenticated, navigate, location, user])

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
  }

  return (
    <div className="login-canvas industrial-grid">
      {/* ── 背景装饰层 ── */}
      <div className="login-canvas__bg">
        <div className="login-canvas__bg-right blueprint-underlay" />
        <div className="login-canvas__bg-bottom" />
        <div className="login-canvas__watermark-top">DOOR_SYS</div>
        <div className="login-canvas__watermark-bottom">System_Active</div>
      </div>

      {/* ── 主登录模块 ── */}
      <div className="login-module">
        {/* 左侧 — 品牌身份区 */}
        <div className="login-brand">
          <div className="login-brand__accent-bar" />

          <div>
            {/* Logo 头 */}
            <div className="login-brand__header">
              <div className="login-brand__icon-box">
                <span className="material-symbols-outlined">settings_input_component</span>
              </div>
              <span className="login-brand__name">DOOR_ADMIN</span>
            </div>

            {/* 主标题区 */}
            <div>
              <p className="login-brand__eyebrow">[SYSTEM_AUTH_REQUIRED]</p>
              <h1 className="login-brand__title">
                指挥入口
                <br />
                Access_V1
              </h1>
              <p className="login-brand__description">
                DOOR 统一认证接口。登录后根据权限自动分配至管理后台、应用层或执行端工作面。
              </p>
            </div>
          </div>

          {/* 底部系统状态 */}
          <div className="login-brand__status">
            <div className="login-brand__status-row">
              <div className="login-brand__status-dot" />
              <span className="login-brand__status-text">System Status: ARMED</span>
            </div>
            <div className="login-brand__status-panel">
              <div className="login-brand__status-meta">
                <span>ENCRYPTION: AES-256</span>
                <span>FREQ: 44.1KHZ</span>
              </div>
              <div className="login-brand__progress-track">
                <div className="login-brand__progress-fill" />
              </div>
            </div>
          </div>
        </div>

        {/* 右侧 — 表单交互区 */}
        <div className="login-form-side">
          <form onSubmit={handleSubmit}>
            {/* 错误提示 */}
            {error ? <div className="login-error">{error}</div> : null}

            {/* 用户名 */}
            <div className="login-field">
              <label htmlFor="username" className="login-field__label">Corporate ID</label>
              <div className="login-field__wrapper">
                <input
                  id="username"
                  type="text"
                  className="login-field__input"
                  placeholder="EMP_ID_XXXX"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isLoading}
                  autoComplete="username"
                />
                <span className="login-field__icon material-symbols-outlined">fingerprint</span>
              </div>
            </div>

            {/* 密码 */}
            <div className="login-field">
              <label htmlFor="password" className="login-field__label">Security Access Key</label>
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
                <span className="login-field__icon material-symbols-outlined">key</span>
              </div>
            </div>

            {/* 记住我 */}
            <div className="login-remember-row">
              <input
                id="remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={isLoading}
              />
              <label htmlFor="remember-me">Remember Terminal</label>
            </div>

            {/* 提交 */}
            <div>
              <button type="submit" className="login-submit" disabled={isLoading}>
                <span className="login-submit__text">
                  {isLoading ? '认证中...' : 'Initiate Access'}
                </span>
                <span className="login-submit__icon material-symbols-outlined">arrow_forward</span>
              </button>
            </div>

            {/* 底部链接 */}
            <div className="login-footer-row">
              <Link to="/forgot-password">Reset Security Token</Link>
              <div className="login-footer-row__status">
                <span className="login-footer-row__status-dot" />
                <span>NODE_ALPHA_CONNECTED</span>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* ── 装饰：QR 面板 (桌面端) ── */}
      <div className="login-qr-panel">
        <div className="login-qr-panel__inner">
          <div className="login-qr-panel__code">
            <span className="material-symbols-outlined" style={{ fontSize: 40, color: 'rgba(255,255,255,0.3)' }}>qr_code_2</span>
          </div>
          <div>
            <p className="login-qr-panel__label">Mobile Link</p>
            <p className="login-qr-panel__desc">
              SCAN FOR<br />BIOMETRIC<br />OVERRIDE
            </p>
          </div>
        </div>
      </div>

      {/* ── 装饰：系统日志 (桌面端) ── */}
      <div className="login-syslog">
        <p>&gt; BOOT_SEQ: SUCCESS</p>
        <p>&gt; KERNEL_LOAD: OK</p>
        <p className="login-syslog__highlight">&gt; WAIT_FOR_USER_AUTH...</p>
        <p>&gt; [42.102.33.19] CONNECTED</p>
      </div>

      {/* ── 外框装饰 ── */}
      <div className="login-canvas__outer-frame" />
      <div className="scanline" style={{ opacity: 0.1 }} />
    </div>
  )
}

export default Login
