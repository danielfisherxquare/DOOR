import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import useAuthStore from '../stores/authStore'

function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [resetToken, setResetToken] = useState(null)
  
  const { forgotPassword, isLoading, error, clearError } = useAuthStore()

  useEffect(() => {
    return () => clearError()
  }, [clearError])

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!email.trim()) {
      return
    }

    const result = await forgotPassword(email)
    if (result.success) {
      setSubmitted(true)
      setResetToken(result.resetToken) // 仅用于演示
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card__header">
          <div className="navbar__logo" style={{ margin: '0 auto 16px', width: 56, height: 56, borderRadius: 16 }}>
            TP
          </div>
          <h1 className="login-card__title">忘记密码</h1>
          <p className="login-card__subtitle">
            {submitted ? '邮件已发送' : '输入您的邮箱地址，我们将发送重置链接'}
          </p>
        </div>

        {submitted ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ 
              padding: '24px', 
              borderRadius: 'var(--radius-lg)', 
              background: 'rgba(34, 197, 94, 0.1)',
              marginBottom: 16
            }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2" style={{ margin: '0 auto 12px' }}>
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
              </svg>
              <p style={{ color: 'var(--color-text)', marginBottom: 8 }}>
                如果该邮箱已注册，您将收到密码重置邮件
              </p>
            </div>
            
            {/* 仅用于演示：显示重置链接 */}
            {resetToken && (
              <div style={{ 
                padding: '12px', 
                borderRadius: 'var(--radius-md)', 
                background: 'rgba(59, 130, 246, 0.1)',
                marginBottom: 16,
                fontSize: 'var(--font-size-sm)'
              }}>
                <p style={{ color: 'var(--color-text-secondary)', marginBottom: 8 }}>演示模式：点击下方链接重置密码</p>
                <Link 
                  to={`/reset-password/${resetToken}`}
                  style={{ color: 'var(--color-primary)', wordBreak: 'break-all' }}
                >
                  重置密码链接
                </Link>
              </div>
            )}
            
            <Link to="/login" className="btn btn--primary btn--large" style={{ display: 'block', textDecoration: 'none' }}>
              返回登录
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
              <label htmlFor="email" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                邮箱地址
              </label>
              <input
                id="email"
                type="email"
                className="input"
                placeholder="请输入注册时的邮箱"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                autoComplete="email"
              />
            </div>

            <button 
              type="submit" 
              className="btn btn--primary btn--large"
              disabled={isLoading}
              style={{ marginTop: 8 }}
            >
              {isLoading ? '发送中...' : '发送重置链接'}
            </button>

            <p style={{ 
              marginTop: 16, 
              textAlign: 'center', 
              fontSize: 'var(--font-size-sm)', 
              color: 'var(--color-text-secondary)' 
            }}>
              想起密码了？{' '}
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

export default ForgotPassword