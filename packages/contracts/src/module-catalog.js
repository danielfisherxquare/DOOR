export const SURFACES = Object.freeze(['app', 'ops', 'admin'])

function freezeModules(modules) {
  return Object.freeze(modules.map((module) => Object.freeze(module)))
}

export const ALL_MODULES = Object.freeze({
  app: freezeModules([
    { id: 'app:home', name: '首页', isDefault: true },
    { id: 'app:profile', name: '个人页', isDefault: true },
    { id: 'app:map', name: 'GIS地图', isDefault: false },
    { id: 'app:reimbursements', name: '报销管理', isDefault: false },
    { id: 'app:design-requests', name: '设计工作台', isDefault: false },
    { id: 'app:3d-studio', name: '3D工作室', isDefault: false },
    { id: 'app:credentials', name: '证件流程', isDefault: false },
    { id: 'app:inventory', name: '仓储作业', isDefault: false },
    { id: 'app:events', name: '赛事管理', isDefault: false },
    { id: 'app:interview', name: '面试工具', isDefault: false },
  ]),
  ops: freezeModules([
    { id: 'ops:home', name: '执行端首页', isDefault: false },
    { id: 'ops:scan', name: '扫码登录', isDefault: false },
    { id: 'ops:bib-pickup', name: '号码布领取', isDefault: false },
    { id: 'ops:credentials', name: '证件发放', isDefault: false },
    { id: 'ops:warehouse', name: '仓储作业', isDefault: false },
    { id: 'ops:design-requests', name: '设计需求', isDefault: false },
  ]),
  admin: freezeModules([
    { id: 'admin:dashboard', name: '管理仪表盘', isDefault: false },
    { id: 'admin:identity-center', name: '身份中心', isDefault: false },
    { id: 'admin:members', name: '成员与授权', isDefault: false },
    { id: 'admin:team', name: '团队管理', isDefault: false },
    { id: 'admin:orgs', name: '机构管理', isDefault: false },
    { id: 'admin:races', name: '赛事管理', isDefault: false },
    { id: 'admin:bib-tracking', name: '号码布追踪', isDefault: false },
    { id: 'admin:credentials', name: '证件管理', isDefault: false },
    { id: 'admin:finance', name: '财务管理', isDefault: false },
    { id: 'admin:inventory', name: '仓储管理', isDefault: false },
    { id: 'admin:backups', name: '数据备份', isDefault: false },
    { id: 'admin:hr', name: '人事面试', isDefault: false },
    { id: 'admin:branding', name: '品牌设置', isDefault: false },
    { id: 'admin:design-requests', name: '设计需求', isDefault: false },
    { id: 'admin:audit', name: '操作日志', isDefault: false },
    { id: 'admin:system', name: '系统任务', isDefault: false },
  ]),
})

export function listAllModuleIds() {
  return SURFACES.flatMap((surface) => ALL_MODULES[surface].map((module) => module.id))
}
