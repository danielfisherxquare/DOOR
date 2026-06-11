import { useSearchParams } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import { getAppNavGroups, buildAppHref } from '../components/app/appConfig'
import useWorkspaceStore from '../features/workspace/workspaceStore'
import {
  AppH5ActionCard,
  AppH5Section,
  AppH5Surface,
} from '../components/app/AppH5Surface'
import { resolveSurfaceOrgId, resolveSurfaceRaceId } from '../utils/surfaceContext'

function Home() {
  const user = useAuthStore((state) => state.user)
  const hasCapability = useAuthStore((state) => state.hasCapability)
  const session = useWorkspaceStore((state) => state.session)
  const [searchParams] = useSearchParams()
  const currentContext = {
    orgId: session?.orgId || resolveSurfaceOrgId(searchParams, user),
    raceId: session?.raceId || resolveSurfaceRaceId(searchParams, user, session?.orgId),
  }
  const portalGroups = getAppNavGroups({ user, hasCapability, raceId: currentContext.raceId })
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.key !== 'dashboard'),
    }))
    .filter((group) => group.items.length > 0)

  return (
    <AppH5Surface className="app-h5-home">
      {portalGroups.map((group) => (
        <AppH5Section
          key={group.key}
          title={group.label}
          summary={group.items.length === 1 ? group.items[0].description : `${group.items.length} 个入口`}
        >
          <div className="app-h5-action-grid">
            {group.items.map((item) => (
              <AppH5ActionCard
                key={item.key}
                to={buildAppHref(item.path, currentContext)}
                icon={item.icon || 'apps'}
                title={item.label}
                description={item.cardDescription || item.description}
                meta={item.needsRace ? '需先选赛事' : item.description}
                badge={item.shortLabel}
              />
            ))}
          </div>
        </AppH5Section>
      ))}
    </AppH5Surface>
  )
}

export default Home
