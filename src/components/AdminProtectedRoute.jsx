import { Navigate, useLocation } from 'react-router-dom'
import useAuthStore from '../stores/authStore'

function AdminProtectedRoute({ children }) {
  const { isAuthenticated, isBootstrapping, user } = useAuthStore()
  const canAccessAdmin = useAuthStore((state) => state.canAccessAdmin)
  const location = useLocation()

  if (isBootstrapping) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--color-text-secondary)' }}>
        <div style={{ width: 40, height: 40, border: '3px solid var(--color-bg-card)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (user?.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }

  if (!canAccessAdmin()) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }}>
        <div style={{ fontSize: 48 }}>!</div>
        <h2 style={{ color: 'var(--color-text-primary)' }}>权限不足</h2>
        <p style={{ color: 'var(--color-text-secondary)' }}>当前账号没有访问管理后台的权限。</p>
        <a href="/" className="btn btn--primary">返回首页</a>
      </div>
    )
  }

  return children
}

export default AdminProtectedRoute
