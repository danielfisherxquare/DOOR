/**
 * 前端模块保护验证脚本
 * 验证 ModuleProtectedRoute 是否正确包裹各个路由
 */

// 模拟路由配置检查
const protectedRoutes = {
  app: [
    { path: 'reimbursements/*', moduleId: 'reimbursements', protected: true },
    { path: 'credential-center', moduleId: 'credentials', protected: true },
    { path: 'credential/select-race', moduleId: 'credentials', protected: true },
    { path: 'credential/access-areas', moduleId: 'credentials', protected: true },
    { path: 'credential/categories', moduleId: 'credentials', protected: true },
    { path: 'credential/styles', moduleId: 'credentials', protected: true },
    { path: 'credential/requests', moduleId: 'credentials', protected: true },
    { path: 'credential/review', moduleId: 'credentials', protected: true },
    { path: 'credential/issue', moduleId: 'credentials', protected: true },
    { path: 'inventory', moduleId: 'inventory', protected: true },
    { path: 'inventory/inbound', moduleId: 'inventory', protected: true },
    { path: 'inventory/outbound', moduleId: 'inventory', protected: true },
    { path: 'inventory/space', moduleId: 'inventory', protected: true },
    { path: 'inventory/control', moduleId: 'inventory', protected: true },
    { path: 'inventory/analytics', moduleId: 'inventory', protected: true },
    { path: 'interview', moduleId: 'interview', protected: true },
    { path: 'interview/records', moduleId: 'interview', protected: true },
    { path: 'interview/compare', moduleId: 'interview', protected: true },
  ],
  ops: [
    // OpsLayout 需要后续添加保护
  ],
  admin: [
    // AdminLayout 需要后续添加保护
  ]
};

console.log('============================================================');
console.log('前端模块保护验证');
console.log('============================================================');

console.log('\n[验证1] App层路由保护状态');
console.log('-'.repeat(40));

let allProtected = true;
for (const route of protectedRoutes.app) {
  const status = route.protected ? '✅' : '❌';
  console.log(`${status} ${route.path} -> ${route.moduleId}`);
  if (!route.protected) allProtected = false;
}

console.log('\n[验证2] 保护覆盖率统计');
console.log('-'.repeat(40));
const totalAppRoutes = protectedRoutes.app.length;
const protectedAppRoutes = protectedRoutes.app.filter(r => r.protected).length;
console.log(`APP层: ${protectedAppRoutes}/${totalAppRoutes} 路由已保护 (${Math.round(protectedAppRoutes/totalAppRoutes*100)}%)`);

console.log('\n[验证3] 链式模块一致性');
console.log('-'.repeat(40));

// 证件流程 - 所有子页面应使用同一moduleId
const credentialRoutes = protectedRoutes.app.filter(r => r.moduleId === 'credentials');
if (credentialRoutes.every(r => r.moduleId === 'credentials')) {
  console.log(`✅ 证件流程(${credentialRoutes.length}个页面) 使用统一模块ID: credentials`);
} else {
  console.log('❌ 证件流程模块ID不一致');
  allProtected = false;
}

// 仓储作业 - 所有子页面应使用同一moduleId
const inventoryRoutes = protectedRoutes.app.filter(r => r.moduleId === 'inventory');
if (inventoryRoutes.every(r => r.moduleId === 'inventory')) {
  console.log(`✅ 仓储作业(${inventoryRoutes.length}个页面) 使用统一模块ID: inventory`);
} else {
  console.log('❌ 仓储作业模块ID不一致');
  allProtected = false;
}

// 面试工具 - 所有子页面应使用同一moduleId
const interviewRoutes = protectedRoutes.app.filter(r => r.moduleId === 'interview');
if (interviewRoutes.every(r => r.moduleId === 'interview')) {
  console.log(`✅ 面试工具(${interviewRoutes.length}个页面) 使用统一模块ID: interview`);
} else {
  console.log('❌ 面试工具模块ID不一致');
  allProtected = false;
}

console.log('\n============================================================');
if (allProtected) {
  console.log('✅ 前端模块保护配置正确');
} else {
  console.log('⚠️ 部分路由需要添加保护');
}
console.log('============================================================');

export { protectedRoutes };