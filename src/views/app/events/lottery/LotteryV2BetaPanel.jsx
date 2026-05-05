import { useEffect, useMemo, useState } from 'react'
import lotteryApi from '../../../../api/lottery'
import {
  CommandDataTable,
  CommandMetricGrid,
  CommandNotice,
  CommandPanel,
} from '../../../../components/command/CommandPrimitives'
import {
  formatNumber,
  toNumber,
} from './lotteryHelpers'

const DEFAULT_CONFIG = {
  apparelScopeMode: 'gender_size',
  sizeMatchPolicy: 'exact',
  performanceRatio: 0.3,
  genderRatio: { M: 0.6, F: 0.4 },
  regionDimension: 'province',
  regionRatios: {},
  seed: '',
  fallbackStrategy: 'same_pool',
}

function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_CONFIG }
  return {
    apparelScopeMode: raw.apparelScopeMode || DEFAULT_CONFIG.apparelScopeMode,
    sizeMatchPolicy: raw.sizeMatchPolicy || DEFAULT_CONFIG.sizeMatchPolicy,
    performanceRatio: toNumber(raw.performanceRatio, DEFAULT_CONFIG.performanceRatio),
    genderRatio: {
      M: toNumber(raw.genderRatio?.M, DEFAULT_CONFIG.genderRatio.M),
      F: toNumber(raw.genderRatio?.F, DEFAULT_CONFIG.genderRatio.F),
    },
    regionDimension: raw.regionDimension || DEFAULT_CONFIG.regionDimension,
    regionRatios: raw.regionRatios && typeof raw.regionRatios === 'object' ? raw.regionRatios : {},
    seed: String(raw.seed || ''),
    fallbackStrategy: raw.fallbackStrategy || DEFAULT_CONFIG.fallbackStrategy,
  }
}

function normalizePreview(raw) {
  if (!raw || typeof raw !== 'object') return null
  return {
    id: raw.id,
    status: raw.status || '',
    errors: Array.isArray(raw.errors) ? raw.errors : [],
    warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
    resultSummary: raw.resultSummary || {},
    createdAt: raw.createdAt || '',
    finalizedAt: raw.finalizedAt || '',
  }
}

function normalizeResults(raw) {
  if (!raw || typeof raw !== 'object') return null
  return {
    counts: raw.counts || { winners: 0, losers: 0, waitlist: 0 },
    apparelReservations: Array.isArray(raw.apparelReservations) ? raw.apparelReservations : [],
    results: Array.isArray(raw.results) ? raw.results : [],
  }
}

function parseRegionRatiosInput(text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return {}
  if (trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed)
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('地域比例 JSON 不是有效对象')
    }
    return parsed
  }

  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const output = {}
  for (const line of lines) {
    const pair = line.split(/[:=]/)
    if (pair.length < 2) {
      throw new Error(`地域比例格式错误：${line}`)
    }
    const key = String(pair[0] || '').trim()
    const value = Number(String(pair.slice(1).join(':') || '').trim())
    if (!key || !Number.isFinite(value) || value < 0) {
      throw new Error(`地域比例值无效：${line}`)
    }
    output[key] = value
  }
  return output
}

function formatRatioMap(ratios) {
  const entries = Object.entries(ratios || {})
  if (!entries.length) return ''
  return entries.map(([key, value]) => `${key}:${value}`).join('\n')
}

export default function LotteryV2BetaPanel({ raceId, onUpdated }) {
  const [config, setConfig] = useState({ ...DEFAULT_CONFIG })
  const [regionRatiosText, setRegionRatiosText] = useState('')
  const [preview, setPreview] = useState(null)
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [rollingBack, setRollingBack] = useState(false)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState('info')

  const loadAll = async () => {
    setLoading(true)
    try {
      const [cfg, latestPreview, latestResults] = await Promise.all([
        lotteryApi.getLotteryV2Config(Number(raceId)).catch(() => null),
        lotteryApi.getLotteryV2Preview(Number(raceId)).catch(() => null),
        lotteryApi.getLotteryV2Results(Number(raceId)).catch(() => null),
      ])
      const normalizedConfig = normalizeConfig(cfg)
      setConfig(normalizedConfig)
      setRegionRatiosText(formatRatioMap(normalizedConfig.regionRatios))
      setPreview(normalizePreview(latestPreview))
      setResults(normalizeResults(latestResults))
    } catch (error) {
      setMessage(`加载 V2 面板失败：${error.message}`)
      setMessageTone('danger')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [raceId])

  const canFinalize = Boolean(preview?.status === 'ready' && (!preview?.errors || preview.errors.length === 0))
  const previewSummary = preview?.resultSummary || {}

  const previewMetrics = useMemo(() => ([
    { key: 'status', label: '预演状态', value: preview?.status || '未预演', meta: '仅 ready 且无阻断错误可执行正式抽签。', pill: 'PREVIEW' },
    { key: 'winners', label: '预演中签', value: formatNumber(previewSummary.winners), meta: '不包含直通锁定。', pill: 'WIN' },
    { key: 'direct', label: '直通占用', value: formatNumber(previewSummary.directReservations), meta: `直通阻断 ${formatNumber(previewSummary.directErrors)} 条。`, pill: 'DIRECT' },
    { key: 'waitlist', label: '候选排除', value: formatNumber(previewSummary.waitlist), meta: `复核阻断 ${formatNumber(previewSummary.blockers)} 条。`, pill: 'EXCLUDE' },
  ]), [preview?.status, previewSummary.blockers, previewSummary.directErrors, previewSummary.directReservations, previewSummary.waitlist, previewSummary.winners])

  const resultMetrics = useMemo(() => ([
    { key: 'winner', label: '正式中签', value: formatNumber(results?.counts?.winners), meta: '写回 records.lottery_status=中签。', pill: 'FINAL' },
    { key: 'loser', label: '正式未中签', value: formatNumber(results?.counts?.losers), meta: '写回 records.lottery_status=未中签。', pill: 'LOSE' },
    { key: 'waitlist', label: '排除/候补', value: formatNumber(results?.counts?.waitlist), meta: '保留在 V2 结果审计中。', pill: 'WAIT' },
  ]), [results?.counts?.losers, results?.counts?.waitlist, results?.counts?.winners])

  const handleSaveConfig = async () => {
    try {
      const payload = {
        ...config,
        genderRatio: {
          M: toNumber(config.genderRatio?.M, 0),
          F: toNumber(config.genderRatio?.F, 0),
        },
        performanceRatio: toNumber(config.performanceRatio, 0),
        regionRatios: parseRegionRatiosInput(regionRatiosText),
      }
      await lotteryApi.saveLotteryV2Config(Number(raceId), payload)
      setMessage('V2 配置已保存，旧预演已标记为失效。')
      setMessageTone('success')
      await loadAll()
    } catch (error) {
      setMessage(`保存 V2 配置失败：${error.message}`)
      setMessageTone('danger')
    }
  }

  const handlePreview = async () => {
    setPreviewing(true)
    try {
      await lotteryApi.previewLotteryV2(Number(raceId), {
        onProgress: (progress) => {
          if (progress?.message) {
            setMessage(`V2 预演中：${progress.message}`)
            setMessageTone('info')
          }
        },
      })
      setMessage('V2 预演完成，已刷新预演结果。')
      setMessageTone('success')
      await loadAll()
      onUpdated?.()
    } catch (error) {
      setMessage(`V2 预演失败：${error.message}`)
      setMessageTone('danger')
    } finally {
      setPreviewing(false)
    }
  }

  const handleFinalize = async () => {
    if (!canFinalize) return
    if (!window.confirm('确认执行 Lottery V2 测试版正式抽签？将写回 records 的中签/未中签状态。')) return

    setFinalizing(true)
    try {
      await lotteryApi.finalizeLotteryV2(Number(raceId), {
        onProgress: (progress) => {
          if (progress?.message) {
            setMessage(`V2 执行中：${progress.message}`)
            setMessageTone('info')
          }
        },
      })
      setMessage('V2 正式执行完成。')
      setMessageTone('success')
      await loadAll()
      onUpdated?.()
    } catch (error) {
      setMessage(`V2 正式执行失败：${error.message}`)
      setMessageTone('danger')
    } finally {
      setFinalizing(false)
    }
  }

  const handleRollback = async () => {
    if (!window.confirm('确认回滚最近一次 V2 正式执行？仅回滚 V2 写入的数据。')) return
    setRollingBack(true)
    try {
      await lotteryApi.rollbackLotteryV2(Number(raceId))
      setMessage('V2 回滚完成。')
      setMessageTone('success')
      await loadAll()
      onUpdated?.()
    } catch (error) {
      setMessage(`V2 回滚失败：${error.message}`)
      setMessageTone('danger')
    } finally {
      setRollingBack(false)
    }
  }

  return (
    <div className="lottery-step-stack">
      {message ? <CommandNotice tone={messageTone}>{message}</CommandNotice> : null}

      <CommandPanel title="Lottery V2 Beta 配置" subtitle="衣服硬约束 > 成绩比例 > 性别比例 > 地域比例。">
        <div className="lottery-form-grid">
          <label className="lottery-field">
            服装模型
            <select className="lottery-select" value={config.apparelScopeMode} onChange={(e) => setConfig((prev) => ({ ...prev, apparelScopeMode: e.target.value }))}>
              <option value="unisex_size">按尺码（不分男女）</option>
              <option value="gender_size">按男女+尺码</option>
              <option value="event_gender_size">按项目+男女+尺码</option>
            </select>
          </label>
          <label className="lottery-field">
            成绩快比例 (0~1)
            <input className="lottery-input" type="number" step="0.01" min="0" max="1" value={config.performanceRatio} onChange={(e) => setConfig((prev) => ({ ...prev, performanceRatio: e.target.value }))} />
          </label>
          <label className="lottery-field">
            男性比例 (0~1)
            <input className="lottery-input" type="number" step="0.01" min="0" max="1" value={config.genderRatio?.M ?? 0} onChange={(e) => setConfig((prev) => ({ ...prev, genderRatio: { ...(prev.genderRatio || {}), M: e.target.value } }))} />
          </label>
          <label className="lottery-field">
            女性比例 (0~1)
            <input className="lottery-input" type="number" step="0.01" min="0" max="1" value={config.genderRatio?.F ?? 0} onChange={(e) => setConfig((prev) => ({ ...prev, genderRatio: { ...(prev.genderRatio || {}), F: e.target.value } }))} />
          </label>
          <label className="lottery-field">
            地域维度
            <select className="lottery-select" value={config.regionDimension} onChange={(e) => setConfig((prev) => ({ ...prev, regionDimension: e.target.value }))}>
              <option value="province">省</option>
              <option value="city">市</option>
              <option value="district">区县</option>
            </select>
          </label>
          <label className="lottery-field">
            回补策略
            <select className="lottery-select" value={config.fallbackStrategy} onChange={(e) => setConfig((prev) => ({ ...prev, fallbackStrategy: e.target.value }))}>
              <option value="same_pool">同池回补</option>
            </select>
          </label>
          <label className="lottery-field">
            随机种子
            <input className="lottery-input" type="text" value={config.seed} onChange={(e) => setConfig((prev) => ({ ...prev, seed: e.target.value }))} />
          </label>
        </div>
        <label className="lottery-field">
          地域比例（JSON 或每行 `地区:比例`）
          <textarea className="lottery-input lottery-v2-textarea" value={regionRatiosText} onChange={(e) => setRegionRatiosText(e.target.value)} />
        </label>
        <div className="lottery-inline-actions">
          <button className="btn btn--secondary" onClick={handleSaveConfig} disabled={loading || previewing || finalizing || rollingBack}>保存 V2 配置</button>
          <button className="btn btn--ghost" onClick={loadAll} disabled={loading || previewing || finalizing || rollingBack}>{loading ? '刷新中...' : '刷新数据'}</button>
        </div>
      </CommandPanel>

      <CommandMetricGrid items={previewMetrics} />

      {preview?.warnings?.length ? (
        <div className="lottery-warning-list">
          {preview.warnings.map((warning, index) => <div key={index}>警告：{warning}</div>)}
        </div>
      ) : null}
      {preview?.errors?.length ? (
        <div className="lottery-error-list">
          {preview.errors.map((error, index) => <div key={index}>阻断：{error}</div>)}
        </div>
      ) : null}

      {Array.isArray(previewSummary.quotaBreakdown) && previewSummary.quotaBreakdown.length ? (
        <CommandPanel title="V2 预演配额分解" subtitle="按项目展示目标、直通占用与实际预演中签。">
          <CommandDataTable>
            <thead>
              <tr>
                <th>项目</th>
                <th>目标人数</th>
                <th>直通占用</th>
                <th>抽签槽位</th>
                <th>成绩池目标</th>
                <th>普通池目标</th>
                <th>预演中签</th>
              </tr>
            </thead>
            <tbody>
              {previewSummary.quotaBreakdown.map((row, index) => (
                <tr key={`${row.event}-${index}`}>
                  <td>{row.event}</td>
                  <td>{formatNumber(row.targetCount)}</td>
                  <td>{formatNumber(row.directCount)}</td>
                  <td>{formatNumber(row.lotterySlots)}</td>
                  <td>{formatNumber(row.performanceTarget)}</td>
                  <td>{formatNumber(row.generalTarget)}</td>
                  <td>{formatNumber(row.winners)}</td>
                </tr>
              ))}
            </tbody>
          </CommandDataTable>
        </CommandPanel>
      ) : null}

      <div className="lottery-footer-actions">
        <button className="btn btn--primary" onClick={handlePreview} disabled={previewing || finalizing || rollingBack}>
          {previewing ? '预演中...' : '执行 V2 预演'}
        </button>
        <button className="btn btn--secondary" onClick={handleFinalize} disabled={!canFinalize || previewing || finalizing || rollingBack}>
          {finalizing ? '执行中...' : canFinalize ? '执行 V2 正式抽签' : '请先完成有效预演'}
        </button>
        <button className="btn btn--ghost" onClick={handleRollback} disabled={previewing || finalizing || rollingBack}>
          {rollingBack ? '回滚中...' : '回滚 V2 结果'}
        </button>
      </div>

      <CommandMetricGrid items={resultMetrics} />

      {results?.apparelReservations?.length ? (
        <CommandPanel title="服装占用汇总" subtitle="来源于 apparel_reservations（直通占用 + V2 抽签占用）。">
          <CommandDataTable>
            <thead>
              <tr>
                <th>服装 Bucket</th>
                <th>占用数量</th>
              </tr>
            </thead>
            <tbody>
              {results.apparelReservations.map((item) => (
                <tr key={item.apparelBucket}>
                  <td>{item.apparelBucket}</td>
                  <td>{formatNumber(item.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </CommandDataTable>
        </CommandPanel>
      ) : null}

      {results?.results?.length ? (
        <CommandPanel title="V2 结果明细（前 200 条）" subtitle="完整数据保留在 lottery_v2_results，可用于审计。">
          <CommandDataTable>
            <thead>
              <tr>
                <th>Record ID</th>
                <th>状态</th>
                <th>Bucket</th>
                <th>服装 Bucket</th>
                <th>原因</th>
              </tr>
            </thead>
            <tbody>
              {results.results.slice(0, 200).map((row) => (
                <tr key={row.id}>
                  <td>{row.recordId}</td>
                  <td>{row.resultStatus}</td>
                  <td>{row.bucketName}</td>
                  <td>{row.apparelBucket}</td>
                  <td>{row.reason || '-'}</td>
                </tr>
              ))}
            </tbody>
          </CommandDataTable>
        </CommandPanel>
      ) : null}
    </div>
  )
}
