import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import assessmentAdminApi from '../../../api/assessmentAdmin'

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

  const templateItems = detail?.template?.items || []
  const reportMembers = useMemo(() => detail?.report?.members || [], [detail])
  const inviteCodes = detail?.inviteCodes || []

  const loadDetail = async () => {
    setLoading(true)
    try {
      const res = await assessmentAdminApi.getCampaignDetail(id)
      if (res.success) {
        setDetail((prev) => ({ ...prev, ...res.data }))
      }
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const loadOverview = async () => {
    try {
      const res = await assessmentAdminApi.getReportOverview(id)
      if (res.success) {
        setDetail((prev) => ({ ...prev, report: res.data }))
      }
    } catch (error) {
      setMessage(error.message)
    }
  }

  useEffect(() => {
    void loadDetail()
  }, [id])

  useEffect(() => {
    if (!detail?.campaign?.id) return
    void loadOverview()
  }, [detail?.campaign?.id])

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
        setDetail((prev) => ({ ...prev, ...res.data }))
        setMessage('评分模板已保存。')
      }
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDownloadTemplate = async () => {
    const res = await assessmentAdminApi.getRosterTemplate(id)
    const meta = res.data
    const headers = meta.columns.map((item) => item.title)
    const rows = meta.sampleRows.map((row) => ({
      工号: row.employeeCode,
      姓名: row.employeeName,
      岗位: row.position,
      团队: row.teamName,
      部门: row.department,
      排序: row.sortOrder,
    }))

    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers })
    XLSX.utils.book_append_sheet(workbook, worksheet, 'roster')
    XLSX.writeFile(workbook, meta.fileName)
  }

  const handleRosterUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
      const normalizedRows = rows.map((row) => ({
        employeeCode: row['工号'],
        employeeName: row['姓名'],
        position: row['岗位'],
        teamName: row['团队'],
        department: row['部门'],
        sortOrder: row['排序'],
      }))

      const previewRes = await assessmentAdminApi.previewRosterImport(id, normalizedRows)
      if (!previewRes.success) return

      const duplicateCodes = previewRes.data.duplicateEmployeeCodes || []
      if (duplicateCodes.length > 0) {
        setMessage(`导入失败，工号重复：${duplicateCodes.join('、')}`)
        return
      }

      const commitRes = await assessmentAdminApi.commitRosterImport(id, previewRes.data.rows)
      if (commitRes.success) {
        setMessage(`名单导入成功，共 ${commitRes.data.length} 人。`)
        await loadDetail()
      }
    } catch (error) {
      setMessage(error.message)
    } finally {
      event.target.value = ''
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
        setDetail((prev) => ({ ...prev, ...res.data }))
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
        setDetail((prev) => ({ ...prev, ...res.data }))
        setMessage('考评活动已关闭。')
      }
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleResetInviteCode = async (inviteCodeId) => {
    if (!window.confirm('确认重置该邀请码的评分进度吗？这会清空它已提交和未提交的数据。')) return
    try {
      const res = await assessmentAdminApi.resetInviteCodeProgress(inviteCodeId)
      if (res.success) {
        setMessage('邀请码进度已重置。')
        await loadDetail()
        await loadOverview()
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

  if (loading) return <div style={{ padding: 24 }}>加载中...</div>
  if (!detail) return <div style={{ padding: 24 }}>未找到考评活动。</div>

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{detail.campaign.name}</h1>
          <div style={{ color: 'var(--color-text-secondary)', marginTop: 6 }}>
            {detail.campaign.raceName || '未关联赛事'} · 状态：{detail.campaign.status}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn--secondary" onClick={handlePublish} disabled={saving || detail.campaign.status !== 'draft'}>发布活动</button>
          <button className="btn btn--ghost" onClick={handleClose} disabled={saving || detail.campaign.status === 'closed'}>关闭活动</button>
        </div>
      </div>

      {message && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 10,
          background: 'rgba(59,130,246,0.1)',
          color: 'var(--color-text-primary)',
        }}
        >
          {message}
        </div>
      )}

      <div style={cardStyle}>
        <div style={titleStyle}>评分模板</div>
        <div style={{ display: 'grid', gap: 12 }}>
          <input
            className="input"
            value={detail.template.title}
            onChange={(e) => setDetail((prev) => ({ ...prev, template: { ...prev.template, title: e.target.value } }))}
            placeholder="模板标题"
          />
          <textarea
            className="input"
            rows={3}
            value={detail.template.instructions}
            onChange={(e) => setDetail((prev) => ({ ...prev, template: { ...prev.template, instructions: e.target.value } }))}
            placeholder="模板说明"
          />
          {templateItems.map((item, index) => (
            <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '220px 1fr 90px', gap: 12 }}>
              <input className="input" value={item.title} onChange={(e) => updateTemplateItem(index, 'title', e.target.value)} />
              <input className="input" value={item.description} onChange={(e) => updateTemplateItem(index, 'description', e.target.value)} />
              <input className="input" type="number" value={item.weight} onChange={(e) => updateTemplateItem(index, 'weight', Number(e.target.value || 1))} />
            </div>
          ))}
          <div>
            <button className="btn btn--primary" onClick={handleSaveTemplate} disabled={saving || detail.campaign.status !== 'draft'}>保存模板</button>
          </div>
        </div>
      </div>

      <div style={twoColumnStyle}>
        <div style={cardStyle}>
          <div style={titleStyle}>名单导入</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <button className="btn btn--secondary" onClick={handleDownloadTemplate}>下载模板</button>
            <label className="btn btn--primary" style={{ cursor: 'pointer' }}>
              上传名单
              <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleRosterUpload} />
            </label>
          </div>
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
            当前成员数：{detail.members.length}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={titleStyle}>邀请码管理</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <input className="input" type="number" value={inviteCount} onChange={(e) => setInviteCount(e.target.value)} style={{ maxWidth: 120 }} />
            <button className="btn btn--primary" onClick={handleGenerateInviteCodes} disabled={saving}>生成邀请码</button>
          </div>
          {generatedCodes.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 8 }}>本次生成</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {generatedCodes.map((code) => (
                  <div key={code.id} style={badgeStyle}>{code.plainCode}</div>
                ))}
              </div>
            </div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>状态</th>
                <th style={thStyle}>激活时间</th>
                <th style={thStyle}>完成时间</th>
                <th style={thStyle}>操作</th>
              </tr>
            </thead>
            <tbody>
              {inviteCodes.map((code) => (
                <tr key={code.id} style={{ borderTop: '1px solid var(--border-color, #e5e7eb)' }}>
                  <td style={tdStyle}>{code.status}</td>
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
                  <td style={tdStyle} colSpan={4}>暂无邀请码</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={titleStyle}>成员名单</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>工号</th>
              <th style={thStyle}>姓名</th>
              <th style={thStyle}>岗位</th>
              <th style={thStyle}>团队</th>
            </tr>
          </thead>
          <tbody>
            {detail.members.map((member) => (
              <tr key={member.id} style={{ borderTop: '1px solid var(--border-color, #e5e7eb)' }}>
                <td style={tdStyle}>{member.employeeCode}</td>
                <td style={tdStyle}>{member.employeeName}</td>
                <td style={tdStyle}>{member.position}</td>
                <td style={tdStyle}>{member.teamName || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={cardStyle}>
        <div style={titleStyle}>赛事报表</div>
        <div style={{ color: 'var(--color-text-secondary)', marginBottom: 12 }}>
          邀请码总数 {detail.report?.inviteCodeTotal || 0} · 已激活 {detail.report?.inviteCodeActivated || 0} · 已完成 {detail.report?.inviteCodeCompleted || 0}
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
              <tr key={member.id} style={{ borderTop: '1px solid var(--border-color, #e5e7eb)' }}>
                <td style={tdStyle}>{member.employeeCode}</td>
                <td style={tdStyle}>{member.employeeName}</td>
                <td style={tdStyle}>{member.position}</td>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={titleStyle}>成员报表详情</div>
            <button className="btn btn--ghost btn--sm" onClick={() => setSelectedMemberReport(null)}>关闭</button>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div><strong>姓名：</strong>{selectedMemberReport.member.employeeName}</div>
            <div><strong>工号：</strong>{selectedMemberReport.member.employeeCode}</div>
            <div><strong>岗位：</strong>{selectedMemberReport.member.position}</div>
            <div><strong>平均分：</strong>{selectedMemberReport.report.averageScore}</div>
            <div><strong>样本数：</strong>{selectedMemberReport.report.sampleCount}</div>
            <div><strong>方差：</strong>{selectedMemberReport.report.variance}</div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>维度</th>
                <th style={thStyle}>平均分</th>
              </tr>
            </thead>
            <tbody>
              {(selectedMemberReport.report.itemAverages || []).map((item) => (
                <tr key={item.itemId} style={{ borderTop: '1px solid var(--border-color, #e5e7eb)' }}>
                  <td style={tdStyle}>{item.title}</td>
                  <td style={tdStyle}>{item.averageScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(selectedMemberReport.report.comments || []).length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>匿名备注</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {selectedMemberReport.report.comments.map((comment, index) => (
                  <div key={`${index}-${comment}`} style={{ padding: 12, borderRadius: 10, background: 'var(--color-bg-secondary, #f5f5f5)' }}>
                    {comment}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={cardStyle}>
        <div style={titleStyle}>成长预览</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input className="input" value={growthCode} onChange={(e) => setGrowthCode(e.target.value)} placeholder="输入工号" style={{ maxWidth: 240 }} />
          <button className="btn btn--primary" onClick={handleGrowthSearch}>查询</button>
        </div>
        {growthReport?.timeline?.length ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>年份</th>
                <th style={thStyle}>活动</th>
                <th style={thStyle}>均分</th>
                <th style={thStyle}>样本数</th>
              </tr>
            </thead>
            <tbody>
              {growthReport.timeline.map((row) => (
                <tr key={`${row.campaignId}-${row.year}`} style={{ borderTop: '1px solid var(--border-color, #e5e7eb)' }}>
                  <td style={tdStyle}>{row.year}</td>
                  <td style={tdStyle}>{row.campaignName}</td>
                  <td style={tdStyle}>{row.averageScore}</td>
                  <td style={tdStyle}>{row.sampleCount}</td>
                </tr>
              ))}
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

const twoColumnStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
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

export default AssessmentCampaignDetailPage
