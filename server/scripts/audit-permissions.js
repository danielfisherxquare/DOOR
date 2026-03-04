#!/usr/bin/env node
/**
 * user_race_permissions 一致性巡检脚本
 *
 * 检查项：
 * 1. permission 中 user_id 对应的 users.org_id 是否与 permission.org_id 一致
 * 2. permission 中 race_id 对应的 races.org_id 是否与 permission.org_id 一致
 * 3. 引用了不存在的 user 或 race（悬挂引用）
 *
 * 用法：
 *   node scripts/audit-permissions.js          # 只检查
 *   node scripts/audit-permissions.js --fix    # 检查并修复
 */
import knex from '../src/db/knex.js';

const FIX_MODE = process.argv.includes('--fix');
let issueCount = 0;

async function main() {
    console.log('🔍 开始巡检 user_race_permissions...\n');

    // 1. user.org_id 与 permission.org_id 不一致
    const userOrgMismatch = await knex('user_race_permissions as urp')
        .join('users as u', 'urp.user_id', 'u.id')
        .whereRaw('urp.org_id != u.org_id')
        .select('urp.id', 'urp.user_id', 'urp.org_id as perm_org', 'u.org_id as user_org', 'u.username');

    if (userOrgMismatch.length > 0) {
        issueCount += userOrgMismatch.length;
        console.log(`❌ 发现 ${userOrgMismatch.length} 条 user.org_id 不一致:`);
        userOrgMismatch.forEach(r => {
            console.log(`   urp.id=${r.id} user=${r.username} perm_org=${r.perm_org} user_org=${r.user_org}`);
        });
        if (FIX_MODE) {
            const ids = userOrgMismatch.map(r => r.id);
            await knex('user_race_permissions').whereIn('id', ids).del();
            console.log(`   🔧 已删除 ${ids.length} 条\n`);
        }
    } else {
        console.log('✅ user.org_id 一致性检查通过');
    }

    // 2. race.org_id 与 permission.org_id 不一致
    const raceOrgMismatch = await knex('user_race_permissions as urp')
        .join('races as r', 'urp.race_id', 'r.id')
        .whereRaw('urp.org_id != r.org_id')
        .select('urp.id', 'urp.race_id', 'urp.org_id as perm_org', 'r.org_id as race_org', 'r.name as race_name');

    if (raceOrgMismatch.length > 0) {
        issueCount += raceOrgMismatch.length;
        console.log(`❌ 发现 ${raceOrgMismatch.length} 条 race.org_id 不一致:`);
        raceOrgMismatch.forEach(r => {
            console.log(`   urp.id=${r.id} race=${r.race_name} perm_org=${r.perm_org} race_org=${r.race_org}`);
        });
        if (FIX_MODE) {
            const ids = raceOrgMismatch.map(r => r.id);
            await knex('user_race_permissions').whereIn('id', ids).del();
            console.log(`   🔧 已删除 ${ids.length} 条\n`);
        }
    } else {
        console.log('✅ race.org_id 一致性检查通过');
    }

    // 3. 悬挂引用（user 或 race 已不存在）— 理论上 CASCADE 会处理，但以防万一
    const danglingUser = await knex('user_race_permissions as urp')
        .leftJoin('users as u', 'urp.user_id', 'u.id')
        .whereNull('u.id')
        .select('urp.id');

    const danglingRace = await knex('user_race_permissions as urp')
        .leftJoin('races as r', 'urp.race_id', 'r.id')
        .whereNull('r.id')
        .select('urp.id');

    const dandlingTotal = danglingUser.length + danglingRace.length;
    if (dandlingTotal > 0) {
        issueCount += dandlingTotal;
        console.log(`❌ 发现 ${dandlingTotal} 条悬挂引用 (user: ${danglingUser.length}, race: ${danglingRace.length})`);
        if (FIX_MODE) {
            const ids = [...danglingUser, ...danglingRace].map(r => r.id);
            await knex('user_race_permissions').whereIn('id', ids).del();
            console.log(`   🔧 已删除 ${ids.length} 条\n`);
        }
    } else {
        console.log('✅ 悬挂引用检查通过');
    }

    // 汇总
    console.log(`\n${'─'.repeat(40)}`);
    if (issueCount === 0) {
        console.log('🎉 所有检查通过，无一致性问题');
    } else {
        console.log(`⚠️  共发现 ${issueCount} 个问题${FIX_MODE ? '（已修复）' : '（使用 --fix 参数修复）'}`);
    }

    await knex.destroy();
    process.exit(issueCount > 0 && !FIX_MODE ? 1 : 0);
}

main().catch(err => {
    console.error('巡检失败:', err);
    process.exit(2);
});
