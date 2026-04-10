import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import { CommandPanel } from '../components/command/CommandPrimitives'

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
    <div className="command-auth surface-public">
      <aside className="command-auth__brand">
        <span className="command-auth__eyebrow">密码找回</span>
        <div className="command-auth__logo">PW</div>
        <h1 className="command-auth__title">重置入口</h1>
        <p className="command-auth__description">
          通过邮箱重置 DOOR 登录密码。系统会保留安全提示，并将结果回收到同一控制台语言中。
        </p>
      </aside>
      <main className="command-auth__content">
        <CommandPanel
          className="command-auth__card"
          title="忘记密码"
          subtitle={submitted ? '如果邮箱有效，重置链路已经生成。' : '输入注册邮箱，系统将发送密码重置链接。'}
        >
          {submitted ? (
            <div className="command-auth__success">
              <div className="command-auth__success-icon">OK</div>
              <div className="command-auth__helper">如果该邮箱已注册，您将收到密码重置邮件。</div>
              {resetToken ? (
                <div className="command-notice command-notice--info">
                  演示模式：
                  <Link to={`/reset-password/${resetToken}`} className="command-auth__link" style={{ marginLeft: 8 }}>
                    打开重置链接
                  </Link>
                </div>
              ) : null}
              <Link to="/login" className="btn btn--primary">返回登录</Link>
            </div>
          ) : (
            <form className="command-auth__stack" onSubmit={handleSubmit}>
              {error ? <div className="command-notice command-notice--danger">{error}</div> : null}

              <div className="input-group">
                <label htmlFor="email" className="login-card__label">邮箱地址</label>
                <input
                  id="email"
                  type="email"
                  className="input"
                  placeholder="请输入注册邮箱"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  autoComplete="email"
                />
              </div>

              <button type="submit" className="btn btn--primary" disabled={isLoading}>
                {isLoading ? '发送中...' : '发送重置链接'}
              </button>

              <div className="command-auth__helper">
                想起密码了？
                <Link to="/login" className="command-auth__link" style={{ marginLeft: 6 }}>
                  返回登录
                </Link>
              </div>
            </form>
          )}
        </CommandPanel>
      </main>
    </div>
  )
}

export default ForgotPassword
