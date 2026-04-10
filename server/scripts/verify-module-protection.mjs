/**
 * 模块权限保护验证脚本
 * 验证新增模块能在权限矩阵中正确管理
 */

import { ALL_MODULES, listAllModuleIds } from '../src/modules/module-access/module-access.registry.js';

console.log('='.repeat(60));
console.log('模块权限保护验证');
console.log('='.repeat(60));

// 1. 验证模块注册表
console.log('\n[验证1] 模块注册表检查');
console.log('-'.repeat(40));

const expectedModules = {
    app: ['app:home', 'app:profile', 'app:map', 'app:reimbursements', 'app:3d-studio', 'app:credentials', 'app:inventory', 'app:events', 'app:interview'],
    ops: ['ops:home', 'ops:scan', 'ops:bib-pickup', 'ops:bib-tracking', 'ops:credentials', 'ops:warehouse'],
    admin: ['admin:dashboard', 'admin:members', 'admin:orgs', 'admin:races', 'admin:credentials', 'admin:finance', 'admin:inventory', 'admin:backups', 'admin:hr']
};

let allPassed = true;

for (const [surface, expectedList] of Object.entries(expectedModules)) {
    const actualList = ALL_MODULES[surface]?.map(m => m.id) || [];
    const missing = expectedList.filter(id => !actualList.includes(id));
    const extra = actualList.filter(id => !expectedList.includes(id));
    
    if (missing.length > 0) {
        console.log(`❌ ${surface}层缺少模块: ${missing.join(', ')}`);
        allPassed = false;
    } else if (extra.length > 0) {
        console.log(`⚠️ ${surface}层多余模块: ${extra.join(', ')}`);
    } else {
        console.log(`✅ ${surface}层模块完整 (${actualList.length}个)`);
    }
}

// 2. 验证listAllModuleIds函数
console.log('\n[验证2] listAllModuleIds函数检查');
console.log('-'.repeat(40));

const allIds = listAllModuleIds();
console.log(`总模块数: ${allIds.length}`);

const uniqueIds = new Set(allIds);
if (uniqueIds.size !== allIds.length) {
    console.log('❌ 存在重复模块ID');
    allPassed = false;
} else {
    console.log('✅ 无重复模块ID');
}

// 3. 验证新增的关键模块
console.log('\n[验证3] 关键新增模块检查');
console.log('-'.repeat(40));

const criticalModules = [
    'app:reimbursements',  // 报销 - P0保护
    'app:credentials',     // 证件流程 - 链式模块
    'app:inventory',       // 仓储作业
    'ops:credentials',     // 证件发放
    'ops:warehouse',       // 仓储作业
    'admin:inventory',     // 仓储管理
    'admin:hr',            // 人事面试
];

for (const moduleId of criticalModules) {
    if (allIds.includes(moduleId)) {
        console.log(`✅ ${moduleId} 已注册`);
    } else {
        console.log(`❌ ${moduleId} 未注册`);
        allPassed = false;
    }
}

// 4. 验证模块命名规范
console.log('\n[验证4] 模块命名规范检查');
console.log('-'.repeat(40));

for (const id of allIds) {
    const parts = id.split(':');
    if (parts.length !== 2) {
        console.log(`❌ ${id} 格式不正确 (应为 surface:module)`);
        allPassed = false;
    } else if (!['app', 'ops', 'admin'].includes(parts[0])) {
        console.log(`❌ ${id} surface不正确`);
        allPassed = false;
    }
}

if (allPassed) {
    console.log('\n' + '='.repeat(60));
    console.log('✅ 所有验证通过！模块权限保护已正确配置');
    console.log('='.repeat(60));
} else {
    console.log('\n' + '='.repeat(60));
    console.log('❌ 验证失败！请检查模块注册表');
    console.log('='.repeat(60));
}

// 输出完整的模块列表
console.log('\n[完整模块列表]');
console.log(JSON.stringify(ALL_MODULES, null, 2));