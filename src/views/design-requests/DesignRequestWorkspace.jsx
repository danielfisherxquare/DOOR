import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import approvalApi from '../../services/approvalApi'
import designRequestApi from '../../services/designRequestApi'
import './design-request-workspace.css'

const EVENT_TYPES = [
  { value: 'marathon', label: '马拉松' },
  { value: 'trail', label: '越野赛' },
  { value: 'aquatic', label: '水上项目' },
  { value: 'orienteering', label: '定向赛' },
  { value: 'general', label: '通用' },
]

const PRIORITIES = [
  { value: 'normal', label: '普通' },
  { value: 'high', label: '高' },
  { value: 'urgent', label: '紧急' },
  { value: 'low', label: '低' },
]

const STATUS_LABELS = {
  pending_review: '审批中',
  approved: '已通过',
  in_design: '设计中',
  design_uploaded: '已上传成品',
  delivered: '已交付',
  archived: '已归档',
  rejected: '已驳回',
  needs_info: '需补充',
}

const PROGRESS_STAGE_LABELS = {
  intake_review: '提报审批',
  assigned: '已分派',
  designing: '设计中',
  internal_review: '待确认',
  revision_requested: '返工中',
  ready_to_order: '可下单',
  ordered: '已下单',
  delivered: '已交付',
}

const PROGRESS_EVENT_LABELS = {
  submitted: '提交需求',
  approve: '审批通过',
  approved: '审批通过',
  assign_designer: '分派设计师',
  design_started: '开始设计',
  revision_uploaded: '上传版本',
  reference_uploaded: '补充参考',
  request_revision: '打回修改',
  final_approved: '定稿确认',
  ordered: '标记下单',
  delivered: '标记交付',
  needs_info: '退回补充',
  reject: '驳回',
  backfilled: '历史补齐',
}

const ORDER_STATUS_LABELS = {
  not_ready: '未到下单',
  ready: '待下单',
  ordered: '已下单',
}

const PROGRESS_STEPS = [
  { stage: 'intake_review', label: '提报审批', icon: 'assignment' },
  { stage: 'assigned', label: '已分派', icon: 'assignment_ind' },
  { stage: 'designing', label: '设计中', icon: 'draw' },
  { stage: 'internal_review', label: '待确认', icon: 'rate_review' },
  { stage: 'revision_requested', label: '返工中', icon: 'published_with_changes' },
  { stage: 'ready_to_order', label: '可下单', icon: 'fact_check' },
  { stage: 'ordered', label: '已下单', icon: 'shopping_cart_checkout' },
]

const PROGRESS_STEP_ORDER = {
  intake_review: 0,
  assigned: 1,
  designing: 2,
  internal_review: 3,
  revision_requested: 4,
  ready_to_order: 5,
  ordered: 6,
  delivered: 6,
}

const APPROVAL_STEP_LABELS = {
  department_owner_review: '部门负责人审批',
  race_director_review: '赛事总监终审',
  design_lead_assignment: '设计负责人分派',
}

const STAFF_ROLES = [
  { value: 'department_owner', label: '部门负责人' },
  { value: 'race_director', label: '赛事总监' },
  { value: 'design_lead', label: '设计负责人' },
  { value: 'design_designer', label: '设计师' },
]

const APPROVAL_FLOW = [
  { stepKey: 'department_owner_review', stepName: '部门负责人审批', order: 1 },
  { stepKey: 'race_director_review', stepName: '赛事总监终审', order: 2 },
  { stepKey: 'design_lead_assignment', stepName: '设计负责人分派', order: 3 },
]

const STATUS_CLASS = {
  pending_review: 'warning',
  approved: 'success',
  in_design: 'info',
  design_uploaded: 'done',
  delivered: 'done',
  archived: 'muted',
  rejected: 'danger',
  needs_info: 'warning',
}

const IMPORT_FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'design', label: '需设计' },
  { value: 'needs_info', label: '待补齐' },
  { value: 'ready', label: '可同步' },
  { value: 'new', label: '新增' },
  { value: 'changed', label: '已修改' },
  { value: 'new_category', label: '新类目' },
  { value: 'unchanged', label: '未变化' },
  { value: 'synced', label: '已同步' },
  { value: 'ignored', label: '非设计项' },
]

const IMPORT_STATUS_LABELS = {
  ignored: '非设计项',
  needs_info: '待补齐',
  ready: '可同步',
  synced: '已同步',
  error: '异常',
}

const IMPORT_CHANGE_LABELS = {
  new: '新增',
  changed: '修改',
  unchanged: '未变化',
  new_category: '新类目',
}

const EXPORT_ACTIONS = [
  { mode: 'blank_template', label: '导出标准模板', icon: 'download' },
  { mode: 'incremental', label: '仅新增/变更', icon: 'difference' },
  { mode: 'full_marked', label: '完整并标记', icon: 'select_all' },
]

const RACE_SCOPE_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'unlinked', label: '未关联赛事' },
  { value: 'race', label: '单赛事' },
  { value: 'multi', label: '多赛事' },
]

function toDateInputValue(date, useDefault = true) {
  if (!date && !useDefault) return ''
  const target = date ? new Date(date) : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
  if (Number.isNaN(target.getTime())) return ''
  const offset = target.getTimezoneOffset() * 60000
  return new Date(target.getTime() - offset).toISOString().slice(0, 16)
}

function createInitialForm(raceId) {
  return {
    raceId: raceId || '',
    raceIdsText: raceId || '',
    primaryRaceId: raceId || '',
    eventType: 'marathon',
    requesterDepartment: '',
    requesterName: '',
    title: '',
    requirementText: '',
    referenceNotes: '',
    sizeSpec: '',
    materialSpec: '',
    dueAt: toDateInputValue(),
    priority: 'normal',
    referenceAsset: null,
    referenceAssetName: '',
    referenceAssetUrl: '',
  }
}

function getResponseData(response, fallback) {
  return response?.data ?? fallback
}

function formatDateTime(value) {
  if (!value) return '未设置'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未设置'
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status || '未知'
}

function progressStageLabel(stage) {
  return PROGRESS_STAGE_LABELS[stage] || stage || '未开始'
}

function progressEventLabel(eventType) {
  return PROGRESS_EVENT_LABELS[eventType] || eventType || '进度记录'
}

function orderStatusLabel(status) {
  return ORDER_STATUS_LABELS[status] || status || '未到下单'
}

function eventTypeLabel(value) {
  return EVENT_TYPES.find((item) => item.value === value)?.label || value || '通用'
}

function priorityLabel(value) {
  return PRIORITIES.find((item) => item.value === value)?.label || value || '普通'
}

function parseRaceIds(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map(Number).filter(Boolean))]
  }
  return [...new Set(String(value || '')
    .split(/[，,\s]+/)
    .map(Number)
    .filter(Boolean))]
}

function raceSummary(request) {
  const links = request?.raceLinks || []
  if (links.length === 0) return '未关联赛事'
  if (links.length === 1) return links[0].raceName || ('赛事 #' + links[0].raceId)
  return links.length + ' 场赛事'
}

function approvalStepLabel(value) {
  return APPROVAL_STEP_LABELS[value] || value || '未发起'
}

function importStatusLabel(value) {
  return IMPORT_STATUS_LABELS[value] || value || '未知'
}

function importChangeLabel(value) {
  return IMPORT_CHANGE_LABELS[value] || value || '未记录'
}

function formatAmount(value) {
  if (value === null || value === undefined || value === '') return '未填'
  const number = Number(value)
  if (!Number.isFinite(number)) return String(value)
  return number.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

function isImageAsset(asset) {
  const mimeType = asset?.mimeType || ''
  const fileUrl = asset?.fileUrl || ''
  return mimeType.startsWith('image/') || fileUrl.startsWith('data:image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(fileUrl)
}

function readFileAsAsset(file, assetType) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve(null)
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      resolve({
        assetType,
        fileName: file.name,
        fileUrl: String(reader.result || ''),
        mimeType: file.type || 'application/octet-stream',
        note: '',
      })
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}

function saveBlob(blob, fileName) {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName || '设计协同清单.xlsx'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

function MetricCard({ label, value, tone, icon }) {
  return (
    <div className={'design-request-metric design-request-metric--' + tone}>
      <span className="material-symbols-outlined">{icon}</span>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  return (
    <span className={'design-request-status design-request-status--' + (STATUS_CLASS[status] || 'muted')}>
      {statusLabel(status)}
    </span>
  )
}

function ApprovalTimeline({ approval }) {
  if (!approval) {
    return (
      <section className="design-request-approval-flow">
        <h3>审批流程</h3>
        <p className="design-request-empty-line">尚未发起审批</p>
      </section>
    )
  }

  return (
    <section className="design-request-approval-flow">
      <div className="design-request-section-head">
        <h3>审批流程</h3>
        <span>{approval.status === 'blocked' ? '缺少岗位' : approval.status === 'approved' ? '已完成' : '进行中'}</span>
      </div>
      {approval.blockedReason ? (
        <p className="design-request-approval-blocked">{approval.blockedReason}</p>
      ) : null}
      <ol>
        {APPROVAL_FLOW.map((step) => {
          const currentOrder = Number(approval.currentStepOrder || 0)
          const isCurrent = approval.currentStep?.stepKey === step.stepKey
          const isDone = approval.status === 'approved' || currentOrder > step.order
          const state = isDone ? 'done' : isCurrent ? 'current' : 'pending'
          return (
            <li key={step.stepKey} className={'design-request-approval-step design-request-approval-step--' + state}>
              <span className="material-symbols-outlined">{isDone ? 'check_circle' : isCurrent ? 'pending_actions' : 'radio_button_unchecked'}</span>
              <div>
                <strong>{step.stepName}</strong>
                <small>{isDone ? '已完成' : isCurrent ? '当前处理' : '待处理'}</small>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function ProgressPill({ progress }) {
  const stage = progress?.stage || 'intake_review'
  return (
    <span className={'design-request-progress-pill design-request-progress-pill--' + stage}>
      {progressStageLabel(stage)}
    </span>
  )
}

function RaceLinkTags({ request }) {
  const links = request?.raceLinks || []
  if (links.length === 0) {
    return <span className="design-request-race-tag design-request-race-tag--empty">未关联赛事</span>
  }
  return (
    <span className="design-request-race-tags">
      {links.map((link) => (
        <span
          key={link.id || link.raceId}
          className={'design-request-race-tag ' + (link.relationType === 'primary' ? 'is-primary' : '')}
        >
          {link.relationType === 'primary' ? '主 ' : ''}
          {link.raceName || ('赛事 #' + link.raceId)}
        </span>
      ))}
    </span>
  )
}

function DesignProgressTracker({ request }) {
  const progress = request?.progress || {}
  const currentIndex = PROGRESS_STEP_ORDER[progress.stage] ?? 0
  const revisionCount = progress.revisionCount || 0
  const latestEvents = (progress.events || []).slice(-8).reverse()

  return (
    <section className="design-request-progress-flow">
      <div className="design-request-section-head">
        <div>
          <h3>设计进度跟踪</h3>
          <p>
            v{progress.currentRevisionNo || 0} · 返工 {progress.revisionCount || 0} 次 · {orderStatusLabel(progress.orderStatus)}
          </p>
        </div>
        <ProgressPill progress={progress} />
      </div>

      <ol className="design-request-progress-steps">
        {PROGRESS_STEPS.map((step, index) => {
          const isRevisionStep = step.stage === 'revision_requested'
          const revisionSkipped = isRevisionStep && revisionCount === 0 && progress.stage !== 'revision_requested'
          const state = revisionSkipped
            ? 'optional'
            : index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'pending'
          const label = revisionSkipped ? '无返工' : step.label
          return (
            <li key={step.stage} className={'design-request-progress-step design-request-progress-step--' + state}>
              <span className="material-symbols-outlined">{state === 'done' ? 'check_circle' : step.icon}</span>
              <strong>{label}</strong>
            </li>
          )
        })}
      </ol>

      <dl className="design-request-progress-meta">
        <div>
          <dt>定稿时间</dt>
          <dd>{formatDateTime(progress.finalApprovedAt)}</dd>
        </div>
        <div>
          <dt>下单编号</dt>
          <dd>{progress.orderReference || '未登记'}</dd>
        </div>
        <div>
          <dt>下单时间</dt>
          <dd>{formatDateTime(progress.orderedAt)}</dd>
        </div>
      </dl>

      <div className="design-request-progress-events">
        {latestEvents.map((event) => (
          <div key={event.id || event.createdAt} className="design-request-progress-event">
            <span className="material-symbols-outlined">history</span>
            <div>
              <strong>{progressEventLabel(event.eventType)}{event.revisionNo ? ' · v' + event.revisionNo : ''}</strong>
              <small>{formatDateTime(event.createdAt)} · {progressStageLabel(event.toStage)}</small>
              {event.comment ? <p>{event.comment}</p> : null}
            </div>
          </div>
        ))}
        {latestEvents.length === 0 ? (
          <p className="design-request-empty-line">暂无进度记录</p>
        ) : null}
      </div>
    </section>
  )
}

function AssetGrid({ title, assets }) {
  if (!assets || assets.length === 0) {
    return (
      <section className="design-request-assets">
        <h3>{title}</h3>
        <p className="design-request-empty-line">暂无文件</p>
      </section>
    )
  }

  return (
    <section className="design-request-assets">
      <h3>{title}</h3>
      <div className="design-request-asset-grid">
        {assets.map((asset) => (
          <a key={asset.id || asset.fileUrl} className="design-request-asset" href={asset.fileUrl} target="_blank" rel="noreferrer">
            {isImageAsset(asset) ? (
              <img src={asset.fileUrl} alt={asset.fileName} />
            ) : (
              <span className="material-symbols-outlined">attach_file</span>
            )}
            <span>{asset.fileName}</span>
            {asset.version ? <small>v{asset.version}</small> : null}
          </a>
        ))}
      </div>
    </section>
  )
}

export default function DesignRequestWorkspace({ surface = 'app', mode = 'designer' }) {
  const [searchParams] = useSearchParams()
  const initialRaceId = searchParams.get('raceId') || ''
  const selectedOrgId = searchParams.get('orgId') || ''
  const [raceScope, setRaceScope] = useState(initialRaceId ? 'race' : 'all')
  const [raceFilterId, setRaceFilterId] = useState(initialRaceId)
  const [raceIdsText, setRaceIdsText] = useState(initialRaceId)
  const [eventTypeFilter, setEventTypeFilter] = useState('all')
  const [requests, setRequests] = useState([])
  const [templates, setTemplates] = useState([])
  const [stats, setStats] = useState({})
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [form, setForm] = useState(() => createInitialForm(initialRaceId))
  const [reviewForm, setReviewForm] = useState({ comment: '', assignedDesignerId: '' })
  const [progressForm, setProgressForm] = useState({ comment: '', orderReference: '', orderNote: '' })
  const [approvalTasks, setApprovalTasks] = useState([])
  const [staffAssignments, setStaffAssignments] = useState([])
  const [staffForm, setStaffForm] = useState({
    teamMemberId: '',
    scopeType: 'org',
    scopeId: '',
    roleKey: 'department_owner',
    roleName: '部门负责人',
    departmentScope: '',
    moduleKey: 'design_requests',
  })
  const [deliverable, setDeliverable] = useState({ fileName: '', fileUrl: '', mimeType: 'image/png', note: '' })
  const [importFile, setImportFile] = useState(null)
  const [imports, setImports] = useState([])
  const [activeImport, setActiveImport] = useState(null)
  const [selectedImportItemId, setSelectedImportItemId] = useState('')
  const [importFilter, setImportFilter] = useState('all')
  const [importDrafts, setImportDrafts] = useState({})
  const [manualFormOpen, setManualFormOpen] = useState(false)
  const [exports, setExports] = useState([])
  const [exportingMode, setExportingMode] = useState('')

  const isRequester = mode === 'requester'
  const isManager = mode === 'manager'
  const isDesigner = mode === 'designer'
  const selectedRaceId = raceScope === 'race' ? raceFilterId : ''
  const activeRaceIds = useMemo(() => {
    if (raceScope === 'race') return parseRaceIds(raceFilterId)
    if (raceScope === 'multi') return parseRaceIds(raceIdsText)
    return []
  }, [raceFilterId, raceIdsText, raceScope])
  const requestScopeParams = useMemo(() => {
    const params = {}
    if (raceScope === 'race' && activeRaceIds[0]) params.raceId = activeRaceIds[0]
    if (raceScope === 'multi' && activeRaceIds.length > 0) params.raceIds = activeRaceIds.join(',')
    if (raceScope === 'unlinked') params.raceScope = 'unlinked'
    if (eventTypeFilter !== 'all') params.eventType = eventTypeFilter
    if (selectedOrgId) params.orgId = selectedOrgId
    return params
  }, [activeRaceIds, eventTypeFilter, raceScope, selectedOrgId])

  const selectedRequest = useMemo(
    () => requests.find((item) => item.id === selectedId) || requests[0] || null,
    [requests, selectedId],
  )

  const importItems = activeImport?.items || []
  const filteredImportItems = useMemo(() => {
    if (importFilter === 'all') return importItems
    if (importFilter === 'design') return importItems.filter((item) => item.needsDesign)
    if (['new', 'changed', 'new_category', 'unchanged'].includes(importFilter)) {
      return importItems.filter((item) => item.changeType === importFilter)
    }
    return importItems.filter((item) => item.syncStatus === importFilter)
  }, [importFilter, importItems])
  const latestExport = exports[0] || null
  const selectedApprovalTask = useMemo(
    () => approvalTasks.find((task) => task.businessId === selectedRequest?.id) || null,
    [approvalTasks, selectedRequest],
  )

  const selectedImportItem = useMemo(
    () => importItems.find((item) => item.id === selectedImportItemId) || filteredImportItems[0] || importItems[0] || null,
    [filteredImportItems, importItems, selectedImportItemId],
  )

  const readyImportItemIds = useMemo(
    () => importItems.filter((item) => item.syncStatus === 'ready').map((item) => item.id),
    [importItems],
  )

  const importMetrics = useMemo(() => {
    if (!activeImport) {
      return [
        { label: '清单行', value: 0, tone: 'blue', icon: 'table_rows' },
        { label: '需设计', value: 0, tone: 'amber', icon: 'design_services' },
        { label: '待补齐', value: 0, tone: 'red', icon: 'edit_note' },
        { label: '可同步', value: 0, tone: 'green', icon: 'sync_alt' },
        { label: '新增', value: 0, tone: 'blue', icon: 'add_box' },
        { label: '修改', value: 0, tone: 'amber', icon: 'published_with_changes' },
        { label: '新类目', value: 0, tone: 'red', icon: 'category' },
      ]
    }
    return [
      { label: '清单行', value: activeImport.rowCount || 0, tone: 'blue', icon: 'table_rows' },
      { label: '需设计', value: activeImport.designCount || 0, tone: 'amber', icon: 'design_services' },
      { label: '待补齐', value: activeImport.needsInfoCount || 0, tone: 'red', icon: 'edit_note' },
      { label: '可同步', value: activeImport.readyCount || 0, tone: 'green', icon: 'sync_alt' },
      { label: '新增', value: activeImport.newCount || 0, tone: 'blue', icon: 'add_box' },
      { label: '修改', value: activeImport.changedCount || 0, tone: 'amber', icon: 'published_with_changes' },
      { label: '新类目', value: activeImport.newCategoryCount || 0, tone: 'red', icon: 'category' },
    ]
  }, [activeImport])

  const loadWorkspace = useCallback(async () => {
    setLoading(true)
    setError('')
    const params = requestScopeParams
    try {
      const [templateResponse, requestResponse, statsResponse] = await Promise.all([
        designRequestApi.getTemplates(surface, { ...params, eventType: form.eventType || 'marathon' }),
        designRequestApi.getRequests(surface, params),
        designRequestApi.getStats(surface, params),
      ])
      const requestPayload = getResponseData(requestResponse, { items: [] })
      const nextRequests = requestPayload.items || []
      setTemplates(getResponseData(templateResponse, []))
      setRequests(nextRequests)
      setStats(getResponseData(statsResponse, {}))
      setSelectedId((current) => current && nextRequests.some((item) => item.id === current)
        ? current
        : (nextRequests[0]?.id || ''))
      if (isRequester) {
        const importListResponse = await designRequestApi.getImports(surface, params)
        const importPayload = getResponseData(importListResponse, { items: [] })
        const nextImports = importPayload.items || []
        setImports(nextImports)
        if (nextImports[0]?.id) {
          const importResponse = await designRequestApi.getImport(surface, nextImports[0].id)
          const nextImport = getResponseData(importResponse, null)
          setActiveImport(nextImport)
          setSelectedImportItemId((current) => current && nextImport?.items?.some((item) => item.id === current)
            ? current
            : (nextImport?.items?.[0]?.id || ''))
        } else {
          setActiveImport(null)
          setSelectedImportItemId('')
        }
      }
      if (isDesigner) {
        const exportResponse = await designRequestApi.getExports(surface, { ...params, eventType: form.eventType || 'marathon' })
        const exportPayload = getResponseData(exportResponse, { items: [] })
        setExports(exportPayload.items || [])
      }
      const taskResponse = await approvalApi.listTasks(surface === 'admin' ? 'admin' : 'app', { ...params, status: 'pending' })
      const taskPayload = getResponseData(taskResponse, { items: [] })
      setApprovalTasks(taskPayload.items || [])
      if (isManager) {
        const staffResponse = await approvalApi.listScopeRoleAssignments('admin', { ...params, status: 'active' })
        const staffPayload = getResponseData(staffResponse, { items: [] })
        setStaffAssignments(staffPayload.items || [])
      }
    } catch (err) {
      setError(err.message || '设计需求加载失败')
    } finally {
      setLoading(false)
    }
  }, [form.eventType, isDesigner, isManager, isRequester, requestScopeParams, surface])

  useEffect(() => {
    if (!selectedRaceId) return
    setForm((current) => ({
      ...current,
      raceId: selectedRaceId,
      raceIdsText: current.raceIdsText || selectedRaceId,
      primaryRaceId: current.primaryRaceId || selectedRaceId,
    }))
  }, [selectedRaceId])

  useEffect(() => {
    loadWorkspace()
  }, [loadWorkspace])

  const metrics = useMemo(() => {
    if (isDesigner) {
      return [
        { label: '待处理', value: stats.approved || 0, tone: 'amber', icon: 'assignment' },
        { label: '返工中', value: stats.revisionRequested || 0, tone: 'red', icon: 'published_with_changes' },
        { label: '待确认', value: stats.designUploaded || 0, tone: 'blue', icon: 'rate_review' },
        { label: '已下单', value: stats.ordered || 0, tone: 'green', icon: 'shopping_cart_checkout' },
      ]
    }
    if (isManager) {
      return [
        { label: '待审核', value: stats.pendingReview || 0, tone: 'amber', icon: 'rule' },
        { label: '返工中', value: stats.revisionRequested || 0, tone: 'red', icon: 'published_with_changes' },
        { label: '待下单', value: stats.readyToOrder || 0, tone: 'blue', icon: 'fact_check' },
        { label: '已下单', value: stats.ordered || 0, tone: 'green', icon: 'shopping_cart_checkout' },
      ]
    }
    return [
      { label: '全部需求', value: stats.total || 0, tone: 'blue', icon: 'table_chart' },
      { label: '待审核', value: stats.pendingReview || 0, tone: 'amber', icon: 'approval' },
      { label: '返工中', value: stats.revisionRequested || 0, tone: 'red', icon: 'published_with_changes' },
      { label: '本周到期', value: stats.dueThisWeek || 0, tone: 'red', icon: 'calendar_month' },
    ]
  }, [isDesigner, isManager, stats])

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const handleReferenceFile = async (event) => {
    const asset = await readFileAsAsset(event.target.files?.[0], 'reference')
    updateForm('referenceAsset', asset)
  }

  const handleDeliverableFile = async (event) => {
    const asset = await readFileAsAsset(event.target.files?.[0], 'deliverable')
    if (asset) {
      setDeliverable({
        fileName: asset.fileName,
        fileUrl: asset.fileUrl,
        mimeType: asset.mimeType,
        note: deliverable.note,
      })
    }
  }

  const handleSubmitRequest = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const raceIds = parseRaceIds(form.raceIdsText || form.raceId)
      const primaryRaceId = Number(form.primaryRaceId || form.raceId || raceIds[0] || 0) || null
      const payload = {
        ...form,
        orgId: selectedOrgId || undefined,
        raceId: primaryRaceId || undefined,
        primaryRaceId: primaryRaceId || undefined,
        raceIds,
        dueAt: new Date(form.dueAt).toISOString(),
        referenceAssets: form.referenceAsset
          ? [{ ...form.referenceAsset, note: form.referenceNotes }]
          : (form.referenceAssetUrl ? [{
            assetType: 'reference',
            fileName: form.referenceAssetName || 'reference-sample',
            fileUrl: form.referenceAssetUrl,
            mimeType: 'image/png',
            note: form.referenceNotes,
          }] : []),
      }
      const response = await designRequestApi.createRequest(surface, payload)
      const created = getResponseData(response, null)
      setNotice('设计需求已提交，等待部门负责人审批。')
      setForm(createInitialForm(selectedRaceId))
      await loadWorkspace()
      if (created?.id) setSelectedId(created.id)
    } catch (err) {
      setError(err.message || '提交失败')
    } finally {
      setSaving(false)
    }
  }

  const handleReview = async (action) => {
    if (!selectedRequest) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await designRequestApi.reviewRequest(surface, selectedRequest.id, {
        action,
        comment: reviewForm.comment,
        assignedDesignerId: reviewForm.assignedDesignerId || undefined,
      })
      setNotice(action === 'approve' ? '审核已通过，设计师可以开始处理。' : action === 'reject' ? '需求已驳回。' : '已退回补充材料。')
      await loadWorkspace()
    } catch (err) {
      setError(err.message || '审核失败')
    } finally {
      setSaving(false)
    }
  }

  const handleApprovalTaskAction = async (action) => {
    if (!selectedApprovalTask) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const taskSurface = surface === 'admin' ? 'admin' : 'app'
      if (action === 'approve') {
        await approvalApi.approveTask(taskSurface, selectedApprovalTask.id, { comment: reviewForm.comment })
        setNotice('审批已通过。')
      } else if (action === 'reject') {
        await approvalApi.rejectTask(taskSurface, selectedApprovalTask.id, { comment: reviewForm.comment })
        setNotice('需求已驳回。')
      } else if (action === 'request_changes') {
        await approvalApi.requestChanges(taskSurface, selectedApprovalTask.id, { comment: reviewForm.comment })
        setNotice('已退回补充材料。')
      } else if (action === 'assign') {
        await approvalApi.assignTask(taskSurface, selectedApprovalTask.id, {
          comment: reviewForm.comment,
          assignment: { assignedDesignerId: reviewForm.assignedDesignerId },
        })
        setNotice('设计师已分派。')
      }
      setReviewForm({ comment: '', assignedDesignerId: '' })
      await loadWorkspace()
    } catch (err) {
      setError(err.message || '审批处理失败')
    } finally {
      setSaving(false)
    }
  }

  const handleCreateStaffAssignment = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const roleName = STAFF_ROLES.find((item) => item.value === staffForm.roleKey)?.label || staffForm.roleName
      await approvalApi.createScopeRoleAssignment('admin', {
        ...staffForm,
        orgId: selectedOrgId || undefined,
        roleName,
      })
      setStaffForm({
        teamMemberId: '',
        scopeType: 'org',
        scopeId: '',
        roleKey: 'department_owner',
        roleName: '部门负责人',
        departmentScope: '',
        moduleKey: 'design_requests',
      })
      setNotice('审批岗位已保存。')
      await loadWorkspace()
    } catch (err) {
      setError(err.message || '审批岗位保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleStartDesign = async () => {
    if (!selectedRequest) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await designRequestApi.startDesign(surface, selectedRequest.id)
      setNotice('已进入设计中。')
      await loadWorkspace()
    } catch (err) {
      setError(err.message || '无法开始设计')
    } finally {
      setSaving(false)
    }
  }

  const handleUploadDeliverable = async (event) => {
    event.preventDefault()
    if (!selectedRequest) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await designRequestApi.addAsset(surface, selectedRequest.id, {
        assetType: 'deliverable',
        fileName: deliverable.fileName,
        fileUrl: deliverable.fileUrl,
        mimeType: deliverable.mimeType || 'image/png',
        note: deliverable.note,
      })
      setNotice('完成图示已上传。')
      setDeliverable({ fileName: '', fileUrl: '', mimeType: 'image/png', note: '' })
      await loadWorkspace()
    } catch (err) {
      setError(err.message || '上传失败')
    } finally {
      setSaving(false)
    }
  }

  const handleProgressAction = async (action) => {
    if (!selectedRequest) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await designRequestApi.updateProgress(surface, selectedRequest.id, {
        action,
        comment: progressForm.comment,
        orderReference: progressForm.orderReference,
        orderNote: progressForm.orderNote,
      })
      const actionNotice = action === 'request_revision'
        ? '已打回修改，设计师可继续上传下一版。'
        : action === 'approve_final'
          ? '已定稿，进入待下单。'
          : action === 'mark_ordered'
            ? '已标记下单。'
            : '进度已更新。'
      setNotice(actionNotice)
      setProgressForm({ comment: '', orderReference: '', orderNote: '' })
      await loadWorkspace()
    } catch (err) {
      setError(err.message || '进度更新失败')
    } finally {
      setSaving(false)
    }
  }

  const handleTemplateSave = async () => {
    if (!selectedRequest) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await designRequestApi.createTemplateFromRequest(surface, selectedRequest.id, {
        name: selectedRequest.title + ' 模板',
        description: '由已提交设计需求沉淀',
      })
      setNotice('已保存为设计需求模板。')
      await loadWorkspace()
    } catch (err) {
      setError(err.message || '模板保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handlePreviewImport = async (event) => {
    event.preventDefault()
    if (!importFile) {
      setError('请先选择 Excel 文件')
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const formData = new FormData()
      formData.append('file', importFile)
      if (selectedOrgId) formData.append('orgId', selectedOrgId)
      const importRaceId = Number(form.primaryRaceId || form.raceId || selectedRaceId || 0) || null
      if (importRaceId) formData.append('raceId', String(importRaceId))
      formData.append('eventType', form.eventType || 'marathon')
      const response = await designRequestApi.previewImport(surface, formData)
      const parsedImport = getResponseData(response, null)
      setActiveImport(parsedImport)
      setImports((current) => [parsedImport, ...current.filter((item) => item.id !== parsedImport.id)])
      setSelectedImportItemId(parsedImport?.items?.[0]?.id || '')
      setNotice('协同清单已识别：' + (parsedImport?.rowCount || 0) + ' 行，' + (parsedImport?.designCount || 0) + ' 条需设计。')
    } catch (err) {
      setError(err.message || '表格识别失败')
    } finally {
      setSaving(false)
    }
  }

  const updateImportDraft = (itemId, key, value) => {
    setImportDrafts((current) => ({
      ...current,
      [itemId]: {
        ...(current[itemId] || {}),
        [key]: value,
      },
    }))
  }

  const getImportDraft = (item) => ({
    requesterDepartment: item?.requesterDepartment || '',
    requesterName: item?.requesterName || '',
    dueAt: toDateInputValue(item?.dueAt, false),
    priority: item?.priority || 'normal',
    designMaterial: item?.designMaterial || '',
    designSize: item?.designSize || '',
    designNote: item?.designNote || '',
    referenceNote: item?.referenceNote || '',
    ...(importDrafts[item?.id] || {}),
  })

  const replaceImportItem = (nextItem) => {
    setActiveImport((current) => current
      ? {
        ...current,
        items: (current.items || []).map((item) => item.id === nextItem.id ? nextItem : item),
        readyCount: (current.items || []).map((item) => item.id === nextItem.id ? nextItem : item).filter((item) => item.syncStatus === 'ready').length,
        needsInfoCount: (current.items || []).map((item) => item.id === nextItem.id ? nextItem : item).filter((item) => item.syncStatus === 'needs_info').length,
      }
      : current)
  }

  const handleUpdateImportItem = async () => {
    if (!activeImport || !selectedImportItem) return
    const draft = getImportDraft(selectedImportItem)
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await designRequestApi.updateImportItem(surface, activeImport.id, selectedImportItem.id, {
        ...draft,
        dueAt: draft.dueAt ? new Date(draft.dueAt).toISOString() : null,
      })
      const nextItem = getResponseData(response, null)
      replaceImportItem(nextItem)
      setImportDrafts((current) => {
        const next = { ...current }
        delete next[selectedImportItem.id]
        return next
      })
      setNotice(nextItem.syncStatus === 'ready' ? '该行已补齐，可以同步为设计需求。' : '该行已保存，仍需补齐字段。')
    } catch (err) {
      setError(err.message || '保存导入行失败')
    } finally {
      setSaving(false)
    }
  }

  const handleCommitImport = async () => {
    if (!activeImport || readyImportItemIds.length === 0) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await designRequestApi.commitImport(surface, activeImport.id, { itemIds: readyImportItemIds })
      const committedImport = getResponseData(response, null)
      setActiveImport(committedImport)
      setNotice('已同步 ' + (committedImport?.syncedCount || 0) + ' 条设计需求，等待岗位审批。')
      await loadWorkspace()
    } catch (err) {
      setError(err.message || '同步失败')
    } finally {
      setSaving(false)
    }
  }

  const handleCreateExport = async (mode) => {
    const exportRaceIds = raceScope === 'race'
      ? parseRaceIds(raceFilterId)
      : raceScope === 'multi'
        ? parseRaceIds(raceIdsText)
        : []
    if (raceScope === 'multi' && exportRaceIds.length === 0) {
      setError('请先填写多赛事范围')
      return
    }
    setExportingMode(mode)
    setError('')
    setNotice('')
    try {
      const response = await designRequestApi.createExport(surface, {
        orgId: selectedOrgId || undefined,
        raceId: exportRaceIds.length === 1 ? exportRaceIds[0] : undefined,
        raceIds: exportRaceIds.length > 1 ? exportRaceIds : undefined,
        eventType: form.eventType || 'marathon',
        mode,
      })
      const createdExport = getResponseData(response, null)
      const blob = await designRequestApi.downloadExport(surface, createdExport.id)
      saveBlob(blob, createdExport.fileName)
      setNotice('已生成第 ' + createdExport.roundNo + ' 轮协同清单：' + createdExport.fileName)
      await loadWorkspace()
    } catch (err) {
      setError(err.message || '导出失败')
    } finally {
      setExportingMode('')
    }
  }

  const selectedImportDraft = selectedImportItem ? getImportDraft(selectedImportItem) : null
  const selectedImportLocked = selectedImportItem
    ? !selectedImportItem.needsDesign || selectedImportItem.syncStatus === 'synced'
    : true
  const selectedProgress = selectedRequest?.progress || {}
  const selectedHasDeliverable = Boolean(selectedRequest?.deliverables?.length)
  const canRequestRevision = selectedHasDeliverable && selectedProgress.orderStatus !== 'ordered'
  const canApproveFinal = selectedHasDeliverable && selectedRequest?.status === 'design_uploaded' && selectedProgress.orderStatus !== 'ordered'
  const canMarkOrdered = selectedProgress.orderStatus === 'ready'
  const canMarkDelivered = selectedProgress.orderStatus === 'ordered' && selectedRequest?.status !== 'delivered'
  const designerUploadLocked = !['in_design', 'design_uploaded'].includes(selectedRequest?.status)
    || ['ready', 'ordered'].includes(selectedProgress.orderStatus)

  return (
    <div className={'design-request-workspace design-request-workspace--' + mode}>
      <section className="design-request-metrics" aria-label="设计需求统计">
        {metrics.map((item) => (
          <MetricCard key={item.label} {...item} />
        ))}
      </section>

      {(notice || error) ? (
        <div
          className={'design-request-alert ' + (error ? 'design-request-alert--error' : 'design-request-alert--ok')}
          role={error ? 'alert' : 'status'}
          aria-live="polite"
        >
          {error || notice}
        </div>
      ) : null}

      <section className="design-request-scope-panel" aria-label="设计需求作用域筛选">
        <div>
          <span className="design-request-kicker">组织级设计中心</span>
          <h2>跨项目设计需求池</h2>
          <p>赛事是关联范围，不再是设计需求的必选归属。</p>
        </div>
        <div className="design-request-scope-controls">
          <div className="design-request-scope-filter">
            <span>关联范围</span>
            <div className="design-request-scope-buttons" role="group" aria-label="赛事筛选">
              {RACE_SCOPE_OPTIONS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={raceScope === item.value ? 'is-active' : ''}
                  onClick={() => setRaceScope(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <label>
            <span>单赛事 ID</span>
            <input
              value={raceFilterId}
              onChange={(event) => setRaceFilterId(event.target.value)}
              placeholder="用于单赛事过滤"
              disabled={raceScope !== 'race'}
            />
          </label>
          <label>
            <span>多赛事范围</span>
            <input
              value={raceIdsText}
              onChange={(event) => setRaceIdsText(event.target.value)}
              placeholder="多个 ID 用逗号分隔"
              disabled={raceScope !== 'multi'}
            />
          </label>
          <label>
            <span>赛事类型</span>
            <select value={eventTypeFilter} onChange={(event) => setEventTypeFilter(event.target.value)}>
              <option value="all">全部类型</option>
              {EVENT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
        </div>
      </section>

      {isRequester ? (
        <nav className="design-request-workbench-nav" aria-label="设计需求工作区导航">
          <a href="#design-import-workbench">
            <span className="material-symbols-outlined">upload_file</span>
            表格导入
          </a>
          <a href="#design-request-list">
            <span className="material-symbols-outlined">table_view</span>
            需求列表
          </a>
        </nav>
      ) : null}

      {isDesigner ? (
        <section className="design-request-export-panel">
          <div>
            <span className="design-request-kicker">标准清单导出</span>
            <h2>导出协同清单给需求方</h2>
            {latestExport ? (
              <p>
                最近第 {latestExport.roundNo} 轮 · {formatDateTime(latestExport.createdAt)} ·
                新增 {latestExport.newCount || 0} · 修改 {latestExport.changedCount || 0} · 新类目 {latestExport.newCategoryCount || 0}
              </p>
            ) : (
              <p>可按组织池、单赛事或多赛事范围导出标准表格。</p>
            )}
          </div>
          <div className="design-request-export-actions">
            {EXPORT_ACTIONS.map((item) => (
              <button
                key={item.mode}
                type="button"
                onClick={() => handleCreateExport(item.mode)}
                disabled={Boolean(exportingMode)}
              >
                <span className="material-symbols-outlined">{item.icon}</span>
                {exportingMode === item.mode ? '生成中...' : item.label}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {isRequester ? (
        <section id="design-import-workbench" className="design-request-import-workbench">
          <div className="design-request-import-head">
            <div>
              <span className="design-request-kicker">协同清单导入</span>
              <h2>上传搭建&设计清单</h2>
	              <p>识别整张表，保留搭建上下文；未选择赛事时进入组织级需求池。</p>
            </div>
            <form className="design-request-import-upload" onSubmit={handlePreviewImport}>
              <label>
                <span>项目类型</span>
                <select value={form.eventType} onChange={(event) => updateForm('eventType', event.target.value)}>
                  {EVENT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="design-request-import-file">
                <span className="material-symbols-outlined">upload_file</span>
                <input type="file" accept=".xlsx" onChange={(event) => setImportFile(event.target.files?.[0] || null)} />
                <strong>{importFile?.name || '选择 Excel 文件'}</strong>
              </label>
	              <button type="submit" disabled={saving || !importFile}>
                {saving ? '识别中...' : '识别清单'}
              </button>
            </form>
          </div>

          <div className="design-request-import-metrics">
            {importMetrics.map((item) => (
              <MetricCard key={item.label} {...item} />
            ))}
          </div>

          <div className="design-request-import-layout">
            <div className="design-request-import-list">
              <div className="design-request-filter-row">
                {IMPORT_FILTERS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={importFilter === item.value ? 'is-active' : ''}
                    onClick={() => setImportFilter(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="design-request-table-wrap">
                <table className="design-request-table design-request-table--import">
                  <thead>
                    <tr>
                      <th>区域 / 项目</th>
                      <th>搭建</th>
                      <th>设计</th>
                      <th>变化</th>
                      <th>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredImportItems.map((item) => (
                      <tr
                        key={item.id}
                        className={selectedImportItem?.id === item.id ? 'is-selected' : ''}
                        onClick={() => setSelectedImportItemId(item.id)}
                      >
                        <td data-label="区域 / 项目">
                          <strong>{item.itemName || '未命名项目'}</strong>
                          <span>{item.area || '未分区'} · 第 {item.excelRowNumber} 行</span>
                        </td>
                        <td data-label="搭建">
                          <strong>{item.quantity ?? '-'} {item.unit}</strong>
                          <span>{item.buildSize || item.craft || '未填'}</span>
                        </td>
                        <td data-label="设计">{item.needsDesign ? '需要' : '不需要'}</td>
                        <td data-label="变化">
                          <span className={'design-request-import-change design-request-import-change--' + (item.changeType || 'new')}>
                            {importChangeLabel(item.changeType)}
                          </span>
                        </td>
                        <td data-label="状态">
                          <span className={'design-request-import-status design-request-import-status--' + item.syncStatus}>
                            {importStatusLabel(item.syncStatus)}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {filteredImportItems.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="design-request-empty-cell">
                          {activeImport ? '当前筛选下没有清单行' : '上传 Excel 后在这里预览识别结果'}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <aside className="design-request-import-detail">
              {selectedImportItem ? (
                <>
                  <div className="design-request-detail-head">
                    <div>
                      <span>{selectedImportItem.area || '未分区'}</span>
                      <h2>{selectedImportItem.itemName || '未命名项目'}</h2>
                    </div>
                    <span className={'design-request-import-status design-request-import-status--' + selectedImportItem.syncStatus}>
                      {importStatusLabel(selectedImportItem.syncStatus)}
                    </span>
                    <span className={'design-request-import-change design-request-import-change--' + (selectedImportItem.changeType || 'new')}>
                      {importChangeLabel(selectedImportItem.changeType)}
                    </span>
                  </div>

                  <dl className="design-request-brief-grid">
                    <div>
                      <dt>供方</dt>
                      <dd>{selectedImportItem.supplier || '未填'}</dd>
                    </div>
                    <div>
                      <dt>类别</dt>
                      <dd>{selectedImportItem.category || '未填'}</dd>
                    </div>
                    <div>
                      <dt>工艺</dt>
                      <dd>{selectedImportItem.craft || '未填'}</dd>
                    </div>
                    <div>
                      <dt>搭建尺寸</dt>
                      <dd>{selectedImportItem.buildSize || '未填'}</dd>
                    </div>
                    <div>
                      <dt>数量</dt>
                      <dd>{selectedImportItem.quantity ?? '未填'} {selectedImportItem.unit}</dd>
                    </div>
                    <div>
                      <dt>费用</dt>
                      <dd>{formatAmount(selectedImportItem.totalPrice)}</dd>
                    </div>
                    <div>
                      <dt>提报时间</dt>
                      <dd>{formatDateTime(selectedImportItem.firstSeenAt)}</dd>
                    </div>
                    <div>
                      <dt>最近修改</dt>
                      <dd>{formatDateTime(selectedImportItem.lastChangedAt)}</dd>
                    </div>
                  </dl>

                  <section className="design-request-copy-block">
                    <h3>搭建备注</h3>
                    <p>{selectedImportItem.buildNote || '暂无搭建备注'}</p>
                  </section>

                  <section className="design-request-action-box">
                    <h3>设计字段补齐</h3>
                    {selectedImportItem.syncIssues?.length ? (
                      <p className="design-request-import-issues">{selectedImportItem.syncIssues.join(' / ')}</p>
                    ) : null}
                    <fieldset className="design-request-import-edit-grid" disabled={selectedImportLocked}>
                      <label>
                        <span>需求部门</span>
                        <input value={selectedImportDraft?.requesterDepartment || ''} onChange={(event) => updateImportDraft(selectedImportItem.id, 'requesterDepartment', event.target.value)} />
                      </label>
                      <label>
                        <span>需求人</span>
                        <input value={selectedImportDraft?.requesterName || ''} onChange={(event) => updateImportDraft(selectedImportItem.id, 'requesterName', event.target.value)} />
                      </label>
                      <label>
                        <span>交付时间</span>
                        <input type="datetime-local" value={selectedImportDraft?.dueAt || ''} onChange={(event) => updateImportDraft(selectedImportItem.id, 'dueAt', event.target.value)} />
                      </label>
                      <label>
                        <span>优先级</span>
                        <select value={selectedImportDraft?.priority || 'normal'} onChange={(event) => updateImportDraft(selectedImportItem.id, 'priority', event.target.value)}>
                          {PRIORITIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                        </select>
                      </label>
                      <label>
                        <span>设计材质</span>
                        <input value={selectedImportDraft?.designMaterial || ''} onChange={(event) => updateImportDraft(selectedImportItem.id, 'designMaterial', event.target.value)} />
                      </label>
                      <label>
                        <span>设计尺寸</span>
                        <input value={selectedImportDraft?.designSize || ''} onChange={(event) => updateImportDraft(selectedImportItem.id, 'designSize', event.target.value)} />
                      </label>
                      <label className="design-request-form__wide">
                        <span>设计备注</span>
                        <textarea value={selectedImportDraft?.designNote || ''} onChange={(event) => updateImportDraft(selectedImportItem.id, 'designNote', event.target.value)} />
                      </label>
                      <label className="design-request-form__wide">
                        <span>参考说明</span>
                        <textarea value={selectedImportDraft?.referenceNote || ''} onChange={(event) => updateImportDraft(selectedImportItem.id, 'referenceNote', event.target.value)} />
                      </label>
                    </fieldset>
                    <div className="design-request-action-row">
                      <button type="button" onClick={handleUpdateImportItem} disabled={saving || selectedImportItem.syncStatus === 'ignored' || selectedImportItem.syncStatus === 'synced'}>
                        保存该行
                      </button>
                      <button type="button" className="is-quiet" onClick={handleCommitImport} disabled={saving || readyImportItemIds.length === 0}>
                        同步 {readyImportItemIds.length} 条可同步项
                      </button>
                    </div>
                  </section>
                </>
              ) : (
                <div className="design-request-empty-detail">
                  <span className="material-symbols-outlined">table_view</span>
                  <p>上传协同清单后选择一行查看搭建和设计字段。</p>
                </div>
              )}
            </aside>
          </div>

          <details className="design-request-manual-panel" open={manualFormOpen} onToggle={(event) => setManualFormOpen(event.currentTarget.open)}>
            <summary>手工提交单条设计需求</summary>
            <form className="design-request-form" onSubmit={handleSubmitRequest}>
              <div className="design-request-form__grid">
                <label>
                  <span>关联赛事</span>
                  <input
                    value={form.raceIdsText}
                    onChange={(event) => updateForm('raceIdsText', event.target.value)}
                    placeholder="可空；多个 ID 用逗号分隔"
                  />
                </label>
                <label>
                  <span>主审批赛事</span>
                  <input
                    value={form.primaryRaceId}
                    onChange={(event) => updateForm('primaryRaceId', event.target.value)}
                    placeholder="可空；用于赛事级审批"
                  />
                </label>
                <label>
                  <span>项目类型</span>
                  <select value={form.eventType} onChange={(event) => updateForm('eventType', event.target.value)}>
                    {EVENT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <label>
                  <span>需求部门</span>
                  <input value={form.requesterDepartment} onChange={(event) => updateForm('requesterDepartment', event.target.value)} required />
                </label>
                <label>
                  <span>提交人</span>
                  <input value={form.requesterName} onChange={(event) => updateForm('requesterName', event.target.value)} required />
                </label>
                <label className="design-request-form__wide">
                  <span>需求标题</span>
                  <input value={form.title} onChange={(event) => updateForm('title', event.target.value)} required />
                </label>
                <label className="design-request-form__wide">
                  <span>具体需求</span>
                  <textarea value={form.requirementText} onChange={(event) => updateForm('requirementText', event.target.value)} required />
                </label>
                <label>
                  <span>尺寸</span>
                  <input value={form.sizeSpec} onChange={(event) => updateForm('sizeSpec', event.target.value)} placeholder="如 1080x1920 / 6m x 3m" />
                </label>
                <label>
                  <span>材质</span>
                  <input value={form.materialSpec} onChange={(event) => updateForm('materialSpec', event.target.value)} placeholder="如喷绘布、亚克力、贴纸" />
                </label>
                <label>
                  <span>需求时间</span>
                  <input type="datetime-local" value={form.dueAt} onChange={(event) => updateForm('dueAt', event.target.value)} required />
                </label>
                <label>
                  <span>优先级</span>
                  <select value={form.priority} onChange={(event) => updateForm('priority', event.target.value)}>
                    {PRIORITIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <label className="design-request-form__wide">
                  <span>参考说明</span>
                  <textarea value={form.referenceNotes} onChange={(event) => updateForm('referenceNotes', event.target.value)} />
                </label>
                <label className="design-request-form__wide">
                  <span>参考样例</span>
                  <input type="file" accept="image/*,.pdf" onChange={handleReferenceFile} />
                </label>
                <label>
                  <span>样例文件名</span>
                  <input value={form.referenceAssetName} onChange={(event) => updateForm('referenceAssetName', event.target.value)} placeholder="reference.png" />
                </label>
                <label>
                  <span>样例 URL</span>
                  <input value={form.referenceAssetUrl} onChange={(event) => updateForm('referenceAssetUrl', event.target.value)} placeholder="https://example.com/reference.png" />
                </label>
              </div>
              <div className="design-request-form__footer">
                <span>{templates[0]?.name || '通用设计需求模板'}</span>
                <button type="submit" disabled={saving}>{saving ? '提交中...' : '提交设计需求'}</button>
              </div>
            </form>
          </details>
        </section>
      ) : null}

      {isManager ? (
        <section className="design-request-staff-panel">
          <div className="design-request-section-head">
            <div>
              <span className="design-request-kicker">组织级审批底座</span>
              <h2>审批岗位配置</h2>
            </div>
            <span>{staffAssignments.length} 个有效任命</span>
          </div>
          <form className="design-request-staff-form" onSubmit={handleCreateStaffAssignment}>
            <label>
              <span>作用域</span>
              <select
                value={staffForm.scopeType}
                onChange={(event) => setStaffForm({ ...staffForm, scopeType: event.target.value })}
              >
                <option value="org">组织</option>
                <option value="department">部门</option>
                <option value="module">模块</option>
                <option value="race">赛事</option>
              </select>
            </label>
            <label>
              <span>作用域 ID</span>
              <input
                value={staffForm.scopeId}
                onChange={(event) => setStaffForm({ ...staffForm, scopeId: event.target.value })}
                placeholder={staffForm.scopeType === 'race' ? '赛事 ID' : '可空'}
              />
            </label>
            <label>
              <span>成员 ID</span>
              <input value={staffForm.teamMemberId} onChange={(event) => setStaffForm({ ...staffForm, teamMemberId: event.target.value })} placeholder="team_member_id" required />
            </label>
            <label>
              <span>岗位</span>
              <select
                value={staffForm.roleKey}
                onChange={(event) => {
                  const nextRole = STAFF_ROLES.find((item) => item.value === event.target.value)
                  setStaffForm({ ...staffForm, roleKey: event.target.value, roleName: nextRole?.label || event.target.value })
                }}
              >
                {STAFF_ROLES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label>
              <span>部门范围</span>
              <input value={staffForm.departmentScope} onChange={(event) => setStaffForm({ ...staffForm, departmentScope: event.target.value })} placeholder="部门负责人必填，如竞赛部" />
            </label>
            <label>
              <span>模块键</span>
              <input value={staffForm.moduleKey} onChange={(event) => setStaffForm({ ...staffForm, moduleKey: event.target.value })} placeholder="design_requests" />
            </label>
            <button type="submit" disabled={saving}>保存岗位</button>
          </form>
          <div className="design-request-staff-list">
            {staffAssignments.map((item) => (
              <div key={item.id} className="design-request-staff-item">
                <span className="material-symbols-outlined">assignment_ind</span>
                <div>
                  <strong>{item.roleName}</strong>
                  <small>
                    {item.employeeName || '未命名'} · {item.scopeType || 'org'}
                    {item.scopeId ? ' #' + item.scopeId : ''}
                    {item.departmentScope ? ' · ' + item.departmentScope : ''}
                    {item.moduleKey ? ' · ' + item.moduleKey : ''}
                    {' · ' + (item.accountUsername || '未绑定账号')}
                  </small>
                </div>
              </div>
            ))}
            {staffAssignments.length === 0 ? (
              <p className="design-request-empty-line">当前组织还没有审批岗位配置</p>
            ) : null}
          </div>
        </section>
      ) : null}

      <section id="design-request-list" className="design-request-main-grid">
        <div className="design-request-list-panel">
          <div className="design-request-panel-title">
            <h2>{isDesigner ? '设计师任务' : isManager ? '岗位审批与管理' : '需求列表'}</h2>
            <button type="button" onClick={loadWorkspace} disabled={loading} aria-label="刷新设计需求">
              <span className="material-symbols-outlined">refresh</span>
            </button>
          </div>
          <div className="design-request-table-wrap">
            <table className="design-request-table">
              <thead>
                <tr>
                  <th>需求</th>
                  <th>关联赛事</th>
                  <th>赛事类型</th>
                  <th>状态</th>
                  <th>进度</th>
                  <th>截止</th>
                  <th>优先级</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((requestItem) => (
                  <tr
                    key={requestItem.id}
                    className={selectedRequest?.id === requestItem.id ? 'is-selected' : ''}
                    onClick={() => setSelectedId(requestItem.id)}
                  >
                    <td>
                      <strong>{requestItem.title}</strong>
                      <span>{requestItem.requesterDepartment} · {raceSummary(requestItem)}</span>
                    </td>
                    <td data-label="关联赛事"><RaceLinkTags request={requestItem} /></td>
                    <td data-label="赛事类型">{eventTypeLabel(requestItem.eventType)}</td>
                    <td data-label="状态"><StatusBadge status={requestItem.status} /></td>
                    <td data-label="进度">
                      <ProgressPill progress={requestItem.progress} />
                      <span>v{requestItem.progress?.currentRevisionNo || 0} · 返工 {requestItem.progress?.revisionCount || 0}</span>
                    </td>
                    <td data-label="截止">{formatDateTime(requestItem.dueAt)}</td>
                    <td data-label="优先级">{priorityLabel(requestItem.priority)}</td>
                  </tr>
                ))}
                {requests.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="design-request-empty-cell">
                      {loading ? '加载中...' : '当前上下文暂无设计需求'}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="design-request-detail-panel">
          {selectedRequest ? (
            <>
              <div className="design-request-detail-head">
                <div>
                  <span>{eventTypeLabel(selectedRequest.eventType)}</span>
                  <h2>{selectedRequest.title}</h2>
                </div>
                <div className="design-request-detail-badges">
                  <StatusBadge status={selectedRequest.status} />
                  <ProgressPill progress={selectedRequest.progress} />
                </div>
              </div>

              <dl className="design-request-brief-grid">
                <div>
                  <dt>需求部门</dt>
                  <dd>{selectedRequest.requesterDepartment}</dd>
                </div>
                <div>
                  <dt>提交人</dt>
                  <dd>{selectedRequest.requesterName}</dd>
                </div>
                <div>
                  <dt>尺寸</dt>
                  <dd>{selectedRequest.sizeSpec || '未填写'}</dd>
                </div>
                <div>
                  <dt>材质</dt>
                  <dd>{selectedRequest.materialSpec || '未填写'}</dd>
                </div>
                <div>
                  <dt>需求时间</dt>
                  <dd>{formatDateTime(selectedRequest.dueAt)}</dd>
                </div>
                <div>
                  <dt>优先级</dt>
                  <dd>{priorityLabel(selectedRequest.priority)}</dd>
                </div>
                <div>
                  <dt>关联赛事</dt>
                  <dd><RaceLinkTags request={selectedRequest} /></dd>
                </div>
                <div>
                  <dt>主审批赛事</dt>
                  <dd>{selectedRequest.primaryRaceId ? ('赛事 #' + selectedRequest.primaryRaceId) : '组织级审批'}</dd>
                </div>
              </dl>

              <DesignProgressTracker request={selectedRequest} />

              <section className="design-request-copy-block">
                <h3>具体需求</h3>
                <p>{selectedRequest.requirementText}</p>
              </section>
              <section className="design-request-copy-block">
                <h3>参考说明</h3>
                <p>{selectedRequest.referenceNotes || '暂无参考说明'}</p>
              </section>
              <section className="design-request-copy-block">
                <h3>审批意见</h3>
                <p>{selectedRequest.reviewComment || '暂无审批意见'}</p>
              </section>

              <ApprovalTimeline approval={selectedRequest.currentApproval} />

              <AssetGrid title="参考样例" assets={selectedRequest.referenceAssets} />
              <AssetGrid title="完成图示" assets={selectedRequest.deliverables} />

              {isManager ? (
                <section className="design-request-action-box">
                  <h3>{selectedApprovalTask ? approvalStepLabel(selectedApprovalTask.step?.stepKey) : '审批待办'}</h3>
                  <textarea value={reviewForm.comment} onChange={(event) => setReviewForm({ ...reviewForm, comment: event.target.value })} placeholder="审核意见" />
                  {selectedApprovalTask?.step?.taskType === 'assignment' ? (
                    <input value={reviewForm.assignedDesignerId} onChange={(event) => setReviewForm({ ...reviewForm, assignedDesignerId: event.target.value })} placeholder="设计师用户 ID" />
                  ) : null}
                  <div className="design-request-action-row">
                    {selectedApprovalTask?.step?.taskType === 'assignment' ? (
                      <button type="button" onClick={() => handleApprovalTaskAction('assign')} disabled={saving || !reviewForm.assignedDesignerId}>分派设计师</button>
                    ) : (
                      <>
                        <button type="button" onClick={() => handleApprovalTaskAction('approve')} disabled={saving || !selectedApprovalTask}>通过</button>
                        <button type="button" onClick={() => handleApprovalTaskAction('request_changes')} disabled={saving || !selectedApprovalTask}>补充</button>
                        <button type="button" className="is-danger" onClick={() => handleApprovalTaskAction('reject')} disabled={saving || !selectedApprovalTask}>驳回</button>
                      </>
                    )}
                    <button type="button" className="is-quiet" onClick={handleTemplateSave} disabled={saving}>存为模板</button>
                  </div>
                  {!selectedApprovalTask ? (
                    <p className="design-request-empty-line">当前账号没有这条需求的待办任务。</p>
                  ) : null}
                </section>
              ) : null}

              {isManager ? (
                <section className="design-request-action-box design-request-progress-actions">
                  <h3>设计进度处理</h3>
                  <textarea
                    value={progressForm.comment}
                    onChange={(event) => setProgressForm({ ...progressForm, comment: event.target.value })}
                    placeholder="返工说明或定稿意见"
                  />
                  <div className="design-request-action-row">
                    <button type="button" className="is-danger" onClick={() => handleProgressAction('request_revision')} disabled={saving || !canRequestRevision}>
                      打回修改
                    </button>
                    <button type="button" onClick={() => handleProgressAction('approve_final')} disabled={saving || !canApproveFinal}>
                      定稿待下单
                    </button>
                  </div>
                  <div className="design-request-progress-order-form">
                    <label>
                      <span>下单编号</span>
                      <input value={progressForm.orderReference} onChange={(event) => setProgressForm({ ...progressForm, orderReference: event.target.value })} placeholder="PO 或供应商订单号" />
                    </label>
                    <label>
                      <span>下单备注</span>
                      <textarea value={progressForm.orderNote} onChange={(event) => setProgressForm({ ...progressForm, orderNote: event.target.value })} placeholder="供应商、文件版本、制作注意事项" />
                    </label>
                  </div>
                  <div className="design-request-action-row">
                    <button type="button" onClick={() => handleProgressAction('mark_ordered')} disabled={saving || !canMarkOrdered}>
                      标记已下单
                    </button>
                    <button type="button" className="is-quiet" onClick={() => handleProgressAction('mark_delivered')} disabled={saving || !canMarkDelivered}>
                      标记交付
                    </button>
                  </div>
                </section>
              ) : null}

              {isDesigner ? (
                <section className="design-request-action-box">
                  <h3>设计交付</h3>
                  <button type="button" onClick={handleStartDesign} disabled={saving || selectedRequest.status !== 'approved'}>
                    开始设计
                  </button>
                  <form onSubmit={handleUploadDeliverable}>
                    <input type="file" accept="image/*,.pdf" onChange={handleDeliverableFile} />
                    <input value={deliverable.fileName} onChange={(event) => setDeliverable({ ...deliverable, fileName: event.target.value })} placeholder="文件名" required />
                    <input value={deliverable.fileUrl} onChange={(event) => setDeliverable({ ...deliverable, fileUrl: event.target.value })} placeholder="图示 URL 或 data URL" required />
                    <textarea value={deliverable.note} onChange={(event) => setDeliverable({ ...deliverable, note: event.target.value })} placeholder="版本说明" />
                    <button type="submit" disabled={saving || designerUploadLocked}>上传完成图示</button>
                  </form>
                </section>
              ) : null}
            </>
          ) : (
            <div className="design-request-empty-detail">
              <span className="material-symbols-outlined">design_services</span>
              <p>选择一条设计需求查看完整 brief。</p>
            </div>
          )}
        </aside>
      </section>
    </div>
  )
}
