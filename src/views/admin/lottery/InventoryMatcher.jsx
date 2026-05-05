import { useEffect, useMemo, useState } from 'react'
import lotteryApi from '../../../api/lottery'
import pipelineApi from '../../../api/pipeline'
import {
  CommandDataTable,
  CommandMetricGrid,
  CommandNotice,
  CommandPanel,
} from '../../../components/command/CommandPrimitives'
import {
  formatNumber,
  getCountFromMap,
  getEventGroupKey,
  getEventLabel,
  resolveEffectiveMode,
  toNumber,
} from './lotteryHelpers'
import LotteryV2BetaPanel from './LotteryV2BetaPanel'

function normalizeResult(raw) {
  if (!raw || typeof raw !== 'object') return null
  const lockedByEvent = raw.lockedByEvent || {}
  const selectedTotal = raw.selectedTotal !== undefined
    ? toNumber(raw.selectedTotal, 0)
    : toNumber(raw.winners, 0) + Object.values(lockedByEvent).reduce((sum, value) => sum + toNumber(value, 0), 0)
  return {
    winners: toNumber(raw.winners, 0),
    losers: toNumber(raw.losers, 0),
    selectedTotal,
    winnersByEvent: raw.winnersByEvent || {},
    lockedByEvent,
    bucketBreakdown: Array.isArray(raw.bucketBreakdown) ? raw.bucketBreakdown : [],
    inventoryReport: Array.isArray(raw.inventoryReport) ? raw.inventoryReport : [],
    unselectedStats: raw.unselectedStats || {},
    genderStats: raw.genderStats || {},
    inventoryWarnings: Array.isArray(raw.inventoryWarnings) ? raw.inventoryWarnings : [],
    warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
    errors: Array.isArray(raw.errors) ? raw.errors : [],
  }
}

function buildEventSummaryList(raceDetail, result) {
  const configuredEvents = Array.isArray(raceDetail?.events)
    ? raceDetail.events.map((item) => getEventLabel(item?.name))
    : []
  const keys = new Set(configuredEvents.map((item) => getEventGroupKey(item)))

  Object.keys(result?.winnersByEvent || {}).forEach((key) => keys.add(key))
  Object.keys(result?.lockedByEvent || {}).forEach((key) => keys.add(key))

  return [...keys].map((key) => ({
    key,
    label: configuredEvents.find((item) => getEventGroupKey(item) === key) || getEventLabel(key),
  }))
}

export default function InventoryMatcher({ raceId, raceDetail, preview, onUpdated }) {
  const [algorithmVersion, setAlgorithmVersion] = useState('v1')
  const [inventory, setInventory] = useState([])
  const [result, setResult] = useState(null)
  const [hasSnapshot, setHasSnapshot] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [rollingBack, setRollingBack] = useState(false)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState('info')
  const raceDefaultMode = raceDetail?.lotteryModeDefault === 'direct' ? 'direct' : 'lottery'

  useEffect(() => {
    let alive = true

    Promise.all([
      pipelineApi.getClothingLimits(Number(raceId)).catch(() => []),
      lotteryApi.getLotteryResults(Number(raceId)).catch(() => null),
      lotteryApi.hasSnapshot(Number(raceId)).catch(() => false),
    ]).then(([limits, results, snapshot]) => {
      if (!alive) return
      setInventory(limits || [])
      setResult(normalizeResult(results))
      setHasSnapshot(Boolean(snapshot))
    }).catch((error) => {
      if (!alive) return
      setMessage(`加载最终执行面板失败：${error.message}`)
      setMessageTone('danger')
    })

    return () => {
      alive = false
    }
  }, [raceId])

  const metrics = useMemo(() => {
    const totalInventory = inventory.reduce((sum, item) => sum + toNumber(item.totalInventory, 0), 0)
    const usedInventory = inventory.reduce((sum, item) => sum + toNumber(item.usedCount, 0), 0)
    const remainingInventory = totalInventory - usedInventory
    const totalSelected = result?.selectedTotal || (result ? result.winners + Object.values(result.lockedByEvent || {}).reduce((sum, value) => sum + toNumber(value, 0), 0) : 0)

    return [
      { key: 'inventory', label: '总库存', value: formatNumber(totalInventory), meta: '所有尺码与项目库存总和。', pill: 'INV' },
      { key: 'remaining', label: '剩余库存', value: formatNumber(remainingInventory), meta: '总库存减去当前已占用库存。', pill: 'LEFT' },
      { key: 'selected', label: '当前入选', value: formatNumber(totalSelected), meta: '中签人数 + 已锁定直通人数。', pill: 'WIN' },
    ]
  }, [inventory, result])

  const capacityRows = preview?.step1?.caps || []
  const executableRows = capacityRows.filter((row) => {
    const effectiveMode = resolveEffectiveMode(row, raceDefaultMode)
    if (effectiveMode === 'direct') return true
    return Math.floor(toNumber(row.targetCount, 0) * toNumber(row.drawRatio, 0)) > 0
  })
  const canExecute = executableRows.length > 0
  const eventSummaryList = buildEventSummaryList(raceDetail, result)

  const refresh = async () => {
    const [limits, results, snapshot] = await Promise.all([
      pipelineApi.getClothingLimits(Number(raceId)).catch(() => []),
      lotteryApi.getLotteryResults(Number(raceId)).catch(() => null),
      lotteryApi.hasSnapshot(Number(raceId)).catch(() => false),
    ])
    setInventory(limits || [])
    setResult(normalizeResult(results))
    setHasSnapshot(Boolean(snapshot))
  }

  const handleExecute = async () => {
    if (!canExecute) {
      setMessage('当前没有可执行项目。请先完成容量定义并确保预计抽签数大于 0。')
      setMessageTone('danger')
      return
    }

    if (!window.confirm('确认执行最终抽签/直通确认？此操作会写入正式抽签结果，并生成回滚快照。')) {
      return
    }

    setExecuting(true)
    setMessage('')
    try {
      const finalResult = await lotteryApi.finalizeLottery(Number(raceId), {
        onProgress: (progress) => {
          if (progress?.message) {
            setMessage(`执行中：${progress.message}`)
            setMessageTone('info')
          }
        },
      })
      setResult(normalizeResult(finalResult))
      setMessage('最终执行完成，结果面已刷新。')
      setMessageTone('success')
      await refresh()
      onUpdated?.()
    } catch (error) {
      setMessage(`执行失败：${error.message}`)
      setMessageTone('danger')
    } finally {
      setExecuting(false)
    }
  }

  const handleRollback = async () => {
    if (!window.confirm('确认回滚当前抽签结果？这会恢复到 pre_lottery 快照状态。')) {
      return
    }

    setRollingBack(true)
    setMessage('')
    try {
      await lotteryApi.rollbackLottery(Number(raceId))
      setMessage('回滚完成，当前已恢复到抽签前状态。')
      setMessageTone('success')
      await refresh()
      onUpdated?.()
    } catch (error) {
      setMessage(`回滚失败：${error.message}`)
      setMessageTone('danger')
    } finally {
      setRollingBack(false)
    }
  }

  return (
    <div className="lottery-step-stack">
      <div className="lottery-version-switch" role="tablist" aria-label="抽签版本切换">
        <button
          type="button"
          role="tab"
          aria-selected={algorithmVersion === 'v1'}
          className={`btn ${algorithmVersion === 'v1' ? 'btn--primary' : 'btn--secondary'}`}
          onClick={() => setAlgorithmVersion('v1')}
        >
          V1 正式版
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={algorithmVersion === 'v2'}
          className={`btn ${algorithmVersion === 'v2' ? 'btn--primary' : 'btn--secondary'}`}
          onClick={() => setAlgorithmVersion('v2')}
        >
          V2 测试版
        </button>
      </div>

      {algorithmVersion === 'v2' ? (
        <LotteryV2BetaPanel raceId={raceId} onUpdated={onUpdated} />
      ) : (
        <>
          {message ? <CommandNotice tone={messageTone}>{message}</CommandNotice> : null}

          <CommandMetricGrid items={metrics} />

          <CommandPanel title="尺码库存" subtitle="库存统计与当前已占用数量会在执行后自动刷新。">
            <CommandDataTable>
              <thead>
                <tr>
                  <th>项目</th>
                  <th>性别</th>
                  <th>尺码</th>
                  <th>总库存</th>
                  <th>已占用</th>
                  <th>剩余</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((item) => (
                  <tr key={item.id || `${item.event}-${item.gender}-${item.size}`}>
                    <td>{item.event || 'ALL'}</td>
                    <td>{item.gender || 'U'}</td>
                    <td>{item.size}</td>
                    <td>{formatNumber(item.totalInventory)}</td>
                    <td>{formatNumber(item.usedCount)}</td>
                    <td>{formatNumber(toNumber(item.totalInventory, 0) - toNumber(item.usedCount, 0))}</td>
                  </tr>
                ))}
              </tbody>
            </CommandDataTable>
          </CommandPanel>

          {result ? (
            <CommandPanel title="最终执行结果" subtitle="结果优先读取最近一次成功的 lottery execution JSON，没有时回退到聚合统计。">
              <div className="lottery-mini-grid lottery-mini-grid--three">
                <div className="lottery-mini-stat"><span className="lottery-mini-stat__label">中签</span><strong className="lottery-mini-stat__value">{formatNumber(result.winners)}</strong></div>
                <div className="lottery-mini-stat"><span className="lottery-mini-stat__label">未中签</span><strong className="lottery-mini-stat__value">{formatNumber(result.losers)}</strong></div>
                <div className="lottery-mini-stat"><span className="lottery-mini-stat__label">总入选</span><strong className="lottery-mini-stat__value">{formatNumber(result.selectedTotal)}</strong></div>
              </div>

              {eventSummaryList.length ? (
                <div className="lottery-card-grid lottery-card-grid--compact">
                  {eventSummaryList.map((item) => (
                    <div key={item.key} className="lottery-mini-card">
                      <span className="lottery-mini-card__label">{item.label}</span>
                      <strong className="lottery-mini-card__value">{formatNumber(getCountFromMap(result.winnersByEvent, item.key) + getCountFromMap(result.lockedByEvent, item.key))}</strong>
                      <span className="lottery-mini-card__meta">
                        中签 {formatNumber(getCountFromMap(result.winnersByEvent, item.key))} / 直通 {formatNumber(getCountFromMap(result.lockedByEvent, item.key))}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}

              {result.warnings?.length ? (
                <div className="lottery-warning-list">
                  {result.warnings.map((warning, index) => <div key={index}>警告：{warning}</div>)}
                </div>
              ) : null}

              {result.inventoryWarnings?.length ? (
                <div className="lottery-warning-list">
                  {result.inventoryWarnings.map((warning, index) => <div key={index}>库存：{warning}</div>)}
                </div>
              ) : null}

              {result.errors?.length ? (
                <div className="lottery-error-list">
                  {result.errors.map((error, index) => <div key={index}>错误：{error}</div>)}
                </div>
              ) : null}

              {result.bucketBreakdown?.length ? (
                <CommandDataTable>
                  <thead>
                    <tr>
                      <th>Bucket</th>
                      <th>候选</th>
                      <th>优先池</th>
                      <th>普通池</th>
                      <th>中签</th>
                      <th>未中签</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.bucketBreakdown.map((bucket, index) => (
                      <tr key={`${bucket.bucket}-${index}`}>
                        <td>{bucket.bucket}</td>
                        <td>{formatNumber(bucket.candidates)}</td>
                        <td>{formatNumber(bucket.qualifiedWinners)} / {formatNumber(bucket.qualifiedCount)}</td>
                        <td>{formatNumber(bucket.generalWinners)} / {formatNumber(bucket.generalCount)}</td>
                        <td>{formatNumber(bucket.winners)}</td>
                        <td>{formatNumber(bucket.losers)}</td>
                      </tr>
                    ))}
                  </tbody>
                </CommandDataTable>
              ) : null}

              {result.inventoryReport?.length ? (
                <CommandDataTable>
                  <thead>
                    <tr>
                      <th>尺码</th>
                      <th>总库存</th>
                      <th>既有占用</th>
                      <th>直通占用</th>
                      <th>本次消耗</th>
                      <th>全马</th>
                      <th>半马</th>
                      <th>剩余</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.inventoryReport.map((item) => (
                      <tr key={item.size}>
                        <td>{item.size}</td>
                        <td>{formatNumber(item.totalInventory)}</td>
                        <td>{formatNumber(item.previouslyUsed)}</td>
                        <td>{formatNumber(item.lockedCount)}</td>
                        <td>{formatNumber(item.consumed)}</td>
                        <td>{formatNumber(item.fullConsumed)}</td>
                        <td>{formatNumber(item.halfConsumed)}</td>
                        <td>{formatNumber(item.remaining)}</td>
                      </tr>
                    ))}
                  </tbody>
                </CommandDataTable>
              ) : null}

              {result.genderStats && Object.keys(result.genderStats).length ? (
                <div className="lottery-card-grid lottery-card-grid--compact">
                  {Object.entries(result.genderStats).map(([key, stats]) => (
                    <div key={key} className="lottery-mini-card">
                      <span className="lottery-mini-card__label">{getEventLabel(key)}</span>
                      <strong className="lottery-mini-card__value">{formatNumber(stats?.total)}</strong>
                      <span className="lottery-mini-card__meta">
                        男 {formatNumber(stats?.male?.winners)} / 女 {formatNumber(stats?.female?.winners)}
                      </span>
                      <span className="lottery-mini-card__meta">
                        目标比 男 {Math.round(toNumber(stats?.male?.targetRatio, 0) * 100)}% / 女 {Math.round(toNumber(stats?.female?.targetRatio, 0) * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}

              {result.unselectedStats ? (
                <div className="lottery-help-block">
                  有成绩未中签 {formatNumber(result.unselectedStats.qualified_lottery)}，无成绩未中签 {formatNumber(result.unselectedStats.general_lottery)}，
                  有成绩但库存不足 {formatNumber(result.unselectedStats.qualified_inventory)}，无成绩但库存不足 {formatNumber(result.unselectedStats.general_inventory)}。
                </div>
              ) : null}
            </CommandPanel>
          ) : null}

          {!canExecute ? (
            <CommandNotice tone="warning">当前还不能执行最终抽签，请先在“容量定义”中保存可执行的项目容量配置。</CommandNotice>
          ) : null}

          <div className="lottery-footer-actions">
            <button className="btn btn--primary" onClick={handleExecute} disabled={!canExecute || executing || rollingBack}>
              {executing ? '执行中...' : '执行最终抽签'}
            </button>
            <button className="btn btn--secondary" onClick={handleRollback} disabled={!hasSnapshot || rollingBack || executing}>
              {rollingBack ? '回滚中...' : hasSnapshot ? '回滚抽签结果' : '暂无可回滚快照'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
