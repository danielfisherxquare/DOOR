import { Link, useSearchParams } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import { getOpsPortalCards, buildOpsHref } from '../../components/ops/opsConfig'
import useWorkspaceStore from '../../features/workspace/workspaceStore'
import { resolveSurfaceOrgId, resolveSurfaceRaceId } from '../../utils/surfaceContext'

function OpsHome() {
  const user = useAuthStore((state) => state.user)
  const session = useWorkspaceStore((state) => state.session)
  const [searchParams] = useSearchParams()
  const currentContext = {
    orgId: session?.orgId || resolveSurfaceOrgId(searchParams, user),
    raceId: session?.raceId || resolveSurfaceRaceId(searchParams, user, session?.orgId),
  }

  const portalCards = getOpsPortalCards({ user })
  return (
    <div>
      {/* 执行入口卡片网格 */}
      <h3 className="app-portal-section-title">现场执行</h3>
      <div className="app-portal-grid">
        {portalCards.map((item) => (
          <Link key={item.key} to={buildOpsHref(item.path, currentContext)} className="app-portal-card">
            <div className="app-portal-card__header">
              <div className="app-portal-card__icon-box">
                <span className="material-symbols-outlined">{item.icon || 'apps'}</span>
              </div>
              <span className="app-portal-card__title">{item.label}</span>
            </div>
            <span className="app-portal-card__description">{item.cardDescription || item.description}</span>
            <span className="app-portal-card__action">
              进入 <span className="material-symbols-outlined">arrow_forward</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default OpsHome
