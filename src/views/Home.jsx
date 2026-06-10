import { useSearchParams } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import { getAppNavGroups, buildAppHref } from '../components/app/appConfig'
import {
  AppH5ActionCard,
  AppH5Section,
  AppH5Surface,
} from '../components/app/AppH5Surface'
import { resolveSurfaceOrgId, resolveSurfaceRaceId } from '../utils/surfaceContext'

function Home() {
  const user = useAuthStore((state) => state.user)
  const hasCapability = useAuthStore((state) => state.hasCapability)
  const [searchParams] = useSearchParams()
  const currentContext = {
    orgId: resolveSurfaceOrgId(searchParams, user),
    raceId: resolveSurfaceRaceId(searchParams, user),
  }
  const portalGroups = getAppNavGroups(hasCapability)
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.key !== 'dashboard'),
    }))
    .filter((group) => group.items.length > 0)

  const moduleCount = portalGroups.reduce((total, group) => total + group.items.length, 0)
  const raceLockedCount = portalGroups.reduce(
    (total, group) => total + group.items.filter((item) => item.needsRace).length,
    0,
  )
  const contextState = currentContext.raceId
    ? '赛事已锁定'
    : currentContext.orgId
      ? '机构已锁定'
      : '待选择'

  const metrics = [
    {
      key: 'modules',
      label: '可用入口',
      value: moduleCount,
      meta: '按当前账号能力过滤后的应用层功能。',
      tone: 'accent',
    },
    {
      key: 'groups',
      label: '业务分区',
      value: portalGroups.length,
      meta: '首页、赛事、业务、证件、仓储和管理入口统一归档。',
    },
    {
      key: 'context',
      label: '上下文',
      value: contextState,
      meta: '顶部上下文会同步到每个业务入口。',
    },
    {
      key: 'race',
      label: '赛事依赖',
      value: raceLockedCount,
      meta: '这些入口进入前需要锁定具体赛事。',
    },
  ]

  return (
    <AppH5Surface
      className="app-h5-home"
      eyebrow="DOOR H5 APP"
      title="应用层工作台"
      summary="把个人任务、赛事处理、报销、证件、仓储和空间工具收在一个可安装的 H5 app 入口里。手机端先从底部快捷栏进入高频功能，其余入口从“全部”菜单展开。"
      actions={(
        <span className="app-h5-home__install-note">
          <span className="material-symbols-outlined" aria-hidden="true">add_to_home_screen</span>
          支持 iOS / Android 添加到主屏幕
        </span>
      )}
      metrics={metrics}
    >
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
                meta={item.needsRace ? '需要赛事上下文' : item.description}
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
