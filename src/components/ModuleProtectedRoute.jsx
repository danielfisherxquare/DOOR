import useAuthStore from '../stores/authStore';
import { hasModuleAccess as checkModuleAccess } from '../utils/moduleAccess';

/**
 * 模块路由保护组件
 * @param {Object} props
 * @param {string} props.surface - 入口层（app/ops/admin）
 * @param {string} props.moduleId - 模块ID（不含 surface 前缀）
 * @param {React.ReactNode} props.children - 子组件
 */
export default function ModuleProtectedRoute({ surface, moduleId, children }) {
  const user = useAuthStore((state) => state.user);

  // 未登录时不渲染（由 AuthRoute 处理）
  if (!user) {
    return null;
  }

  // super_admin / org_admin 跳过检查（拥有全部模块权限）
  if (['super_admin', 'org_admin'].includes(user?.role)) {
    return children;
  }

  if (!checkModuleAccess(user, surface, moduleId)) {
    return <AccessDenied module={moduleId} surface={surface} />;
  }

  return children;
}

/**
 * 访问被拒绝页面
 */
function AccessDenied({ module, surface }) {
  return (
    <div className="module-denied">
      <div className="module-denied__card">
        <div className="module-denied__badge">ACCESS DENIED</div>
        <h1>模块访问受限</h1>
        <p>
          您没有访问 <strong>{surface}:{module}</strong> 模块的权限。
        </p>
        <p className="module-denied__hint">
          如需访问该功能，请联系管理员开通模块访问权限。
        </p>
        <a href={`/${surface}`} className="btn btn--primary">
          返回{surface === 'app' ? '应用首页' : surface === 'ops' ? '执行端' : '管理后台'}
        </a>
      </div>

      <style>{`
        .module-denied {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-secondary);
          padding: 24px;
        }

        .module-denied__card {
          background: var(--surface);
          border-radius: var(--radius-lg);
          padding: 48px;
          text-align: center;
          max-width: 400px;
          box-shadow: var(--shadow-lg);
        }

        .module-denied__badge {
          display: inline-block;
          padding: 6px 16px;
          background: var(--danger-soft);
          color: var(--danger);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.1em;
          border-radius: var(--radius-md);
          margin-bottom: 24px;
        }

        .module-denied h1 {
          margin: 0 0 16px;
          font-size: 24px;
          font-weight: 700;
        }

        .module-denied p {
          color: var(--text-secondary);
          margin: 0 0 8px;
        }

        .module-denied__hint {
          font-size: 14px;
          margin-bottom: 24px !important;
        }

        .module-denied .btn {
          display: inline-block;
          padding: 12px 24px;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          border-radius: var(--radius-md);
          background: var(--primary);
          color: white;
        }
      `}</style>
    </div>
  );
}

/**
 * 检查用户是否有模块访问权限（用于条件渲染）
 * @param {Object} user - 用户对象
 * @param {string} surface - 入口层
 * @param {string} moduleId - 模块ID
 * @returns {boolean}
 */
export function hasModuleAccess(user, surface, moduleId) {
  return checkModuleAccess(user, surface, moduleId);
}
