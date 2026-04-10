import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import useRaceContextStore from '../../../stores/raceContextStore'
import {
  CommandMetricGrid,
  CommandShell,
  ContextRequirementState,
} from '../../../components/command/CommandPrimitives'
import RecordsOverviewPanel from './RecordsOverviewPanel'
import './records-page.css'

export default function RecordsPage() {
  const [searchParams] = useSearchParams()
  const raceId = searchParams.get('raceId')
  const currentRace = useRaceContextStore((state) => state.currentRace)

  const metrics = useMemo(() => ([
    {
      key: 'race',
      label: '目标赛事',
      value: currentRace?.name || `#${raceId}`,
      meta: '当前筛选和导出动作都只作用于该赛事。',
      pill: 'RACE',
    },
    {
      key: 'processing',
      label: '后处理中心',
      value: '已恢复',
      meta: '名单处理、成绩校验和二次清洗已迁回独立入口。',
      pill: 'PROC',
    },
  ]), [currentRace?.name, raceId])

  const processingHref = useMemo(() => {
    const query = searchParams.toString()
    return `/admin/processing${query ? `?${query}` : ''}`
  }, [searchParams])

  if (!raceId) {
    return (
      <div className="command-page surface-admin">
        <CommandShell
          eyebrow="选手管理"
          title="名单管理"
          summary="统一查看导入后的选手记录、筛选条件和导出结果，避免再回到旧式白表页面。"
        >
          <CommandMetricGrid items={[
            { key: 'race', label: '目标赛事', value: '未选择', meta: '请先锁定赛事作用域。', pill: 'RACE' },
          ]} />
        </CommandShell>
        <ContextRequirementState
          title="请先选择赛事"
          description="在顶部控制面板中选择目标赛事后，才能查看和管理选手名单。"
        />
      </div>
    )
  }

  return (
    <div className="command-page surface-admin records-page">
      <CommandShell
        eyebrow="选手管理"
        title="名单管理"
        summary="围绕当前赛事统一查看选手记录、字段筛选、排序和导出动作。"
      >
        <CommandMetricGrid items={metrics} />
      </CommandShell>

      <RecordsOverviewPanel
        raceId={raceId}
        currentRace={currentRace}
        extraActions={<Link className="btn btn--secondary" to={processingHref}>进入名单处理</Link>}
      />
    </div>
  )
}
