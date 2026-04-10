import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import useInterviewStore, { CRITERIA_DATA } from '../../stores/interviewStore'
import { loadChartJs } from '../../utils/chartLoader'
import { normalizeInterviewDate } from '../../utils/beijingDate'
import { showInfo } from '../../utils/toast'
import InterviewWorkspaceShell from './InterviewWorkspaceShell'
import { useInterviewSurface } from './useInterviewSurface'
import {
  average,
  COMPARE_SWATCHES,
  getScoreTone,
  summarizeInterview,
} from './interviewTheme'

export default function InterviewCompare() {
  const { interviews, isLoading, fetchInterviews } = useInterviewStore()
  const { buildPath } = useInterviewSurface()
  const chartRef = useRef(null)
  const chartInstance = useRef(null)
  const [selectedIds, setSelectedIds] = useState([])

  useEffect(() => {
    fetchInterviews()
  }, [fetchInterviews])

  useEffect(() => {
    let cancelled = false

    loadChartJs().then((Chart) => {
      if (!cancelled) {
        window.Chart = Chart
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  const selectedInterviews = useMemo(
    () => interviews.filter((item) => selectedIds.includes(item.id)),
    [interviews, selectedIds],
  )

  const compareRows = useMemo(
    () => selectedInterviews.map((interview) => ({
      interview,
      summary: summarizeInterview(interview),
    })),
    [selectedInterviews],
  )

  useEffect(() => {
    if (!window.Chart || !chartRef.current || !compareRows.length) {
      if (chartInstance.current) {
        chartInstance.current.destroy()
        chartInstance.current = null
      }
      return
    }

    const datasets = compareRows.map(({ interview, summary }, index) => {
      const swatch = COMPARE_SWATCHES[index % COMPARE_SWATCHES.length]
      return {
        label: interview.candidate_name,
        data: summary.scores,
        backgroundColor: swatch.bg,
        borderColor: swatch.border,
        pointBackgroundColor: swatch.border,
        pointRadius: 3,
        borderWidth: 2,
      }
    })

    if (chartInstance.current) {
      chartInstance.current.destroy()
      chartInstance.current = null
    }

    chartInstance.current = new window.Chart(chartRef.current, {
      type: 'radar',
      data: {
        labels: CRITERIA_DATA.map((item) => item.title.split('与')[0]),
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              usePointStyle: true,
              padding: 18,
              color: '#57534e',
              font: { size: 12, weight: '600' },
            },
          },
        },
        scales: {
          r: {
            angleLines: { color: 'rgba(0, 0, 0, 0.08)' },
            grid: { color: 'rgba(0, 0, 0, 0.08)' },
            pointLabels: {
              color: '#57534e',
              font: { size: 11, weight: '600' },
            },
            suggestedMin: 0,
            suggestedMax: 5,
            ticks: { display: false, stepSize: 1 },
          },
        },
      },
    })

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy()
        chartInstance.current = null
      }
    }
  }, [compareRows])

  const stats = useMemo(() => {
    const highestScore = compareRows.length
      ? Math.max(...compareRows.map(({ summary }) => summary.grandTotal))
      : 0

    return [
      { label: '已选候选人', value: `${selectedIds.length}/5`, meta: '最多同时对比 5 人', tone: 'neutral' },
      {
        label: '平均综合分',
        value: compareRows.length ? average(compareRows.map(({ summary }) => summary.grandTotal)).toFixed(1) : '0.0',
        meta: '用于看整体梯队是否均衡',
        tone: 'warning',
      },
      {
        label: '最高综合分',
        value: highestScore,
        meta: compareRows.length ? '当前候选人池中的最高分' : '请先选择候选人',
        tone: 'elite',
      },
      {
        label: '推荐比例',
        value: compareRows.filter(({ interview }) => ['S', 'A'].includes(interview.tier)).length,
        meta: 'S / A 评级数量',
        tone: 'positive',
      },
    ]
  }, [compareRows, selectedIds.length])

  const handleSelect = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds((current) => current.filter((item) => item !== id))
      return
    }

    if (selectedIds.length >= 5) {
      showInfo('最多同时对比 5 位候选人')
      return
    }

    setSelectedIds((current) => [...current, id])
  }

  return (
    <InterviewWorkspaceShell
      eyebrow="结构对比"
      title="候选人对比视图"
      summary="把八维评分和场景压测放到同一张比较面板里，先看总分，再看能力结构和明显短板。"
      stats={stats}
      actions={(
        <>
          <Link to={buildPath('/records')} className="interview-button interview-button--ghost">
            查看记录
          </Link>
          <Link to={buildPath()} className="interview-button interview-button--primary">
            新建面试
          </Link>
        </>
      )}
    >
      <section className="interview-grid interview-grid--compare">
        <aside className="interview-panel interview-panel--sticky">
          <div className="interview-panel__header">
            <div className="interview-panel__title-wrap">
              <h3 className="interview-panel__title">候选人池</h3>
              <p className="interview-panel__subtitle">从记录中选择候选人，系统会即时刷新结构雷达和逐项得分表。</p>
            </div>
          </div>

          {isLoading ? (
            <div className="interview-loading-state">
              <p className="interview-empty-state__title">正在同步候选人数据</p>
              <p className="interview-empty-state__copy">请稍候，列表即将可用。</p>
            </div>
          ) : interviews.length === 0 ? (
            <div className="interview-empty-state">
              <p className="interview-empty-state__title">还没有可对比的候选人</p>
              <p className="interview-empty-state__copy">先创建面试记录，再回到对比页查看结构差异。</p>
            </div>
          ) : (
            <div className="interview-candidate-list">
              {interviews.map((interview) => {
                const summary = summarizeInterview(interview)
                const isActive = selectedIds.includes(interview.id)
                const disabled = selectedIds.length >= 5 && !isActive

                return (
                  <button
                    key={interview.id}
                    type="button"
                    className={`interview-candidate-option ${isActive ? 'is-active' : ''}`}
                    onClick={() => handleSelect(interview.id)}
                    disabled={disabled}
                  >
                    <div className="interview-candidate-option__row">
                      <span className="interview-candidate-option__title">{interview.candidate_name}</span>
                      <span className="interview-candidate-tier" data-tone={summary.tierMeta.tone}>
                        {summary.tierMeta.label}
                      </span>
                    </div>
                    <div className="interview-candidate-option__row">
                      <span className="interview-candidate-option__meta">
                        {normalizeInterviewDate(interview.interview_date)}
                      </span>
                      <span className="interview-candidate-option__meta">{summary.grandTotal} 分</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </aside>

        <div className="interview-compare-stack">
          {compareRows.length === 0 ? (
            <section className="interview-empty-state">
              <p className="interview-empty-state__title">先从左侧挑选候选人</p>
              <p className="interview-empty-state__copy">
                建议优先对比同一岗位或同一轮面试的候选人，这样八维结构差异会更有参考价值。
              </p>
            </section>
          ) : (
            <>
              <section className="interview-panel interview-chart-panel">
                <div className="interview-panel__header">
                  <div className="interview-panel__title-wrap">
                    <h3 className="interview-panel__title">能力雷达</h3>
                    <p className="interview-panel__subtitle">同一张雷达图里同时对比各候选人的核心能力密度。</p>
                  </div>
                </div>
                <div className="interview-chart-panel__canvas">
                  <canvas ref={chartRef} />
                </div>
              </section>

              <section className="interview-panel">
                <div className="interview-panel__header">
                  <div className="interview-panel__title-wrap">
                    <h3 className="interview-panel__title">逐项得分表</h3>
                    <p className="interview-panel__subtitle">先横向看维度，再纵向看每位候选人的分数波动。</p>
                  </div>
                </div>

                <div className="interview-table-wrap">
                  <table className="interview-table">
                    <thead>
                      <tr>
                        <th>能力维度</th>
                        {compareRows.map(({ interview }, index) => (
                          <th key={interview.id}>
                            <span style={{ color: COMPARE_SWATCHES[index % COMPARE_SWATCHES.length].border }}>
                              {interview.candidate_name}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {CRITERIA_DATA.map((criteria) => (
                        <tr key={criteria.id}>
                          <td>{criteria.icon} {criteria.title}</td>
                          {compareRows.map(({ interview, summary }) => (
                            <td key={`${interview.id}-${criteria.id}`}>
                              <span
                                className="interview-score-badge"
                                data-tone={getScoreTone(summary.scores[criteria.id])}
                              >
                                {summary.scores[criteria.id] || '-'}
                              </span>
                            </td>
                          ))}
                        </tr>
                      ))}
                      <tr>
                        <td>场景压测</td>
                        {compareRows.map(({ interview, summary }) => (
                          <td key={`${interview.id}-scenario`}>
                            <span
                              className="interview-score-badge"
                              data-tone={getScoreTone(summary.scenarioTotal / 4)}
                            >
                              {summary.scenarioTotal}
                            </span>
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td>综合总分</td>
                        {compareRows.map(({ interview, summary }) => (
                          <td key={`${interview.id}-grand`}>
                            <span className="interview-score-badge" data-tone={summary.tierMeta.tone}>
                              {summary.grandTotal}
                            </span>
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>
      </section>
    </InterviewWorkspaceShell>
  )
}
