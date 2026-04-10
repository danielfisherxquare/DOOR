import { useEffect, useMemo, useState } from 'react'
import racesApi from '../../../../api/races'
import lotteryApi from '../../../../api/lottery'
import {
  CommandEmptyState,
  CommandMetricGrid,
  CommandNotice,
  CommandPanel,
} from '../../../../components/command/CommandPrimitives'
import GenderRatioConfig from './GenderRatioConfig'
import {
  buildEventRows,
  formatNumber,
  resolveEffectiveMode,
  toNumber,
} from './lotteryHelpers'

function hydrateRows(capacities, raceDetail) {
  const raceDefaultMode = raceDetail?.lotteryModeDefault === 'direct' ? 'direct' : 'lottery'
  const defaultRows = buildEventRows(raceDetail)
  const capacityMap = new Map((capacities || []).map((item) => [item.event, item]))

  const baseRows = defaultRows.length ? defaultRows : (capacities || [])
  return baseRows.map((row) => {
    const existing = capacityMap.get(row.event)
    const merged = existing ? { ...row, ...existing } : row
    const drawRatio = toNumber(merged.drawRatio, 0.85)
    return {
      ...merged,
      drawRatio,
      reservedRatio: toNumber(merged.reservedRatio, Number((1 - drawRatio).toFixed(2))),
      lotteryModeOverride: merged.lotteryModeOverride || 'inherit',
      effectiveLotteryMode: resolveEffectiveMode(merged, raceDefaultMode),
    }
  })
}

export default function CapacityPlanner({ raceId, raceDetail, preview, onUpdated }) {
  const [rows, setRows] = useState([])
  const [raceMode, setRaceMode] = useState(raceDetail?.lotteryModeDefault === 'direct' ? 'direct' : 'lottery')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState('info')
  const raceDefaultMode = raceMode

  useEffect(() => {
    setRaceMode(raceDetail?.lotteryModeDefault === 'direct' ? 'direct' : 'lottery')
  }, [raceDetail?.lotteryModeDefault])

  useEffect(() => {
    let alive = true

    lotteryApi.getRaceCapacity(Number(raceId))
      .then((capacities) => {
        if (!alive) return
        setRows(hydrateRows(capacities, raceDetail))
      })
      .catch(() => {
        if (!alive) return
        setRows(hydrateRows([], raceDetail))
      })

    return () => {
      alive = false
    }
  }, [raceDetail, raceId])

  const metrics = useMemo(() => {
    const totalTarget = rows.reduce((sum, row) => sum + toNumber(row.targetCount, 0), 0)
    const totalEstimated = rows.reduce((sum, row) => {
      const effectiveMode = resolveEffectiveMode(row, raceDefaultMode)
      if (effectiveMode === 'direct') return sum
      return sum + Math.floor(toNumber(row.targetCount, 0) * toNumber(row.drawRatio, 0))
    }, 0)
    const totalEntries = preview?.records?.total || 0

    return [
      { key: 'total', label: '报名总数', value: formatNumber(totalEntries), meta: '从预览统计读取当前赛事总报名人数。', pill: 'POOL' },
      { key: 'target', label: '目标人数', value: formatNumber(totalTarget), meta: '按项目汇总的目标通过人数。', pill: 'CAP' },
      { key: 'draw', label: '预计抽签数', value: formatNumber(totalEstimated), meta: '只统计抽签模式项目，直通模式不参与随机抽签。', pill: 'DRAW' },
    ]
  }, [preview?.records?.total, raceDefaultMode, rows])

  const updateRow = (index, field, value) => {
    setRows((current) => current.map((row, rowIndex) => {
      if (rowIndex !== index) return row

      if (field === 'drawRatio') {
        const drawRatio = toNumber(value, row.drawRatio)
        return {
          ...row,
          drawRatio,
          reservedRatio: Number((1 - drawRatio).toFixed(2)),
        }
      }

      return {
        ...row,
        [field]: field === 'targetCount' ? Math.max(0, Math.floor(toNumber(value, row[field]))) : value,
      }
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage('')
    try {
      await racesApi.update(Number(raceId), {
        lotteryModeDefault: raceMode,
      })

      const existing = await lotteryApi.getRaceCapacity(Number(raceId))
      const existingMap = new Map((existing || []).map((item) => [item.event, item]))

      for (const stale of existing || []) {
        if (!rows.some((row) => row.event === stale.event) && stale.id) {
          await lotteryApi.deleteRaceCapacity(stale.id)
        }
      }

      for (const row of rows) {
        const existingRow = existingMap.get(row.event)
        await lotteryApi.saveRaceCapacity(Number(raceId), {
          id: existingRow?.id || row.id,
          event: row.event,
          targetCount: toNumber(row.targetCount, 0),
          drawRatio: toNumber(row.drawRatio, 0.85),
          reservedRatio: toNumber(row.reservedRatio, 0.15),
          lotteryModeOverride: row.lotteryModeOverride || 'inherit',
        })
      }

      setMessage('容量定义已保存，赛事默认模式和项目覆盖已同步更新。')
      setMessageTone('success')
      onUpdated?.()
    } catch (error) {
      setMessage(`保存失败：${error.message}`)
      setMessageTone('danger')
    } finally {
      setSaving(false)
    }
  }

  if (!rows.length) {
    return (
      <CommandPanel title="容量定义" subtitle="当前赛事还没有可编辑的项目容量。">
        <CommandEmptyState
          icon="CAP"
          title="暂无容量配置"
          description="先在赛事设置里定义项目，或直接保存一次默认容量。"
        />
      </CommandPanel>
    )
  }

  return (
    <div className="lottery-step-stack">
      {message ? <CommandNotice tone={messageTone}>{message}</CommandNotice> : null}

      <CommandMetricGrid items={metrics} />

      <CommandPanel
        title="赛事默认模式"
        subtitle="赛事默认模式决定没有覆盖配置的项目走抽签还是直通。"
        actions={(
          <div className="lottery-inline-actions">
            <select
              className="lottery-select"
              value={raceDefaultMode}
              onChange={(event) => setRaceMode(event.target.value)}
            >
              <option value="lottery">抽签</option>
              <option value="direct">直通</option>
            </select>
          </div>
        )}
      >
        <div className="lottery-help-block">
          当前默认模式来自赛事配置。下面每个项目都可以用“项目模式覆盖”单独改成 `inherit / lottery / direct`，保存时会一并写回。
        </div>
      </CommandPanel>

      <div className="lottery-card-grid">
        {rows.map((row, index) => {
          const effectiveMode = resolveEffectiveMode(row, raceDefaultMode)
          const estimatedDraw = effectiveMode === 'direct'
            ? 0
            : Math.floor(toNumber(row.targetCount, 0) * toNumber(row.drawRatio, 0.85))
          const reservedCount = Math.max(toNumber(row.targetCount, 0) - estimatedDraw, 0)

          return (
            <CommandPanel
              key={row.id || row.event}
              title={row.event}
              subtitle={effectiveMode === 'direct' ? '当前生效模式：直通' : '当前生效模式：抽签'}
              className="lottery-card"
            >
              <div className="lottery-form-grid">
                <label className="lottery-field">
                  <span>目标人数</span>
                  <input
                    className="lottery-input"
                    type="number"
                    min="0"
                    value={row.targetCount}
                    onChange={(event) => updateRow(index, 'targetCount', event.target.value)}
                  />
                </label>

                <label className="lottery-field">
                  <span>项目模式覆盖</span>
                  <select
                    className="lottery-select"
                    value={row.lotteryModeOverride || 'inherit'}
                    onChange={(event) => updateRow(index, 'lotteryModeOverride', event.target.value)}
                  >
                    <option value="inherit">inherit</option>
                    <option value="lottery">lottery</option>
                    <option value="direct">direct</option>
                  </select>
                </label>
              </div>

              <label className="lottery-field">
                <span>抽签率 {Math.round(toNumber(row.drawRatio, 0.85) * 100)}%</span>
                <input
                  className="lottery-range"
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  value={row.drawRatio}
                  onChange={(event) => updateRow(index, 'drawRatio', event.target.value)}
                  disabled={effectiveMode === 'direct'}
                />
              </label>

              <div className="lottery-mini-grid">
                <div className="lottery-mini-stat">
                  <span className="lottery-mini-stat__label">预计抽签</span>
                  <strong className="lottery-mini-stat__value">{formatNumber(estimatedDraw)}</strong>
                </div>
                <div className="lottery-mini-stat">
                  <span className="lottery-mini-stat__label">预留人数</span>
                  <strong className="lottery-mini-stat__value">{formatNumber(reservedCount)}</strong>
                </div>
              </div>

              <GenderRatioConfig raceId={raceId} event={row.event} targetCount={row.targetCount} />
            </CommandPanel>
          )
        })}
      </div>

      <div className="lottery-footer-actions">
        <button className="btn btn--primary" onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : '保存容量定义'}
        </button>
      </div>
    </div>
  )
}
