import { buildSurfaceHref } from '../../utils/surfaceContext'

const navGroups = [
  {
    key: 'home',
    label: '概览',
    icon: 'space_dashboard',
    caption: '后台应用入口',
    items: [
      {
        key: 'dashboard',
        path: '',
        icon: 'space_dashboard',
        shortLabel: 'CT',
        label: '指挥台',
        description: '当前上下文、关键流程与待处理入口',
      },
    ],
  },
  {
    key: 'platform',
    label: '平台治理',
    icon: 'admin_panel_settings',
    caption: '平台级资源维护',
    superAdminOnly: true,
    items: [
      { key: 'orgs', path: '/orgs', icon: 'corporate_fare', shortLabel: 'OG', label: '机构管理', description: '机构清单、基础资料与账号入口' },
      { key: 'races', path: '/races', icon: 'emoji_events', shortLabel: 'RC', label: '赛事管理', description: '赛事主数据与项目配置' },
      { key: 'system-backup', path: '/db-backups', icon: 'backup', shortLabel: 'BK', label: '数据库备份', description: '备份生成、下载与恢复' },
    ],
  },
  {
    key: 'identity',
    label: '组织与授权',
    icon: 'badge',
    caption: '成员、账号与权限分配',
    items: [
      { key: 'identity-center', path: '/identity-center', icon: 'fingerprint', shortLabel: 'ID', label: '身份中心', description: '成员、账号和授权' },
      { key: 'team', path: '/team', icon: 'group', shortLabel: 'TM', label: '团队管理', description: '成员档案、导入与账号开通' },
    ],
  },
  {
    key: 'hr',
    label: '人事管理',
    icon: 'work',
    caption: '面试评分与候选人管理',
    items: [
      { key: 'interview-panel', path: '/interview', icon: 'assignment', shortLabel: 'IP', label: '面试面板', description: '创建与更新候选人面试评估' },
      { key: 'interview-records', path: '/interview/records', icon: 'description', shortLabel: 'IR', label: '面试记录', description: '查看所有面试评分记录' },
      { key: 'interview-compare', path: '/interview/compare', icon: 'compare', shortLabel: 'IC', label: '面试对比', description: '候选人评分对比分析' },
    ],
  },
  {
    key: 'finance',
    label: '财务管理',
    icon: 'payments',
    caption: '机构报销总览与导出',
    items: [
      { key: 'reimbursements', path: '/reimbursements', icon: 'receipt_long', shortLabel: 'RB', label: '报销管理', description: '查看机构或平台范围内的报销汇总数据' },
    ],
  },
  {
    key: 'credential',
    label: '证件治理',
    icon: 'id_card',
    caption: '规则、类别与样式模板',
    items: [
      { key: 'credential-center', path: '/credential-center', icon: 'badge', shortLabel: 'CC', label: '证件中心', description: '证件规则与处理概览' },
      { key: 'credential-access-areas', path: '/credential/access-areas', icon: 'map', shortLabel: 'CA', label: '通行区域', description: '证件通行区域配置' },
      { key: 'credential-categories', path: '/credential/categories', icon: 'category', shortLabel: 'CG', label: '证件类别', description: '类别、默认区域和审核规则' },
      { key: 'credential-styles', path: '/credential/styles', icon: 'style', shortLabel: 'CS', label: '证件样式', description: '样式模板和版式配置' },
    ],
  },
  {
    key: 'branding',
    label: '品牌设置',
    icon: 'palette',
    caption: '配色方案与品牌定制',
    items: [
      { key: 'color-scheme', path: '/branding/colors', icon: 'format_color_fill', shortLabel: 'CS', label: '配色方案', description: '机构品牌配色定制与预设管理' },
    ],
  },
  {
    key: 'design',
    label: '设计协同',
    icon: 'design_services',
    caption: '需求审核与模板',
    items: [
      { key: 'design-requests', path: '/design-requests', icon: 'approval', shortLabel: 'DR', label: '设计需求', description: '组织级审批岗位、跨赛事需求和设计模板管理', groupKey: 'design' },
    ],
  },
]

const routeMeta = [
  { key: 'dashboard', path: '/admin', exact: true, title: '中奥致远指挥台', summary: '', groupKey: 'home' },
  { key: 'orgs', path: '/admin/orgs', title: '机构管理', summary: '管理机构资料、人员、赛事和项目关系。', groupKey: 'platform' },
  { key: 'identity-center', path: '/admin/identity-center', title: '身份与授权中心', summary: '管理成员、账号、机构授权和赛事授权。', groupKey: 'identity' },
  { key: 'races', path: '/admin/races', title: '赛事管理', summary: '配置赛事主数据、比赛项目与机构归属。', groupKey: 'platform' },
  { key: 'system-backup', path: '/admin/db-backups', title: '数据库备份', summary: '生成备份、下载留档，必要时恢复到测试库。', groupKey: 'platform' },
  { key: 'team', path: '/admin/team', title: '团队管理', summary: '维护成员档案、照片、导入记录和账号开通。', groupKey: 'identity' },
  { key: 'legacy-identity-users', path: '/admin/users', exact: true, title: '入口已下线', summary: '用户管理已移到身份中心。', groupKey: 'identity' },
  { key: 'legacy-identity-race', path: '/admin/race-permissions', exact: true, title: '入口已下线', summary: '赛事授权已移到身份中心的用户赛事授权视图。', groupKey: 'identity' },
  { key: 'legacy-identity-module', path: '/admin/module-permissions', exact: true, title: '入口已下线', summary: '模块权限已移到身份中心的应用授权视图。', groupKey: 'identity' },
  { key: 'legacy-identity-org-race', path: '/admin/org-race-permissions', exact: true, title: '入口已下线', summary: '机构赛事授权已移到身份中心的机构范围视图。', groupKey: 'identity' },
  { key: 'interview-panel', path: '/admin/interview', title: '面试面板', summary: '完成候选人评分、场景压测和备注记录。', groupKey: 'hr' },
  { key: 'interview-records', path: '/admin/interview/records', title: '面试记录', summary: '查看所有面试评分记录与详情。', groupKey: 'hr' },
  { key: 'interview-compare', path: '/admin/interview/compare', title: '面试对比', summary: '候选人评分对比分析与筛选。', groupKey: 'hr' },
  { key: 'credential-center', path: '/admin/credential-center', title: '证件中心', summary: '配置规则、处理申请、审核并追踪发放状态。', groupKey: 'credential' },
  { key: 'credential-select-race', path: '/admin/credential/select-race', title: '证件流程入口', summary: '先选择赛事，再配置证件规则。', groupKey: 'credential' },
  { key: 'credential-access-areas', path: '/admin/credential/access-areas', title: '通行区域', summary: '维护该赛事的证件通行区域。', groupKey: 'credential', needsRace: true },
  { key: 'credential-categories', path: '/admin/credential/categories', title: '证件类别', summary: '维护类别、默认区域和审核规则。', groupKey: 'credential', needsRace: true },
  { key: 'credential-styles', path: '/admin/credential/styles', title: '证件样式', summary: '维护证件模板、版式和打印样式。', groupKey: 'credential', needsRace: true },
  { key: 'credential-requests', path: '/admin/credential/requests', title: '申请与建单', summary: '处理申请，也可以手动建单。', groupKey: 'credential', needsRace: true },
  { key: 'credential-review', path: '/admin/credential/review', title: '审核中心', summary: '审核申请，填写驳回原因或通过意见。', groupKey: 'credential', needsRace: true },
  { key: 'credential-issue', path: '/admin/credential/issue', title: '领取管理', summary: '发放证件，并查看申请和审核记录。', groupKey: 'credential', needsRace: true },
  { key: 'inventory-workbench', path: '/admin/inventory', exact: true, title: '仓储总览', summary: '查看仓库主数据、异常和趋势。', groupKey: 'warehouse' },
  { key: 'inventory-inbound-center', path: '/admin/inventory/inbound', title: '入库中心', summary: '该页面已从后台导航移出，仅保留给存量内部跳转使用。', groupKey: 'warehouse' },
  { key: 'inventory-outbound-center', path: '/admin/inventory/outbound', title: '出库中心', summary: '该页面已从后台导航移出，仅保留给存量内部跳转使用。', groupKey: 'warehouse' },
  { key: 'inventory-space-center', path: '/admin/inventory/space', title: '空间中心', summary: '维护仓库资料、3D 场景和库位绑定。', groupKey: 'warehouse' },
  { key: 'inventory-control-center', path: '/admin/inventory/control', title: '盘点与异常', summary: '处理盘点计划、差异项和异常预警。', groupKey: 'warehouse' },
  { key: 'inventory-analytics-center', path: '/admin/inventory/analytics', title: '复盘报表', summary: '查看趋势、类型结构和最近流转记录。', groupKey: 'warehouse' },
  { key: 'reimbursements', path: '/admin/reimbursements', title: '报销管理', summary: '后台承接机构级和平台级报销汇总、查看与导出。', groupKey: 'finance' },
  { key: 'color-scheme', path: '/admin/branding/colors', title: '配色方案', summary: '为机构定制专属品牌配色，支持预设选择与自定义调整。', groupKey: 'branding' },
  { key: 'design-requests', path: '/admin/design-requests', title: '设计需求', summary: '审核各部门设计需求，配置审批岗位，保存常用模板。', groupKey: 'design' },
  { key: 'inventory-twin-designer', path: '/admin/inventory/twin/designer', title: '空间中心', summary: '旧链接已并入空间中心的 3D 设计视图。', groupKey: 'warehouse' },
]

export function getAdminNavGroups({ isSuperAdmin }) {
  return navGroups
    .filter((group) => !group.superAdminOnly || isSuperAdmin)
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.superAdminOnly || isSuperAdmin),
    }))
}

export function getAdminRouteMeta(pathname) {
  const sorted = [...routeMeta].sort((left, right) => right.path.length - left.path.length)
  return (
    sorted.find((item) => (
      item.exact
        ? pathname === item.path
        : pathname === item.path || pathname.startsWith(`${item.path}/`)
    )) || routeMeta[0]
  )
}

export function buildAdminHref(routePath, { selectedOrgId, selectedRaceId } = {}) {
  return buildSurfaceHref(`/admin${routePath}`, { orgId: selectedOrgId, raceId: selectedRaceId })
}

export function buildIdentityCenterHref(view, { selectedOrgId, selectedRaceId } = {}) {
  const params = new URLSearchParams()

  if (selectedOrgId) {
    params.set('orgId', String(selectedOrgId))
  }

  if (selectedRaceId) {
    params.set('raceId', String(selectedRaceId))
  }

  if (view) {
    params.set('view', view)
  }

  const query = params.toString()
  return `/admin/identity-center${query ? `?${query}` : ''}`
}

export function getPriorityShortcuts(context = {}) {
  return [
    { label: '身份中心', path: buildIdentityCenterHref('accounts', context) },
    { label: '授权工作台', path: buildIdentityCenterHref('user-race', context) },
    { label: '证件中心', path: buildAdminHref('/credential-center', context) },
    { label: '报销管理', path: buildAdminHref('/reimbursements', context) },
  ]
}
