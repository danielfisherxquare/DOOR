import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import useInterviewStore, { CRITERIA_DATA, SCENARIO_DATA } from '../../stores/interviewStore'
import { loadChartJs } from '../../utils/chartLoader'
import { showError, showSuccess } from '../../utils/toast'
import InterviewWorkspaceShell from './InterviewWorkspaceShell'
import { useInterviewSurface } from './useInterviewSurface'
import { getScoreTone, getTierMeta } from './interviewTheme'

function joinClassNames(...values) {
  return values.filter(Boolean).join(' ')
}

function CriteriaCard({ item, score, onScore }) {
  const tone = item.type === 'bonus' ? 'warning' : 'elite'

  return (
    <article className="interview-criteria-card" data-kind={item.type}>
      <header className="interview-criteria-card__header">
        <div className="interview-criteria-card__title-group">
          <span className="interview-criteria-card__icon" aria-hidden="true">{item.icon}</span>
          <div>
            <h4 className="interview-criteria-card__title">{item.title}</h4>
            <p className="interview-criteria-card__desc">{item.desc}</p>
          </div>
        </div>
        <span className="interview-micro-pill">{item.weight}</span>
      </header>

      <div className="interview-question-box">
        <span className="interview-question-box__icon" aria-hidden="true">●</span>
        <div className="interview-question-box__content">
          <span className="interview-question-box__label">速问</span>
          <p className="interview-question-box__text">{item.question}</p>
        </div>
      </div>

      <div className="interview-level-grid">
        <div className="interview-level-pill" data-tone="danger">
          <span><strong>1 分</strong>{item.levels[1]}</span>
        </div>
        <div className="interview-level-pill" data-tone="warning">
          <span><strong>3 分</strong>{item.levels[3]}</span>
        </div>
        <div className="interview-level-pill" data-tone="positive">
          <span><strong>5 分</strong>{item.levels[5]}</span>
        </div>
      </div>

      <div className="interview-score-row">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            className={joinClassNames('interview-score-btn', score === value && 'is-active')}
            data-tone={score === value ? getScoreTone(value) : tone}
            onClick={() => onScore(item.id, value)}
          >
            {value}
          </button>
        ))}
      </div>
    </article>
  )
}

function ScenarioPanel({ scenarioScores, onScenarioScore }) {
  const [openIndex, setOpenIndex] = useState(0)

  return (
    <div className="interview-scenario-stack">
      {SCENARIO_DATA.map((scenario, index) => {
        const score = scenarioScores[index]
        const isOpen = openIndex === index
        const tone = getScoreTone(score)

        return (
          <section
            key={scenario.title}
            className={joinClassNames('interview-scenario-item', isOpen && 'is-open')}
          >
            <button
              type="button"
              className="interview-scenario-item__trigger"
              onClick={() => setOpenIndex((current) => (current === index ? -1 : index))}
            >
              <div>
                <h4 className="interview-scenario-item__title">{scenario.title}</h4>
                <span className="interview-scenario-item__target">{scenario.target}</span>
              </div>
              <div className="interview-candidate-option__row">
                <span className="interview-score-badge" data-tone={tone}>
                  {score}/5
                </span>
                <span className="interview-scenario-item__icon" aria-hidden="true">▾</span>
              </div>
            </button>

            {isOpen ? (
              <div className="interview-scenario-item__body">
                <div className="interview-scenario-item__prompt">
                  <span className="interview-scenario-item__prompt-label">面试官提问</span>
                  <p>{scenario.q}</p>
                </div>

                <div className="interview-score-row">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={joinClassNames('interview-score-btn', score === value && 'is-active')}
                      data-tone={score === value ? getScoreTone(value) : 'neutral'}
                      onClick={() => onScenarioScore(index, value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>

                <div className="interview-level-grid">
                  <div className="interview-scenario-item__signal" data-tone="positive">
                    <span className="interview-scenario-item__signal-label">高分抓手</span>
                    <ul>
                      {scenario.green.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                  <div className="interview-scenario-item__signal" data-tone="danger">
                    <span className="interview-scenario-item__signal-label">避坑红线</span>
                    <ul>
                      {scenario.red.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                  <div className="interview-scenario-item__signal">
                    <span className="interview-scenario-item__signal-label">当前判断</span>
                    <ul>
                      <li>1-2 分：明显存在短板或缺乏真实落地经验。</li>
                      <li>3 分：具备一定经验，但仍需继续追问细节。</li>
                      <li>4-5 分：能快速给出方法、流程和落地细节。</li>
                    </ul>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}

export default function InterviewForm() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editId = searchParams.get('edit')
  const chartRef = useRef(null)
  const chartInstance = useRef(null)
  const { buildPath, surface } = useInterviewSurface()

  const {
    scores,
    scenarioScores,
    candidateName,
    interviewDate,
    interviewer,
    notes,
    editingId,
    isLoading,
    setScore,
    setScenarioScore,
    setCandidateName,
    setInterviewDate,
    setInterviewer,
    setNotes,
    getTier,
    getTotalScore,
    getBaseScore,
    getBonusScore,
    getScenarioTotal,
    getGrandTotal,
    resetForm,
    loadForEdit,
    saveInterview,
    fetchInterview,
  } = useInterviewStore()

  useEffect(() => {
    if (editId) {
      fetchInterview(editId, surface).then((data) => {
        if (data) loadForEdit(data)
      })
    }

    return () => resetForm()
  }, [editId, fetchInterview, loadForEdit, resetForm, surface])

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

  useEffect(() => {
    if (!window.Chart || !chartRef.current) return undefined

    const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2563eb'

    if (chartInstance.current) {
      chartInstance.current.destroy()
      chartInstance.current = null
    }

    chartInstance.current = new window.Chart(chartRef.current, {
      type: 'radar',
      data: {
        labels: CRITERIA_DATA.map((item) => item.title.split('与')[0]),
        datasets: [
          {
            label: '当前候选人',
            data: scores,
            backgroundColor: `${accentColor}22`,
            borderColor: accentColor,
            pointBackgroundColor: accentColor,
            pointRadius: 3,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
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
  }, [scores])

  const tierMeta = getTierMeta(getTier())
  const totalScore = getTotalScore()
  const baseScore = getBaseScore()
  const bonusScore = getBonusScore()
  const scenarioTotal = getScenarioTotal()
  const grandTotal = getGrandTotal()
  const completedScores = [...scores, ...scenarioScores].filter((value) => value > 0).length
  const completion = `${completedScores}/${scores.length + scenarioScores.length}`

  const stats = [
    { label: editingId ? '编辑模式' : '当前模式', value: editingId ? '更新中' : '新建中', meta: editingId ? '正在复核已有候选人记录' : '可直接录入新的候选人评估', tone: 'neutral' },
    { label: '评分完成度', value: completion, meta: '8 个能力项 + 4 个场景项', tone: 'warning' },
    { label: '当前评级', value: tierMeta.label, meta: tierMeta.title, tone: tierMeta.tone },
    { label: '综合总分', value: `${grandTotal}/60`, meta: '八维评分 + 场景压测', tone: 'elite' },
  ]

  const handleSave = async () => {
    const result = await saveInterview(surface)
    if (!result.success) {
      showError(result.error || '保存失败')
      return
    }

    showSuccess(editingId ? '面试记录已更新' : '面试记录已保存')
    navigate(buildPath('/records'))
  }

  const handleReset = () => {
    resetForm()
  }

  return (
    <InterviewWorkspaceShell
      eyebrow={editingId ? '更新候选人' : '新建候选人'}
      title={editingId ? '更新面试评估' : '创建面试评估'}
      summary="统一记录候选人的八维评分、场景压测和补充备注，让即时判断和后续复盘使用同一份面板。"
      stats={stats}
      actions={(
        <>
          <Link to={buildPath('/records')} className="interview-button interview-button--ghost">
            查看记录
          </Link>
          <Link to={buildPath('/compare')} className="interview-button">
            候选人对比
          </Link>
        </>
      )}
    >
      <section className="interview-grid interview-grid--form">
        <div className="interview-form-stack">
          <section className="interview-panel">
            <div className="interview-section-heading">
              <div>
                <h3>基础信息</h3>
                <p>先锁定候选人和本次面试上下文，再进入详细评分。</p>
              </div>
            </div>

            <div className="interview-meta-grid">
              <label className="interview-field">
                <span className="interview-field__label">候选人姓名</span>
                <input
                  className="interview-input"
                  type="text"
                  value={candidateName}
                  onChange={(event) => setCandidateName(event.target.value)}
                  placeholder="输入候选人姓名"
                />
              </label>
              <label className="interview-field">
                <span className="interview-field__label">面试日期</span>
                <input
                  className="interview-input"
                  type="date"
                  value={interviewDate}
                  onChange={(event) => setInterviewDate(event.target.value)}
                />
              </label>
              <label className="interview-field">
                <span className="interview-field__label">面试官</span>
                <input
                  className="interview-input"
                  type="text"
                  value={interviewer}
                  onChange={(event) => setInterviewer(event.target.value)}
                  placeholder="输入面试官姓名"
                />
              </label>
            </div>

            <div className="interview-callout">
              <span className="interview-callout__title">评估建议</span>
              <p className="interview-callout__body">
                先使用每个能力项中的“速问”快速摸底，再用分级描述校准判断。若候选人回答模糊，再切到下方场景压测继续追问。
              </p>
            </div>
          </section>

          <section className="interview-panel">
            <div className="interview-section-heading">
              <div>
                <h3>核心六维</h3>
                <p>优先判断视觉基础、软件效能、印前落地和大型赛事物料的真实经验。</p>
              </div>
            </div>

            <div className="interview-criteria-list">
              {CRITERIA_DATA.filter((item) => item.type === 'core').map((item) => (
                <CriteriaCard key={item.id} item={item} score={scores[item.id]} onScore={setScore} />
              ))}
            </div>
          </section>

          <section className="interview-panel">
            <div className="interview-section-heading">
              <div>
                <h3>高阶加分项</h3>
                <p>用于判断候选人是否具备 3D 表现或 AI 辅助设计等超额能力。</p>
              </div>
            </div>

            <div className="interview-criteria-list">
              {CRITERIA_DATA.filter((item) => item.type === 'bonus').map((item) => (
                <CriteriaCard key={item.id} item={item} score={scores[item.id]} onScore={setScore} />
              ))}
            </div>
          </section>

          <section className="interview-panel">
            <div className="interview-section-heading">
              <div>
                <h3>场景压测</h3>
                <p>当“速问”无法确认水平时，用极限场景继续追问候选人的真实落地能力。</p>
              </div>
            </div>

            <ScenarioPanel scenarioScores={scenarioScores} onScenarioScore={setScenarioScore} />

            <div className="interview-scenario-summary">
              {SCENARIO_DATA.map((scenario, index) => (
                <article key={scenario.title} className="interview-scenario-summary__card">
                  <span className="interview-scenario-summary__index">场景 {index + 1}</span>
                  <strong
                    className="interview-scenario-summary__score"
                    data-tone={getScoreTone(scenarioScores[index])}
                  >
                    {scenarioScores[index]}
                  </strong>
                  <span className="interview-stat-card__meta">{scenario.target}</span>
                </article>
              ))}
            </div>
          </section>

          <section className="interview-panel">
            <div className="interview-section-heading">
              <div>
                <h3>补充备注</h3>
                <p>记录候选人的临场表现、沟通状态或面试中的额外观察。</p>
              </div>
            </div>

            <label className="interview-field">
              <span className="interview-field__label">备注</span>
              <textarea
                className="interview-textarea"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="例如：对导视逻辑理解很强，但印前追色经验仍需继续确认。"
              />
            </label>
          </section>

          <section className="interview-panel">
            <div className="interview-action-row">
              <div className="interview-panel__title-wrap">
                <h3 className="interview-panel__title">提交本次评估</h3>
                <p className="interview-panel__subtitle">保存后会写入记录台账，可立即进入对比页继续筛选。</p>
              </div>
              <div className="interview-record-card__actions">
                <button
                  type="button"
                  className="interview-button interview-button--ghost"
                  onClick={handleReset}
                >
                  重置
                </button>
                <button
                  type="button"
                  className="interview-button interview-button--primary"
                  onClick={handleSave}
                  disabled={isLoading}
                >
                  {isLoading ? '保存中...' : editingId ? '更新面试记录' : '保存面试记录'}
                </button>
              </div>
            </div>
          </section>
        </div>

        <aside className="interview-form-stack">
          <section className="interview-panel interview-panel--sticky interview-summary-card">
            <div className="interview-panel__header">
              <div className="interview-panel__title-wrap">
                <h3 className="interview-panel__title">即时评估雷达</h3>
                <p className="interview-panel__subtitle">分数每次变动都会即时映射到结构雷达和综合评级。</p>
              </div>
            </div>

            <div className="interview-chart-wrap">
              <canvas ref={chartRef} />
            </div>

            <div className="interview-summary-metrics">
              <article className="interview-summary-metric">
                <span className="interview-summary-metric__label">八维评分</span>
                <strong className="interview-summary-metric__value">{totalScore}</strong>
                <span className="interview-summary-metric__meta">基础 {baseScore} / 加分 {bonusScore}</span>
              </article>
              <article className="interview-summary-metric">
                <span className="interview-summary-metric__label">场景压测</span>
                <strong className="interview-summary-metric__value">{scenarioTotal}</strong>
                <span className="interview-summary-metric__meta">4 个场景合计 / 20</span>
              </article>
              <article className="interview-summary-metric">
                <span className="interview-summary-metric__label">综合总分</span>
                <strong className="interview-summary-metric__value">{grandTotal}</strong>
                <span className="interview-summary-metric__meta">总分上限 60</span>
              </article>
            </div>

            <div className="interview-tier-panel" data-tone={tierMeta.tone}>
              <div className="interview-tier-panel__headline">
                <span className="interview-tier-badge" data-tone={tierMeta.tone}>{tierMeta.label}</span>
                <h4 className="interview-tier-panel__title">{tierMeta.title}</h4>
              </div>
              <p className="interview-tier-panel__desc">{tierMeta.description}</p>
              <ul className="interview-tip-list">
                <li>八维评分以专业能力为主，适合快速判断“是否能上手”。</li>
                <li>场景压测优先验证候选人的工程化意识和极限交付经验。</li>
                <li>若分数接近，可进入“候选人对比”页继续看结构差异。</li>
              </ul>
            </div>
          </section>
        </aside>
      </section>
    </InterviewWorkspaceShell>
  )
}
