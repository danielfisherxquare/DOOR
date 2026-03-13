import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import assessmentPublicApi from '../../api/assessmentPublic'

const STORAGE_KEY_PREFIX = 'assessment-session:'

const PROGRESS_STATUS_LABELS = {
  pending: '未开始',
  draft: '草稿中',
  submitted: '已提交',
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
    setScores(templateItems.map((item, index) => ({
      itemId: item.id,
      title: item.title,
      score: draftScores[index]?.score ?? '',
    })))
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
    if (res.success) {
      setMeta(res.data)
    }
  }

  const loadProgress = async (accessToken) => {
    const res = await assessmentPublicApi.getProgress(campaignId, accessToken)
    if (res.success) {
      await hydrateProgress(res.data, accessToken)
    }
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
        if (!cancelled && token) {
          await loadProgress(token)
        }
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
      if (document.visibilityState === 'hidden') {
        void flushDraft()
      }
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
    setScores((prev) => prev.map((row, rowIndex) => (rowIndex === index ? { ...row, score: value } : row)))
    setDirty(true)
  }

  const handleSubmit = async () => {
    if (!currentMember) return
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
      if (token) {
        await assessmentPublicApi.logout(campaignId, token)
      }
    } catch (_error) {
      // Ignore public logout failures.
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
                {meta?.campaign?.raceName || ''} {meta?.memberCount ? `· 待评分人数 ${meta.memberCount}` : ''}
              </div>
            </div>
            {token && <button className="btn btn--ghost" onClick={handleLogout}>退出邀请码会话</button>}
          </div>
        </div>

        {message && (
          <div style={{ ...panelStyle, background: 'rgba(59,130,246,0.08)' }}>
            {message}
          </div>
        )}

        {!token ? (
          <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: 16 }}>
            <div style={panelStyle}>
              <h2 style={{ marginTop: 0 }}>输入邀请码继续评分</h2>
              <form onSubmit={handleLogin} style={{ display: 'grid', gap: 12 }}>
                <input
                  className="input"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="请输入邀请码"
                />
                <button className="btn btn--primary" type="submit" disabled={authLoading || !inviteCode.trim()}>
                  {authLoading ? '登录中...' : '进入评分'}
                </button>
              </form>
              <div style={{ marginTop: 12, color: '#6b7280', fontSize: 14 }}>
                使用邀请码即可进入当前赛事评分。系统会自动恢复上次未完成的位置，并实时自动保存。
              </div>
            </div>

            <div style={panelStyle}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>待评分成员预览</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                {membersPreview.map((member) => (
                  <div key={member.id} style={{ padding: 12, borderRadius: 12, background: '#f8fafc', border: '1px solid #e5e7eb' }}>
                    <div style={{ fontWeight: 700 }}>{member.employeeName}</div>
                    <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
                      {member.position}{member.teamName ? ` · ${member.teamName}` : ''}
                    </div>
                  </div>
                ))}
                {membersPreview.length === 0 && (
                  <div style={{ color: '#6b7280' }}>当前还没有可评分成员。</div>
                )}
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
              <div style={{ color: '#6b7280', marginBottom: 12 }}>
                已完成 {progress?.completedCount || 0} / {progress?.totalCount || 0}
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {(progress?.items || []).map((member) => (
                  <button
                    key={member.id}
                    className="btn btn--ghost"
                    onClick={() => void handleSelectMember(member.id)}
                    style={{
                      justifyContent: 'space-between',
                      background: currentMember?.id === member.id ? 'rgba(59,130,246,0.1)' : 'transparent',
                    }}
                  >
                    <span>{member.employeeName}</span>
                    <span style={{ fontSize: 12, opacity: 0.7 }}>
                      {PROGRESS_STATUS_LABELS[member.progressStatus] || member.progressStatus}
                    </span>
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
                      <div style={{ fontSize: 22, fontWeight: 700 }}>{currentMember.employeeName}</div>
                      <div style={{ color: '#6b7280', marginTop: 4 }}>
                        {currentMember.position}{currentMember.teamName ? ` · ${currentMember.teamName}` : ''}
                      </div>
                    </div>
                    <div style={{ color: saveState === 'error' ? '#dc2626' : '#6b7280' }}>
                      {saveState === 'saving' && '正在保存'}
                      {saveState === 'saved' && '已自动保存'}
                      {saveState === 'error' && '保存失败'}
                      {saveState === 'idle' && '等待编辑'}
                    </div>
                  </div>

                  {(template.items || []).map((item, index) => (
                    <div key={item.id} style={{ borderTop: '1px solid #e5e7eb', paddingTop: 14 }}>
                      <div style={{ fontWeight: 700 }}>{index + 1}. {item.title}</div>
                      <div style={{ color: '#6b7280', fontSize: 14, margin: '6px 0 10px' }}>{item.description}</div>
                      <input
                        className="input"
                        type="number"
                        min={item.scoreMin}
                        max={item.scoreMax}
                        value={scores[index]?.score ?? ''}
                        onChange={(e) => handleScoreChange(index, e.target.value)}
                        placeholder={`${item.scoreMin}-${item.scoreMax}`}
                        style={{ maxWidth: 140 }}
                      />
                    </div>
                  ))}

                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>备注</div>
                    <textarea
                      className="input"
                      rows={4}
                      value={comment}
                      onChange={(e) => {
                        setComment(e.target.value)
                        setDirty(true)
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn--secondary" onClick={() => void flushDraft()}>立即保存</button>
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
