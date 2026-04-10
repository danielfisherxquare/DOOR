import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import { CommandPanel } from '../components/command/CommandPrimitives'

function ResetPassword() {
  const { token } = useParams()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [success, setSuccess] = useState(false)

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
    <div className="command-auth surface-public">
      <aside className="command-auth__brand">
        <span className="command-auth__eyebrow">密码重置</span>
        <div className="command-auth__logo">RS</div>
        <h1 className="command-auth__title">重置密码</h1>
        <p className="command-auth__description">
          为当前账号设置新密码。表单与状态提示遵循同一套控制台规范，不再使用旧版营销式认证页。
        </p>
      </aside>
      <main className="command-auth__content">
        <CommandPanel
          className="command-auth__card"
          title="设置新密码"
          subtitle={success ? '密码已经更新。' : '请输入并确认新的登录密码。'}
        >
          {success ? (
            <div className="command-auth__success">
              <div className="command-auth__success-icon">OK</div>
              <div className="command-auth__helper">密码重置成功，请使用新密码重新登录。</div>
              <Link to="/login" className="btn btn--primary">前往登录</Link>
            </div>
          ) : (
            <form className="command-auth__stack" onSubmit={handleSubmit}>
              {error ? <div className="command-notice command-notice--danger">{error}</div> : null}

              <div className="input-group">
                <label htmlFor="password" className="login-card__label">新密码</label>
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
                <label htmlFor="confirmPassword" className="login-card__label">确认新密码</label>
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

              <button type="submit" className="btn btn--primary" disabled={isLoading}>
                {isLoading ? '重置中...' : '确认重置'}
              </button>

              <div className="command-auth__helper">
                <Link to="/login" className="command-auth__link">返回登录</Link>
              </div>
            </form>
          )}
        </CommandPanel>
      </main>
    </div>
  )
}

export default ResetPassword
