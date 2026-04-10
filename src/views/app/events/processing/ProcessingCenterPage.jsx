import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import racesApi from '../../../../api/races'
import useRaceContextStore from '../../../../stores/raceContextStore'
import { unwrapData } from '../../../../utils/apiResponse'
import {
  CommandMetricGrid,
  CommandShell,
  CommandStepRail,
  ContextRequirementState,
} from '../../../../components/command/CommandPrimitives'
import ProcessingOverviewPanel from './ProcessingOverviewPanel'
import VerificationImportPanel from './VerificationImportPanel'
import LotteryListsPanel from './LotteryListsPanel'
import AuditPipelinePanel from './AuditPipelinePanel'
import RecordsOverviewPanel from '../records/RecordsOverviewPanel'
import './processing-center.css'

const TABS = [
  { key: 'records', label: '全量记录', icon: 'RC', desc: '查询、筛选和导出当前赛事的全量选手记录。' },
  { key: 'overview', label: '处理概览', icon: 'OV', desc: '按选手处理状态查看分布概览，快速了解当前进度。' },
  { key: 'results', label: '校验成绩管理', icon: 'VR', desc: '导入成绩证明，预览后写回选手历史成绩字段。' },
  { key: 'lists', label: '黑/白名单处理', icon: 'LW', desc: '导入、匹配和重应用黑白名单，同时维护冲突规则。' },
  { key: 'audit', label: '清洗流水线', icon: 'AU', desc: '按五步执行二次清洗，逐步确认后进入下一步。' },
]

export default function ProcessingCenterPage() {
  const [searchParams] = useSearchParams()
  const raceId = searchParams.get('raceId')
  const tabParam = searchParams.get('tab')
  const initialTab = TABS.some((item) => item.key === tabParam) ? tabParam : 'records'
  const [activeTab, setActiveTab] = useState(initialTab)
  const currentRace = useRaceContextStore((state) => state.currentRace)
  const [raceDetail, setRaceDetail] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!raceId) {
      setRaceDetail(null)
      return
    }

    let alive = true

    racesApi.getById(Number(raceId))
      .then((response) => {
        if (!alive) return
        setRaceDetail(unwrapData(response) || null)
      })
      .catch(() => {
        if (!alive) return
        setRaceDetail(null)
      })

    return () => {
      alive = false
    }
  }, [raceId])

  const activeTabMeta = useMemo(
    () => TABS.find((item) => item.key === activeTab) || TABS[0],
    [activeTab],
  )

  const metrics = useMemo(() => ([
    {
      key: 'race',
      label: '目标赛事',
      value: raceDetail?.name || currentRace?.name || (raceId ? `#${raceId}` : '未选择'),
      meta: '当前处理动作都只作用于这个赛事上下文。',
      pill: 'RACE',
    },
    {
      key: 'current-tab',
      label: '当前工作面板',
      value: activeTabMeta.label,
      meta: activeTabMeta.desc,
      pill: activeTabMeta.icon,
    },
    {
      key: 'pipeline',
      label: '二次清洗',
      value: '五步已恢复',
      meta: '未成年检查、黑名单碰撞、精英资质、直通锁定、大众池标记。',
      pill: '5STEP',
    },
  ]), [activeTabMeta, currentRace?.name, raceDetail?.name, raceId])

  const handleDataChanged = () => {
    setRefreshKey((value) => value + 1)
  }

  if (!raceId) {
    return (
      <div className="command-page surface-app processing-center-page">
        <CommandShell
          eyebrow="我的赛事"
          title="名单处理"
          summary="把成绩校验、黑白名单和五步二次清洗收回到同一条处理链路。"
        >
          <CommandMetricGrid items={[
            { key: 'race', label: '目标赛事', value: '未选择', meta: '处理中心依赖明确的赛事作用域。', pill: 'RACE' },
          ]} />
        </CommandShell>
        <ContextRequirementState
          title="请先选择赛事"
          description="在顶部控制面板中锁定赛事后，才能进入名单处理中心。"
        />
      </div>
    )
  }

  return (
    <div className="command-page surface-app processing-center-page">
      <CommandShell
        eyebrow="我的赛事"
        title="名单处理"
        summary="集中查询导出、状态概览、成绩校验、黑白名单与五步二次清洗。"
      >
        <CommandMetricGrid items={metrics} />
      </CommandShell>

      <CommandStepRail
        steps={TABS}
        activeKey={activeTab}
        onChange={setActiveTab}
        className="processing-tab-strip"
        ariaLabel="名单处理标签"
      />

      <div className="processing-stack">
        {activeTab === 'records' ? (
          <RecordsOverviewPanel
            raceId={raceId}
            currentRace={raceDetail || currentRace}
          />
        ) : null}

        {activeTab === 'overview' ? (
          <ProcessingOverviewPanel
            raceId={raceId}
            currentRace={raceDetail || currentRace}
            refreshKey={refreshKey}
          />
        ) : null}

        {activeTab === 'results' ? (
          <VerificationImportPanel raceId={raceId} onImported={handleDataChanged} />
        ) : null}

        {activeTab === 'lists' ? (
          <LotteryListsPanel
            raceId={raceId}
            raceDetail={raceDetail}
            onDataChanged={handleDataChanged}
          />
        ) : null}

        {activeTab === 'audit' ? (
          <AuditPipelinePanel
            raceId={raceId}
            raceDate={raceDetail?.date || currentRace?.date || ''}
            onDataChanged={handleDataChanged}
          />
        ) : null}
      </div>
    </div>
  )
}
