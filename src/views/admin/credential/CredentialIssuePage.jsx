import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCredentialSurface } from './useCredentialSurface'
import {
  AdminDataTable,
  AdminEmptyState,
  AdminNotice,
  AdminSectionHeader,
  AdminStatusPill,
  AdminSurface,
  AdminToolbar,
} from '../../../components/admin/AdminWorkbench'

const STATUS_LABELS = {
  generated: '待打印',
  printed: '待领取',
  issued: '已领取',
  returned: '已归还',
  voided: '已作废',
}

const STATUS_TONES = {
  generated: 'neutral',
  printed: 'warning',
  issued: 'success',
  returned: 'warning',
  voided: 'danger',
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('zh-CN')
}

export default function CredentialIssuePage() {
  const { buildHref, credentialApi, orgId, raceId } = useCredentialSurface()
  const context = useMemo(() => ({ orgId, raceId: raceId || '' }), [orgId, raceId])

  const [credentials, setCredentials] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedCredential, setSelectedCredential] = useState(null)
  const [issuing, setIssuing] = useState(false)
  const [message, setMessage] = useState('')
  const [issueForm, setIssueForm] = useState({
    recipientName: '',
    recipientIdCard: '',
    remark: '',
  })

  useEffect(() => {
    if (!raceId) {
      setLoading(false)
      return
    }

    const loadCredentials = async () => {
      setLoading(true)
      try {
        const res = await credentialApi.getCredentials(raceId, { status: statusFilter || undefined })
        if (res.success) {
          setCredentials(res.data || [])
        } else {
          setMessage(res.message || '加载证件列表失败')
        }
      } catch (err) {
        setMessage(`请求失败：${err.message}`)
      } finally {
        setLoading(false)
      }
    }

    void loadCredentials()
  }, [credentialApi, raceId, statusFilter])

  const filteredCredentials = useMemo(() => {
    const keyword = searchKeyword.trim()
    return credentials.filter((cred) => {
      const matchSearch = !keyword
        || cred.personName?.includes(keyword)
        || cred.credentialNo?.includes(keyword)
        || cred.categoryName?.includes(keyword)

      const matchStatus = !statusFilter || cred.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [credentials, searchKeyword, statusFilter])

  const stats = useMemo(() => ({
    pending: credentials.filter((item) => item.status === 'generated' || item.status === 'printed').length,
    issued: credentials.filter((item) => item.status === 'issued').length,
    returned: credentials.filter((item) => item.status === 'returned').length,
    voided: credentials.filter((item) => item.status === 'voided').length,
  }), [credentials])

  const metrics = useMemo(() => ([
    { label: '待领取', value: loading ? '...' : formatNumber(stats.pending), meta: '优先处理 generated 与 printed 状态。' },
    { label: '已领取', value: loading ? '...' : formatNumber(stats.issued), meta: '已经完成发放并进入有效持有状态。' },
    { label: '已归还', value: loading ? '...' : formatNumber(stats.returned), meta: '可以回看领用记录与归还动作。' },
    { label: '已作废', value: loading ? '...' : formatNumber(stats.voided), meta: '作废件需要和重新制证、补发流程联动。' },
  ]), [loading, stats])

  const openIssuePanel = (credential) => {
    if (credential.status === 'issued') {
      setMessage('该证件已领取，无需重复发放')
      return
    }
    if (credential.status === 'voided') {
      setMessage('该证件已作废，无法继续发放')
      return
    }
    setSelectedCredential(credential)
    setIssueForm({
      recipientName: credential.personName || '',
      recipientIdCard: '',
      remark: '',
    })
    setMessage('')
  }

  const handleIssue = async () => {
    if (!selectedCredential) return

    if (!issueForm.recipientName.trim()) {
      setMessage('请填写领取人姓名')
      return
    }

    setIssuing(true)
    setMessage('')

    try {
      const res = await credentialApi.issueCredential(raceId, selectedCredential.id, {
        recipientName: issueForm.recipientName.trim(),
        recipientIdCard: issueForm.recipientIdCard.trim() || undefined,
        remark: issueForm.remark.trim() || undefined,
      })

      if (res.success) {
        const issuedAt = new Date().toISOString()
        setCredentials((prev) => prev.map((item) => (
          item.id === selectedCredential.id
            ? {
                ...item,
                status: 'issued',
                issuedToUserName: issueForm.recipientName.trim(),
                issuedAt,
              }
            : item
        )))

        setSelectedCredential((prev) => (
          prev
            ? {
                ...prev,
                status: 'issued',
                issuedToUserName: issueForm.recipientName.trim(),
                issuedAt,
              }
            : prev
        ))
        setMessage('证件发放完成')
      } else {
        setMessage(res.message || '领取失败')
      }
    } catch (err) {
      setMessage(`请求失败：${err.message}`)
    } finally {
      setIssuing(false)
    }
  }

  if (!raceId) {
    return (
      <AdminSurface title="先选择赛事" subtitle="领取管理需要基于明确赛事查看证件池。">
        <AdminEmptyState
          title="当前没有赛事上下文"
          description="先锁定赛事，再查看待领取证件、发放记录和异常状态。"
          action={<Link to={buildHref('/credential/select-race', context)} className="btn btn--primary">去选择赛事</Link>}
        />
      </AdminSurface>
    )
  }

  return (
    <div style={pageStyle}>
      <AdminSectionHeader
        eyebrow="发放控制台"
        title="领取管理"
        description="发放页已经从弹窗确认改成“证件池 + 发放工作台”。左侧持续看待领取证件，右侧完成实名登记和发放确认，更适合高频窗口作业。"
        metrics={metrics}
        actions={<Link to={buildHref('/credential-center', context)} className="btn btn--ghost">返回证件中心</Link>}
      />

      {message ? (
        <AdminNotice tone={message.includes('失败') || message.includes('无法') || message.includes('请填写') ? 'danger' : 'success'}>
          {message}
        </AdminNotice>
      ) : null}

      <AdminToolbar>
        <div style={toolbarStyle}>
          <div style={toolbarFieldStyle}>
            <input
              className="input"
              type="text"
              placeholder="搜索姓名 / 编号 / 岗位"
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              style={searchInputStyle}
            />
            <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={filterSelectStyle}>
              <option value="">全部状态</option>
              <option value="generated">待打印</option>
              <option value="printed">待领取</option>
              <option value="issued">已领取</option>
              <option value="returned">已归还</option>
              <option value="voided">已作废</option>
            </select>
          </div>
          <div style={toolbarMetaStyle}>
            <AdminStatusPill tone="warning">{`结果 ${formatNumber(filteredCredentials.length)} 条`}</AdminStatusPill>
            <Link to={buildHref('/credential/requests', context)} className="btn btn--ghost">回到申请池</Link>
          </div>
        </div>
      </AdminToolbar>

      <div style={layoutStyle}>
        <AdminSurface
          title="证件池"
          subtitle="先锁定一张证件，再在右侧完成领取登记和确认。"
        >
          {loading ? (
            <AdminEmptyState title="正在加载证件池" description="马上就能开始发放和回看领取状态。" />
          ) : filteredCredentials.length === 0 ? (
            <AdminEmptyState title="暂无对应证件" description="当前筛选下没有可用证件，可能还未完成审核或制证。" />
          ) : (
            <AdminDataTable>
              <thead>
                <tr>
                  <th>证件编号</th>
                  <th>姓名</th>
                  <th>身份</th>
                  <th>单位</th>
                  <th>状态</th>
                  <th>领用人</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredCredentials.map((cred) => {
                  const active = selectedCredential && String(selectedCredential.id) === String(cred.id)
                  return (
                    <tr key={cred.id} style={active ? activeRowStyle : null}>
                      <td>{cred.credentialNo || '-'}</td>
                      <td>
                        <div style={primaryCellStyle}>{cred.personName}</div>
                        <div style={secondaryCellStyle}>
                          {(cred.accessAreas || []).map((area) => area.accessCode).join(' / ') || '未配置区域'}
                        </div>
                      </td>
                      <td>{cred.categoryName || '-'}</td>
                      <td>{cred.orgName || '-'}</td>
                      <td>
                        <AdminStatusPill tone={STATUS_TONES[cred.status] || 'neutral'}>
                          {STATUS_LABELS[cred.status] || cred.status}
                        </AdminStatusPill>
                      </td>
                      <td>{cred.issuedToUserName || '-'}</td>
                      <td>
                        <button
                          type="button"
                          className={`btn ${active ? 'btn--secondary' : 'btn--ghost'} btn--sm`}
                          onClick={() => openIssuePanel(cred)}
                        >
                          {active ? '处理中' : cred.status === 'issued' ? '查看' : '去发放'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </AdminDataTable>
          )}
        </AdminSurface>

        <AdminSurface
          title={selectedCredential ? `发放 ${selectedCredential.personName}` : '发放工作台'}
          subtitle={selectedCredential ? '确认领用人信息后，再完成发放动作。' : '从左侧证件池点开一张证件，这里会显示领取登记表单。'}
          actions={selectedCredential ? (
            <AdminStatusPill tone={STATUS_TONES[selectedCredential.status] || 'neutral'}>
              {STATUS_LABELS[selectedCredential.status] || selectedCredential.status}
            </AdminStatusPill>
          ) : null}
        >
          {!selectedCredential ? (
            <AdminEmptyState title="还没有选中证件" description="左侧证件池会一直保留，适合窗口连续发放，不需要每次开关弹窗。" />
          ) : (
            <div style={panelStyle}>
              <div style={summaryGridStyle}>
                <div style={summaryCardStyle}>
                  <span style={summaryLabelStyle}>证件编号</span>
                  <span style={summaryValueStyle}>{selectedCredential.credentialNo || '-'}</span>
                </div>
                <div style={summaryCardStyle}>
                  <span style={summaryLabelStyle}>姓名</span>
                  <span style={summaryValueStyle}>{selectedCredential.personName || '-'}</span>
                </div>
                <div style={summaryCardStyle}>
                  <span style={summaryLabelStyle}>身份类别</span>
                  <span style={summaryValueStyle}>{selectedCredential.categoryName || '-'}</span>
                </div>
                <div style={summaryCardStyle}>
                  <span style={summaryLabelStyle}>所属单位</span>
                  <span style={summaryValueStyle}>{selectedCredential.orgName || '-'}</span>
                </div>
              </div>

              <div style={fieldStyle}>
                <span style={fieldLabelStyle}>可通行区域</span>
                <div style={accessGridStyle}>
                  {(selectedCredential.accessAreas || []).map((area) => (
                    <div key={area.accessCode} style={accessChipStyle}>
                      <span style={{ ...accessDotStyle, background: area.accessColor || '#f97316' }} />
                      <span style={accessNameStyle}>{area.accessName || area.accessCode}</span>
                      <span style={accessCodeStyle}>{area.accessCode}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={fieldGridStyle}>
                <label style={fieldStyle}>
                  <span style={fieldLabelStyle}>领取人姓名</span>
                  <input
                    className="input"
                    type="text"
                    value={issueForm.recipientName}
                    onChange={(event) => setIssueForm((prev) => ({ ...prev, recipientName: event.target.value }))}
                    disabled={issuing || selectedCredential.status === 'issued' || selectedCredential.status === 'voided'}
                    placeholder="请输入实际领取证件的人员姓名"
                  />
                </label>

                <label style={fieldStyle}>
                  <span style={fieldLabelStyle}>领取人身份证号</span>
                  <input
                    className="input"
                    type="text"
                    value={issueForm.recipientIdCard}
                    onChange={(event) => setIssueForm((prev) => ({ ...prev, recipientIdCard: event.target.value }))}
                    disabled={issuing || selectedCredential.status === 'issued' || selectedCredential.status === 'voided'}
                    placeholder="选填，用于实名追溯"
                  />
                </label>
              </div>

              <label style={fieldStyle}>
                <span style={fieldLabelStyle}>发放备注</span>
                <textarea
                  className="input"
                  rows={3}
                  value={issueForm.remark}
                  onChange={(event) => setIssueForm((prev) => ({ ...prev, remark: event.target.value }))}
                  disabled={issuing || selectedCredential.status === 'issued' || selectedCredential.status === 'voided'}
                  placeholder="例如代领关系、补发说明、现场核验情况。"
                  style={textareaStyle}
                />
              </label>

              <div style={actionRowStyle}>
                <button type="button" className="btn btn--ghost" onClick={() => setSelectedCredential(null)} disabled={issuing}>
                  关闭面板
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={handleIssue}
                  disabled={issuing || selectedCredential.status === 'issued' || selectedCredential.status === 'voided'}
                >
                  {issuing ? '处理中...' : selectedCredential.status === 'issued' ? '已发放' : '确认发放'}
                </button>
              </div>
            </div>
          )}
        </AdminSurface>
      </div>
    </div>
  )
}

const pageStyle = {
  display: 'grid',
  gap: 18,
}

const toolbarStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  flexWrap: 'wrap',
  alignItems: 'center',
}

const toolbarFieldStyle = {
  display: 'flex',
  gap: 10,
  flexWrap: 'wrap',
  alignItems: 'center',
}

const toolbarMetaStyle = {
  display: 'flex',
  gap: 10,
  flexWrap: 'wrap',
  alignItems: 'center',
}

const searchInputStyle = {
  minWidth: 220,
}

const filterSelectStyle = {
  minWidth: 170,
}

const layoutStyle = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.12fr) minmax(360px, 0.88fr)',
  gap: 18,
  alignItems: 'start',
}

const activeRowStyle = {
  outline: '1px solid rgba(249, 115, 22, 0.24)',
}

const primaryCellStyle = {
  fontWeight: 700,
  letterSpacing: '-0.02em',
}

const secondaryCellStyle = {
  marginTop: 4,
  color: '#66717f',
  fontSize: 12,
}

const panelStyle = {
  display: 'grid',
  gap: 16,
}

const summaryGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 10,
}

const summaryCardStyle = {
  display: 'grid',
  gap: 6,
  padding: '14px 16px',
  borderRadius: 18,
  background: 'rgba(15, 23, 42, 0.04)',
  border: '1px solid rgba(17, 24, 39, 0.08)',
}

const summaryLabelStyle = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#66717f',
}

const summaryValueStyle = {
  fontWeight: 700,
  lineHeight: 1.5,
}

const fieldGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 12,
}

const fieldStyle = {
  display: 'grid',
  gap: 8,
}

const fieldLabelStyle = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#66717f',
}

const accessGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: 10,
}

const accessChipStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '12px 14px',
  borderRadius: 16,
  border: '1px solid rgba(17, 24, 39, 0.08)',
  background: 'rgba(248, 250, 252, 0.88)',
}

const accessDotStyle = {
  width: 12,
  height: 12,
  borderRadius: 999,
  flexShrink: 0,
}

const accessNameStyle = {
  fontWeight: 600,
  minWidth: 0,
}

const accessCodeStyle = {
  marginLeft: 'auto',
  fontSize: 12,
  color: '#66717f',
}

const textareaStyle = {
  minHeight: 96,
}

const actionRowStyle = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 10,
  flexWrap: 'wrap',
}
