export const EVENT_TYPES = [
  { value: 'marathon', label: '马拉松' },
  { value: 'trail', label: '越野赛' },
  { value: 'aquatic', label: '水上项目' },
  { value: 'orienteering', label: '定向赛' },
  { value: 'general', label: '通用' },
]

export const PRIORITIES = [
  { value: 'normal', label: '普通' },
  { value: 'high', label: '高' },
  { value: 'urgent', label: '紧急' },
  { value: 'low', label: '低' },
]

export const STATUS_LABELS = {
  pending_review: '审批中',
  approved: '已通过',
  in_design: '设计中',
  design_uploaded: '已上传成品',
  delivered: '已交付',
  archived: '已归档',
  rejected: '已驳回',
  needs_info: '需补充',
}

export const PROGRESS_STAGE_LABELS = {
  intake_review: '提报审批',
  assigned: '已分派',
  designing: '设计中',
  internal_review: '待确认',
  revision_requested: '返工中',
  ready_to_order: '可下单',
  ordered: '已下单',
  delivered: '已交付',
}

export const PROGRESS_EVENT_LABELS = {
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

export const ORDER_STATUS_LABELS = {
  not_ready: '未到下单',
  ready: '待下单',
  ordered: '已下单',
}

export const PROGRESS_STEPS = [
  { stage: 'intake_review', label: '提报审批', icon: 'assignment' },
  { stage: 'assigned', label: '已分派', icon: 'assignment_ind' },
  { stage: 'designing', label: '设计中', icon: 'draw' },
  { stage: 'internal_review', label: '待确认', icon: 'rate_review' },
  { stage: 'revision_requested', label: '返工中', icon: 'published_with_changes' },
  { stage: 'ready_to_order', label: '可下单', icon: 'fact_check' },
  { stage: 'ordered', label: '已下单', icon: 'shopping_cart_checkout' },
]

export const PROGRESS_STEP_ORDER = {
  intake_review: 0,
  assigned: 1,
  designing: 2,
  internal_review: 3,
  revision_requested: 4,
  ready_to_order: 5,
  ordered: 6,
  delivered: 6,
}

export const APPROVAL_STEP_LABELS = {
  department_owner_review: '部门负责人审批',
  race_director_review: '赛事总监终审',
  design_lead_assignment: '设计负责人分派',
}

export const STAFF_ROLES = [
  { value: 'department_owner', label: '部门负责人' },
  { value: 'race_director', label: '赛事总监' },
  { value: 'design_lead', label: '设计负责人' },
  { value: 'design_designer', label: '设计师' },
]

export const APPROVAL_FLOW = [
  { stepKey: 'department_owner_review', stepName: '部门负责人审批', order: 1 },
  { stepKey: 'race_director_review', stepName: '赛事总监终审', order: 2 },
  { stepKey: 'design_lead_assignment', stepName: '设计负责人分派', order: 3 },
]

export const STATUS_CLASS = {
  pending_review: 'warning',
  approved: 'success',
  in_design: 'info',
  design_uploaded: 'done',
  delivered: 'done',
  archived: 'muted',
  rejected: 'danger',
  needs_info: 'warning',
}

export const IMPORT_FILTERS = [
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

export const IMPORT_STATUS_LABELS = {
  ignored: '非设计项',
  needs_info: '待补齐',
  ready: '可同步',
  synced: '已同步',
  error: '异常',
}

export const IMPORT_CHANGE_LABELS = {
  new: '新增',
  changed: '修改',
  unchanged: '未变化',
  new_category: '新类目',
}

export const EXPORT_ACTIONS = [
  { mode: 'blank_template', label: '导出标准模板', icon: 'download' },
  { mode: 'incremental', label: '仅新增/变更', icon: 'difference' },
  { mode: 'full_marked', label: '完整并标记', icon: 'select_all' },
]

export const RACE_SCOPE_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'unlinked', label: '未关联赛事' },
  { value: 'race', label: '单赛事' },
  { value: 'multi', label: '多赛事' },
]

export function toDateInputValue(date, useDefault = true) {
  if (!date && !useDefault) return ''
  const target = date ? new Date(date) : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
  if (Number.isNaN(target.getTime())) return ''
  const offset = target.getTimezoneOffset() * 60000
  return new Date(target.getTime() - offset).toISOString().slice(0, 16)
}

export function createInitialForm(raceId) {
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

export function getResponseData(response, fallback) {
  return response?.data ?? fallback
}

export function formatDateTime(value) {
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

export function statusLabel(status) {
  return STATUS_LABELS[status] || status || '未知'
}

export function progressStageLabel(stage) {
  return PROGRESS_STAGE_LABELS[stage] || stage || '未开始'
}

export function progressEventLabel(eventType) {
  return PROGRESS_EVENT_LABELS[eventType] || eventType || '进度记录'
}

export function orderStatusLabel(status) {
  return ORDER_STATUS_LABELS[status] || status || '未到下单'
}

export function eventTypeLabel(value) {
  return EVENT_TYPES.find((item) => item.value === value)?.label || value || '通用'
}

export function priorityLabel(value) {
  return PRIORITIES.find((item) => item.value === value)?.label || value || '普通'
}

export function parseRaceIds(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map(Number).filter(Boolean))]
  }
  return [...new Set(String(value || '')
    .split(/[，,\s]+/)
    .map(Number)
    .filter(Boolean))]
}

export function raceSummary(request) {
  const links = request?.raceLinks || []
  if (links.length === 0) return '未关联赛事'
  if (links.length === 1) return links[0].raceName || ('赛事 #' + links[0].raceId)
  return links.length + ' 场赛事'
}

export function approvalStepLabel(value) {
  return APPROVAL_STEP_LABELS[value] || value || '未发起'
}

export function importStatusLabel(value) {
  return IMPORT_STATUS_LABELS[value] || value || '未知'
}

export function importChangeLabel(value) {
  return IMPORT_CHANGE_LABELS[value] || value || '未记录'
}

export function formatAmount(value) {
  if (value === null || value === undefined || value === '') return '未填'
  const number = Number(value)
  if (!Number.isFinite(number)) return String(value)
  return number.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

export function isImageAsset(asset) {
  const mimeType = asset?.mimeType || ''
  const fileUrl = asset?.fileUrl || ''
  return mimeType.startsWith('image/') || fileUrl.startsWith('data:image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(fileUrl)
}
