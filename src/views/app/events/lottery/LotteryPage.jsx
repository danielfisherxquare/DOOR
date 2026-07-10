import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import pipelineApi from '../../../../api/pipeline'
import racesApi from '../../../../api/races'
import useAuthStore from '../../../../stores/authStore'
import useRaceContextStore from '../../../../stores/raceContextStore'
import useWorkspaceStore from '../../../../features/workspace/workspaceStore'
import { resolveSurfaceOrgId, resolveSurfaceRaceId } from '../../../../utils/surfaceContext'
import {
  AppH5ContextState,
  AppH5Notice,
  AppH5Panel,
  AppH5Surface,
  AppH5Tabs,
} from '../../../../components/app/AppH5Surface'
import CapacityPlanner from './CapacityPlanner'
import StartZoneSimulator from './StartZoneSimulator'
import PerformanceFilter from './PerformanceFilter'
import InventoryMatcher from './InventoryMatcher'
import '../processing/processing-center.css'
import './lottery-page.css'

const STEPS = [
  { key: 'capacity', label: '容量定义', icon: '01', desc: '设定赛事默认模式、项目目标人数、抽签率和性别比例。' },
  { key: 'zones', label: '起点沙盘', icon: '02', desc: '维护起跑区、容量推演、颜色、间距和项目绑定。' },
  { key: 'performance', label: '成绩筛选', icon: '03', desc: '维护达标门槛和优先比例，并执行成绩筛选。' },
  { key: 'inventory', label: '物资匹配与最终执行', icon: '04', desc: '查看库存、执行最终抽签、查看结果并支持回滚。' },
]

export default function LotteryPage() {
  const [searchParams] = useSearchParams()
  const user = useAuthStore((state) => state.user)
  const session = useWorkspaceStore((state) => state.session)
  const orgId = resolveSurfaceOrgId(searchParams, user, session)
  const raceId = resolveSurfaceRaceId(searchParams, user, orgId, session)
  const currentRace = useRaceContextStore((state) => state.currentRace)
  const [activeStep, setActiveStep] = useState('capacity')
  const [raceDetail, setRaceDetail] = useState(null)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState('info')

  const refreshPreview = async (announce = false) => {
    if (!raceId) return

    setLoading(true)
    try {
      const [raceResponse, previewResponse] = await Promise.all([
        racesApi.getById(Number(raceId)),
        pipelineApi.getPreview(Number(raceId)),
      ])
      setRaceDetail(raceResponse?.data || null)
      setPreview(previewResponse?.data || null)
      if (announce) {
        setMessage('抽签工作流数据已刷新。')
        setMessageTone('success')
      }
    } catch (error) {
      setMessage(`加载抽签工作流失败：${error.message}`)
      setMessageTone('danger')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshPreview(false)
  }, [raceId])

  const activeMeta = useMemo(
    () => STEPS.find((step) => step.key === activeStep) || STEPS[0],
    [activeStep],
  )

  const metrics = useMemo(() => {
    const totalRecords = preview?.records?.total || 0
    const totalTarget = preview?.step1?.totalTarget || 0
    const totalSelected = (preview?.records?.won || 0) + (preview?.records?.locked || 0)

    return [
      {
        key: 'race',
        label: '目标赛事',
        value: raceDetail?.name || currentRace?.name || (raceId ? `#${raceId}` : '未选择'),
        meta: '容量、分区、成绩筛选和最终执行都只作用于当前赛事。',
        pill: 'RACE',
      },
      {
        key: 'pool',
        label: '报名池',
        value: totalRecords.toLocaleString(),
        meta: `目标人数 ${totalTarget.toLocaleString()}，当前已入选 ${totalSelected.toLocaleString()}。`,
        pill: 'POOL',
      },
      {
        key: 'step',
        label: '当前步骤',
        value: activeMeta.label,
        meta: activeMeta.desc,
        pill: activeMeta.icon,
      },
    ]
  }, [activeMeta, currentRace?.name, preview?.records?.locked, preview?.records?.total, preview?.records?.won, preview?.step1?.totalTarget, raceDetail?.name, raceId])

  const stepTabs = useMemo(() => STEPS.map((step) => ({
    key: step.key,
    label: step.label,
    badge: step.icon,
    active: step.key === activeStep,
    onClick: () => setActiveStep(step.key),
  })), [activeStep])

  if (!raceId) {
    return (
      <AppH5Surface
        className="lottery-page"
        eyebrow="我的赛事"
        title="抽签管理"
        summary="把容量定义、起点沙盘、成绩筛选和最终执行收回到一条完整的抽签链路。"
        metrics={[{ key: 'race', label: '目标赛事', value: '未选择', meta: '抽签工作流必须先锁定赛事上下文。', pill: 'RACE' }]}
      >
        <AppH5ContextState
          title="请先选择赛事"
          description="在顶部控制面板中选择赛事后，才能进入抽签管理工作流。"
        />
      </AppH5Surface>
    )
  }

  return (
    <AppH5Surface
      className="lottery-page"
      eyebrow="我的赛事"
      title="抽签管理"
      summary="对齐 TOOL 的四步链路：容量定义、起点沙盘、成绩筛选、物资匹配与最终执行。"
      metrics={metrics}
      actions={<button className="btn btn--secondary" onClick={() => refreshPreview(true)} disabled={loading}>{loading ? '刷新中...' : '刷新预览'}</button>}
    >

      {message ? <AppH5Notice tone={messageTone}>{message}</AppH5Notice> : null}

      <AppH5Tabs
        items={stepTabs}
        ariaLabel="抽签步骤"
      />

      <AppH5Panel
        title={activeMeta.label}
        summary={`Step ${STEPS.findIndex((step) => step.key === activeStep) + 1} · ${activeMeta.desc}`}
        className="lottery-step-shell"
      />

      {activeStep === 'capacity' ? (
        <CapacityPlanner raceId={raceId} raceDetail={raceDetail} preview={preview} onUpdated={() => refreshPreview(false)} />
      ) : null}

      {activeStep === 'zones' ? (
        <StartZoneSimulator raceId={raceId} raceDetail={raceDetail} preview={preview} onUpdated={() => refreshPreview(false)} />
      ) : null}

      {activeStep === 'performance' ? (
        <PerformanceFilter raceId={raceId} raceDetail={raceDetail} preview={preview} onUpdated={() => refreshPreview(false)} />
      ) : null}

      {activeStep === 'inventory' ? (
        <InventoryMatcher raceId={raceId} raceDetail={raceDetail} preview={preview} onUpdated={() => refreshPreview(false)} />
      ) : null}

      <div className="lottery-step-nav">
        <button
          className="btn btn--ghost"
          onClick={() => setActiveStep(STEPS[Math.max(0, STEPS.findIndex((step) => step.key === activeStep) - 1)].key)}
          disabled={activeStep === STEPS[0].key}
        >
          上一步
        </button>
        <button
          className="btn btn--secondary"
          onClick={() => setActiveStep(STEPS[Math.min(STEPS.length - 1, STEPS.findIndex((step) => step.key === activeStep) + 1)].key)}
          disabled={activeStep === STEPS[STEPS.length - 1].key}
        >
          下一步
        </button>
      </div>
    </AppH5Surface>
  )
}
