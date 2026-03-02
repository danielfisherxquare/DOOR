import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import useAuthStore from '../stores/authStore'

function Register() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [orgName, setOrgName] = useState('')
  const navigate = useNavigate()

  const { register, isAuthenticated, isLoading, error, clearError } = useAuthStore()

  // 已登录则跳转
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true })
    }
  }, [isAuthenticated, navigate])

  // 清除错误
  useEffect(() => {
    return () => clearError()
  }, [clearError])

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!username.trim() || !email.trim() || !password.trim() || !orgName.trim()) {
      return
    }

    if (password !== confirmPassword) {
      return
    }

    const result = await register(username, email, password, orgName)
    if (result.success) {
      navigate('/', { replace: true })
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card__header">
          <div className="navbar__logo" style={{ margin: '0 auto 16px', width: 56, height: 56, borderRadius: 16 }}>
            TP
          </div>
          <h1 className="login-card__title">创建账号</h1>
          <p className="login-card__subtitle">注册以访问工具门户</p>
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
            <label htmlFor="orgName" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
              组织名称
            </label>
            <input
              id="orgName"
              type="text"
              className="input"
              placeholder="您的团队或公司名称"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="input-group">
            <label htmlFor="username" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
              用户名
            </label>
            <input
              id="username"
              type="text"
              className="input"
              placeholder="3-20 个字符"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoading}
              autoComplete="username"
            />
          </div>

          <div className="input-group">
            <label htmlFor="email" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
              邮箱
            </label>
            <input
              id="email"
              type="email"
              className="input"
              placeholder="请输入邮箱地址"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              autoComplete="email"
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
              placeholder="至少 6 个字符"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              autoComplete="new-password"
            />
          </div>

          <div className="input-group">
            <label htmlFor="confirmPassword" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
              确认密码
            </label>
            <input
              id="confirmPassword"
              type="password"
              className="input"
              placeholder="再次输入密码"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isLoading}
              autoComplete="new-password"
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
                注册中...
              </>
            ) : '注 册'}
          </button>
        </form>

        <p style={{
          marginTop: 16,
          textAlign: 'center',
          fontSize: 'var(--font-size-sm)',
          color: 'var(--color-text-secondary)'
        }}>
          已有账号？{' '}
          <Link to="/login" style={{ color: 'var(--color-primary)', textDecoration: 'none' }}>
            立即登录
          </Link>
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

export default Register