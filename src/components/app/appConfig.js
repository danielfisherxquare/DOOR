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
        icon: 'home',
        shortLabel: 'HM',
        label: '我的工作台',
        description: '个人任务与常用入口',
        cardDescription: '查看个人待办、近期动态和常用功能的统一入口。',
      },
    ],
  },
  {
    key: 'events',
    label: '我的赛事',
    icon: 'emoji_events',
    items: [
      {
        key: 'import',
        path: '/events/import',
        icon: 'upload_file',
        shortLabel: 'IM',
        label: '名单导入',
        description: '上传报名数据、字段映射、清洗与提交',
        cardDescription: '上传本地报名数据，完成字段映射、清洗与预览后安全提交。',
        needsRace: true,
      },
      {
        key: 'processing',
        path: '/events/processing',
        icon: 'tune',
        shortLabel: 'PR',
        label: '名单处理',
        description: '选手查询导出、成绩校验、黑白名单与二次清洗',
        cardDescription: '集中查询导出、状态概览、成绩校验、黑白名单与五步二次清洗。',
        needsRace: true,
      },
      {
        key: 'records',
        path: '/events/records',
        icon: 'table_rows',
        shortLabel: 'RC',
        label: '名单管理',
        description: '全量选手记录、字段筛选、排序与导出',
        cardDescription: '围绕当前赛事查看选手记录，完成字段筛选、排序和导出。',
        needsRace: true,
      },
      {
        key: 'lottery',
        path: '/events/lottery',
        icon: 'casino',
        shortLabel: 'LT',
        label: '抽签管理',
        description: '容量定义、起点沙盘、成绩筛选与最终执行',
        cardDescription: '定义容量、起点沙盘与成绩筛选，执行抽签并查看结果。',
        needsRace: true,
      },
      {
        key: 'bib',
        path: '/events/bib',
        icon: 'pin',
        shortLabel: 'BB',
        label: '选手排号',
        description: '号码布模板与自动分配',
        cardDescription: '配置号码布模板，自动或手动分配号码布。',
        needsRace: true,
      },
      {
        key: 'clothing',
        path: '/events/clothing',
        icon: 'checkroom',
        shortLabel: 'CL',
        label: '服装物资',
        description: '库存管理与需求统计',
        cardDescription: '管理服装库存，查看需求和缺口统计。',
        needsRace: true,
      },
    ],
  },
  {
    key: 'workspace',
    label: '我的业务',
    icon: 'work',
    items: [
      {
        key: 'reimbursement',
        path: '/reimbursements',
        icon: 'receipt_long',
        shortLabel: 'RB',
        label: '发票报销',
        description: '个人报销项目与识别记录',
        cardDescription: '提交费用报销、上传发票、查看审核进度和历史报销记录。',
      },
      {
        key: 'design-requests',
        path: '/design-requests',
        icon: 'design_services',
        shortLabel: 'DR',
        label: '设计工作台',
        description: '设计需求预览、统计和成品上传',
        cardDescription: '查看已审批的设计 brief、参考样例、尺寸材质和交付时间，并上传完成图示。',
        needsRace: true,
      },
      {
        key: 'map',
        path: '/map',
        icon: 'map',
        shortLabel: 'MP',
        label: 'GIS 地图',
        description: '地理信息与空间数据管理',
        cardDescription: '浏览地图、绘制图形、管理图层数据，支持 2D/3D 视图切换和离线区域下载。',
      },
      {
        key: 'three-studio',
        path: '/3d-studio',
        icon: 'view_in_ar',
        shortLabel: 'SP',
        label: '空间工作台',
        description: '机构共享的 GIS 锚定空间运营工作区',
        cardDescription: '统一管理场地地图、仓库建模、资产部署与运营绑定，支持导入历史仓库场景。',
        requiredCapability: { scope: 'inventory', capability: '3d_studio' },
      },
      {
        key: 'terrain-model',
        path: '/terrain-model',
        icon: 'terrain',
        shortLabel: 'TM',
        label: '轨迹地形模型',
        description: 'GPX 轨迹地形预览与打印模型导出',
        cardDescription: '上传赛事 GPX，生成轨迹地形 3D 预览，并导出 STL/GLB 打印文件。',
      },
    ],
  },
  {
    key: 'credential',
    label: '证件流程',
    icon: 'id_card',
    items: [
      {
        key: 'credential-center',
        path: '/credential-center',
        icon: 'hub',
        shortLabel: 'CF',
        label: '证件中心',
        description: '证件规则、申请、审核与发放入口',
        cardDescription: '围绕同一赛事上下文处理证件规则配置、申请建单、审核和发放追踪。',
      },
      {
        key: 'credential-select-race',
        path: '/credential/select-race',
        icon: 'emoji_events',
        shortLabel: 'SR',
        label: '选择赛事',
        description: '先锁定赛事，再进入证件流程',
        cardDescription: '进入证件流程前先锁定赛事上下文，避免在错误作用域下配置规则或处理申请。',
      },
      {
        key: 'credential-access-areas',
        path: '/credential/access-areas',
        icon: 'meeting_room',
        shortLabel: 'AR',
        label: '通行区域',
        description: '区域、编码和颜色管理',
        cardDescription: '管理通行区域、颜色和编码，作为证件类别和申请规则的底层配置。',
        needsRace: true,
      },
      {
        key: 'credential-categories',
        path: '/credential/categories',
        icon: 'category',
        shortLabel: 'CT',
        label: '证件类别',
        description: '类别、默认区域与审核策略',
        cardDescription: '配置证件类别、默认通行区域与审核规则，统一类别定义与流程约束。',
        needsRace: true,
      },
      {
        key: 'credential-styles',
        path: '/credential/styles',
        icon: 'palette',
        shortLabel: 'ST',
        label: '证件样式',
        description: '模板元数据与样式管理',
        cardDescription: '维护证件样式模板、编码和启停状态，作为排版与制证的基础元数据。',
        needsRace: true,
      },
      {
        key: 'credential-requests',
        path: '/credential/requests',
        icon: 'edit_note',
        shortLabel: 'RQ',
        label: '申请与建单',
        description: '申请池与管理员直建',
        cardDescription: '把用户自助申请与管理员直建收回同一条建单链路，统一处理申请池。',
        needsRace: true,
      },
      {
        key: 'credential-review',
        path: '/credential/review',
        icon: 'grading',
        shortLabel: 'RV',
        label: '审核中心',
        description: '审核、驳回与意见处理',
        cardDescription: '集中处理证件审核、驳回原因和权限调整，连续完成审核决策。',
        needsRace: true,
      },
    ],
  },
  {
    key: 'warehouse',
    label: '仓储治理',
    icon: 'warehouse',
    items: [
      {
        key: 'inventory-workbench',
        path: '/inventory',
        icon: 'inventory_2',
        shortLabel: 'WH',
        label: '仓储作业台',
        description: '仓储概览、负载与异常入口',
        cardDescription: '统一查看当前机构的仓储负载、作业队列、异常和未来 7 天趋势。',
      },
      {
        key: 'inventory-space-center',
        path: '/inventory/space',
        icon: 'view_in_ar',
        shortLabel: 'SP',
        label: '空间中心',
        description: '仓库主数据、3D 查看与绑定',
        cardDescription: '统一处理仓库主数据、3D 场景查看、设计和库位绑定。',
      },
      {
        key: 'inventory-control-center',
        path: '/inventory/control',
        icon: 'inventory',
        shortLabel: 'CTL',
        label: '盘点与异常',
        description: '盘点计划、差异与预警',
        cardDescription: '集中处理盘点计划、差异项、异常告警和处置动作。',
      },
      {
        key: 'inventory-analytics-center',
        path: '/inventory/analytics',
        icon: 'monitoring',
        shortLabel: 'ANA',
        label: '复盘报表',
        description: '趋势、分布与流转复盘',
        cardDescription: '查看仓储趋势、类型分布、状态结构和最近流转记录，用于复盘和优化。',
      },
    ],
  },
  {
    key: 'management',
    label: '赛事管理',
    icon: 'admin_panel_settings',
    items: [
      {
        key: 'race-dashboard',
        path: '/race-dashboard',
        icon: 'monitoring',
        shortLabel: 'DS',
        label: '赛事大屏',
        description: '赛事数据一览，面向领导/甲方展示',
        cardDescription: '数字化信息一览，展示一场赛事的全部关键数据，支持脱敏模式和全屏展示。',
        needsRace: true,
      },
      {
        key: 'projects',
        path: '/projects',
        icon: 'assignment',
        shortLabel: 'PJ',
        label: '项目计划',
        description: '项目计划与任务管理',
        cardDescription: '创建和管理项目计划，配置任务、甘特图和关联赛事。',
      },
      {
        key: 'assessment',
        path: '/assessment',
        icon: 'assessment',
        shortLabel: 'AS',
        label: '考评管理',
        description: '成员考评与绩效管理',
        cardDescription: '创建考评活动，管理成员评分、邀请码和绩效报表。',
      },
      {
        key: 'bib-tracking',
        path: '/bib-tracking',
        icon: 'confirmation_number',
        shortLabel: 'BT',
        label: '号牌布控',
        description: '号牌状态追踪与撤回管理',
        cardDescription: '按赛事查看号码布状态、检索命中记录，追踪时间线与撤回动作。',
        needsRace: true,
      },
    ],
  },
  {
    key: 'tools',
    label: '我的工具',
    icon: 'construction',
    items: [
      {
        key: 'mechanical-clock',
        path: '/tools/mechanical-clock',
        icon: 'timer',
        shortLabel: 'MC',
        label: '机械翻页钟',
        description: '二维翻页时钟与倒计时工具',
        cardDescription: '进入经典翻页时钟，支持北京时间显示、倒计时与音效控制。',
      },
      {
        key: 'mechanical-clock-3d',
        path: '/tools/mechanical-clock-3d',
        icon: 'deployed_code',
        shortLabel: 'C3',
        label: '立体翻页钟',
        description: '立体翻转机械时钟',
        cardDescription: '进入三维段式机械翻页钟，查看立体翻转效果与倒计时模式。',
      },
      {
        key: 'interview',
        path: '/interview',
        icon: 'badge',
        shortLabel: 'IV',
        label: '面试面板',
        description: '候选人评估、记录和对比',
        cardDescription: '在应用层直接完成面试评分、记录管理与候选人对比，不再回管理层跳转。',
      },
    ],
  },
  {
    key: 'account',
    label: '个人',
    icon: 'person',
    items: [
      {
        key: 'settings',
        path: '/settings',
        icon: 'settings',
        shortLabel: 'ST',
        label: '个人设置',
        description: '修改密码和账号设置',
        cardDescription: '修改登录密码、调整个人偏好和账号安全设置。',
      },
    ],
  },
]

const routeMeta = [
  { key: 'dashboard', path: '/app', exact: true, title: '我的工作台', summary: '', groupKey: 'home', sectionLabel: '应用层', surfaceCode: 'APP' },
  { key: 'import', path: '/app/events/import', title: '名单导入', summary: '上传报名数据，完成字段映射、清洗与预览后安全提交。', groupKey: 'events', sectionLabel: '我的赛事', surfaceCode: 'APP', needsRace: true },
  { key: 'processing', path: '/app/events/processing', title: '名单处理', summary: '集中查询导出、状态概览、成绩校验、黑白名单与五步二次清洗。', groupKey: 'events', sectionLabel: '我的赛事', surfaceCode: 'APP', needsRace: true },
  { key: 'records', path: '/app/events/records', title: '名单管理', summary: '围绕当前赛事查看选手记录、字段筛选、排序和导出动作。', groupKey: 'events', sectionLabel: '我的赛事', surfaceCode: 'APP', needsRace: true },
  { key: 'lottery', path: '/app/events/lottery', title: '抽签管理', summary: '定义容量、起点沙盘与成绩筛选，执行抽签并查看结果。', groupKey: 'events', sectionLabel: '我的赛事', surfaceCode: 'APP', needsRace: true },
  { key: 'bib', path: '/app/events/bib', title: '选手排号', summary: '配置号码布模板，自动或手动分配号码布。', groupKey: 'events', sectionLabel: '我的赛事', surfaceCode: 'APP', needsRace: true },
  { key: 'clothing', path: '/app/events/clothing', title: '服装物资', summary: '管理服装库存，查看需求和缺口统计。', groupKey: 'events', sectionLabel: '我的赛事', surfaceCode: 'APP', needsRace: true },
  { key: 'reimbursement-projects', path: '/app/reimbursements/projects', title: '报销项目管理', summary: '集中维护自己的报销项目，支持创建、编辑、清空和删除。', groupKey: 'workspace', sectionLabel: '我的业务', surfaceCode: 'APP' },
  { key: 'reimbursement', path: '/app/reimbursements', title: '我的报销', summary: '管理自己的报销项目、识别结果和导出。', groupKey: 'workspace', sectionLabel: '我的业务', surfaceCode: 'APP' },
  { key: 'design-requests', path: '/app/design-requests', title: '设计工作台', summary: '预览已审批设计需求、参考样例、尺寸材质和需求时间，并上传完成图示。', groupKey: 'workspace', sectionLabel: '我的业务', surfaceCode: 'APP', needsRace: true },
  { key: 'map', path: '/app/map', title: 'GIS 地图', summary: '浏览地图、绘制图形、管理图层数据。', groupKey: 'workspace', sectionLabel: '我的业务', surfaceCode: 'APP' },
  { key: 'three-studio', path: '/app/3d-studio', title: '空间工作台', summary: '管理机构共享的 GIS 锚定空间项目，统一进行地图、结构、资产与运营绑定。', groupKey: 'workspace', sectionLabel: '我的业务', surfaceCode: 'APP' },
  { key: 'terrain-model', path: '/app/terrain-model', title: '轨迹地形模型', summary: '上传赛事 GPX，生成可预览和导出的地形轨迹模型。', groupKey: 'workspace', sectionLabel: '我的业务', surfaceCode: 'APP' },
  { key: 'credential-center', path: '/app/credential-center', title: '证件中心', summary: '围绕同一赛事上下文串联证件规则配置、申请建单、审核处理和发放追踪。', groupKey: 'credential', sectionLabel: '证件流程', surfaceCode: 'APP' },
  { key: 'credential-select-race', path: '/app/credential/select-race', title: '选择赛事', summary: '先锁定赛事上下文，再进入证件规则、申请和审核链路。', groupKey: 'credential', sectionLabel: '证件流程', surfaceCode: 'APP' },
  { key: 'credential-access-areas', path: '/app/credential/access-areas', title: '通行区域', summary: '管理区域、编码与颜色，作为证件流程的底层规则。', groupKey: 'credential', sectionLabel: '证件流程', surfaceCode: 'APP', needsRace: true },
  { key: 'credential-categories', path: '/app/credential/categories', title: '证件类别', summary: '配置类别、默认区域和审核策略。', groupKey: 'credential', sectionLabel: '证件流程', surfaceCode: 'APP', needsRace: true },
  { key: 'credential-styles', path: '/app/credential/styles', title: '证件样式', summary: '维护证件样式模板的元数据和状态。', groupKey: 'credential', sectionLabel: '证件流程', surfaceCode: 'APP', needsRace: true },
  { key: 'credential-requests', path: '/app/credential/requests', title: '申请与建单', summary: '在同一工作台内处理申请池与管理员直建。', groupKey: 'credential', sectionLabel: '证件流程', surfaceCode: 'APP', needsRace: true },
  { key: 'credential-review', path: '/app/credential/review', title: '审核中心', summary: '连续处理审核、驳回和通过后的后续动作。', groupKey: 'credential', sectionLabel: '证件流程', surfaceCode: 'APP', needsRace: true },
  { key: 'credential-issue', path: '/app/credential/issue', title: '领取管理', summary: '处理证件发放、实名登记和领取状态。', groupKey: 'credential', sectionLabel: '证件流程', surfaceCode: 'APP', needsRace: true },
  { key: 'inventory-workbench', path: '/app/inventory', exact: true, title: '仓储作业台', summary: '统一查看仓储负载、异常、流转和作业队列。', groupKey: 'warehouse', sectionLabel: '仓储治理', surfaceCode: 'APP' },
  { key: 'inventory-inbound-center', path: '/app/inventory/inbound', title: '入库中心', summary: '把预入库、正式入库和标签打印收回同一条链路。', groupKey: 'warehouse', sectionLabel: '仓储治理', surfaceCode: 'APP' },
  { key: 'inventory-outbound-center', path: '/app/inventory/outbound', title: '出库中心', summary: '处理领取、出库和现场流转的统一入口。', groupKey: 'warehouse', sectionLabel: '仓储治理', surfaceCode: 'APP' },
  { key: 'inventory-space-center', path: '/app/inventory/space', title: '空间中心', summary: '仓库主数据、3D 查看、设计和库位绑定统一围绕同一个仓库上下文工作。', groupKey: 'warehouse', sectionLabel: '仓储治理', surfaceCode: 'APP' },
  { key: 'inventory-control-center', path: '/app/inventory/control', title: '盘点与异常', summary: '盘点计划、差异项和预警规则合并为统一控制面。', groupKey: 'warehouse', sectionLabel: '仓储治理', surfaceCode: 'APP' },
  { key: 'inventory-analytics-center', path: '/app/inventory/analytics', title: '复盘报表', summary: '趋势、类型结构和流转记录只服务于复盘与优化。', groupKey: 'warehouse', sectionLabel: '仓储治理', surfaceCode: 'APP' },
  { key: 'projects', path: '/app/projects', exact: true, title: '项目计划', summary: '创建和管理项目计划，配置任务、甘特图和关联赛事。', groupKey: 'management', sectionLabel: '赛事管理', surfaceCode: 'APP' },
  { key: 'projects-detail', path: '/app/projects', title: '项目详情', summary: '编辑项目详情、任务管理和甘特图视图。', groupKey: 'management', sectionLabel: '赛事管理', surfaceCode: 'APP' },
  { key: 'assessment', path: '/app/assessment', exact: true, title: '考评管理', summary: '创建考评活动，管理成员评分、邀请码和绩效报表。', groupKey: 'management', sectionLabel: '赛事管理', surfaceCode: 'APP' },
  { key: 'assessment-detail', path: '/app/assessment', title: '考评详情', summary: '管理考评活动详情、成员、邀请码和报表。', groupKey: 'management', sectionLabel: '赛事管理', surfaceCode: 'APP' },
  { key: 'bib-tracking', path: '/app/bib-tracking', title: '号牌布控', summary: '按赛事查看号码布状态、检索命中记录，并在同一页里追踪时间线与撤回动作。', groupKey: 'management', sectionLabel: '赛事管理', surfaceCode: 'APP', needsRace: true },
  { key: 'race-dashboard', path: '/app/race-dashboard', title: '赛事大屏', summary: '数字化信息一览，展示一场赛事的全部关键数据，支持脱敏模式和全屏展示。', groupKey: 'management', sectionLabel: '赛事管理', surfaceCode: 'APP', needsRace: true },
  { key: 'mechanical-clock', path: '/app/tools/mechanical-clock', title: '机械翻页钟', summary: '使用经典翻页时钟与倒计时工具。', groupKey: 'tools', sectionLabel: '我的工具', surfaceCode: 'APP' },
  { key: 'mechanical-clock-3d', path: '/app/tools/mechanical-clock-3d', title: '立体翻页钟', summary: '使用三维段式机械翻页钟与倒计时工具。', groupKey: 'tools', sectionLabel: '我的工具', surfaceCode: 'APP' },
  { key: 'interview', path: '/app/interview', title: '面试面板', summary: '进行候选人面试评分与即时评估。', groupKey: 'tools', sectionLabel: '我的工具', surfaceCode: 'APP' },
  { key: 'interview-records', path: '/app/interview/records', title: '面试记录', summary: '查看和维护候选人面试记录。', groupKey: 'tools', sectionLabel: '我的工具', surfaceCode: 'APP' },
  { key: 'interview-compare', path: '/app/interview/compare', title: '候选人对比', summary: '对比候选人评分结构与总分。', groupKey: 'tools', sectionLabel: '我的工具', surfaceCode: 'APP' },
  { key: 'settings', path: '/app/settings', title: '个人设置', summary: '修改密码和账户设置。', groupKey: 'account', sectionLabel: '个人', surfaceCode: 'APP' },
]

function isAllowed(item, hasCapability) {
  if (!item.requiredCapability) return true
  if (typeof hasCapability !== 'function') return false
  return hasCapability(item.requiredCapability.scope, item.requiredCapability.capability)
}

export function getAppNavGroups(hasCapability) {
  return navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => isAllowed(item, hasCapability)),
    }))
    .filter((group) => group.items.length > 0)
}

export function getAppRouteMeta(pathname) {
  const sorted = [...routeMeta].sort((left, right) => right.path.length - left.path.length)
  return (
    sorted.find((item) => (
      item.exact
        ? pathname === item.path
        : pathname === item.path || pathname.startsWith(`${item.path}/`)
    )) || routeMeta[0]
  )
}

export function buildAppHref(routePath, { orgId, raceId } = {}) {
  return buildSurfaceHref(`/app${routePath}`, { orgId, raceId })
}

/**
 * 获取所有可用的应用入口（用于首页卡片网格）
 * 排除 dashboard 本身，只返回功能入口
 */
export function getAppPortalCards(hasCapability) {
  return navGroups
    .flatMap((group) => group.items)
    .filter((item) => isAllowed(item, hasCapability))
    .filter((item) => item.key !== 'dashboard')
}
