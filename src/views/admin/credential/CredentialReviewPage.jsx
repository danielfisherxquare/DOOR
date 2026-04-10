import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import credentialApi from '../../../api/credential'
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

const TAB_OPTIONS = [
  { value: 'pending', label: '待处理' },
  { value: 'all', label: '全部请求' },
]

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'submitted', label: '待审核' },
  { value: 'under_review', label: '审核中' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已驳回' },
]

const STATUS_META = {
  submitted: { tone: 'warning', label: '待审核' },
  under_review: { tone: 'warning', label: '审核中' },
  approved: { tone: 'success', label: '已通过' },
  rejected: { tone: 'danger', label: '已驳回' },
  generated: { tone: 'success', label: '已生成' },
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('zh-CN')
}

export default function CredentialReviewPage() {
  const [searchParams] = useSearchParams()
  const raceId = searchParams.get('raceId')
  const orgId = searchParams.get('orgId') || ''
  const { buildHref } = useCredentialSurface()
  const context = useMemo(() => ({ orgId, raceId: raceId || '' }), [orgId, raceId])

  const [requests, setRequests] = useState([])
  const [categories, setCategories] = useState([])
  const [accessAreas, setAccessAreas] = useState([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [message, setMessage] = useState('')
  const [activeTab, setActiveTab] = useState('pending')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [reviewForm, setReviewForm] = useState({
    approved: true,
    categoryId: '',
    jobTitle: '',
    accessCodes: [],
    remark: '',
    rejectReason: '',
  })

  const resetReviewForm = (request) => {
    setSelectedRequest(request)
    setReviewForm({
      approved: request.status !== 'rejected',
      categoryId: String(request.categoryId || ''),
      jobTitle: request.jobTitle || '',
      accessCodes: (request.accessAreas || []).map((item) => item.accessCode),
      remark: request.reviewRemark || '',
      rejectReason: request.rejectReason || '',
    })
  }

  const loadData = async () => {
    if (!raceId) return
    setLoading(true)

    try {
      const [requestRes, categoryRes, accessAreaRes] = await Promise.all([
        credentialApi.getRequests(raceId, statusFilter ? { status: statusFilter } : {}),
        credentialApi.getCategories(raceId),
        credentialApi.getAccessAreas(raceId),
      ])

      if (requestRes.success) setRequests(requestRes.data || [])
      if (categoryRes.success) setCategories(categoryRes.data || [])
      if (accessAreaRes.success) setAccessAreas(accessAreaRes.data || [])
    } catch (err) {
      setMessage(`加载审核列表失败：${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [raceId, statusFilter])

  const filteredRequests = useMemo(() => {
    const pendingStatuses = new Set(['submitted', 'under_review'])
    return requests
      .filter((item) => (activeTab === 'pending' ? pendingStatuses.has(item.status) : true))
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
  }, [activeTab, requests])

  useEffect(() => {
    if (!selectedRequest) return

    const nextSelected = filteredRequests.find((item) => String(item.id) === String(selectedRequest.id))
    if (!nextSelected) {
      setSelectedRequest(null)
      return
    }

    resetReviewForm(nextSelected)
  }, [filteredRequests])

  const metrics = useMemo(() => {
    const pendingCount = requests.filter((item) => ['submitted', 'under_review'].includes(item.status)).length
    const approvedCount = requests.filter((item) => item.status === 'approved').length
    const rejectedCount = requests.filter((item) => item.status === 'rejected').length

    return [
      { label: '审核池', value: loading ? '...' : formatNumber(pendingCount), meta: '优先处理 submitted 与 under_review。' },
      { label: '已通过', value: loading ? '...' : formatNumber(approvedCount), meta: '通过后可继续进入制证或发放环节。' },
      { label: '已驳回', value: loading ? '...' : formatNumber(rejectedCount), meta: '驳回原因应尽量明确，方便再次申请。' },
    ]
  }, [loading, requests])

  const openReview = async (requestId) => {
    try {
      const res = await credentialApi.getRequest(raceId, requestId)
      if (!res.success) return
      resetReviewForm(res.data)
    } catch (err) {
      setMessage(`加载请求详情失败：${err.message}`)
    }
  }

  const toggleAccessCode = (accessCode) => {
    setReviewForm((prev) => ({
      ...prev,
      accessCodes: prev.accessCodes.includes(accessCode)
        ? prev.accessCodes.filter((code) => code !== accessCode)
        : [...prev.accessCodes, accessCode],
    }))
  }

  const applyCategoryDefaults = (categoryId) => {
    const category = categories.find((item) => String(item.id) === String(categoryId))
    setReviewForm((prev) => ({
      ...prev,
      categoryId: String(categoryId),
      accessCodes: category ? (category.accessAreas || []).map((item) => item.accessCode) : [],
    }))
  }

  const submitReview = async () => {
    if (!selectedRequest) return
    if (!reviewForm.categoryId) {
      setMessage('请选择证件类别')
      return
    }
    if (!reviewForm.approved && !reviewForm.rejectReason.trim()) {
      setMessage('驳回时必须填写原因')
      return
    }

    setProcessing(true)
    setMessage('')

    try {
      await credentialApi.reviewRequest(raceId, selectedRequest.id, {
        approved: reviewForm.approved,
        categoryId: Number(reviewForm.categoryId),
        jobTitle: reviewForm.jobTitle.trim() || undefined,
        accessCodes: reviewForm.approved ? reviewForm.accessCodes : undefined,
        remark: reviewForm.approved ? reviewForm.remark.trim() || undefined : undefined,
        rejectReason: reviewForm.approved ? undefined : reviewForm.rejectReason.trim(),
      })

      setMessage('审核完成，列表已刷新')
      setSelectedRequest(null)
      await loadData()
    } catch (err) {
      setMessage(`审核失败：${err.message}`)
    } finally {
      setProcessing(false)
    }
  }

  if (!raceId) {
    return (
      <AdminSurface title="先选择赛事" subtitle="证件审核始终依赖赛事上下文。">
        <AdminEmptyState
          title="当前没有赛事上下文"
          description="先锁定赛事，审核池、类别和通行区域才有意义。"
          action={<Link to={buildHref('/credential/select-race', context)} className="btn btn--primary">去选择赛事</Link>}
        />
      </AdminSurface>
    )
  }

  return (
    <div style={pageStyle}>
      <AdminSectionHeader
        eyebrow="审核工位"
        title="证件审核中心"
        description="审核页已经从“列表 + 弹窗”改成了常驻审核台。左侧盯请求池，右侧直接完成类别调整、通行范围确认和通过/驳回决策，路径更适合连续处理。"
        metrics={metrics}
        actions={<Link to={buildHref('/credential-center', context)} className="btn btn--ghost">返回证件中心</Link>}
      />

      {message ? (
        <AdminNotice tone={message.includes('失败') || message.includes('必须') ? 'danger' : 'success'}>
          {message}
        </AdminNotice>
      ) : null}

      <AdminToolbar>
        <div style={toolbarStyle}>
          <div style={tabGroupStyle}>
            {TAB_OPTIONS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                className={`btn ${activeTab === tab.value ? 'btn--primary' : 'btn--ghost'}`}
                onClick={() => setActiveTab(tab.value)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div style={filterGroupStyle}>
            <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={filterSelectStyle}>
              {STATUS_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <AdminStatusPill tone="warning">{`当前列表 ${formatNumber(filteredRequests.length)} 条`}</AdminStatusPill>
          </div>
        </div>
      </AdminToolbar>

      <div style={reviewLayoutStyle}>
        <AdminSurface
          title="审核请求池"
          subtitle="先从这里判断优先级，再切到右侧处理详情。"
        >
          {loading ? (
            <AdminEmptyState title="正在加载请求池" description="会同步读取申请记录、类别和通行区域规则。" />
          ) : filteredRequests.length === 0 ? (
            <AdminEmptyState
              title={activeTab === 'pending' ? '暂无待审核请求' : '暂无请求记录'}
              description={activeTab === 'pending' ? '当前赛事下没有待你处理的证件请求。' : '换一个筛选条件，或者回到申请页创建新请求。'}
            />
          ) : (
            <AdminDataTable>
              <thead>
                <tr>
                  <th>申请人</th>
                  <th>类别</th>
                  <th>状态</th>
                  <th>提交时间</th>
                  <th>处理</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((request) => {
                  const status = STATUS_META[request.status] || STATUS_META.submitted
                  const active = selectedRequest && String(selectedRequest.id) === String(request.id)

                  return (
                    <tr key={request.id} style={active ? activeRowStyle : null}>
                      <td>
                        <div style={primaryCellStyle}>{request.personName}</div>
                        <div style={secondaryCellStyle}>{request.orgName || '-'}</div>
                      </td>
                      <td>
                        <div style={primaryCellStyle}>{request.categoryName || '-'}</div>
                        <div style={secondaryCellStyle}>{request.jobTitle || '未填写职务'}</div>
                      </td>
                      <td>
                        <AdminStatusPill tone={status.tone}>{status.label}</AdminStatusPill>
                      </td>
                      <td>{new Date(request.createdAt).toLocaleString('zh-CN')}</td>
                      <td>
                        <button type="button" className={`btn ${active ? 'btn--secondary' : 'btn--ghost'} btn--sm`} onClick={() => openReview(request.id)}>
                          {active ? '处理中' : ['submitted', 'under_review'].includes(request.status) ? '去审核' : '看详情'}
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
          title={selectedRequest ? `审核 ${selectedRequest.personName}` : '审核工作台'}
          subtitle={selectedRequest ? '在这里直接完成最终类别、通行权限与决策。' : '从左侧点开一条申请后，审核面板会常驻在这里。'}
          actions={selectedRequest ? (
            <AdminStatusPill tone={(STATUS_META[selectedRequest.status] || STATUS_META.submitted).tone}>
              {(STATUS_META[selectedRequest.status] || STATUS_META.submitted).label}
            </AdminStatusPill>
          ) : null}
        >
          {!selectedRequest ? (
            <AdminEmptyState
              title="还没有选中审核对象"
              description="左侧列表会一直保留，适合连续处理多条请求，不需要每次开关弹窗。"
            />
          ) : (
            <div style={reviewPanelStyle}>
              <div style={summaryGridStyle}>
                <div style={summaryCardStyle}>
                  <span style={summaryLabelStyle}>申请人</span>
                  <span style={summaryValueStyle}>{selectedRequest.personName}</span>
                </div>
                <div style={summaryCardStyle}>
                  <span style={summaryLabelStyle}>所属单位</span>
                  <span style={summaryValueStyle}>{selectedRequest.orgName || '-'}</span>
                </div>
                <div style={summaryCardStyle}>
                  <span style={summaryLabelStyle}>当前类别</span>
                  <span style={summaryValueStyle}>{selectedRequest.categoryName || '-'}</span>
                </div>
                <div style={summaryCardStyle}>
                  <span style={summaryLabelStyle}>提交时间</span>
                  <span style={summaryValueStyle}>{new Date(selectedRequest.createdAt).toLocaleString('zh-CN')}</span>
                </div>
              </div>

              <div style={fieldGridStyle}>
                <label style={fieldStyle}>
                  <span style={fieldLabelStyle}>最终证件类别</span>
                  <select
                    className="input"
                    value={reviewForm.categoryId}
                    onChange={(event) => applyCategoryDefaults(event.target.value)}
                  >
                    <option value="">请选择类别</option>
                    {categories.map((item) => (
                      <option key={item.id} value={item.id}>{item.categoryName}</option>
                    ))}
                  </select>
                </label>

                <label style={fieldStyle}>
                  <span style={fieldLabelStyle}>最终职务</span>
                  <input
                    className="input"
                    type="text"
                    value={reviewForm.jobTitle}
                    onChange={(event) => setReviewForm((prev) => ({ ...prev, jobTitle: event.target.value }))}
                    placeholder="审核后显示在证件上的职务"
                  />
                </label>
              </div>

              <div style={decisionStripStyle}>
                <button
                  type="button"
                  className={`btn ${reviewForm.approved ? 'btn--primary' : 'btn--ghost'}`}
                  onClick={() => setReviewForm((prev) => ({ ...prev, approved: true }))}
                >
                  审核通过
                </button>
                <button
                  type="button"
                  className={`btn ${reviewForm.approved ? 'btn--ghost' : 'btn--primary'}`}
                  onClick={() => setReviewForm((prev) => ({ ...prev, approved: false }))}
                >
                  驳回申请
                </button>
                <AdminStatusPill tone={reviewForm.approved ? 'success' : 'danger'}>
                  {reviewForm.approved ? '将进入后续制证' : '会要求申请方重新提交'}
                </AdminStatusPill>
              </div>

              <div style={fieldStyle}>
                <span style={fieldLabelStyle}>最终通行区域</span>
                <div style={accessGridStyle}>
                  {accessAreas.map((item) => (
                    <label key={item.id} style={{ ...accessChipStyle, ...(reviewForm.accessCodes.includes(item.accessCode) ? accessChipActiveStyle : null) }}>
                      <input
                        type="checkbox"
                        checked={reviewForm.accessCodes.includes(item.accessCode)}
                        onChange={() => toggleAccessCode(item.accessCode)}
                        disabled={!reviewForm.approved}
                        style={hiddenCheckboxStyle}
                      />
                      <span style={{ ...accessDotStyle, background: item.accessColor || '#f97316' }} />
                      <span style={accessNameStyle}>{item.accessName}</span>
                      <span style={accessCodeStyle}>{item.accessCode}</span>
                    </label>
                  ))}
                </div>
              </div>

              <label style={fieldStyle}>
                <span style={fieldLabelStyle}>{reviewForm.approved ? '审核备注' : '驳回原因'}</span>
                <textarea
                  className="input"
                  value={reviewForm.approved ? reviewForm.remark : reviewForm.rejectReason}
                  onChange={(event) => setReviewForm((prev) => ({
                    ...prev,
                    [reviewForm.approved ? 'remark' : 'rejectReason']: event.target.value,
                  }))}
                  style={textareaStyle}
                  placeholder={reviewForm.approved ? '说明这次审核调整了什么。' : '明确告诉申请人为什么不能通过。'}
                />
              </label>

              <div style={actionRowStyle}>
                <button type="button" className="btn btn--ghost" onClick={() => setSelectedRequest(null)} disabled={processing}>
                  暂不处理
                </button>
                <button type="button" className="btn btn--primary" onClick={submitReview} disabled={processing}>
                  {processing ? '提交中...' : '确认审核结果'}
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

const tabGroupStyle = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
}

const filterGroupStyle = {
  display: 'flex',
  gap: 10,
  alignItems: 'center',
  flexWrap: 'wrap',
}

const filterSelectStyle = {
  minWidth: 180,
}

const reviewLayoutStyle = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.1fr) minmax(360px, 0.9fr)',
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

const reviewPanelStyle = {
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

const decisionStripStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
  alignItems: 'center',
  padding: '14px 16px',
  borderRadius: 18,
  background: 'rgba(15, 23, 42, 0.04)',
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
