import { useEffect, useMemo, useState } from 'react'
import lotteryApi from '../../../../api/lottery'
import { getEventGroupKey } from './lotteryHelpers'

function normalizeRatio(raw, fallback) {
  const value = Number(raw)
  if (!Number.isFinite(value)) return fallback
  if (value < 0) return 0
  if (value > 1) return 1
  return Number(value.toFixed(2))
}

export default function GenderRatioConfig({ raceId, event, targetCount = 0 }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState({
    id: null,
    maleRatio: 0.7,
    femaleRatio: 0.3,
  })

  const targetGroup = useMemo(() => getEventGroupKey(event), [event])

  useEffect(() => {
    let alive = true

    lotteryApi.getLotteryWeights(Number(raceId))
      .then((response) => {
        if (!alive) return
        const items = Array.isArray(response?.data) ? response.data : []
        const existing = (items || []).find((item) => (
          item.weightType === 'gender' && item.targetGroup === targetGroup
        ))

        if (!existing) {
          setConfig({ id: null, maleRatio: 0.7, femaleRatio: 0.3 })
          return
        }

        const maleRatio = normalizeRatio(existing.weightConfig?.maleRatio, 0.7)
        setConfig({
          id: existing.id || null,
          maleRatio,
          femaleRatio: normalizeRatio(existing.weightConfig?.femaleRatio, Number((1 - maleRatio).toFixed(2))),
        })
      })
      .catch(() => {
        if (!alive) return
        setConfig({ id: null, maleRatio: 0.7, femaleRatio: 0.3 })
      })

    return () => {
      alive = false
    }
  }, [raceId, targetGroup])

  const estimatedMale = Math.floor(Number(targetCount || 0) * config.maleRatio)
  const estimatedFemale = Math.max(Number(targetCount || 0) - estimatedMale, 0)

  const updateMaleRatio = (nextRatio) => {
    const maleRatio = normalizeRatio(nextRatio, config.maleRatio)
    setConfig({
      ...config,
      maleRatio,
      femaleRatio: normalizeRatio(1 - maleRatio, config.femaleRatio),
    })
  }

  const save = async () => {
    setSaving(true)
    try {
      await lotteryApi.saveLotteryWeight({
        id: config.id || undefined,
        raceId: Number(raceId),
        targetGroup,
        weightType: 'gender',
        enabled: true,
        priority: 100,
        weightConfig: {
          maleRatio: config.maleRatio,
          femaleRatio: config.femaleRatio,
        },
      })
    } catch (error) {
      alert(`保存性别比例失败：${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  const applyPreset = (maleRatio) => {
    const normalized = normalizeRatio(maleRatio, 0.7)
    setConfig({
      ...config,
      maleRatio: normalized,
      femaleRatio: normalizeRatio(1 - normalized, 0.3),
    })
  }

  return (
    <div className={`lottery-gender ${open ? 'is-open' : ''}`}>
      <button type="button" className="lottery-gender__toggle" onClick={() => setOpen((value) => !value)}>
        <span>性别比例</span>
        <strong>{Math.round(config.maleRatio * 100)} / {Math.round(config.femaleRatio * 100)}</strong>
      </button>

      {open ? (
        <div className="lottery-gender__panel">
          <div className="lottery-gender__summary">
            <span>男 {Math.round(config.maleRatio * 100)}% · 约 {estimatedMale.toLocaleString()} 人</span>
            <span>女 {Math.round(config.femaleRatio * 100)}% · 约 {estimatedFemale.toLocaleString()} 人</span>
          </div>

          <input
            className="lottery-range"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={config.maleRatio}
            onChange={(event) => updateMaleRatio(event.target.value)}
          />

          <div className="lottery-gender__presets">
            {[0.7, 0.6, 0.5, 0.4].map((ratio) => (
              <button key={ratio} type="button" className="btn btn--ghost btn--sm" onClick={() => applyPreset(ratio)}>
                {Math.round(ratio * 100)}/{Math.round((1 - ratio) * 100)}
              </button>
            ))}
            <button type="button" className="btn btn--secondary btn--sm" onClick={save} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
