export const ADMIN_ROUTE_GROUPS = [
  { key: 'home', label: '概览', icon: 'space_dashboard', caption: '后台应用入口' },
  { key: 'platform', label: '平台治理', icon: 'admin_panel_settings', caption: '平台级资源维护', superAdminOnly: true },
  { key: 'identity', label: '组织与授权', icon: 'badge', caption: '成员、账号与权限分配' },
  { key: 'hr', label: '人事管理', icon: 'work', caption: '面试评分与候选人管理' },
  { key: 'finance', label: '财务管理', icon: 'payments', caption: '机构报销总览与导出' },
  { key: 'credential', label: '证件治理', icon: 'id_card', caption: '规则、类别与样式模板' },
  { key: 'branding', label: '品牌设置', icon: 'palette', caption: '配色方案与品牌定制' },
  { key: 'design', label: '设计协同', icon: 'design_services', caption: '需求审核与模板' },
]

const navigationRoutes = [
  ['dashboard', 'home', '', 'dashboard', 'space_dashboard', 'CT', '指挥台', '当前上下文、关键流程与待处理入口', 'dashboard', '中奥致远指挥台', ''],
  ['orgs', 'platform', '/orgs', 'orgs', 'corporate_fare', 'OG', '机构管理', '机构清单、基础资料与账号入口', 'org-list', '机构管理', '管理机构资料、人员、赛事和项目关系。'],
  ['races', 'platform', '/races', 'races', 'emoji_events', 'RC', '赛事管理', '赛事主数据与项目配置', 'race-management', '赛事管理', '配置赛事主数据、比赛项目与机构归属。'],
  ['system-backup', 'platform', '/db-backups', 'backups', 'backup', 'BK', '数据库备份', '备份生成、下载与恢复', 'database-backup', '数据库备份', '生成备份、下载留档，必要时恢复到测试库。'],
  ['identity-center', 'identity', '/identity-center', 'identity-center', 'fingerprint', 'ID', '身份中心', '成员、账号和授权', 'identity-center', '身份与授权中心', '管理成员、账号、机构授权和赛事授权。'],
  ['team', 'identity', '/team', 'team', 'group', 'TM', '团队管理', '成员档案、导入与账号开通', 'team', '团队管理', '维护成员档案、照片、导入记录和账号开通。'],
  ['interview-panel', 'hr', '/interview', 'hr', 'assignment', 'IP', '面试面板', '创建与更新候选人面试评估', 'interview-form', '面试面板', '完成候选人评分、场景压测和备注记录。'],
  ['interview-records', 'hr', '/interview/records', 'hr', 'description', 'IR', '面试记录', '查看所有面试评分记录', 'interview-list', '面试记录', '查看所有面试评分记录与详情。'],
  ['interview-compare', 'hr', '/interview/compare', 'hr', 'compare', 'IC', '面试对比', '候选人评分对比分析', 'interview-compare', '面试对比', '候选人评分对比分析与筛选。'],
  ['reimbursements', 'finance', '/reimbursements', 'finance', 'receipt_long', 'RB', '报销管理', '查看机构或平台范围内的报销汇总数据', 'reimbursements', '报销管理', '后台承接机构级和平台级报销汇总、查看与导出。'],
  ['credential-center', 'credential', '/credential-center', 'credentials', 'badge', 'CC', '证件中心', '证件规则与处理概览', 'credential-center', '证件中心', '配置规则、处理申请、审核并追踪发放状态。'],
  ['credential-access-areas', 'credential', '/credential/access-areas', 'credentials', 'map', 'CA', '通行区域', '证件通行区域配置', 'credential-zones', '通行区域', '维护该赛事的证件通行区域。'],
  ['credential-categories', 'credential', '/credential/categories', 'credentials', 'category', 'CG', '证件类别', '类别、默认区域和审核规则', 'credential-roles', '证件类别', '维护类别、默认区域和审核规则。'],
  ['credential-styles', 'credential', '/credential/styles', 'credentials', 'style', 'CS', '证件样式', '样式模板和版式配置', 'credential-styles', '证件样式', '维护证件模板、版式和打印样式。'],
  ['color-scheme', 'branding', '/branding/colors', 'branding', 'format_color_fill', 'CS', '配色方案', '机构品牌配色定制与预设管理', 'color-scheme', '配色方案', '为机构定制专属品牌配色，支持预设选择与自定义调整。'],
  ['design-requests', 'design', '/design-requests', 'design-requests', 'approval', 'DR', '设计需求', '组织级审批岗位、跨赛事需求和设计模板管理', 'design-requests', '设计需求', '审核各部门设计需求，配置审批岗位，保存常用模板。'],
].map(([key, groupKey, path, moduleId, icon, shortLabel, label, description, componentKey, title, summary]) => ({
  key,
  groupKey,
  path,
  routePath: path.replace(/^\//, ''),
  moduleId,
  icon,
  shortLabel,
  label,
  description,
  componentKey,
  title,
  summary,
  navigation: true,
  exact: path === '',
  needsRace: key.startsWith('credential-') && key !== 'credential-center',
}))

const extraRoutes = [
  { key: 'org-create', path: '/orgs/new', routePath: 'orgs/new', moduleId: 'orgs', componentKey: 'org-create', meta: false },
  { key: 'org-detail', path: '/orgs/:orgId', routePath: 'orgs/:orgId', moduleId: 'orgs', componentKey: 'org-detail', meta: false },
  { key: 'members', path: '/members', routePath: 'members', moduleId: 'team', componentKey: 'redirect-team', meta: false },
  { key: 'members-new', path: '/members/new', routePath: 'members/new', moduleId: 'team', componentKey: 'redirect-team', meta: false },
  ...[
    ['import', '导入、记录处理、抽签、号码布和服装作业已从后台移出。请从启动台进入应用层继续处理赛事业务。'],
    ['records', '记录处理已从后台移出。请从启动台进入应用层继续处理赛事业务。'],
    ['processing', '赛事处理中心已从后台移出。请从启动台进入应用层继续处理赛事业务。'],
    ['lottery', '抽签作业已从后台移出。请从启动台进入应用层继续处理赛事业务。'],
    ['bib', '号码布编排作业已从后台移出。请从启动台进入应用层继续处理赛事业务。'],
    ['clothing', '服装配置作业已从后台移出。请从启动台进入应用层继续处理赛事业务。'],
  ].map(([routePath, deprecatedDescription]) => ({
    key: `deprecated-${routePath}`,
    path: `/${routePath}`,
    routePath,
    componentKey: 'deprecated',
    deprecatedDescription,
    title: '入口已下线',
    summary: deprecatedDescription,
    groupKey: 'home',
  })),
  { key: 'bib-tracking', path: '/bib-tracking', routePath: 'bib-tracking', moduleId: 'bib-tracking', componentKey: 'bib-tracking', title: '号码布追踪', summary: '查看号码布流转与现场领取状态。', groupKey: 'platform' },
  { key: 'credential-root', path: '/credential', routePath: 'credential', moduleId: 'credentials', componentKey: 'redirect-credential-center', meta: false },
  { key: 'credential-select-race', path: '/credential/select-race', routePath: 'credential/select-race', moduleId: 'credentials', componentKey: 'credential-select-race', title: '证件流程入口', summary: '先选择赛事，再配置证件规则。', groupKey: 'credential' },
  { key: 'credential-zones-legacy', path: '/credential/zones', routePath: 'credential/zones', moduleId: 'credentials', componentKey: 'redirect-credential-zones', meta: false },
  { key: 'credential-roles-legacy', path: '/credential/roles', routePath: 'credential/roles', moduleId: 'credentials', componentKey: 'redirect-credential-roles', meta: false },
  { key: 'credential-applications-legacy', path: '/credential/applications', routePath: 'credential/applications', moduleId: 'credentials', componentKey: 'redirect-credential-requests', meta: false },
  { key: 'credential-requests', path: '/credential/requests', routePath: 'credential/requests', moduleId: 'credentials', componentKey: 'credential-requests', title: '申请与建单', summary: '处理申请，也可以手动建单。', groupKey: 'credential', needsRace: true },
  { key: 'credential-review', path: '/credential/review', routePath: 'credential/review', moduleId: 'credentials', componentKey: 'credential-review', title: '审核中心', summary: '审核申请，填写驳回原因或通过意见。', groupKey: 'credential', needsRace: true },
  { key: 'credential-issue', path: '/credential/issue', routePath: 'credential/issue', moduleId: 'credentials', componentKey: 'credential-issue', title: '领取管理', summary: '发放证件，并查看申请和审核记录。', groupKey: 'credential', needsRace: true },
  { key: 'app-manager', path: '/app-manager', routePath: 'app-manager', moduleId: 'dashboard', componentKey: 'redirect-home', meta: false },
  ...[
    ['inventory', '仓储总览', '查看仓库主数据、异常和趋势。', '后台仓储治理页还未迁入新入口；一线入库、出库、绑定和盘点请从启动台进入执行层。'],
    ['inventory/inbound', '入库中心', '该页面已从后台导航移出，仅保留给存量内部跳转使用。', '入库动作已归入执行层。请从启动台进入执行层仓库入口。'],
    ['inventory/outbound', '出库中心', '该页面已从后台导航移出，仅保留给存量内部跳转使用。', '出库动作已归入执行层。请从启动台进入执行层仓库入口。'],
    ['inventory/space', '空间中心', '维护仓库资料、3D 场景和库位绑定。', '仓库空间治理页还未迁入新入口；当前不再从后台跳转到应用层。'],
    ['inventory/control', '盘点与异常', '处理盘点计划、差异项和异常预警。', '盘点与异常处理已归入执行层。请从启动台进入执行层仓库入口。'],
    ['inventory/analytics', '复盘报表', '查看趋势、类型结构和最近流转记录。', '仓储复盘报表还未迁入新入口；当前不再从后台跳转到应用层。'],
  ].map(([routePath, title, summary, deprecatedDescription], index) => ({
    key: `inventory-deprecated-${index}`,
    path: `/${routePath}`,
    routePath,
    moduleId: 'inventory',
    componentKey: 'deprecated',
    deprecatedDescription,
    title,
    summary,
    groupKey: 'warehouse',
    exact: routePath === 'inventory',
  })),
  { key: 'inventory-twin-designer', path: '/inventory/twin/designer', routePath: 'inventory/twin/designer', moduleId: 'inventory', componentKey: 'asset-designer-redirect', title: '空间中心', summary: '旧链接已并入空间中心的 3D 设计视图。', groupKey: 'warehouse' },
  ...[
    ['users', 'legacy-identity-users', '用户管理已移到身份中心。'],
    ['module-permissions', 'legacy-identity-module', '模块权限已移到身份中心的应用授权视图。'],
    ['race-permissions', 'legacy-identity-race', '赛事授权已移到身份中心的用户赛事授权视图。'],
    ['org-race-permissions', 'legacy-identity-org-race', '机构赛事授权已移到身份中心的机构范围视图。'],
  ].map(([routePath, key, summary]) => ({
    key,
    path: `/${routePath}`,
    routePath,
    moduleId: 'identity-center',
    componentKey: 'legacy-identity',
    title: '入口已下线',
    summary,
    groupKey: 'identity',
    exact: true,
  })),
]

export const ADMIN_ROUTE_REGISTRY = [...navigationRoutes, ...extraRoutes]

export function listAdminNavigationRoutes() {
  return ADMIN_ROUTE_REGISTRY.filter((route) => route.navigation)
}

export function listAdminComponentRoutes() {
  return ADMIN_ROUTE_REGISTRY.filter((route) => route.componentKey)
}
