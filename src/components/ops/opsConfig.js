import { buildSurfaceHref } from '../../utils/surfaceContext.js'
import { hasModuleAccess } from '../../utils/moduleAccess.js'

const navGroups = [
  {
    key: 'home',
    label: '概览',
    icon: 'space_dashboard',
    moduleId: 'home',
    items: [
      {
        key: 'dashboard',
        path: '',
        icon: 'space_dashboard',
        shortLabel: 'HM',
        label: '执行工作台',
        description: '当前上下文、执行入口与待处理动作',
        cardDescription: '查看扫码、发放和仓储作业入口。',
      },
    ],
  },
  {
    key: 'scan',
    label: '扫码执行',
    icon: 'qr_code_scanner',
    items: [
      {
        key: 'scan',
        path: '/scan',
        moduleId: 'scan',
        icon: 'qr_code_scanner',
        shortLabel: 'SC',
        label: '通用扫码',
        description: '号码布与证件扫码入口',
        cardDescription: '扫号码布或证件，核验后继续处理。',
      },
      {
        key: 'bibs',
        path: '/bibs/pickup',
        moduleId: 'bib-pickup',
        icon: 'confirmation_number',
        shortLabel: 'BB',
        label: '号码布领取',
        description: '号码布领取与核验',
        cardDescription: '选手现场领取号码布、扫码核验身份并确认发放。',
      },
      {
        key: 'credentials',
        path: '/credentials/issue',
        moduleId: 'credentials',
        icon: 'badge',
        shortLabel: 'CR',
        label: '证件发放',
        description: '证件发放与状态更新',
        cardDescription: '发放工作人员、志愿者等证件，并更新状态。',
      },
    ],
  },
  {
    key: 'warehouse',
    label: '仓储作业',
    icon: 'warehouse',
    moduleId: 'warehouse',
    items: [
      {
        key: 'workbench',
        path: '/warehouse',
        icon: 'inventory_2',
        shortLabel: 'WH',
        label: '仓储作业台',
        description: '入库、出库、库位绑定与盘点',
        cardDescription: '处理入库、出库、库位绑定、盘点和异常。',
      },
    ],
  },
  {
    key: 'design',
    label: '部门协同',
    icon: 'design_services',
    items: [
      {
        key: 'design-requests',
        path: '/design-requests',
        moduleId: 'design-requests',
        icon: 'add_photo_alternate',
        shortLabel: 'DR',
        label: '设计需求',
        description: '提交组织级设计 brief 并查看处理进度',
        cardDescription: '提交设计需求，填写尺寸、材质、时间和关联赛事。',
      },
    ],
  },
]

const routeMeta = [
  { key: 'ops-home', path: '/ops', exact: true, title: '执行工作台', summary: '', groupKey: 'home', sectionLabel: '执行端', surfaceCode: 'OPS' },
  { key: 'scan', path: '/ops/scan', title: '执行端扫码', summary: '扫号码布或证件，核验后继续处理。', groupKey: 'scan', sectionLabel: '扫码执行', surfaceCode: 'OPS' },
  { key: 'scan-result', path: '/ops/scan/result', title: '扫码结果', summary: '展示扫码命中结果并执行后续动作。', groupKey: 'scan', sectionLabel: '扫码执行', surfaceCode: 'OPS' },
  { key: 'bibs', path: '/ops/bibs/pickup', title: '号码布领取', summary: '号码布现场扫码与领取确认。', groupKey: 'scan', sectionLabel: '扫码执行', surfaceCode: 'OPS' },
  { key: 'credentials', path: '/ops/credentials/issue', title: '证件发放', summary: '证件发放、领取和状态更新。', groupKey: 'scan', sectionLabel: '扫码执行', surfaceCode: 'OPS' },
  { key: 'warehouse', path: '/ops/warehouse', exact: true, title: '仓储作业台', summary: '处理入库、出库、库位绑定、盘点和异常。', groupKey: 'warehouse', sectionLabel: '仓储作业', surfaceCode: 'OPS' },
  { key: 'warehouse-inbound', path: '/ops/warehouse/inbound', title: '入库作业', summary: '预入库、批量入库与标签处理。', groupKey: 'warehouse', sectionLabel: '仓储作业', surfaceCode: 'OPS' },
  { key: 'warehouse-outbound', path: '/ops/warehouse/outbound', title: '出库作业', summary: '出库、领取与扫码处理。', groupKey: 'warehouse', sectionLabel: '仓储作业', surfaceCode: 'OPS' },
  { key: 'warehouse-binding', path: '/ops/warehouse/binding', title: '库位绑定', summary: '数字孪生库位绑定、移位与解绑。', groupKey: 'warehouse', sectionLabel: '仓储作业', surfaceCode: 'OPS' },
  { key: 'warehouse-count', path: '/ops/warehouse/count', title: '盘点作业', summary: '盘点与异常处置。', groupKey: 'warehouse', sectionLabel: '仓储作业', surfaceCode: 'OPS' },
  { key: 'design-requests', path: '/ops/design-requests', title: '设计需求', summary: '提交设计需求，关联赛事，并查看审批和设计进度。', groupKey: 'design', sectionLabel: '部门协同', surfaceCode: 'OPS' },
]

function normalizeAccessOptions(options = {}) {
  return {
    user: options?.user || null,
  }
}

function getItemModuleId(group, item) {
  return item.moduleId || group.moduleId || null
}

function hasNavigationModuleAccess(group, item, user) {
  const moduleId = getItemModuleId(group, item)
  if (!moduleId) return true
  return hasModuleAccess(user, 'ops', moduleId)
}

export function getOpsNavGroups(options) {
  const accessOptions = normalizeAccessOptions(options)

  return navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => hasNavigationModuleAccess(group, item, accessOptions.user)),
    }))
    .filter((group) => group.items.length > 0)
}

export function getOpsRouteMeta(pathname) {
  const sorted = [...routeMeta].sort((left, right) => right.path.length - left.path.length)
  return (
    sorted.find((item) => (
      item.exact
        ? pathname === item.path
        : pathname === item.path || pathname.startsWith(`${item.path}/`)
    )) || routeMeta[0]
  )
}

export function buildOpsHref(routePath, { orgId, raceId } = {}) {
  return buildSurfaceHref(`/ops${routePath}`, { orgId, raceId })
}

/**
 * 获取全部执行端入口（用于首页卡片网格）
 */
export function getOpsPortalCards(options) {
  const accessOptions = normalizeAccessOptions(options)

  return navGroups
    .flatMap((group) => group.items.map((item) => ({ group, item })))
    .filter(({ group, item }) => hasNavigationModuleAccess(group, item, accessOptions.user))
    .map(({ item }) => item)
    .filter((item) => item.key !== 'dashboard')
}
