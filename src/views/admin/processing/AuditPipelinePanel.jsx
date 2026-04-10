import { useCallback, useEffect, useMemo, useState } from 'react'
import auditApi from '../../../api/audit'
import {
  CommandEmptyState,
  CommandNotice,
  CommandPanel,
  CommandStatusTag,
} from '../../../components/command/CommandPrimitives'

const PIPELINE_STEPS = [
  {
    key: 'underage',
    label: '未成年检查',
    description: '基于比赛日计算周岁年龄，未满 18 周岁的选手将被剔除。',
    hint: '第 1 步会继续传入当前赛事日期。',
    action: (raceId, raceDate) => auditApi.stepUnderage(Number(raceId), { raceDate }),
  },
  {
    key: 'blacklist',
    label: '黑名单碰撞',
    description: '将选手记录与黑名单做碰撞检查，命中后标记为拒绝或模糊剔除。',
    hint: '会沿用当前赛事的黑白名单和冲突规则。',
    action: (raceId) => auditApi.stepBlacklist(Number(raceId)),
  },
  {
    key: 'fake-elite',
    label: '精英资质核验',
    description: '对白名单外的精英选手进行核验，识别资质存疑记录。',
    hint: '该步骤不会跳过前面步骤留下的结果。',
    action: (raceId) => auditApi.stepFakeElite(Number(raceId)),
  },
  {
    key: 'direct-lock',
    label: '直通锁定',
    description: '锁定 Elite、Permanent、Pacer、Medic、Sponsor 等直通选手。',
    hint: '锁定后不再进入抽签池。',
    action: (raceId) => auditApi.stepDirectLock(Number(raceId)),
  },
  {
    key: 'mass-pool',
    label: '大众池标记',
    description: '将剩余待处理的大众选手标记为参与抽签。',
    hint: '第 5 步结束后，五步二次清洗完成。',
    action: (raceId) => auditApi.stepMassPool(Number(raceId)),
  },
]

function formatResult(result) {
  if (!result) return '待执行'
  if (result.error) return `失败：${result.error}`
  return `影响 ${result.affected || 0} 人，剩余 ${result.remaining ?? 0} 人`
}

export default function AuditPipelinePanel({ raceId, raceDate, onDataChanged }) {
  const [stats, setStats] = useState({ byEvent: {}, total: 0 })
  const [loadingStats, setLoadingStats] = useState(false)
  const [currentStepIndex, setCurrentStepIndex] = useState(-1)
  const [stepResults, setStepResults] = useState({})
  const [runningStepKey, setRunningStepKey] = useState('')
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState('info')

  const loadStats = useCallback(async () => {
    if (!raceId) return

    setLoadingStats(true)
    try {
      const result = await auditApi.getPrepStats(Number(raceId))
      setStats(result || { byEvent: {}, total: 0 })
    } catch (err) {
      setMessage(`加载统计失败：${err.message}`)
      setMessageTone('danger')
      setStats({ byEvent: {}, total: 0 })
    } finally {
      setLoadingStats(false)
    }
  }, [raceId])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const handleReset = useCallback(async (announce = true) => {
    if (!raceId) return

    try {
      const result = await auditApi.resetAudit(Number(raceId))
      setCurrentStepIndex(-1)
      setStepResults({})
      await loadStats()
      onDataChanged?.()
      if (announce) {
        setMessage(`已重置审核链路，当前待处理 ${result?.pending ?? 0} 人。`)
        setMessageTone('success')
      }
      return result
    } catch (err) {
      setMessage(`重置失败：${err.message}`)
      setMessageTone('danger')
      return null
    }
  }, [loadStats, onDataChanged, raceId])

  const handleStart = useCallback(async () => {
    const result = await handleReset(false)
    if (!result) return
    setCurrentStepIndex(0)
    setMessage(`流水线已启动，当前待处理 ${result?.pending ?? 0} 人。`)
    setMessageTone('success')
  }, [handleReset])

  const handleRunStep = useCallback(async (stepIndex) => {
    const step = PIPELINE_STEPS[stepIndex]
    if (!step) return
    if (step.key === 'underage' && !raceDate) {
      setMessage('未找到赛事日期，无法执行未成年检查。请先补充赛事日期。')
      setMessageTone('danger')
      return
    }

    setRunningStepKey(step.key)
    setMessage('')
    try {
      const result = await step.action(raceId, raceDate)
      setStepResults((prev) => ({ ...prev, [step.key]: result }))
      await loadStats()
      onDataChanged?.()
      setMessage(`步骤“${step.label}”已完成，影响 ${result?.affected || 0} 人。`)
      setMessageTone('success')
    } catch (err) {
      const failed = { affected: 0, remaining: 0, error: err.message }
      setStepResults((prev) => ({ ...prev, [step.key]: failed }))
      setMessage(`步骤“${step.label}”执行失败：${err.message}`)
      setMessageTone('danger')
    } finally {
      setRunningStepKey('')
    }
  }, [loadStats, onDataChanged, raceDate, raceId])

  const allDone = currentStepIndex >= PIPELINE_STEPS.length
  const eventEntries = useMemo(() => Object.entries(stats?.byEvent || {}), [stats?.byEvent])

  return (
    <div className="processing-stack">
      <CommandNotice tone="info">
        建议先在"黑/白名单处理"Tab 完成名单导入和匹配后，再启动清洗流水线，以避免第 2 步黑名单碰撞覆盖之前的手动标记。
      </CommandNotice>
      {message ? <CommandNotice tone={messageTone}>{message}</CommandNotice> : null}

      <CommandPanel
        title="按项目统计"
        subtitle="统计直接基于后端返回的 byEvent + total 结构渲染，不再使用旧抽签页的伪字段。"
        actions={(
          <div className="processing-inline-actions">
            <button className="btn btn--secondary" onClick={loadStats} disabled={loadingStats}>
              {loadingStats ? '刷新中...' : '刷新统计'}
            </button>
          </div>
        )}
        footer={<div className="processing-footnote">当前赛事总报名人数：{stats?.total || 0}</div>}
      >
        {eventEntries.length === 0 ? (
          <CommandEmptyState
            icon="STAT"
            title="暂无项目统计"
            description="当前赛事还没有可用于清洗流水线的记录数据。"
          />
        ) : (
          <div className="pipeline-event-grid">
            {eventEntries.map(([eventName, eventStats]) => (
              <article key={eventName} className="pipeline-event-card">
                <div className="pipeline-event-title-row">
                  <strong>{eventName}</strong>
                  <CommandStatusTag tone="neutral">{eventStats.subtotal || 0} 人</CommandStatusTag>
                </div>
                <div className="pipeline-event-stats">
                  <span>参与抽签 {eventStats.participate || 0}</span>
                  <span>直通 {eventStats.direct || 0}</span>
                  <span>不予通过 {eventStats.denied || 0}</span>
                  <span>待处理 {eventStats.pending || 0}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </CommandPanel>

      <CommandPanel
        title="清洗流水线"
        subtitle="开始流水线会先重置审核状态；每一步执行后都需要显式确认，才能进入下一步。"
        actions={(
          <div className="processing-inline-actions">
            <button className="btn btn--secondary" onClick={() => handleReset(true)}>
              重置全部
            </button>
            <button className="btn btn--primary" onClick={handleStart} disabled={runningStepKey !== ''}>
              开始流水线
            </button>
          </div>
        )}
      >
        <div className="pipeline-step-list">
          {PIPELINE_STEPS.map((step, index) => {
            const isCurrent = currentStepIndex === index
            const isDone = currentStepIndex > index || allDone
            const isLocked = currentStepIndex >= 0 && index > currentStepIndex
            const result = stepResults[step.key]
            const isRunning = runningStepKey === step.key

            return (
              <section
                key={step.key}
                className={`command-panel pipeline-step-panel ${isCurrent ? 'pipeline-step-panel--current' : ''}`}
              >
                <div className="command-panel__body">
                  <div className="pipeline-step-meta">
                    <div>
                      <strong>{`${index + 1}. ${step.label}`}</strong>
                      <p>{step.description}</p>
                    </div>
                    <CommandStatusTag tone={isDone ? 'success' : isCurrent ? 'warning' : 'neutral'}>
                      {isDone ? '已完成' : isCurrent ? '进行中' : currentStepIndex === -1 ? '未开始' : isLocked ? '等待前一步确认' : '待执行'}
                    </CommandStatusTag>
                  </div>

                  <div className="processing-help">{step.hint}</div>

                  {result ? (
                    <div className={`pipeline-result ${result.error ? 'danger' : ''}`}>
                      {formatResult(result)}
                    </div>
                  ) : null}

                  <div className="processing-inline-actions">
                    <button
                      className="btn btn--primary"
                      onClick={() => handleRunStep(index)}
                      disabled={!isCurrent || isRunning}
                    >
                      {isRunning ? '执行中...' : `执行 ${step.label}`}
                    </button>

                    <button
                      className="btn btn--secondary"
                      onClick={() => setCurrentStepIndex(index + 1)}
                      disabled={!isCurrent || !result || !!result.error}
                    >
                      {index === PIPELINE_STEPS.length - 1 ? '确认完成' : '确认进入下一步'}
                    </button>
                  </div>
                </div>
              </section>
            )
          })}
        </div>

        {allDone ? (
          <div className="processing-help">
            五步二次清洗已全部完成。你可以返回“数据总览”核对结果，或再次点击“重置全部”重新开始。
          </div>
        ) : null}
      </CommandPanel>
    </div>
  )
}
