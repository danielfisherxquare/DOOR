import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchAllRecords } from '../../../../api/records'
import {
  AppH5DataCard,
  AppH5DataTable,
  AppH5EmptyState,
  AppH5Notice,
  AppH5Panel,
  AppH5StatusTag,
} from '../../../../components/app/AppH5Surface'

/**
 * 选手处理状态概览面板
 *
 * 替代原先在 ProcessingCenterPage 中复用的 RecordsOverviewPanel，
 * 提供按 lotteryStatus 分组的汇总统计，
 * 让"名单管理"和"名单处理"形成差异化定位。
 */

const STATUS_LABELS = {
  '直通名额': { tone: 'success', icon: '✓', group: '已锁定' },
  '强制保签': { tone: 'success', icon: '★', group: '已锁定' },
  '不予通过': { tone: 'danger', icon: '✕', group: '已剔除' },
  '模糊剔除': { tone: 'danger', icon: '≈', group: '已剔除' },
  '强制剔除': { tone: 'danger', icon: '⊘', group: '已剔除' },
  '大众池': { tone: 'neutral', icon: '⚡', group: '待抽签' },
  '中签': { tone: 'success', icon: '🎉', group: '已出结果' },
  '未中签': { tone: 'warning', icon: '—', group: '已出结果' },
}

export default function ProcessingOverviewPanel({ raceId, currentRace, refreshKey }) {
  const [statusCounts, setStatusCounts] = useState({})
  const [totalRecords, setTotalRecords] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const loadStatusDistribution = useCallback(async () => {
    if (!raceId) return

    setLoading(true)
    setError(null)
    try {
      const records = await fetchAllRecords(raceId)
      setTotalRecords(records.length)

      const counts = {}
      records.forEach((record) => {
        const status = record.lotteryStatus || '待处理'
        counts[status] = (counts[status] || 0) + 1
      })
      setStatusCounts(counts)
    } catch (err) {
      setError(err.message)
      setStatusCounts({})
      setTotalRecords(0)
    } finally {
      setLoading(false)
    }
  }, [raceId])

  useEffect(() => {
    loadStatusDistribution()
  }, [loadStatusDistribution, refreshKey])

  const statusEntries = useMemo(() => {
    return Object.entries(statusCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([status, count]) => {
        const meta = STATUS_LABELS[status] || { tone: 'neutral', icon: '?', group: '其他' }
        return { status, count, ...meta }
      })
  }, [statusCounts])

  const pendingCount = statusCounts['待处理'] || 0
  const lockedCount = statusEntries
    .filter((item) => item.group === '已锁定')
    .reduce((sum, item) => sum + item.count, 0)
  const removedCount = statusEntries
    .filter((item) => item.group === '已剔除')
    .reduce((sum, item) => sum + item.count, 0)

  return (
    <div className="processing-stack">
      {error ? <AppH5Notice tone="danger">{`加载失败：${error}`}</AppH5Notice> : null}

      <AppH5Panel
        title="处理进度概览"
        subtitle={currentRace ? `当前赛事：${currentRace.name}` : `赛事 ID：${raceId}`}
        actions={(
          <div className="processing-inline-actions">
            <button
              className="btn btn--secondary"
              onClick={() => loadStatusDistribution()}
              disabled={loading}
            >
              {loading ? '刷新中...' : '刷新统计'}
            </button>
          </div>
        )}
      >
        {loading ? (
          <AppH5Notice tone="info">正在统计选手处理状态分布...</AppH5Notice>
        ) : totalRecords === 0 ? (
          <AppH5EmptyState
            icon="EMP"
            title="暂无选手数据"
            description="当前赛事还没有导入选手名单，请先进行名单导入。"
          />
        ) : (
          <>
            <div className="pipeline-event-grid">
              <article className="pipeline-event-card">
                <div className="pipeline-event-title-row">
                  <strong>总记录</strong>
                  <AppH5StatusTag tone="neutral">{totalRecords} 人</AppH5StatusTag>
                </div>
                <div className="pipeline-event-stats">
                  <span>所有已导入的选手记录</span>
                </div>
              </article>
              <article className="pipeline-event-card">
                <div className="pipeline-event-title-row">
                  <strong>待处理</strong>
                  <AppH5StatusTag tone="warning">{pendingCount} 人</AppH5StatusTag>
                </div>
                <div className="pipeline-event-stats">
                  <span>尚未经过黑白名单或清洗流水线处理</span>
                </div>
              </article>
              <article className="pipeline-event-card">
                <div className="pipeline-event-title-row">
                  <strong>已锁定</strong>
                  <AppH5StatusTag tone="success">{lockedCount} 人</AppH5StatusTag>
                </div>
                <div className="pipeline-event-stats">
                  <span>直通名额 + 强制保签</span>
                </div>
              </article>
              <article className="pipeline-event-card">
                <div className="pipeline-event-title-row">
                  <strong>已剔除</strong>
                  <AppH5StatusTag tone="danger">{removedCount} 人</AppH5StatusTag>
                </div>
                <div className="pipeline-event-stats">
                  <span>不予通过 + 模糊剔除 + 强制剔除</span>
                </div>
              </article>
            </div>

            <div className="processing-status-detail">
              <AppH5DataTable
                mobileCards={statusEntries.map(({ status, count, tone, group }) => (
                  <AppH5DataCard
                    key={status}
                    eyebrow="处理状态"
                    title={status}
                    meta={<AppH5StatusTag tone={tone}>{count.toLocaleString()} 人</AppH5StatusTag>}
                    fields={[
                      { key: 'status', label: '状态', value: status },
                      { key: 'count', label: '人数', value: count.toLocaleString() },
                      { key: 'ratio', label: '占比', value: totalRecords > 0 ? ((count / totalRecords) * 100).toFixed(1) + '%' : '—' },
                      { key: 'group', label: '分组', value: group },
                    ]}
                  />
                ))}
              >
                <table>
                <thead>
                  <tr>
                    <th>状态</th>
                    <th>人数</th>
                    <th>占比</th>
                    <th>分组</th>
                  </tr>
                </thead>
                <tbody>
                  {statusEntries.map(({ status, count, tone, group }) => (
                    <tr key={status}>
                      <td>
                        <AppH5StatusTag tone={tone}>{status}</AppH5StatusTag>
                      </td>
                      <td>{count.toLocaleString()}</td>
                      <td>{totalRecords > 0 ? `${((count / totalRecords) * 100).toFixed(1)}%` : '—'}</td>
                      <td>{group}</td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </AppH5DataTable>
            </div>
          </>
        )}
      </AppH5Panel>
    </div>
  )
}
