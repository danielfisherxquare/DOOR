import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import assessmentAdminApi from '../../../api/assessmentAdmin'
import { loadChartJs } from '../../../utils/chartLoader'

const CAMPAIGN_STATUS_LABELS = {
  draft: '草稿',
  published: '已发布',
  closed: '已关闭',
  archived: '已归档',
}

const INVITE_STATUS_LABELS = {
  unused: '未使用',
  active: '进行中',
  completed: '已完成',
  revoked: '已撤销',
  expired: '已失效',
}

const MEMBER_TYPE_LABELS = {
  employee: '正式成员',
  external_support: '外援',
}

const EXTERNAL_TYPE_LABELS = {
  temporary: '临时外援',
  long_term: '长期外援',
}

const CORE_ITEM_IDS = ['skill', 'quality', 'execution']
const RED_LINE_THRESHOLD = 4

const TIER_CONFIG = {
  'S': { title: 'S级 - 应提拔', color: '#FFD700' },
  'A': { title: 'A级 - 应培养', color: '#6366F1' },
  'B': { title: 'B级 - 稳定贡献', color: '#10B981' },
  'C': { title: 'C级 - 需关注', color: '#F59E0B' },
  'D': { title: 'D级 - 应淘汰', color: '#EF4444' }
}

const TIER_DESCRIPTIONS = {
  'S': '核心能力突出，具备带领团队的潜质，建议纳入人才梯队培养计划。',
  'A': '表现优异，是部门骨干力量，可考虑赋予更多责任和挑战性任务。',
  'B': '能胜任当前岗位要求，建议持续关注其成长轨迹。',
  'C': '存在明显短板，需制定针对性提升计划，建议1-3个月后复评。',
  'D': '能力严重不足或多项核心指标不达标，建议调整岗位或启动淘汰流程。'
}

function checkRedLines(itemAverages) {
  const itemMap = new Map(itemAverages.map(item => [item.itemId, item.averageScore]))
  const warnings = []
  let redLineCount = 0
  
  CORE_ITEM_IDS.forEach(itemId => {
    const score = itemMap.get(itemId)
    if (score !== undefined && score <= RED_LINE_THRESHOLD) {
      redLineCount++
      const itemTitle = itemAverages.find(i => i.itemId === itemId)?.title || itemId
      warnings.push(`${itemTitle} 得分 ${score.toFixed(1)} 分，低于合格线`)
    }
  })
  
  return { redLineCount, warnings, hasRedLine: redLineCount > 0 }
}

function calculateTier(averageScore, itemAverages) {
  const { redLineCount } = checkRedLines(itemAverages)
  
  if (redLineCount >= 2) return 'D'
  if (redLineCount >= 1 && averageScore < 60) return 'D'
  if (redLineCount >= 1) return 'C'
  
  if (averageScore >= 90) {
    const highScores = itemAverages.filter(item => item.averageScore >= 9).length
    return highScores >= 3 ? 'S' : 'A'
  }
  if (averageScore >= 75) return 'A'
  if (averageScore >= 60) return 'B'
  if (averageScore >= 40) return 'C'
  return 'D'
}

function buildTierResultFallback(averageScore, itemAverages) {
  const tier = calculateTier(averageScore, itemAverages)
  const { redLineCount, warnings } = checkRedLines(itemAverages)
  
  return {
    tier,
    tierTitle: TIER_CONFIG[tier].title,
    tierColor: TIER_CONFIG[tier].color,
    tierDescription: TIER_DESCRIPTIONS[tier],
    redLineCount,
    redLineWarnings: warnings,
    hasRedLine: redLineCount > 0
  }
}

function getTierResult(report) {
  if (report.tierResult) return report.tierResult
  if (report.itemAverages && report.averageScore !== undefined) {
    return buildTierResultFallback(report.averageScore, report.itemAverages)
  }
  return null
}

function AssessmentCampaignDetailPage() {
  const { id } = useParams()
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [inviteCount, setInviteCount] = useState(10)
  const [generatedCodes, setGeneratedCodes] = useState([])
  const [growthCode, setGrowthCode] = useState('')
  const [growthReport, setGrowthReport] = useState(null)
  const [selectedMemberReport, setSelectedMemberReport] = useState(null)
  const [candidateKeyword, setCandidateKeyword] = useState('')
  const [candidateLoading, setCandidateLoading] = useState(false)
  const [candidates, setCandidates] = useState([])
  const [selectedMembers, setSelectedMembers] = useState([])
  const [chartLoaded, setChartLoaded] = useState(false)
  const radarChartRef = useRef(null)
  const radarChartInstance = useRef(null)

  useEffect(() => {
    loadChartJs().then(Chart => {
      window.Chart = Chart
      setChartLoaded(true)
    })
  }, [])

  const templateItems = detail?.template?.items || []
  const reportMembers = useMemo(() => detail?.report?.members || [], [detail])
  const inviteCodes = detail?.inviteCodes || []
  const selectedMemberMap = useMemo(() => new Map(selectedMembers.map((item) => [item.teamMemberId, item])), [selectedMembers])
  const positionOptions = useMemo(
    () => [...new Set(candidates.map((item) => String(item.position || '').trim()).filter(Boolean))],
    [candidates],
  )
  const shareLink = useMemo(() => {
    if (typeof window === 'undefined' || !id) return ''
    return `${window.location.origin}/assessment/${id}`
  }, [id])

  const loadDetail = async () => {
    setLoading(true)
    setMessage('')
    try {
      const res = await assessmentAdminApi.getCampaignDetail(id)
      if (res.success) {
        setDetail(res.data)
        setSelectedMembers(
          (res.data.members || [])
            .filter((item) => item.teamMemberId)
            .map((item) => ({
              teamMemberId: item.teamMemberId,
              position: item.position || '',
            })),
        )
      }
    } catch (error) {
      setDetail(null)
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const loadCandidates = async (keyword = '') => {
    setCandidateLoading(true)
    try {
      const res = await assessmentAdminApi.getTeamCandidates(id, keyword)
      if (res.success) {
        setCandidates(res.data || [])
      }
    } catch (error) {
      setMessage(error.message)
    } finally {
      setCandidateLoading(false)
    }
  }

  useEffect(() => {
    void loadDetail()
    void loadCandidates('')
  }, [id])

  const updateTemplateItem = (index, key, value) => {
    setDetail((prev) => {
      const nextItems = [...(prev?.template?.items || [])]
      nextItems[index] = { ...nextItems[index], [key]: value }
      return {
        ...prev,
        template: {
          ...prev.template,
          items: nextItems,
        },
      }
    })
  }

  const handleSaveTemplate = async () => {
    if (!detail) return
    setSaving(true)
    setMessage('')
    try {
      const res = await assessmentAdminApi.updateCampaign(id, {
        name: detail.campaign.name,
        year: detail.campaign.year,
        templateTitle: detail.template.title,
        templateInstructions: detail.template.instructions,
        templateItems,
      })
      if (res.success) {
        setDetail(res.data)
        setMessage('评分模板已保存。')
      }
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSyncMembers = async () => {
    setSaving(true)
    setMessage('')
    try {
      const res = await assessmentAdminApi.setCampaignMembers(id, selectedMembers)
      if (res.success) {
        setMessage(`已同步 ${res.data.length} 名成员到考评活动。`)
        await loadDetail()
      }
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleGenerateInviteCodes = async () => {
    setSaving(true)
    setMessage('')
    try {
      const res = await assessmentAdminApi.generateInviteCodes(id, Number(inviteCount))
      if (res.success) {
        setGeneratedCodes(res.data.inviteCodes || [])
        setMessage(`已生成 ${res.data.inviteCodes?.length || 0} 个邀请码。`)
        await loadDetail()
      }
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  const handlePublish = async () => {
    setSaving(true)
    setMessage('')
    try {
      const res = await assessmentAdminApi.publishCampaign(id)
      if (res.success) {
        setDetail(res.data)
        setMessage('考评活动已发布。')
      }
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleClose = async () => {
    setSaving(true)
    setMessage('')
    try {
      const res = await assessmentAdminApi.closeCampaign(id)
      if (res.success) {
        setDetail(res.data)
        setMessage('考评活动已关闭。')
      }
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleResetInviteCode = async (inviteCodeId) => {
    if (!window.confirm('确认重置该邀请码的评分进度吗？这会清空它当前的草稿和已提交评分。')) return
    try {
      const res = await assessmentAdminApi.resetInviteCodeProgress(inviteCodeId)
      if (res.success) {
        setMessage('邀请码进度已重置。')
        await loadDetail()
      }
    } catch (error) {
      setMessage(error.message)
    }
  }

  const handleRevokeInviteCode = async (inviteCodeId) => {
    if (!window.confirm('确认撤销该邀请码吗？撤销后将无法继续评分。')) return
    try {
      const res = await assessmentAdminApi.revokeInviteCode(inviteCodeId)
      if (res.success) {
        setMessage('邀请码已撤销。')
        await loadDetail()
      }
    } catch (error) {
      setMessage(error.message)
    }
  }

  const handleOpenMemberReport = async (member) => {
    try {
      const res = await assessmentAdminApi.getMemberReport(id, member.id)
      if (res.success) {
        setSelectedMemberReport({
          member: res.data.member,
          report: res.data.report,
        })
      }
    } catch (error) {
      setMessage(error.message)
    }
  }

  const renderRadarChart = (report) => {
    if (!radarChartRef.current || !chartLoaded || !window.Chart) return
    
    const itemAverages = report.itemAverages || []
    if (itemAverages.length === 0) return
    
    if (radarChartInstance.current) {
      radarChartInstance.current.destroy()
      radarChartInstance.current = null
    }
    
    const tierResult = getTierResult(report)
    const tierColor = tierResult?.tierColor || '#6366F1'
    
    radarChartInstance.current = new window.Chart(radarChartRef.current, {
      type: 'radar',
      data: {
        labels: itemAverages.map(item => (item.title || '').slice(0, 6)),
        datasets: [{
          label: '平均分',
          data: itemAverages.map(item => item.averageScore),
          backgroundColor: `${tierColor}33`,
          borderColor: tierColor,
          pointBackgroundColor: tierColor,
          pointBorderColor: '#fff',
          borderWidth: 2,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            angleLines: { color: 'rgba(0, 0, 0, 0.08)' },
            grid: { color: 'rgba(0, 0, 0, 0.08)' },
            pointLabels: { font: { size: 11, weight: '600' }, color: '#57534e' },
            ticks: { display: false, stepSize: 2 },
            min: 0,
            max: 10
          }
        },
        plugins: { legend: { display: false } }
      }
    })
  }

  useEffect(() => {
    if (selectedMemberReport?.report && chartLoaded) {
      renderRadarChart(selectedMemberReport.report)
    }
    return () => {
      if (radarChartInstance.current) {
        radarChartInstance.current.destroy()
        radarChartInstance.current = null
      }
    }
  }, [selectedMemberReport, chartLoaded])

  const handleGrowthSearch = async () => {
    if (!growthCode.trim()) return
    try {
      const res = await assessmentAdminApi.getGrowthReport(growthCode.trim())
      if (res.success) {
        setGrowthReport(res.data)
      }
    } catch (error) {
      setMessage(error.message)
    }
  }

  const handleCopyShareLink = async () => {
    if (!shareLink) return
    try {
      await navigator.clipboard.writeText(shareLink)
      setMessage('分享链接已复制。')
    } catch (_error) {
      setMessage(shareLink)
    }
  }

  const toggleCandidate = (candidateId) => {
    setSelectedMembers((prev) => {
      const existing = prev.find((item) => item.teamMemberId === candidateId)
      if (existing) return prev.filter((item) => item.teamMemberId !== candidateId)
      const candidate = candidates.find((item) => item.id === candidateId)
      return [...prev, { teamMemberId: candidateId, position: candidate?.position || '' }]
    })
  }

  const updateCandidatePosition = (candidateId, position) => {
    setSelectedMembers((prev) => prev.map((item) => (
      item.teamMemberId === candidateId
        ? { ...item, position }
        : item
    )))
  }

  if (loading) return <div style={{ padding: 24 }}>加载中...</div>
  if (!detail) return <div style={{ padding: 24 }}>{message || '未找到考评活动。'}</div>

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{detail.campaign.name}</h1>
          <div style={{ color: 'var(--color-text-secondary)', marginTop: 6 }}>
            {detail.campaign.raceName || '未关联赛事'}，状态：{CAMPAIGN_STATUS_LABELS[detail.campaign.status] || detail.campaign.status}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <div style={shareCardStyle}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>考评分发链接</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input className="input" readOnly value={shareLink} onFocus={(event) => event.target.select()} style={{ minWidth: 0 }} />
              <button className="btn btn--secondary" onClick={handleCopyShareLink}>复制</button>
            </div>
          </div>
          <button className="btn btn--secondary" onClick={handlePublish} disabled={saving || detail.campaign.status !== 'draft'}>发布活动</button>
          <button className="btn btn--ghost" onClick={handleClose} disabled={saving || detail.campaign.status === 'closed'}>关闭活动</button>
        </div>
      </div>

      {message && <div style={noticeStyle}>{message}</div>}

      <div style={cardStyle}>
        <div style={titleStyle}>评分模板</div>
        <div style={{ display: 'grid', gap: 12 }}>
          <input
            className="input"
            value={detail.template.title}
            onChange={(event) => setDetail((prev) => ({ ...prev, template: { ...prev.template, title: event.target.value } }))}
            placeholder="模板标题"
          />
          <textarea
            className="input"
            rows={3}
            value={detail.template.instructions}
            onChange={(event) => setDetail((prev) => ({ ...prev, template: { ...prev.template, instructions: event.target.value } }))}
            placeholder="模板说明"
          />
          {templateItems.map((item, index) => (
            <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '220px 1fr 90px', gap: 12 }}>
              <input className="input" value={item.title} onChange={(event) => updateTemplateItem(index, 'title', event.target.value)} />
              <input className="input" value={item.description} onChange={(event) => updateTemplateItem(index, 'description', event.target.value)} />
              <input className="input" type="number" value={item.weight} onChange={(event) => updateTemplateItem(index, 'weight', Number(event.target.value || 1))} />
            </div>
          ))}
          <div>
            <button className="btn btn--primary" onClick={handleSaveTemplate} disabled={saving || detail.campaign.status !== 'draft'}>保存模板</button>
          </div>
        </div>
      </div>

      <div style={twoColumnStyle}>
        <div style={{ ...cardStyle, display: 'grid', gridTemplateRows: 'auto auto 1fr auto', gap: 16, minHeight: 600 }}>
          <div style={titleStyle}>活动成员</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" value={candidateKeyword} onChange={(event) => setCandidateKeyword(event.target.value)} placeholder="搜索工号、姓名、岗位、部门" style={{ flex: 1 }} />
            <button className="btn btn--secondary" onClick={() => loadCandidates(candidateKeyword)} disabled={candidateLoading}>搜索</button>
          </div>
          <datalist id={`assessment-position-options-${id}`}>
            {positionOptions.map((item) => <option key={item} value={item} />)}
          </datalist>
          <div style={{ maxHeight: 600, overflow: 'auto', display: 'grid', gap: 8 }}>
            {candidates.map((candidate) => (
              <label key={candidate.id} style={candidateRowStyle}>
                <input type="checkbox" checked={selectedMemberMap.has(candidate.id)} onChange={() => toggleCandidate(candidate.id)} style={{ marginTop: 4, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={memberDisplayNameStyle}>{candidate.employeeCode} · {candidate.employeeName}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4, display: 'grid', gap: 2 }}>
                    <div>{candidate.position || '未填写岗位'}</div>
                    <div>{candidate.department || '未填写部门'} · {MEMBER_TYPE_LABELS[candidate.memberType] || candidate.memberType}</div>
                    {candidate.externalEngagementType && (
                      <div style={{ color: '#059669' }}>{EXTERNAL_TYPE_LABELS[candidate.externalEngagementType] || candidate.externalEngagementType}</div>
                    )}
                  </div>
                  {selectedMemberMap.has(candidate.id) && (
                    <div style={{ marginTop: 10 }}>
                      <div style={candidateFieldLabelStyle}>本场岗位 / 板块</div>
                      <input
                        className="input"
                        value={selectedMemberMap.get(candidate.id)?.position || ''}
                        onChange={(event) => updateCandidatePosition(candidate.id, event.target.value)}
                        placeholder="输入本场赛事岗位"
                        list={`assessment-position-options-${id}`}
                      />
                    </div>
                  )}
                </div>
              </label>
            ))}
            {candidates.length === 0 && <div style={{ color: '#6b7280', padding: 20, textAlign: 'center' }}>当前机构下暂无可选团队成员。</div>}
          </div>
          <div style={{ paddingTop: 16, borderTop: '1px solid #e5e7eb' }}>
            <button className="btn btn--primary" onClick={handleSyncMembers} disabled={saving || detail.campaign.status !== 'draft'}>同步到考评活动</button>
          </div>
        </div>

        <div style={{ ...cardStyle, display: 'grid', gridTemplateRows: 'auto auto 1fr', gap: 16, minHeight: 600 }}>
          <div style={titleStyle}>邀请码管理</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input className="input" type="number" value={inviteCount} onChange={(event) => setInviteCount(event.target.value)} style={{ maxWidth: 120 }} />
            <button className="btn btn--primary" onClick={handleGenerateInviteCodes} disabled={saving}>生成邀请码</button>
          </div>
          {generatedCodes.length > 0 && (
            <div style={{ padding: '12px', background: '#f0f9ff', borderRadius: 8 }}>
              <div style={{ fontSize: 13, color: '#0369a1', marginBottom: 8, fontWeight: 600 }}>本次生成</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {generatedCodes.map((code) => (
                  <div key={code.id} style={badgeStyle}>{code.plainCode}</div>
                ))}
              </div>
            </div>
          )}
          <div style={{ maxHeight: 600, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>邀请码</th>
                  <th style={thStyle}>状态</th>
                  <th style={thStyle}>激活时间</th>
                  <th style={thStyle}>完成时间</th>
                  <th style={thStyle}>操作</th>
                </tr>
              </thead>
              <tbody>
                {inviteCodes.map((code) => (
                  <tr key={code.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <code style={{
                          padding: '2px 8px',
                          background: '#f3f4f6',
                          borderRadius: 4,
                          fontSize: 13,
                          fontWeight: 600,
                          color: '#1f2937'
                        }}>
                          {code.plainCode || 'N/A'}
                        </code>
                        {code.plainCode && (
                          <button
                            className="btn btn--ghost btn--sm"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(code.plainCode)
                                setMessage('邀请码已复制到剪贴板')
                              } catch (_error) {
                                setMessage(code.plainCode)
                              }
                            }}
                            style={{ padding: '2px 6px', fontSize: 12 }}
                          >
                            复制
                          </button>
                        )}
                      </div>
                    </td>
                    <td style={tdStyle}>{INVITE_STATUS_LABELS[code.status] || code.status}</td>
                    <td style={tdStyle}>{code.activatedAt ? new Date(code.activatedAt).toLocaleString() : '-'}</td>
                    <td style={tdStyle}>{code.completedAt ? new Date(code.completedAt).toLocaleString() : '-'}</td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn--ghost btn--sm" onClick={() => handleResetInviteCode(code.id)}>重置进度</button>
                        <button className="btn btn--ghost btn--sm" onClick={() => handleRevokeInviteCode(code.id)} disabled={code.status === 'revoked'}>撤销</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {inviteCodes.length === 0 && (
                  <tr>
                    <td style={tdStyle} colSpan={5}>暂无邀请码</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={titleStyle}>考评成员快照</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>工号</th>
              <th style={thStyle}>姓名</th>
              <th style={thStyle}>岗位</th>
              <th style={thStyle}>成员类型</th>
            </tr>
          </thead>
          <tbody>
            {detail.members.map((member) => (
              <tr key={member.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                <td style={tdStyle}>{member.employeeCode}</td>
                <td style={tdStyle}>{member.employeeName}</td>
                <td style={tdStyle}>{member.position || '-'}</td>
                <td style={tdStyle}>
                  {MEMBER_TYPE_LABELS[member.memberType] || member.memberType}
                  {member.externalEngagementType ? ` / ${EXTERNAL_TYPE_LABELS[member.externalEngagementType] || member.externalEngagementType}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={cardStyle}>
        <div style={titleStyle}>赛事报表</div>
        <div style={{ color: 'var(--color-text-secondary)', marginBottom: 12 }}>
          邀请码总数 {detail.report?.inviteCodeTotal || 0} / 已激活 {detail.report?.inviteCodeActivated || 0} / 已完成 {detail.report?.inviteCodeCompleted || 0}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>工号</th>
              <th style={thStyle}>姓名</th>
              <th style={thStyle}>岗位</th>
              <th style={thStyle}>样本数</th>
              <th style={thStyle}>平均分</th>
              <th style={thStyle}>操作</th>
            </tr>
          </thead>
          <tbody>
            {reportMembers.map((member) => (
              <tr key={member.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                <td style={tdStyle}>{member.employeeCode}</td>
                <td style={tdStyle}>{member.employeeName}</td>
                <td style={tdStyle}>{member.position || '-'}</td>
                <td style={tdStyle}>{member.report?.sampleCount || 0}</td>
                <td style={tdStyle}>{member.report?.averageScore || 0}</td>
                <td style={tdStyle}>
                  <button className="btn btn--ghost btn--sm" onClick={() => handleOpenMemberReport(member)}>查看详情</button>
                </td>
              </tr>
            ))}
            {reportMembers.length === 0 && (
              <tr>
                <td style={tdStyle} colSpan={6}>暂无报表数据</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedMemberReport && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={titleStyle}>成员报表详情</div>
            <button className="btn btn--ghost btn--sm" onClick={() => setSelectedMemberReport(null)}>关闭</button>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24 }}>
            <div style={{ height: 260 }}>
              <canvas ref={radarChartRef} />
            </div>
            
            <div style={{ display: 'grid', gap: 16 }}>
              {(() => {
                const tierResult = getTierResult(selectedMemberReport.report)
                return tierResult && (
                  <div style={{
                    padding: 16,
                    borderRadius: 12,
                    background: `${tierResult.tierColor}15`,
                    border: `1px solid ${tierResult.tierColor}40`
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                      <span style={{
                        padding: '4px 12px',
                        borderRadius: 6,
                        background: tierResult.tierColor,
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: 14
                      }}>
                        {tierResult.tierTitle}
                      </span>
                      {tierResult.hasRedLine && (
                        <span style={{ color: '#EF4444', fontSize: 13, fontWeight: 600 }}>
                          ⚠️ {tierResult.redLineCount} 条红线
                        </span>
                      )}
                    </div>
                    <div style={{ color: '#374151', fontSize: 14, lineHeight: 1.6 }}>
                      {tierResult.tierDescription}
                    </div>
                    {tierResult.redLineWarnings?.length > 0 && (
                      <div style={{ marginTop: 8, fontSize: 13, color: '#DC2626' }}>
                        {tierResult.redLineWarnings.map((w, i) => (
                          <div key={i}>• {w}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 14 }}>
                <div><strong>姓名：</strong>{selectedMemberReport.member.employeeName}</div>
                <div><strong>工号：</strong>{selectedMemberReport.member.employeeCode}</div>
                <div><strong>岗位：</strong>{selectedMemberReport.member.position || '-'}</div>
                <div><strong>平均分：</strong>{selectedMemberReport.report.averageScore}</div>
                <div><strong>样本数：</strong>{selectedMemberReport.report.sampleCount}</div>
                <div><strong>方差：</strong>{selectedMemberReport.report.variance}</div>
              </div>
            </div>
          </div>
          
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
            <thead>
              <tr>
                <th style={thStyle}>维度</th>
                <th style={thStyle}>平均分</th>
                <th style={thStyle}>状态</th>
              </tr>
            </thead>
            <tbody>
              {(selectedMemberReport.report.itemAverages || []).map((item) => {
                const isCore = CORE_ITEM_IDS.includes(item.itemId)
                const isRedLine = isCore && item.averageScore <= RED_LINE_THRESHOLD
                return (
                  <tr key={item.itemId} style={{ borderTop: '1px solid #e5e7eb' }}>
                    <td style={tdStyle}>
                      {item.title}
                      {isCore && <span style={{ color: '#6366F1', marginLeft: 4, fontSize: 11 }}>核心</span>}
                    </td>
                    <td style={tdStyle}>{item.averageScore}</td>
                    <td style={tdStyle}>
                      {isRedLine && <span style={{ color: '#EF4444', fontWeight: 600 }}>⚠️ 红线</span>}
                      {!isRedLine && item.averageScore >= 8 && <span style={{ color: '#10B981' }}>优秀</span>}
                      {!isRedLine && item.averageScore < 8 && item.averageScore >= 6 && <span style={{ color: '#6B7280' }}>合格</span>}
                      {!isRedLine && item.averageScore < 6 && <span style={{ color: '#F59E0B' }}>待提升</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={cardStyle}>
        <div style={titleStyle}>成长预览</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input className="input" value={growthCode} onChange={(event) => setGrowthCode(event.target.value)} placeholder="输入工号" style={{ maxWidth: 240 }} />
          <button className="btn btn--primary" onClick={handleGrowthSearch}>查询</button>
        </div>
        {growthReport?.timeline?.length ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>年份</th>
                <th style={thStyle}>活动</th>
                <th style={thStyle}>均分</th>
                <th style={thStyle}>等级</th>
                <th style={thStyle}>样本数</th>
              </tr>
            </thead>
            <tbody>
              {growthReport.timeline.map((row) => {
                const tierResult = row.tierResult || getTierResult({ averageScore: row.averageScore, itemAverages: row.itemAverages })
                return (
                  <tr key={`${row.campaignId}-${row.year}`} style={{ borderTop: '1px solid #e5e7eb' }}>
                    <td style={tdStyle}>{row.year}</td>
                    <td style={tdStyle}>{row.campaignName}</td>
                    <td style={tdStyle}>{row.averageScore}</td>
                    <td style={tdStyle}>
                      {tierResult ? (
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: tierResult.tierColor,
                          color: '#fff',
                          fontSize: 12,
                          fontWeight: 600
                        }}>
                          {tierResult.tierTitle}
                        </span>
                      ) : '-'}
                    </td>
                    <td style={tdStyle}>{row.sampleCount}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <div style={{ color: 'var(--color-text-secondary)' }}>暂无成长数据</div>
        )}
      </div>
    </div>
  )
}

const cardStyle = {
  background: 'var(--color-bg-card, #fff)',
  borderRadius: 12,
  padding: 20,
  boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.06))',
}

const shareCardStyle = {
  minWidth: 320,
  maxWidth: 420,
  padding: 10,
  borderRadius: 12,
  background: 'var(--color-bg-card, #fff)',
  boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.06))',
  display: 'grid',
  gap: 8,
}

const noticeStyle = {
  padding: '12px 16px',
  borderRadius: 10,
  background: 'rgba(59,130,246,0.1)',
  color: 'var(--color-text-primary)',
}

const twoColumnStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))',
  gap: 16,
}

const titleStyle = {
  fontSize: 18,
  fontWeight: 700,
  marginBottom: 16,
}

const thStyle = {
  textAlign: 'left',
  padding: '10px 8px',
  fontSize: 13,
}

const tdStyle = {
  padding: '12px 8px',
  fontSize: 14,
}

const badgeStyle = {
  display: 'inline-flex',
  padding: '6px 10px',
  borderRadius: 999,
  background: 'rgba(59,130,246,0.1)',
  fontFamily: 'monospace',
  fontSize: 13,
}

const candidateRowStyle = {
  display: 'flex',
  gap: 12,
  alignItems: 'flex-start',
  padding: '14px 16px',
  borderRadius: 10,
  border: '1px solid #e5e7eb',
  background: '#ffffff',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
}

const memberDisplayNameStyle = {
  fontFamily: "'Microsoft YaHei UI', 'Microsoft YaHei', 'PingFang SC', 'Hiragino Sans GB', 'Noto Sans CJK SC', 'Source Han Sans SC', sans-serif",
  fontWeight: 600,
  fontSize: 14,
  color: '#111827',
  letterSpacing: 0.3,
}

const candidateFieldLabelStyle = {
  fontSize: 12,
  color: '#6b7280',
  marginBottom: 4,
}

export default AssessmentCampaignDetailPage
