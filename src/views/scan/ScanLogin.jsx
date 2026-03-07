import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'

function ScanLogin() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  const { login, isLoading, error, isAuthenticated, clearError } = useAuthStore()

  useEffect(() => {
    if (isAuthenticated) {
      const redirect = new URLSearchParams(location.search).get('redirect') || '/scan'
      navigate(redirect, { replace: true })
    }
  }, [isAuthenticated, location.search, navigate])

  useEffect(() => () => clearError(), [clearError])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!username.trim() || !password.trim()) return
    const result = await login(username, password, false)
    if (result.success) {
      const redirect = new URLSearchParams(location.search).get('redirect') || '/scan'
      navigate(redirect, { replace: true })
    }
  }

  return (
    <div style={{ background: '#fff', borderRadius: 24, padding: 20, boxShadow: '0 20px 50px rgba(15, 23, 42, 0.08)' }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 24 }}>扫码登录</h1>
      <p style={{ margin: '0 0 16px', color: '#475569', fontSize: 14 }}>使用已有 Door 账号登录后开始扫码。</p>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
        <input
          className="input"
          placeholder="用户名或邮箱"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          disabled={isLoading}
        />
        <input
          className="input"
          type="password"
          placeholder="密码"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={isLoading}
        />
        {error && <div style={{ color: '#DC2626', fontSize: 13 }}>{error}</div>}
        <button className="btn btn--primary" disabled={isLoading} type="submit">
          {isLoading ? '登录中...' : '登录并进入扫码'}
        </button>
      </form>
    </div>
  )
}

export default ScanLogin
