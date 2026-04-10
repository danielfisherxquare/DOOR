import useAuthStore from '../stores/authStore'

export default function CapabilityProtectedRoute({ scope, capability, children }) {
  const hasCapability = useAuthStore((state) => state.hasCapability)

  if (!hasCapability(scope, capability)) {
    return (
      <div className="surface-protected-route">
        <div className="surface-protected-route__card">
          <div className="surface-protected-route__badge">ACCESS DENIED</div>
          <h1>权限不足</h1>
          <p>当前账号缺少访问该应用所需的能力，请联系管理员开通。</p>
        </div>
      </div>
    )
  }

  return children
}
