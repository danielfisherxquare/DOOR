import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import authApi from '../api/auth'
import useAuthStore from '../stores/authStore'

function ChangePasswordPage() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const fetchCurrentUser = useAuthStore((state) => state.fetchCurrentUser)

  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!oldPassword || !newPassword) {
      setMessage('请填写完整密码信息。')
      return
    }
    if (newPassword !== confirmPassword) {
      setMessage('两次输入的新密码不一致。')
      return
    }

    setSaving(true)
    setMessage('')
    try {
      const res = await authApi.changePassword({ oldPassword, newPassword })
      if (res.success) {
        await fetchCurrentUser()
        navigate('/admin', { replace: true })
      }
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card__header">
          <h1 className="login-card__title">修改密码</h1>
          <p className="login-card__subtitle">{user?.username} 需要先修改初始密码后才能继续使用系统。</p>
        </div>
        <form className="login-card__form" onSubmit={handleSubmit}>
          {message && (
            <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(59,130,246,0.08)' }}>
              {message}
            </div>
          )}
          <div className="input-group">
            <label htmlFor="old-password">当前密码</label>
            <input id="old-password" type="password" className="input" value={oldPassword} onChange={(event) => setOldPassword(event.target.value)} />
          </div>
          <div className="input-group">
            <label htmlFor="new-password">新密码</label>
            <input id="new-password" type="password" className="input" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
          </div>
          <div className="input-group">
            <label htmlFor="confirm-password">确认新密码</label>
            <input id="confirm-password" type="password" className="input" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
          </div>
          <button type="submit" className="btn btn--primary btn--large" disabled={saving}>
            {saving ? '提交中...' : '保存新密码'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default ChangePasswordPage
