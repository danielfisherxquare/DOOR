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
      { key: 'identity-center', path: '/identity-center', icon: 'fingerprint', shortLabel: 'ID', label: '身份中心', description: '统一承接成员、账号和授权链路' },
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
    caption: '需求审核与模板沉淀',
    items: [
      { key: 'design-requests', path: '/design-requests', icon: 'approval', shortLabel: 'DR', label: '设计需求', description: '部门负责人审批、赛事总监终审、设计师分配和赛事模板管理' },
    ],
  },
]

const routeMeta = [
  { key: 'dashboard', path: '/admin', exact: true, title: 'DOOR 指挥台', summary: '', groupKey: 'home' },
  { key: 'orgs', path: '/admin/orgs', title: '机构管理', summary: '机构是平台治理的主索引，人员、赛事和项目都从这里延展开。', groupKey: 'platform' },
  { key: 'identity-center', path: '/admin/identity-center', title: '身份与授权中心', summary: '把成员、账号、机构授权和赛事授权收回到一条连续工作流中。', groupKey: 'identity' },
  { key: 'races', path: '/admin/races', title: '赛事管理', summary: '配置赛事主数据、比赛项目与机构归属。', groupKey: 'platform' },
  { key: 'system-backup', path: '/admin/db-backups', title: '数据库备份', summary: '高风险操作集中到系统运维区，避免与业务作业混排。', groupKey: 'platform' },
  { key: 'team', path: '/admin/team', title: '团队管理', summary: '成员档案、照片、导入和账号开通属于同一个身份中心。', groupKey: 'identity' },
  { key: 'legacy-identity-users', path: '/admin/users', exact: true, title: '入口已下线', summary: '用户管理已收敛进身份中心，请改用身份中心对应视图。', groupKey: 'identity' },
  { key: 'legacy-identity-race', path: '/admin/race-permissions', exact: true, title: '入口已下线', summary: '赛事授权已收敛进身份中心，请改用用户赛事授权视图。', groupKey: 'identity' },
  { key: 'legacy-identity-module', path: '/admin/module-permissions', exact: true, title: '入口已下线', summary: '模块权限矩阵已收敛进身份中心，请改用模块权限视图。', groupKey: 'identity' },
  { key: 'legacy-identity-org-race', path: '/admin/org-race-permissions', exact: true, title: '入口已下线', summary: '机构赛事授权已收敛进身份中心，请改用机构赛事范围视图。', groupKey: 'identity' },
  { key: 'interview-panel', path: '/admin/interview', title: '面试面板', summary: '在同一块工作区中完成候选人评分、场景压测和备注沉淀。', groupKey: 'hr' },
  { key: 'interview-records', path: '/admin/interview/records', title: '面试记录', summary: '查看所有面试评分记录与详情。', groupKey: 'hr' },
  { key: 'interview-compare', path: '/admin/interview/compare', title: '面试对比', summary: '候选人评分对比分析与筛选。', groupKey: 'hr' },
  { key: 'credential-center', path: '/admin/credential-center', title: '证件中心', summary: '围绕同一赛事上下文串联规则配置、申请建单、审核处理和发放追踪。', groupKey: 'credential' },
  { key: 'credential-select-race', path: '/admin/credential/select-race', title: '证件流程入口', summary: '证件模块的第一步应该是明确赛事上下文，而不是让用户自行猜测当前作用域。', groupKey: 'credential' },
  { key: 'credential-access-areas', path: '/admin/credential/access-areas', title: '通行区域', summary: '区域配置是证件规则的地基，应与赛事上下文一起常驻显示。', groupKey: 'credential', needsRace: true },
  { key: 'credential-categories', path: '/admin/credential/categories', title: '证件类别', summary: '类别定义、默认区域和审核规则应在一个流程面板里连续可见。', groupKey: 'credential', needsRace: true },
  { key: 'credential-styles', path: '/admin/credential/styles', title: '证件样式', summary: '样式属于证件配置链路的一环，不应成为孤立页面。', groupKey: 'credential', needsRace: true },
  { key: 'credential-requests', path: '/admin/credential/requests', title: '申请与建单', summary: '申请、直建、审核、制证与发放应围绕同一赛事上下文工作。', groupKey: 'credential', needsRace: true },
  { key: 'credential-review', path: '/admin/credential/review', title: '审核中心', summary: '审核动作依赖状态切换，应突出待办优先级而不是只给列表。', groupKey: 'credential', needsRace: true },
  { key: 'credential-issue', path: '/admin/credential/issue', title: '领取管理', summary: '领证是证件流程的最后一步，应该能回看申请与审核轨迹。', groupKey: 'credential', needsRace: true },
  { key: 'inventory-workbench', path: '/admin/inventory', exact: true, title: '仓储治理概览', summary: '后台只保留仓储治理视角，用于掌握主数据、异常和趋势。', groupKey: 'warehouse' },
  { key: 'inventory-inbound-center', path: '/admin/inventory/inbound', title: '入库中心', summary: '该页面已从后台导航移出，仅保留给存量内部跳转使用。', groupKey: 'warehouse' },
  { key: 'inventory-outbound-center', path: '/admin/inventory/outbound', title: '出库中心', summary: '该页面已从后台导航移出，仅保留给存量内部跳转使用。', groupKey: 'warehouse' },
  { key: 'inventory-space-center', path: '/admin/inventory/space', title: '空间中心', summary: '仓库主数据、3D 查看、3D 设计和库位绑定统一围绕同一个仓库上下文工作。', groupKey: 'warehouse' },
  { key: 'inventory-control-center', path: '/admin/inventory/control', title: '盘点与异常', summary: '盘点计划、差异项和预警规则合并为统一控制面。', groupKey: 'warehouse' },
  { key: 'inventory-analytics-center', path: '/admin/inventory/analytics', title: '复盘报表', summary: '趋势、类型结构和流转记录只服务于复盘与优化，不再承担一线作业入口。', groupKey: 'warehouse' },
  { key: 'reimbursements', path: '/admin/reimbursements', title: '报销管理', summary: '后台承接机构级和平台级报销汇总、查看与导出。', groupKey: 'finance' },
  { key: 'color-scheme', path: '/admin/branding/colors', title: '配色方案', summary: '为机构定制专属品牌配色，支持预设选择与自定义调整。', groupKey: 'branding' },
  { key: 'design-requests', path: '/admin/design-requests', title: '设计需求', summary: '审核各部门提交的设计需求，分配设计师，并把高质量需求沉淀为赛事模板。', groupKey: 'design', needsRace: true },
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
    { label: '证件中心', path: buildSurfaceHref('/app/credential-center', { orgId: context.selectedOrgId, raceId: context.selectedRaceId }) },
    { label: '报销管理', path: buildAdminHref('/reimbursements', context) },
  ]
}
