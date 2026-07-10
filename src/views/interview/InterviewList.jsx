import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import useInterviewStore from '../../stores/interviewStore'
import { normalizeInterviewDate } from '../../utils/beijingDate'
import { showError, showSuccess } from '../../utils/toast'
import InterviewWorkspaceShell from './InterviewWorkspaceShell'
import { useInterviewSurface } from './useInterviewSurface'
import { average, summarizeInterview } from './interviewTheme'

export default function InterviewList() {
  const navigate = useNavigate()
  const { buildPath, surface } = useInterviewSurface()
  const { interviews, isLoading, fetchInterviews, deleteInterview } = useInterviewStore()
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  useEffect(() => {
    fetchInterviews(surface)
  }, [fetchInterviews, surface])

  const stats = useMemo(() => {
    const recommendedCount = interviews.filter((item) => ['S', 'A'].includes(item.tier)).length
    const averagePrimary = interviews.length ? average(interviews.map((item) => item.total_score)).toFixed(1) : '0.0'
    const averageGrand = interviews.length
      ? average(interviews.map((item) => summarizeInterview(item).grandTotal)).toFixed(1)
      : '0.0'

    const latestInterview = [...interviews]
      .sort((left, right) => new Date(right.interview_date) - new Date(left.interview_date))[0]

    return [
      { label: '记录总数', value: interviews.length, meta: '已归档候选人评估', tone: 'neutral' },
      { label: '推荐录用', value: recommendedCount, meta: '当前评级为 S / A 的候选人', tone: 'positive' },
      { label: '平均八维', value: averagePrimary, meta: '核心与加分项平均分 / 40', tone: 'warning' },
      {
        label: '平均综合分',
        value: averageGrand,
        meta: latestInterview ? `最近面试：${normalizeInterviewDate(latestInterview.interview_date)}` : '暂无最近记录',
        tone: 'elite',
      },
    ]
  }, [interviews])

  const handleDelete = async (id) => {
    const result = await deleteInterview(id, surface)
    if (!result.success) {
      showError(result.error || '删除面试记录失败')
      return
    }

    setDeleteConfirm(null)
    showSuccess('面试记录已删除')
  }

  return (
    <InterviewWorkspaceShell
      eyebrow="记录总览"
      title="面试记录台账"
      summary="把候选人的即时评分、场景压测和补充备注统一收进同一条记录链路，方便回放、复核和二次筛选。"
      stats={stats}
      actions={(
        <>
          <Link to={buildPath('/compare')} className="interview-button interview-button--ghost">
            去做对比
          </Link>
          <Link to={buildPath()} className="interview-button interview-button--primary">
            新建面试
          </Link>
        </>
      )}
    >
      {isLoading ? (
        <section className="interview-loading-state">
          <p className="interview-empty-state__title">正在加载面试记录</p>
          <p className="interview-empty-state__copy">请稍候，系统正在同步候选人评分台账。</p>
        </section>
      ) : interviews.length === 0 ? (
        <section className="interview-empty-state">
          <p className="interview-empty-state__title">还没有任何面试记录</p>
          <p className="interview-empty-state__copy">
            建议先从“面试面板”创建第一条评估，再回到这里统一复盘候选人分数和备注。
          </p>
          <Link to={buildPath()} className="interview-button interview-button--primary">
            创建第一条记录
          </Link>
        </section>
      ) : (
        <section className="interview-grid interview-grid--records">
          {interviews.map((interview) => {
            const summary = summarizeInterview(interview)

            return (
              <article key={interview.id} className="interview-record-card">
                <div className="interview-record-card__head">
                  <div>
                    <h3 className="interview-record-card__title">{interview.candidate_name}</h3>
                    <p className="interview-record-card__meta">
                      {normalizeInterviewDate(interview.interview_date)}
                      {interview.interviewer ? ` · 面试官 ${interview.interviewer}` : ''}
                    </p>
                  </div>
                  <span className="interview-tier-badge" data-tone={summary.tierMeta.tone}>
                    {summary.tierMeta.label}
                  </span>
                </div>

                <div className="interview-record-card__score-grid">
                  <div className="interview-record-card__score-box">
                    <span className="interview-record-card__score-label">八维评分</span>
                    <strong className="interview-record-card__score-value">{summary.primaryTotal}</strong>
                    <span className="interview-record-card__meta">基础 {summary.baseScore} / 加分 {summary.bonusScore}</span>
                  </div>
                  <div className="interview-record-card__score-box">
                    <span className="interview-record-card__score-label">场景压测</span>
                    <strong className="interview-record-card__score-value">{summary.scenarioTotal}</strong>
                    <span className="interview-record-card__meta">4 个场景合计 / 20</span>
                  </div>
                  <div className="interview-record-card__score-box">
                    <span className="interview-record-card__score-label">综合总分</span>
                    <strong className="interview-record-card__score-value">{summary.grandTotal}</strong>
                    <span className="interview-record-card__meta">{summary.tierMeta.title}</span>
                  </div>
                </div>

                {interview.notes ? (
                  <p className="interview-record-card__notes">{interview.notes}</p>
                ) : null}

                <div className="interview-record-card__actions">
                  <button
                    type="button"
                    className="interview-button interview-button--ghost"
                    onClick={() => navigate(`${buildPath()}?edit=${interview.id}`)}
                  >
                    编辑记录
                  </button>
                  <Link to={buildPath('/compare')} className="interview-button">
                    打开对比台
                  </Link>
                  <button
                    type="button"
                    className="interview-button interview-button--danger"
                    onClick={() => setDeleteConfirm(interview.id)}
                  >
                    删除
                  </button>
                </div>
              </article>
            )
          })}
        </section>
      )}

      {deleteConfirm ? (
        <div className="interview-modal" onClick={() => setDeleteConfirm(null)}>
          <div className="interview-modal__panel" onClick={(event) => event.stopPropagation()}>
            <h3 className="interview-modal__title">删除这条面试记录？</h3>
            <p className="interview-modal__copy">
              删除后将同时移除该候选人的评分、场景压测和备注，且无法恢复。
            </p>
            <div className="interview-modal__actions">
              <button
                type="button"
                className="interview-button interview-button--ghost"
                onClick={() => setDeleteConfirm(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="interview-button interview-button--danger"
                onClick={() => handleDelete(deleteConfirm)}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </InterviewWorkspaceShell>
  )
}
