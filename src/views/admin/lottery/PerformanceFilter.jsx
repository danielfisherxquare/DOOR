import { useEffect, useMemo, useState } from 'react'
import pipelineApi from '../../../api/pipeline'
import {
  CommandMetricGrid,
  CommandNotice,
  CommandPanel,
} from '../../../components/command/CommandPrimitives'
import { getEventLabel, toNumber } from './lotteryHelpers'

function buildDefaultRules(raceDetail, raceId) {
  const events = Array.isArray(raceDetail?.events) ? raceDetail.events : []
  if (!events.length) {
    return [
      { raceId: Number(raceId), event: '马拉松', minTime: '', maxTime: '06:00:00', priorityRatio: 0.6 },
      { raceId: Number(raceId), event: '半程马拉松', minTime: '', maxTime: '03:00:00', priorityRatio: 0.6 },
    ]
  }

  return events.map((event) => ({
    raceId: Number(raceId),
    event: getEventLabel(event?.name),
    minTime: '',
    maxTime: getEventLabel(event?.name).includes('半') ? '03:00:00' : '06:00:00',
    priorityRatio: 0.6,
  }))
}

export default function PerformanceFilter({ raceId, raceDetail, preview, onUpdated }) {
  const [rules, setRules] = useState([])
  const [saving, setSaving] = useState(false)
  const [filtering, setFiltering] = useState(false)
  const [result, setResult] = useState(null)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState('info')

  useEffect(() => {
    let alive = true

    pipelineApi.getPerformanceRules(Number(raceId))
      .then((items) => {
        if (!alive) return
        setRules(items?.length ? items : buildDefaultRules(raceDetail, raceId))
      })
      .catch(() => {
        if (!alive) return
        setRules(buildDefaultRules(raceDetail, raceId))
      })

    return () => {
      alive = false
    }
  }, [raceDetail, raceId])

  const metrics = useMemo(() => ([
    { key: 'passed', label: '清洗通过', value: (preview?.records?.passed || 0).toLocaleString(), meta: '已通过五步清洗且可进入成绩筛选的人数。', pill: 'PASS' },
    { key: 'qualified', label: '已标记达标', value: (preview?.records?.qualified || 0).toLocaleString(), meta: '当前已被标成 qualified_time 的人数。', pill: 'TIME' },
    { key: 'rules', label: '筛选规则', value: rules.length.toLocaleString(), meta: '每个项目独立维护成绩门槛和优先比例。', pill: 'RULE' },
  ]), [preview?.records?.passed, preview?.records?.qualified, rules.length])

  const updateRule = (index, field, value) => {
    setRules((current) => current.map((rule, ruleIndex) => (
      ruleIndex === index
        ? {
          ...rule,
          [field]: field === 'priorityRatio' ? toNumber(value, rule.priorityRatio) : value,
        }
        : rule
    )))
  }

  const persistRules = async () => {
    for (const rule of rules) {
      await pipelineApi.savePerformanceRule({
        ...rule,
        raceId: Number(raceId),
      })
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage('')
    try {
      await persistRules()
      setMessage('成绩门槛与优先比例已保存。')
      setMessageTone('success')
      onUpdated?.()
    } catch (error) {
      setMessage(`保存失败：${error.message}`)
      setMessageTone('danger')
    } finally {
      setSaving(false)
    }
  }

  const handleRunFilter = async () => {
    setFiltering(true)
    setMessage('')
    try {
      await persistRules()
      const data = await pipelineApi.filterPerformance(Number(raceId))
      setResult(data)
      setMessage('成绩筛选已执行，达标人数和无成绩人数已重新统计。')
      setMessageTone('success')
      onUpdated?.()
    } catch (error) {
      setMessage(`执行失败：${error.message}`)
      setMessageTone('danger')
    } finally {
      setFiltering(false)
    }
  }

  return (
    <div className="lottery-step-stack">
      {message ? <CommandNotice tone={messageTone}>{message}</CommandNotice> : null}

      <CommandMetricGrid items={metrics} />

      <div className="lottery-card-grid">
        {rules.map((rule, index) => (
          <CommandPanel key={rule.id || rule.event} title={rule.event} subtitle="设定达标门槛和优先录取比例。">
            <div className="lottery-form-grid">
              <label className="lottery-field">
                <span>成绩上限</span>
                <input
                  className="lottery-input"
                  value={rule.maxTime || ''}
                  onChange={(event) => updateRule(index, 'maxTime', event.target.value)}
                  placeholder="HH:MM:SS"
                />
              </label>

              <label className="lottery-field">
                <span>成绩下限</span>
                <input
                  className="lottery-input"
                  value={rule.minTime || ''}
                  onChange={(event) => updateRule(index, 'minTime', event.target.value)}
                  placeholder="可留空"
                />
              </label>
            </div>

            <label className="lottery-field">
              <span>优先比例 {Math.round(toNumber(rule.priorityRatio, 0.6) * 100)}%</span>
              <input
                className="lottery-range"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={rule.priorityRatio}
                onChange={(event) => updateRule(index, 'priorityRatio', event.target.value)}
              />
            </label>
          </CommandPanel>
        ))}
      </div>

      {result ? (
        <CommandPanel title="筛选结果" subtitle="执行后会更新 qualified_time 标记，抽签阶段将以这个结果作为优先池输入。">
          <div className="lottery-mini-grid lottery-mini-grid--three">
            <div className="lottery-mini-stat"><span className="lottery-mini-stat__label">达标</span><strong className="lottery-mini-stat__value">{(result.qualifiedCount || 0).toLocaleString()}</strong></div>
            <div className="lottery-mini-stat"><span className="lottery-mini-stat__label">未达标</span><strong className="lottery-mini-stat__value">{(result.unqualifiedCount || 0).toLocaleString()}</strong></div>
            <div className="lottery-mini-stat"><span className="lottery-mini-stat__label">无成绩</span><strong className="lottery-mini-stat__value">{(result.noTimeCount || 0).toLocaleString()}</strong></div>
          </div>
        </CommandPanel>
      ) : null}

      <div className="lottery-footer-actions">
        <button className="btn btn--secondary" onClick={handleSave} disabled={saving || filtering}>
          {saving ? '保存中...' : '仅保存规则'}
        </button>
        <button className="btn btn--primary" onClick={handleRunFilter} disabled={filtering || saving}>
          {filtering ? '筛选中...' : '执行成绩筛选'}
        </button>
      </div>
    </div>
  )
}
