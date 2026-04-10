import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import credentialApi from '../../../api/credential'
import useAuthStore from '../../../stores/authStore'
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

const SOURCE_OPTIONS = [
  { value: 'self_service', label: '用户自助申请' },
  { value: 'admin_direct', label: '管理员直建' },
]

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'submitted', label: '待审核' },
  { value: 'under_review', label: '审核中' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已驳回' },
  { value: 'generated', label: '已生成证件' },
]

const STATUS_META = {
  submitted: { tone: 'warning', label: '待审核' },
  under_review: { tone: 'warning', label: '审核中' },
  approved: { tone: 'success', label: '已通过' },
  rejected: { tone: 'danger', label: '已驳回' },
  generated: { tone: 'success', label: '已生成证件' },
  draft: { tone: 'neutral', label: '草稿' },
}

const EMPTY_FORM = {
  sourceMode: 'admin_direct',
  categoryId: '',
  personName: '',
  orgName: '',
  jobTitle: '',
  accessCodes: [],
  remark: '',
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('zh-CN')
}

export default function CredentialApplicationPage() {
  const { user } = useAuthStore()
  const [searchParams] = useSearchParams()
  const raceId = searchParams.get('raceId')
  const orgId = searchParams.get('orgId') || ''
  const { buildHref } = useCredentialSurface()
  const context = useMemo(() => ({ orgId, raceId: raceId || '' }), [orgId, raceId])

  const [categories, setCategories] = useState([])
  const [accessAreas, setAccessAreas] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [panelMode, setPanelMode] = useState('create')
  const [form, setForm] = useState({
    ...EMPTY_FORM,
    personName: user?.name || '',
  })

  const isAdmin = ['org_admin', 'super_admin'].includes(user?.role)

  const loadData = async () => {
    if (!raceId) return
    setLoading(true)
    try {
      const [categoryRes, accessAreaRes, requestRes] = await Promise.all([
        credentialApi.getCategories(raceId),
        credentialApi.getAccessAreas(raceId),
        credentialApi.getRequests(raceId, statusFilter ? { status: statusFilter } : {}),
      ])
      if (categoryRes.success) setCategories(categoryRes.data || [])
      if (accessAreaRes.success) setAccessAreas(accessAreaRes.data || [])
      if (requestRes.success) setRequests(requestRes.data || [])
    } catch (err) {
      setMessage(`加载证件申请失败：${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [raceId, statusFilter])

  const currentCategory = useMemo(
    () => categories.find((item) => String(item.id) === String(form.categoryId)) || null,
    [categories, form.categoryId],
  )

  useEffect(() => {
    if (!currentCategory) return
    setForm((prev) => {
      if (prev.accessCodes.length > 0) return prev
      return {
        ...prev,
        accessCodes: (currentCategory.accessAreas || []).map((item) => item.accessCode),
      }
    })
  }, [currentCategory])

  const metrics = useMemo(() => {
    const pendingCount = requests.filter((item) => ['submitted', 'under_review'].includes(item.status)).length
    const directCount = requests.filter((item) => item.sourceMode === 'admin_direct').length
    return [
      { label: '证件类别', value: loading ? '...' : formatNumber(categories.length), meta: '创建请求时先锁定类别与默认区域。' },
      { label: '请求池', value: loading ? '...' : formatNumber(requests.length), meta: '建单与自助申请现在回到同一个池子。' },
      { label: '待推进', value: loading ? '...' : formatNumber(pendingCount), meta: '优先送往审核中心的请求数量。' },
      { label: '直建占比', value: loading ? '...' : formatNumber(directCount), meta: '方便判断当前建单更多来自后台还是前台。' },
    ]
  }, [categories.length, loading, requests])

  const resetForm = () => {
    setForm({
      ...EMPTY_FORM,
      sourceMode: isAdmin ? 'admin_direct' : 'self_service',
      personName: user?.name || '',
    })
  }

  const toggleAccessCode = (accessCode) => {
    setForm((prev) => ({
      ...prev,
      accessCodes: prev.accessCodes.includes(accessCode)
        ? prev.accessCodes.filter((code) => code !== accessCode)
        : [...prev.accessCodes, accessCode],
    }))
  }

  const openRequestDetail = async (requestId) => {
    try {
      const res = await credentialApi.getRequest(raceId, requestId)
      if (res.success) {
        setSelectedRequest(res.data)
        setPanelMode('detail')
      }
    } catch (err) {
      setMessage(`加载申请详情失败：${err.message}`)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!form.categoryId) {
      setMessage('请选择证件类别')
      return
    }
    if (!form.personName.trim()) {
      setMessage('请填写姓名')
      return
    }

    setSaving(true)
    setMessage('')

    try {
      await credentialApi.createRequest(raceId, {
        sourceMode: isAdmin ? form.sourceMode : 'self_service',
        categoryId: Number(form.categoryId),
        personName: form.personName.trim(),
        orgName: form.orgName.trim() || undefined,
        jobTitle: form.jobTitle.trim() || undefined,
        accessCodes: form.accessCodes.length > 0 ? form.accessCodes : undefined,
        remark: form.remark.trim() || undefined,
      })

      setMessage('请求已提交，申请池已刷新')
      setPanelMode('create')
      setSelectedRequest(null)
      resetForm()
      await loadData()
    } catch (err) {
      setMessage(`提交失败：${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  if (!raceId) {
    return (
      <AdminSurface title="先选择赛事" subtitle="证件申请与建单都依赖明确的赛事上下文。">
        <AdminEmptyState
          title="当前没有赛事上下文"
          description="先锁定赛事，申请池、类别和通行区域规则才会完整。"
          action={<Link to={buildHref('/credential/select-race', context)} className="btn btn--primary">去选择赛事</Link>}
        />
      </AdminSurface>
    )
  }

  return (
    <div style={pageStyle}>
      <AdminSectionHeader
        eyebrow="申请工位"
        title="申请与建单"
        description="这里把自助申请和管理员直建收回同一条建单链路。左侧看请求池，右侧直接建单或回看详情，避免之前不停弹窗切换。"
        metrics={metrics}
        actions={
          <>
            <Link to={buildHref('/credential-center', context)} className="btn btn--ghost">返回证件中心</Link>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                setPanelMode('create')
                setSelectedRequest(null)
                setMessage('')
              }}
            >
              新建请求
            </button>
          </>
        }
      />

      {message ? (
        <AdminNotice tone={message.includes('失败') ? 'danger' : 'success'}>
          {message}
        </AdminNotice>
      ) : null}

      <AdminToolbar>
        <div style={toolbarStyle}>
          <div style={toolbarMetaStyle}>
            <AdminStatusPill tone="warning">{`当前请求 ${formatNumber(requests.length)} 条`}</AdminStatusPill>
            <AdminStatusPill tone="neutral">{`类别 ${formatNumber(categories.length)} 个`}</AdminStatusPill>
          </div>
          <div style={toolbarActionStyle}>
            <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={filterSelectStyle}>
              {STATUS_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <Link to={buildHref('/credential/review', context)} className="btn btn--ghost">进入审核中心</Link>
          </div>
        </div>
      </AdminToolbar>

      <div style={layoutStyle}>
        <AdminSurface
          title="请求池"
          subtitle="建单完成后，所有申请都会在这里汇总，再流向审核和发放。"
        >
          {loading ? (
            <AdminEmptyState title="正在加载请求池" description="会同步读取当前赛事下的申请记录、类别和区域规则。" />
          ) : requests.length === 0 ? (
            <AdminEmptyState title="暂无申请记录" description="右侧已经准备好建单工作台，可以直接创建第一条请求。" />
          ) : (
            <AdminDataTable>
              <thead>
                <tr>
                  <th>申请人</th>
                  <th>类别</th>
                  <th>来源</th>
                  <th>状态</th>
                  <th>提交时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => {
                  const status = STATUS_META[request.status] || STATUS_META.draft
                  const active = selectedRequest && String(selectedRequest.id) === String(request.id)
                  return (
                    <tr key={request.id} style={active ? activeRowStyle : null}>
                      <td>
                        <div style={primaryCellStyle}>{request.personName}</div>
                        <div style={secondaryCellStyle}>{request.orgName || '-'}</div>
                      </td>
                      <td>
                        <div style={primaryCellStyle}>{request.categoryName}</div>
                        <div style={secondaryCellStyle}>{request.jobTitle || '未填写职务'}</div>
                      </td>
                      <td>{request.sourceMode === 'admin_direct' ? '管理员直建' : '用户自助'}</td>
                      <td>
                        <AdminStatusPill tone={status.tone}>{status.label}</AdminStatusPill>
                      </td>
                      <td>{new Date(request.createdAt).toLocaleString('zh-CN')}</td>
                      <td>
                        <button type="button" className={`btn ${active ? 'btn--secondary' : 'btn--ghost'} btn--sm`} onClick={() => openRequestDetail(request.id)}>
                          {active ? '查看中' : '看详情'}
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
          title={panelMode === 'create' ? '建单工作台' : `请求详情 · ${selectedRequest?.personName || ''}`}
          subtitle={panelMode === 'create' ? '在这里直接创建请求，类别默认规则会自动回填到通行区域。' : '详情留在右侧常驻面板里，不再通过弹窗临时查看。'}
          actions={panelMode === 'detail' ? (
            <>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPanelMode('create')}>
                新建请求
              </button>
              {selectedRequest && ['submitted', 'under_review'].includes(selectedRequest.status) ? (
                <Link to={buildHref('/credential/review', context)} className="btn btn--primary btn--sm">送去审核</Link>
              ) : null}
              {selectedRequest && selectedRequest.status === 'generated' ? (
                <Link to={buildHref('/credential/issue', context)} className="btn btn--primary btn--sm">去发放</Link>
              ) : null}
            </>
          ) : null}
        >
          {panelMode === 'create' ? (
            <form onSubmit={handleSubmit} style={formStyle}>
              {isAdmin ? (
                <label style={fieldStyle}>
                  <span style={fieldLabelStyle}>创建方式</span>
                  <select
                    className="input"
                    value={form.sourceMode}
                    onChange={(event) => setForm((prev) => ({ ...prev, sourceMode: event.target.value }))}
                  >
                    {SOURCE_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>
              ) : null}

              <div style={fieldGridStyle}>
                <label style={fieldStyle}>
                  <span style={fieldLabelStyle}>证件类别</span>
                  <select
                    className="input"
                    value={form.categoryId}
                    onChange={(event) => setForm((prev) => ({ ...prev, categoryId: event.target.value, accessCodes: [] }))}
                  >
                    <option value="">请选择类别</option>
                    {categories.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.categoryName}{item.requiresReview ? '（需审核）' : '（自动通过）'}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={fieldStyle}>
                  <span style={fieldLabelStyle}>姓名</span>
                  <input
                    className="input"
                    type="text"
                    value={form.personName}
                    onChange={(event) => setForm((prev) => ({ ...prev, personName: event.target.value }))}
                  />
                </label>

                <label style={fieldStyle}>
                  <span style={fieldLabelStyle}>单位名称</span>
                  <input
                    className="input"
                    type="text"
                    value={form.orgName}
                    onChange={(event) => setForm((prev) => ({ ...prev, orgName: event.target.value }))}
                  />
                </label>

                <label style={fieldStyle}>
                  <span style={fieldLabelStyle}>职务</span>
                  <input
                    className="input"
                    type="text"
                    value={form.jobTitle}
                    onChange={(event) => setForm((prev) => ({ ...prev, jobTitle: event.target.value }))}
                    placeholder="例如 主裁判 / 检录志愿者"
                  />
                </label>
              </div>

              <div style={ruleNoticeStyle}>
                <AdminStatusPill tone="warning">{currentCategory ? `默认规则来自 ${currentCategory.categoryName}` : '先选类别再回填规则'}</AdminStatusPill>
                <span style={ruleTextStyle}>
                  {currentCategory
                    ? '右下方区域列表已经按当前类别的默认规则预填，你可以继续微调。'
                    : '类别会决定默认通行区域和后续审核链路。'}
                </span>
              </div>

              <label style={fieldStyle}>
                <span style={fieldLabelStyle}>最终通行区域</span>
                <div style={accessGridStyle}>
                  {accessAreas.map((item) => (
                    <label key={item.id} style={{ ...accessChipStyle, ...(form.accessCodes.includes(item.accessCode) ? accessChipActiveStyle : null) }}>
                      <input
                        type="checkbox"
                        checked={form.accessCodes.includes(item.accessCode)}
                        onChange={() => toggleAccessCode(item.accessCode)}
                        style={hiddenCheckboxStyle}
                      />
                      <span style={{ ...accessDotStyle, background: item.accessColor || '#f97316' }} />
                      <span style={accessNameStyle}>{item.accessName}</span>
                      <span style={accessCodeStyle}>{item.accessCode}</span>
                    </label>
                  ))}
                </div>
              </label>

              <label style={fieldStyle}>
                <span style={fieldLabelStyle}>备注</span>
                <textarea
                  className="input"
                  value={form.remark}
                  onChange={(event) => setForm((prev) => ({ ...prev, remark: event.target.value }))}
                  style={textareaStyle}
                  placeholder="记录建单背景、特殊要求或申请来源说明。"
                />
              </label>

              <div style={actionRowStyle}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    resetForm()
                    setMessage('')
                  }}
                  disabled={saving}
                >
                  重置
                </button>
                <button type="submit" className="btn btn--primary" disabled={saving}>
                  {saving ? '提交中...' : '提交请求'}
                </button>
              </div>
            </form>
          ) : !selectedRequest ? (
            <AdminEmptyState title="没有选中请求" description="从左侧请求池点开一条记录后，这里会显示完整详情与下一步动作。" />
          ) : (
            <div style={detailPanelStyle}>
              <div style={summaryGridStyle}>
                <div style={summaryCardStyle}>
                  <span style={summaryLabelStyle}>类别</span>
                  <span style={summaryValueStyle}>{selectedRequest.categoryName}</span>
                </div>
                <div style={summaryCardStyle}>
                  <span style={summaryLabelStyle}>姓名</span>
                  <span style={summaryValueStyle}>{selectedRequest.personName}</span>
                </div>
                <div style={summaryCardStyle}>
                  <span style={summaryLabelStyle}>单位</span>
                  <span style={summaryValueStyle}>{selectedRequest.orgName || '-'}</span>
                </div>
                <div style={summaryCardStyle}>
                  <span style={summaryLabelStyle}>来源</span>
                  <span style={summaryValueStyle}>{selectedRequest.sourceMode === 'admin_direct' ? '管理员直建' : '用户自助'}</span>
                </div>
              </div>

              <div style={signalRowStyle}>
                <AdminStatusPill tone={(STATUS_META[selectedRequest.status] || STATUS_META.draft).tone}>
                  {(STATUS_META[selectedRequest.status] || STATUS_META.draft).label}
                </AdminStatusPill>
                <span style={secondaryCellStyle}>{new Date(selectedRequest.createdAt).toLocaleString('zh-CN')}</span>
              </div>

              <div style={fieldStyle}>
                <span style={fieldLabelStyle}>通行区域</span>
                <div style={accessGridStyle}>
                  {(selectedRequest.accessAreas || []).map((item) => (
                    <div key={item.accessCode} style={detailAccessChipStyle}>
                      <span style={{ ...accessDotStyle, background: item.accessColor || '#f97316' }} />
                      <span style={accessNameStyle}>{item.accessName || item.accessCode}</span>
                      <span style={accessCodeStyle}>{item.accessCode}</span>
                    </div>
                  ))}
                </div>
              </div>

              {selectedRequest.reviewRemark ? (
                <div style={detailBlockStyle}>
                  <span style={fieldLabelStyle}>审核意见</span>
                  <p style={detailTextStyle}>{selectedRequest.reviewRemark}</p>
                </div>
              ) : null}

              {selectedRequest.rejectReason ? (
                <div style={detailBlockStyle}>
                  <span style={fieldLabelStyle}>驳回原因</span>
                  <p style={{ ...detailTextStyle, color: '#b91c1c' }}>{selectedRequest.rejectReason}</p>
                </div>
              ) : null}
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

const toolbarMetaStyle = {
  display: 'flex',
  gap: 10,
  flexWrap: 'wrap',
  alignItems: 'center',
}

const toolbarActionStyle = {
  display: 'flex',
  gap: 10,
  flexWrap: 'wrap',
  alignItems: 'center',
}

const filterSelectStyle = {
  minWidth: 180,
}

const layoutStyle = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.08fr) minmax(360px, 0.92fr)',
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

const formStyle = {
  display: 'grid',
  gap: 16,
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

const ruleNoticeStyle = {
  display: 'flex',
  gap: 10,
  flexWrap: 'wrap',
  alignItems: 'center',
  padding: '14px 16px',
  borderRadius: 18,
  background: 'rgba(15, 23, 42, 0.04)',
}

const ruleTextStyle = {
  color: '#66717f',
  fontSize: 13,
  lineHeight: 1.6,
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
  cursor: 'pointer',
  position: 'relative',
}

const accessChipActiveStyle = {
  borderColor: 'rgba(249, 115, 22, 0.28)',
  background: 'rgba(249, 115, 22, 0.08)',
}

const detailAccessChipStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '12px 14px',
  borderRadius: 16,
  border: '1px solid rgba(17, 24, 39, 0.08)',
  background: 'rgba(248, 250, 252, 0.88)',
}

const hiddenCheckboxStyle = {
  position: 'absolute',
  opacity: 0,
  pointerEvents: 'none',
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

const detailPanelStyle = {
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

const signalRowStyle = {
  display: 'flex',
  gap: 10,
  alignItems: 'center',
  flexWrap: 'wrap',
}

const detailBlockStyle = {
  display: 'grid',
  gap: 8,
}

const detailTextStyle = {
  margin: 0,
  fontSize: 14,
  lineHeight: 1.7,
  color: '#334155',
}
