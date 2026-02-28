import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import useAuthStore from '../stores/authStore'

function ResetPassword() {
  const { token } = useParams()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [success, setSuccess] = useState(false)
  const navigate = useNavigate()
  
  const { resetPassword, isLoading, error, clearError } = useAuthStore()

  useEffect(() => {
    return () => clearError()
  }, [clearError])

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!password.trim() || password.length < 6) {
      return
    }

    if (password !== confirmPassword) {
      return
    }

    const result = await resetPassword(token, password)
    if (result.success) {
      setSuccess(true)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card__header">
          <div className="navbar__logo" style={{ margin: '0 auto 16px', width: 56, height: 56, borderRadius: 16 }}>
            TP
          </div>
          <h1 className="login-card__title">重置密码</h1>
          <p className="login-card__subtitle">
            {success ? '密码已重置' : '请输入您的新密码'}
          </p>
        </div>

        {success ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ 
              padding: '24px', 
              borderRadius: 'var(--radius-lg)', 
              background: 'rgba(34, 197, 94, 0.1)',
              marginBottom: 16
            }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2" style={{ margin: '0 auto 12px' }}>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22,4 12,14.01 9,11.01"/>
              </svg>
              <p style={{ color: 'var(--color-text)' }}>
                密码重置成功！请使用新密码登录
              </p>
            </div>
            
            <Link to="/login" className="btn btn--primary btn--large" style={{ display: 'block', textDecoration: 'none' }}>
              前往登录
            </Link>
          </div>
        ) : (
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
              <label htmlFor="password" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                新密码
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
                确认新密码
              </label>
              <input
                id="confirmPassword"
                type="password"
                className="input"
                placeholder="再次输入新密码"
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
              {isLoading ? '重置中...' : '重置密码'}
            </button>

            <p style={{ 
              marginTop: 16, 
              textAlign: 'center', 
              fontSize: 'var(--font-size-sm)', 
              color: 'var(--color-text-secondary)' 
            }}>
              <Link to="/login" style={{ color: 'var(--color-primary)', textDecoration: 'none' }}>
                返回登录
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}

export default ResetPassword