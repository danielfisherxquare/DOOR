import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import assessmentPublicApi from '../../api/assessmentPublic'
import {
  CommandEmptyState,
  CommandNotice,
  CommandPanel,
  CommandShell,
  CommandStatusTag,
} from '../../components/command/CommandPrimitives'

const STORAGE_KEY_PREFIX = 'assessment-session:'

const PROGRESS_STATUS_LABELS = {
  pending: '未开始',
  draft: '草稿中',
  submitted: '已提交',
}

const SAVE_STATE_LABELS = {
  idle: '等待编辑',
  saving: '正在自动保存',
  saved: '已自动保存',
  error: '保存失败',
}

function getDeviceFingerprint() {
  const key = 'assessment-device-id'
  let current = window.localStorage.getItem(key)
  if (!current) {
    current = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    window.localStorage.setItem(key, current)
  }
  return current
}

function normalizeScoreValue(value) {
  if (value === '' || value === null || value === undefined) return ''
  const numeric = Number(value)
  return Number.isInteger(numeric) ? numeric : ''
}

function getStarColor(index) {
  const hue = 46 - index * 2.2
  return `hsl(${Math.max(24, hue)} 96% 56%)`
}

function useCompactLayout(breakpoint = 768) {
  const [isCompact, setIsCompact] = useState(() => window.innerWidth <= breakpoint)

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${breakpoint}px)`)
    const handleChange = (event) => setIsCompact(event.matches)

    setIsCompact(mediaQuery.matches)
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [breakpoint])

  return isCompact
}

function StarScoreInput({ item, value, onChange }) {
  const [hoverValue, setHoverValue] = useState(null)
  const activeValue = hoverValue ?? normalizeScoreValue(value) ?? ''
  const currentValue = normalizeScoreValue(value)

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <button
            type="button"
            onMouseEnter={() => setHoverValue(0)}
            onMouseLeave={() => setHoverValue(null)}
            onFocus={() => setHoverValue(0)}
            onBlur={() => setHoverValue(null)}
            onClick={() => onChange(0)}
            aria-label={`${item.title} 0 分`}
            title="0 分"
            style={{
              border: activeValue === 0 ? '1px solid rgba(59,130,246,0.28)' : '1px solid #e5e7eb',
              background: activeValue === 0 ? 'rgba(59,130,246,0.08)' : '#fff',
              color: activeValue === 0 ? 'var(--info)' : 'var(--text-secondary)',
              borderRadius: 999,
              padding: '7px 10px',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 700,
              lineHeight: 1,
              transition: 'all 120ms ease',
            }}
          >
            0分
          </button>
          {Array.from({ length: item.scoreMax }, (_, index) => {
            const score = index + 1
            const active = activeValue >= score
            return (
              <button
                key={score}
                type="button"
                onMouseEnter={() => setHoverValue(score)}
                onMouseLeave={() => setHoverValue(null)}
                onFocus={() => setHoverValue(score)}
                onBlur={() => setHoverValue(null)}
                onClick={() => onChange(score)}
                aria-label={`${item.title} ${score} 分`}
                title={`${score} 分`}
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  cursor: 'pointer',
                  fontSize: 26,
                  lineHeight: 1,
                  color: active ? getStarColor(index) : 'var(--border-strong)',
                  transform: active ? 'scale(1.02)' : 'scale(1)',
                  transition: 'color 120ms ease, transform 120ms ease',
                }}
              >
                ★
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              minWidth: 88,
              padding: '6px 10px',
              borderRadius: 0,
              background: activeValue !== '' ? 'var(--warning-soft)' : 'var(--bg-secondary)',
              color: activeValue !== '' ? 'var(--warning)' : 'var(--text-secondary)',
              fontWeight: 700,
              textAlign: 'center',
            }}
          >
            {activeValue === '' ? 0 : activeValue} / {item.scoreMax}
          </div>
          {currentValue !== '' && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => onChange('')}
              style={{ minWidth: 'auto', padding: '8px 12px' }}
            >
              清空
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-disabled)', fontSize: 12 }}>
        <span>{item.scoreMin} 分</span>
        <span>{item.scoreMax} 分</span>
      </div>
    </div>
  )
}

function AssessmentPublicPage() {
  const { campaignId } = useParams()
  const isCompactLayout = useCompactLayout()
  const [meta, setMeta] = useState(null)
  const [progress, setProgress] = useState(null)
  const [currentMember, setCurrentMember] = useState(null)
  const [template, setTemplate] = useState(null)
  const [inviteCode, setInviteCode] = useState('')
  const [token, setToken] = useState(() => window.sessionStorage.getItem(`${STORAGE_KEY_PREFIX}${campaignId}`) || '')
  const [scores, setScores] = useState([])
  const [comment, setComment] = useState('')
  const [message, setMessage] = useState('')
  const [saveState, setSaveState] = useState('idle')
  const [loading, setLoading] = useState(true)
  const [authLoading, setAuthLoading] = useState(false)
  const [dirty, setDirty] = useState(false)
  const saveTimerRef = useRef(null)

  const membersPreview = useMemo(() => meta?.membersPreview || [], [meta])

  const openMember = useCallback(async (memberId, accessToken = token) => {
    if (!accessToken || !memberId) return

    const formRes = await assessmentPublicApi.getMemberForm(campaignId, memberId, accessToken)
    if (!formRes.success) return

    const templateItems = formRes.data.template.items || []
    const draftScores = formRes.data?.draft?.scores || []

    setCurrentMember(formRes.data.member)
    setTemplate(formRes.data.template)
    setScores(
      templateItems.map((item, index) => ({
        itemId: item.id,
        title: item.title,
        score: normalizeScoreValue(draftScores[index]?.score),
      })),
    )
    setComment(formRes.data?.draft?.comment || '')
    setDirty(false)
    setSaveState('idle')
  }, [campaignId, token])

  const hydrateProgress = useCallback(async (progressData, accessToken = token) => {
    setProgress(progressData)
    const nextMemberId = progressData?.inviteCode?.lastMemberId || progressData?.nextPendingMemberId
    if (nextMemberId && progressData.completedCount < progressData.totalCount) {
      await openMember(nextMemberId, accessToken)
      return
    }
    setCurrentMember(null)
    setTemplate(null)
    setScores([])
    setComment('')
    setDirty(false)
  }, [openMember, token])

  const loadMeta = useCallback(async () => {
    const res = await assessmentPublicApi.getMeta(campaignId)
    if (res.success) setMeta(res.data)
  }, [campaignId])

  const loadProgress = useCallback(async (accessToken) => {
    const res = await assessmentPublicApi.getProgress(campaignId, accessToken)
    if (res.success) await hydrateProgress(res.data, accessToken)
  }, [campaignId, hydrateProgress])

  const flushDraft = useCallback(async () => {
    if (!token || !currentMember || !dirty) return
    setSaveState('saving')
    try {
      await assessmentPublicApi.saveDraft(campaignId, currentMember.id, token, { scores, comment })
      setSaveState('saved')
      setDirty(false)
    } catch (error) {
      setSaveState('error')
      setMessage(error.message)
    }
  }, [campaignId, comment, currentMember, dirty, scores, token])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await loadMeta()
        if (!cancelled && token) await loadProgress(token)
      } catch (error) {
        if (!cancelled) setMessage(error.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadMeta, loadProgress, token])

  useEffect(() => {
    if (!dirty || !token || !currentMember) return
    window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      void flushDraft()
    }, 1200)
    return () => window.clearTimeout(saveTimerRef.current)
  }, [comment, currentMember, dirty, flushDraft, scores, token])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') void flushDraft()
    }
    const handleBeforeUnload = () => {
      void flushDraft()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [comment, currentMember, dirty, flushDraft, scores, token])

  const handleLogin = async (event) => {
    event.preventDefault()
    setAuthLoading(true)
    setMessage('')
    try {
      const res = await assessmentPublicApi.login(campaignId, {
        inviteCode,
        deviceFingerprint: getDeviceFingerprint(),
      })
      if (res.success) {
        const accessToken = res.data.accessToken
        window.sessionStorage.setItem(`${STORAGE_KEY_PREFIX}${campaignId}`, accessToken)
        setToken(accessToken)
        await hydrateProgress(res.data.progress, accessToken)
      }
    } catch (error) {
      setMessage(error.message)
    } finally {
      setAuthLoading(false)
    }
  }

  const handleSelectMember = async (memberId) => {
    await flushDraft()
    await openMember(memberId)
  }

  const handleScoreChange = (index, value) => {
    setScores((prev) => prev.map((row, rowIndex) => (rowIndex === index ? { ...row, score: normalizeScoreValue(value) } : row)))
    setDirty(true)
  }

  const handleSubmit = async () => {
    if (!currentMember) return
    const incompleteItem = scores.find((row) => row.score === '' || row.score === null || row.score === undefined)
    if (incompleteItem) {
      setMessage(`请先完成“${incompleteItem.title}”的评分。`)
      return
    }

    setSaveState('saving')
    setMessage('')
    try {
      const res = await assessmentPublicApi.submit(campaignId, currentMember.id, token, {
        scores: scores.map((row) => ({ itemId: row.itemId, score: Number(row.score) })),
        comment,
      })
      if (res.success) {
        setSaveState('saved')
        await hydrateProgress(res.data.progress, token)
      }
    } catch (error) {
      setSaveState('error')
      setMessage(error.message)
    }
  }

  const handleLogout = async () => {
    try {
      if (token) await assessmentPublicApi.logout(campaignId, token)
    } catch (_error) {
      // ignore
    }
    window.sessionStorage.removeItem(`${STORAGE_KEY_PREFIX}${campaignId}`)
    setToken('')
    setProgress(null)
    setCurrentMember(null)
    setTemplate(null)
    setScores([])
    setComment('')
    setDirty(false)
    setSaveState('idle')
  }

  if (loading) {
    return (
      <div className="command-tool-page surface-public">
        <div className="command-tool-page__wrap command-page">
          <CommandPanel title="考评页面加载中" subtitle="正在读取活动元数据与当前邀请码进度。">
            <CommandNotice tone="info">加载中...</CommandNotice>
          </CommandPanel>
        </div>
      </div>
    )
  }

  return (
    <div className="command-tool-page surface-public">
      <div className="command-tool-page__wrap command-page">
        <CommandShell
          eyebrow="公开考评"
          title={meta?.campaign?.name || '考评活动'}
          summary={`${meta?.campaign?.raceName || ''}${meta?.memberCount ? `，待评分人数 ${meta.memberCount}` : ''}`}
          actions={token ? <button className="btn btn--ghost" onClick={handleLogout}>退出邀请码会话</button> : null}
        >
          <div className="command-actions-row">
            <CommandStatusTag>{meta?.campaign?.raceName || '未关联赛事'}</CommandStatusTag>
            {progress ? <CommandStatusTag tone="info">已完成 {progress.completedCount || 0} / {progress.totalCount || 0}</CommandStatusTag> : null}
          </div>
        </CommandShell>

        {message ? <CommandNotice tone={saveState === 'error' ? 'danger' : 'info'}>{message}</CommandNotice> : null}

        {!token ? (
          <div className="command-grid command-grid--two">
            <CommandPanel title="输入邀请码继续评分" subtitle="使用邀请码即可进入当前赛事评分，系统会自动恢复上次未完成的位置并持续保存草稿。">
              <form onSubmit={handleLogin} className="command-stack">
                <input className="input" value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} placeholder="请输入邀请码" />
                <button className="btn btn--primary" type="submit" disabled={authLoading || !inviteCode.trim()}>
                  {authLoading ? '登录中...' : '进入评分'}
                </button>
              </form>
            </CommandPanel>

            <CommandPanel title="待评分成员预览" subtitle="预览当前活动中待评分的成员名单。">
              {membersPreview.length === 0 ? (
                <CommandEmptyState title="当前还没有可评分成员" description="请联系后台先完成成员导入或邀请码分配。" icon="MB" />
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: isCompactLayout ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                  {membersPreview.map((member) => (
                    <div
                      key={member.id}
                      style={{
                        padding: 12,
                        borderRadius: 12,
                        background: '#f8fafc',
                        border: '1px solid #e5e7eb',
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                      }}
                    >
                      <div style={memberDisplayNameStyle}>{member.employeeCode} {member.employeeName}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>所在岗位：{member.position || '未填写岗位'}</div>
                    </div>
                  ))}
                </div>
              )}
            </CommandPanel>
          </div>
        ) : progress?.completedCount >= progress?.totalCount ? (
          <CommandPanel title="已完成全部评分" subtitle="该邀请码对应的评分任务已经全部提交完成。">
            <CommandEmptyState title="评分任务已全部完成" description="如需再次进入，请联系后台重新分配成员或邀请码。" icon="OK" />
          </CommandPanel>
        ) : (
          <div className="command-grid" style={{ gridTemplateColumns: isCompactLayout ? '1fr' : '320px minmax(0, 1fr)' }}>
            <CommandPanel title="评分进度" subtitle={`已完成 ${progress?.completedCount || 0} / ${progress?.totalCount || 0}`}>
              <div className="command-stack">
                {(progress?.items || []).map((member) => (
                  <button
                    key={member.id}
                    className="btn btn--ghost"
                    onClick={() => void handleSelectMember(member.id)}
                    style={{
                      width: '100%',
                      justifyContent: 'space-between',
                      background: currentMember?.id === member.id ? 'rgba(59,130,246,0.1)' : 'transparent',
                      color: '#111827',
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                    }}
                  >
                    <span style={{ color: '#111827' }}>{member.employeeName}</span>
                    <span style={{ fontSize: 12, opacity: 0.7 }}>{PROGRESS_STATUS_LABELS[member.progressStatus] || member.progressStatus}</span>
                  </button>
                ))}
              </div>
            </CommandPanel>

            <CommandPanel title="成员评分" subtitle="评分项会自动保存草稿，提交后进入下一位成员。">
              {!currentMember || !template ? (
                <CommandEmptyState title="请选择一位成员继续评分" description="左侧进度列表会展示当前邀请码分配到的成员。" icon="SC" />
              ) : (
                <div style={{ display: 'grid', gap: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isCompactLayout ? 'flex-start' : 'center', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          ...memberDisplayNameStyle,
                          fontSize: isCompactLayout ? 18 : 22,
                          userSelect: 'none',
                          WebkitUserSelect: 'none',
                        }}
                      >
                        {currentMember.employeeCode} {currentMember.employeeName}
                      </div>
                      <div style={{ color: 'var(--text-secondary)', marginTop: 4 }}>所在岗位：{currentMember.position || '未填写岗位'}</div>
                    </div>
                    <CommandStatusTag tone={saveState === 'error' ? 'danger' : saveState === 'saved' ? 'success' : 'neutral'}>
                      {SAVE_STATE_LABELS[saveState] || SAVE_STATE_LABELS.idle}
                    </CommandStatusTag>
                  </div>

                  {(template.items || []).map((item, index) => (
                    <div key={item.id} style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                      <div style={{ fontWeight: 700 }}>{index + 1}. {item.title}</div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '6px 0 10px' }}>{item.description}</div>
                      <StarScoreInput item={item} value={scores[index]?.score ?? ''} onChange={(value) => handleScoreChange(index, value)} />
                    </div>
                  ))}

                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>备注</div>
                    <textarea
                      className="input"
                      rows={4}
                      value={comment}
                      onChange={(event) => {
                        setComment(event.target.value)
                        setDirty(true)
                      }}
                    />
                    <div style={{ color: 'var(--text-disabled)', fontSize: 12, marginTop: 8 }}>
                      备注同样会自动保存，无需手动点击保存。
                    </div>
                  </div>

                  <div className="command-actions-row">
                    <button className="btn btn--primary" onClick={handleSubmit}>提交当前成员评分</button>
                  </div>
                </div>
              )}
            </CommandPanel>
          </div>
        )}
      </div>
    </div>
  )
}

const memberDisplayNameStyle = {
  fontFamily: "'Microsoft YaHei UI', 'Microsoft YaHei', 'PingFang SC', 'Hiragino Sans GB', 'Noto Sans CJK SC', 'Source Han Sans SC', sans-serif",
  fontWeight: 600,
  letterSpacing: 0,
  color: '#111827',
  fontSynthesis: 'none',
  wordBreak: 'break-word',
  lineHeight: 1.5,
}

export default AssessmentPublicPage
