import { buildSurfaceHref } from '../../utils/surfaceContext'

const navGroups = [
  {
    key: 'home',
    label: '概览',
    icon: 'space_dashboard',
    items: [
      {
        key: 'dashboard',
        path: '',
        icon: 'space_dashboard',
        shortLabel: 'HM',
        label: '执行工作台',
        description: '当前上下文、执行入口与待处理动作',
        cardDescription: '进入执行工作台，查看当前上下文下的扫码、发放和仓储作业入口。',
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
        icon: 'qr_code_scanner',
        shortLabel: 'SC',
        label: '通用扫码',
        description: '号码布与证件扫码入口',
        cardDescription: '统一处理号码布和证件扫码动作，支持多码制批量扫描。',
      },
      {
        key: 'bibs',
        path: '/bibs/pickup',
        icon: 'confirmation_number',
        shortLabel: 'BB',
        label: '号码布领取',
        description: '号码布领取与核验',
        cardDescription: '选手现场领取号码布、扫码核验身份并确认发放。',
      },
      {
        key: 'credentials',
        path: '/credentials/issue',
        icon: 'badge',
        shortLabel: 'CR',
        label: '证件发放',
        description: '证件发放与状态更新',
        cardDescription: '工作人员/志愿者等各类证件的现场发放与状态追踪。',
      },
    ],
  },
  {
    key: 'warehouse',
    label: '仓储作业',
    icon: 'warehouse',
    items: [
      {
        key: 'inbound',
        path: '/warehouse/inbound',
        icon: 'input',
        shortLabel: 'IN',
        label: '入库',
        description: '预入库与正式入库',
        cardDescription: '接收到货物资、批量扫码入库、打印标签与上架确认。',
      },
      {
        key: 'outbound',
        path: '/warehouse/outbound',
        icon: 'output',
        shortLabel: 'OUT',
        label: '出库',
        description: '出库与领取处理',
        cardDescription: '按任务单扫码出库、领取签收与流转记录。',
      },
      {
        key: 'count',
        path: '/warehouse/count',
        icon: 'inventory',
        shortLabel: 'CT',
        label: '盘点',
        description: '盘点与异常处理',
        cardDescription: '定期盘点、差异核对与异常登记处理。',
      },
    ],
  },
]

const routeMeta = [
  { key: 'ops-home', path: '/ops', exact: true, title: '执行工作台', summary: '', groupKey: 'home', sectionLabel: '执行端', surfaceCode: 'OPS' },
  { key: 'scan', path: '/ops/scan', title: '执行端扫码', summary: '统一处理号码布和证件扫码动作。', groupKey: 'scan', sectionLabel: '扫码执行', surfaceCode: 'OPS' },
  { key: 'scan-result', path: '/ops/scan/result', title: '扫码结果', summary: '展示扫码命中结果并执行后续动作。', groupKey: 'scan', sectionLabel: '扫码执行', surfaceCode: 'OPS' },
  { key: 'bibs', path: '/ops/bibs/pickup', title: '号码布领取', summary: '号码布现场扫码与领取确认。', groupKey: 'scan', sectionLabel: '扫码执行', surfaceCode: 'OPS' },
  { key: 'credentials', path: '/ops/credentials/issue', title: '证件发放', summary: '证件发放、领取和状态更新。', groupKey: 'scan', sectionLabel: '扫码执行', surfaceCode: 'OPS' },
  { key: 'warehouse-inbound', path: '/ops/warehouse/inbound', title: '仓储入库', summary: '预入库、批量入库与标签处理。', groupKey: 'warehouse', sectionLabel: '仓储作业', surfaceCode: 'OPS' },
  { key: 'warehouse-outbound', path: '/ops/warehouse/outbound', title: '仓储出库', summary: '出库、领取与扫码处理。', groupKey: 'warehouse', sectionLabel: '仓储作业', surfaceCode: 'OPS' },
  { key: 'warehouse-count', path: '/ops/warehouse/count', title: '仓储盘点', summary: '盘点与异常处置。', groupKey: 'warehouse', sectionLabel: '仓储作业', surfaceCode: 'OPS' },
]

export function getOpsNavGroups() {
  return navGroups
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
export function getOpsPortalCards() {
  return navGroups
    .flatMap((group) => group.items)
    .filter((item) => item.key !== 'dashboard')
}
