import { Navigate, useLocation } from 'react-router-dom'
import useAuthStore from '../stores/authStore'

function ScanProtectedRoute({ children }) {
  const { isAuthenticated, isBootstrapping } = useAuthStore()
  const location = useLocation()

  if (isBootstrapping) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F8FAFC',
        color: '#334155'
      }}>
        正在校验登录状态...
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to={`/scan/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />
  }

  return children
}

export default ScanProtectedRoute
