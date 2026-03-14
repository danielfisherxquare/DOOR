import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import assessmentPublicApi from '../../api/assessmentPublic'

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
              color: activeValue === 0 ? '#1d4ed8' : '#6b7280',
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
                  color: active ? getStarColor(index) : '#d1d5db',
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
              borderRadius: 999,
              background: activeValue !== '' ? 'rgba(245,158,11,0.12)' : '#f3f4f6',
              color: activeValue !== '' ? '#b45309' : '#6b7280',
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

      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9ca3af', fontSize: 12 }}>
        <span>{item.scoreMin} 分</span>
        <span>{item.scoreMax} 分</span>
      </div>
    </div>
  )
}

function AssessmentPublicPage() {
  const { campaignId } = useParams()
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

  const openMember = async (memberId, accessToken = token) => {
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
  }

  const hydrateProgress = async (progressData, accessToken = token) => {
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
  }

  const loadMeta = async () => {
    const res = await assessmentPublicApi.getMeta(campaignId)
    if (res.success) setMeta(res.data)
  }

  const loadProgress = async (accessToken) => {
    const res = await assessmentPublicApi.getProgress(campaignId, accessToken)
    if (res.success) await hydrateProgress(res.data, accessToken)
  }

  const flushDraft = async () => {
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
  }

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
  }, [campaignId])

  useEffect(() => {
    if (!dirty || !token || !currentMember) return
    window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      void flushDraft()
    }, 1200)
    return () => window.clearTimeout(saveTimerRef.current)
  }, [dirty, scores, comment, token, currentMember])

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
  }, [token, currentMember, dirty, scores, comment])

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
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>加载中...</div>
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7fb', padding: 24 }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', display: 'grid', gap: 16 }}>
        <div style={panelStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 28 }}>{meta?.campaign?.name || '考评活动'}</h1>
              <div style={{ color: '#6b7280', marginTop: 8 }}>
                {meta?.campaign?.raceName || ''}
                {meta?.memberCount ? `，待评分人数 ${meta.memberCount}` : ''}
              </div>
            </div>
            {token && (
              <button className="btn btn--ghost" onClick={handleLogout}>退出邀请码会话</button>
            )}
          </div>
        </div>

        {message && <div style={{ ...panelStyle, background: 'rgba(59,130,246,0.08)' }}>{message}</div>}

        {!token ? (
          <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: 16 }}>
            <div style={panelStyle}>
              <h2 style={{ marginTop: 0 }}>输入邀请码继续评分</h2>
              <form onSubmit={handleLogin} style={{ display: 'grid', gap: 12 }}>
                <input className="input" value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} placeholder="请输入邀请码" />
                <button className="btn btn--primary" type="submit" disabled={authLoading || !inviteCode.trim()}>
                  {authLoading ? '登录中...' : '进入评分'}
                </button>
              </form>
              <div style={{ marginTop: 12, color: '#6b7280', fontSize: 14 }}>
                使用邀请码即可进入当前赛事评分。系统会自动恢复上次未完成的位置，并实时自动保存草稿。
              </div>
            </div>

            <div style={panelStyle}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>待评分成员预览</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
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
                    <div style={{ fontWeight: 700, color: '#111827' }}>{member.employeeCode} {member.employeeName}</div>
                    <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>所在岗位：{member.position || '未填写岗位'}</div>
                  </div>
                ))}
                {membersPreview.length === 0 && <div style={{ color: '#6b7280' }}>当前还没有可评分成员。</div>}
              </div>
            </div>
          </div>
        ) : progress?.completedCount >= progress?.totalCount ? (
          <div style={panelStyle}>
            <h2 style={{ marginTop: 0 }}>已完成全部评分</h2>
            <div>该邀请码对应的评分任务已经全部提交完成。</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16 }}>
            <div style={panelStyle}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>评分进度</div>
              <div style={{ color: '#6b7280', marginBottom: 12 }}>已完成 {progress?.completedCount || 0} / {progress?.totalCount || 0}</div>
              <div style={{ display: 'grid', gap: 8 }}>
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
            </div>

            <div style={panelStyle}>
              {!currentMember || !template ? (
                <div>请选择一位成员继续评分。</div>
              ) : (
                <div style={{ display: 'grid', gap: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                    <div>
                      <div
                        style={{
                          fontSize: 22,
                          fontWeight: 700,
                          color: '#111827',
                          userSelect: 'none',
                          WebkitUserSelect: 'none',
                        }}
                      >
                        {currentMember.employeeCode} {currentMember.employeeName}
                      </div>
                      <div style={{ color: '#6b7280', marginTop: 4 }}>所在岗位：{currentMember.position || '未填写岗位'}</div>
                    </div>
                    <div style={{ color: saveState === 'error' ? '#dc2626' : '#6b7280' }}>
                      {SAVE_STATE_LABELS[saveState] || SAVE_STATE_LABELS.idle}
                    </div>
                  </div>

                  {(template.items || []).map((item, index) => (
                    <div key={item.id} style={{ borderTop: '1px solid #e5e7eb', paddingTop: 14 }}>
                      <div style={{ fontWeight: 700 }}>{index + 1}. {item.title}</div>
                      <div style={{ color: '#6b7280', fontSize: 14, margin: '6px 0 10px' }}>{item.description}</div>
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
                    <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 8 }}>
                      备注同样会自动保存，无需手动点击保存。
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn--primary" onClick={handleSubmit}>提交当前成员评分</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const panelStyle = {
  background: '#fff',
  borderRadius: 16,
  padding: 20,
  boxShadow: '0 10px 30px rgba(15,23,42,0.06)',
}

export default AssessmentPublicPage
