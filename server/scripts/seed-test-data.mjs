#!/usr/bin/env node
/**
 * Seed Test Data — 创建测试机构、赛事和员工
 *
 * 用法:
 *   node --env-file=.env scripts/seed-test-data.mjs
 *
 * 环境变量:
 *   SEED_CLEANUP - 是否清理现有测试数据 (默认: true)
 *   SEED_ORG_COUNT - 创建测试机构数量 (默认: 3)
 *   SEED_RACES_PER_ORG - 每个机构的测试赛事数量 (默认: 2)
 *   SEED_EMPLOYEES_PER_ORG - 每个机构的测试员工数量 (默认: 5)
 */

import bcrypt from 'bcryptjs';
import knex from '../src/db/knex.js';
import { encryptField, normalizePhone, normalizeIdNumber } from '../src/utils/crypto.js';

// ============================================================================
// 配置
// ============================================================================

const CLEANUP = process.env.SEED_CLEANUP !== 'false';
const ORG_COUNT = parseInt(process.env.SEED_ORG_COUNT || '3', 10);
const RACES_PER_ORG = parseInt(process.env.SEED_RACES_PER_ORG || '2', 10);
const EMPLOYEES_PER_ORG = parseInt(process.env.SEED_EMPLOYEES_PER_ORG || '5', 10);

// 测试数据标记
const TEST_MARKER = '__TEST_DATA__';

// 随机数据生成器
const randomItems = {
    orgPrefixes: ['北京', '上海', '广州', '深圳', '杭州', '成都', '武汉', '西安', '南京', '苏州'],
    orgSuffixes: ['马拉松俱乐部', '体育文化公司', '赛事运营中心', '跑步协会', '运动俱乐部'],
    raceTypes: ['马拉松', '半程马拉松', '迷你马拉松', '10公里跑', '越野跑', '山地马拉松', '城市定向赛', '接力赛'],
    locations: ['奥林匹克公园', '城市中心广场', '滨江跑道', '森林公园', '体育中心', '环湖赛道'],
    departments: ['竞赛部', '运营部', '市场部', '技术部', '后勤部', '安保部', '志愿者部', '医疗部'],
    positions: ['总监', '经理', '主管', '专员', '协调员', '助理', '负责人'],
    surnames: ['张', '王', '李', '赵', '刘', '陈', '杨', '黄', '周', '吴', '徐', '孙', '马', '朱', '胡'],
    givenNames: ['伟', '芳', '娜', '秀英', '敏', '静', '丽', '强', '磊', '洋', '勇', '军', '杰', '涛', '明', '华', '飞', '鹏', '婷', '莉'],
};

function randomFrom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomPhone() {
    const prefixes = ['138', '139', '186', '187', '150', '151', '152', '158', '159', '188'];
    return randomFrom(prefixes) + Math.random().toString().slice(2, 11);
}

function randomIdNumber() {
    // 生成一个合法格式的测试身份证号 (18位)
    const areaCodes = ['110101', '310101', '440101', '330101', '510101']; // 北京、上海、广州、杭州、成都
    const area = randomFrom(areaCodes);
    const year = 1970 + Math.floor(Math.random() * 35); // 1970-2004
    const month = String(1 + Math.floor(Math.random() * 12)).padStart(2, '0');
    const day = String(1 + Math.floor(Math.random() * 28)).padStart(2, '0');
    const seq = String(Math.floor(Math.random() * 999)).padStart(3, '0');
    // 最后一位是校验码，这里简化处理
    const checkChars = '0123456789X';
    const check = randomFrom(checkChars.split(''));
    return `${area}${year}${month}${day}${seq}${check}`;
}

function generateEmployeeCode(index) {
    return `EMP${String(index).padStart(4, '0')}`;
}

function generateSlug(name) {
    return name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\u4e00-\u9fa5-]/g, '')
        + '-' + Date.now().toString(36);
}

// ============================================================================
// 主函数
// ============================================================================

async function seed() {
    console.log('========================================');
    console.log('    DOOR 测试数据种子脚本');
    console.log('========================================\n');
    console.log(`配置:`);
    console.log(`  - 清理现有测试数据: ${CLEANUP}`);
    console.log(`  - 创建机构数量: ${ORG_COUNT}`);
    console.log(`  - 每机构赛事数量: ${RACES_PER_ORG}`);
    console.log(`  - 每机构员工数量: ${EMPLOYEES_PER_ORG}`);
    console.log('');

    const createdOrgs = [];
    const createdRaces = [];
    const createdUsers = [];
    const createdTeamMembers = [];

    try {
        // ── 1. 清理现有测试数据 ─────────────────────────────────
        if (CLEANUP) {
            console.log('🧹 清理现有测试数据...');
            
            // 查找测试用户
            const testUsers = await knex('users')
                .where('username', 'like', `%${TEST_MARKER}%`)
                .orWhere('email', 'like', `%${TEST_MARKER}%`);
            
            // 删除用户赛事权限
            for (const user of testUsers) {
                await knex('user_race_permissions').where('user_id', user.id).del();
            }
            
            // 删除测试用户
            await knex('users')
                .where('username', 'like', `%${TEST_MARKER}%`)
                .orWhere('email', 'like', `%${TEST_MARKER}%`)
                .del();
            
            // 删除测试团队成员
            await knex('team_members')
                .where('employee_code', 'like', `TEST-%`)
                .del();
            
            // 删除测试赛事
            await knex('races')
                .where('name', 'like', `%${TEST_MARKER}%`)
                .del();
            
            // 删除测试机构
            await knex('organizations')
                .where('slug', 'like', `%${TEST_MARKER}%`)
                .del();
            
            console.log('  ✅ 清理完成\n');
        }

        // ── 2. 创建测试机构 ─────────────────────────────────────
        console.log('🏛️ 创建测试机构...');
        
        const passwordHash = await bcrypt.hash('Test@123456', 10);
        
        for (let i = 0; i < ORG_COUNT; i++) {
            const orgName = `${randomFrom(randomItems.orgPrefixes)}${randomFrom(randomItems.orgSuffixes)}`;
            const slug = generateSlug(orgName + TEST_MARKER);
            
            const [org] = await knex('organizations')
                .insert({
                    name: orgName,
                    slug: slug,
                })
                .returning(['id', 'name', 'slug']);
            
            createdOrgs.push(org);
            console.log(`  ✅ 机构 ${i + 1}: ${org.name} (${org.id})`);

            // 创建机构管理员
            const adminUsername = `admin_${TEST_MARKER}_${i + 1}`;
            const adminEmail = `admin${i + 1}@${TEST_MARKER}.test`;
            
            const [adminUser] = await knex('users')
                .insert({
                    org_id: org.id,
                    username: adminUsername,
                    email: adminEmail,
                    password_hash: passwordHash,
                    role: 'org_admin',
                    status: 'active',
                    must_change_password: false,
                })
                .returning(['id', 'username', 'email', 'role']);
            
            createdUsers.push(adminUser);
            console.log(`     👤 管理员: ${adminUser.username}`);
        }
        console.log('');

        // ── 3. 创建测试赛事 ─────────────────────────────────────
        console.log('🏃 创建测试赛事...');
        
        for (const org of createdOrgs) {
            for (let i = 0; i < RACES_PER_ORG; i++) {
                const raceType = randomFrom(randomItems.raceTypes);
                const location = randomFrom(randomItems.locations);
                const raceName = `${org.name.replace(randomItems.orgSuffixes[0], '')}${raceType}${TEST_MARKER}`;
                
                // 赛事日期：未来1-6个月内随机
                const raceDate = new Date();
                raceDate.setMonth(raceDate.getMonth() + 1 + Math.floor(Math.random() * 6));
                const dateStr = raceDate.toISOString().split('T')[0];
                
                // 生成赛事项目
                const events = [
                    { name: `${raceType}`, date: dateStr, description: '正式比赛' },
                ];
                
                const [race] = await knex('races')
                    .insert({
                        org_id: org.id,
                        name: raceName,
                        date: dateStr,
                        location: `${org.name.replace(randomItems.orgSuffixes[0], '')}${location}`,
                        events: JSON.stringify(events),
                        conflict_rule: Math.random() > 0.5 ? 'strict' : 'permissive',
                        location_lat: 30 + Math.random() * 10,
                        location_lng: 100 + Math.random() * 30,
                    })
                    .returning(['id', 'name', 'date', 'location']);
                
                createdRaces.push(race);
                console.log(`  ✅ 赛事: ${race.name} (${race.date})`);
            }
        }
        console.log('');

        // ── 4. 创建测试员工 ─────────────────────────────────────
        console.log('👥 创建测试员工...');
        
        for (const org of createdOrgs) {
            for (let i = 0; i < EMPLOYEES_PER_ORG; i++) {
                const name = `${randomFrom(randomItems.surnames)}${randomFrom(randomItems.givenNames)}`;
                const department = randomFrom(randomItems.departments);
                const position = randomFrom(randomItems.positions);
                const phone = randomPhone();
                const idNumber = randomIdNumber();
                const employeeCode = `TEST-${org.id.slice(0, 8)}-${String(i + 1).padStart(3, '0')}`;
                
                // 加密敏感字段
                // 身份证号加密
                const encryptedIdNumber = encryptField(normalizeIdNumber(idNumber), {
                    tableName: 'team_members',
                    columnName: 'id_number',
                    orgId: org.id,
                });
                // 联系方式(手机号)加密
                const encryptedPhone = encryptField(normalizePhone(phone), {
                    tableName: 'team_members',
                    columnName: 'contact',
                    orgId: org.id,
                });
                
                // 从加密字符串中提取 IV 和 AuthTag
                // 格式: enc:v1:<version>:<iv>:<tag>:<cipher>
                const idParts = encryptedIdNumber.split(':');
                const phoneParts = encryptedPhone.split(':');
                
                const [teamMember] = await knex('team_members')
                    .insert({
                        org_id: org.id,
                        employee_code: employeeCode,
                        employee_name: name,
                        position: position,
                        department: department,
                        member_type: 'employee',
                        // 身份证号加密字段
                        id_number_ciphertext: Buffer.from(idParts[5], 'base64url'),
                        id_number_iv: idParts[3],
                        id_number_auth_tag: idParts[4],
                        id_number_last4: idNumber.slice(-4),
                        // 联系方式加密字段
                        contact_ciphertext: Buffer.from(phoneParts[5], 'base64url'),
                        contact_iv: phoneParts[3],
                        contact_auth_tag: phoneParts[4],
                        contact_last4: phone.slice(-4),
                        status: 'active',
                    })
                    .returning(['id', 'employee_code', 'employee_name', 'department', 'position']);
                
                createdTeamMembers.push(teamMember);
                console.log(`  ✅ 员工: ${teamMember.employee_name} (${teamMember.employee_code}) - ${teamMember.department} ${teamMember.position}`);
            }
        }
        console.log('');

        // ── 5. 创建测试普通用户（使用 org_admin 角色）─────────────
        console.log('👤 创建测试普通用户...');
        
        for (let orgIndex = 0; orgIndex < createdOrgs.length; orgIndex++) {
            const org = createdOrgs[orgIndex];
            
            // 创建普通用户 (使用 org_admin 角色，因为数据库约束可能还未更新)
            const memberUsername = `member_${TEST_MARKER}_${orgIndex + 1}`;
            const memberEmail = `member${orgIndex + 1}@${TEST_MARKER}.test`;
            
            const [memberUser] = await knex('users')
                .insert({
                    org_id: org.id,
                    username: memberUsername,
                    email: memberEmail,
                    password_hash: passwordHash,
                    role: 'org_admin',
                    status: 'active',
                    must_change_password: false,
                })
                .returning(['id', 'username', 'email', 'role']);
            
            createdUsers.push(memberUser);
            console.log(`  ✅ 成员用户: ${memberUser.username}`);
        }
        console.log('');

        // ── 6. 输出汇总 ───────────────────────────────────────
        console.log('========================================');
        console.log('    ✅ 测试数据创建完成！');
        console.log('========================================\n');
        
        console.log('📊 统计:');
        console.log(`  - 机构: ${createdOrgs.length} 个`);
        console.log(`  - 赛事: ${createdRaces.length} 场`);
        console.log(`  - 员工: ${createdTeamMembers.length} 人`);
        console.log(`  - 用户: ${createdUsers.length} 人\n`);
        
        console.log('📋 测试账号信息 (密码统一为: Test@123456):');
        console.log('-------------------------------------------');
        for (const user of createdUsers) {
            const roleMap = {
                'org_admin': '机构管理员',
                'race_editor': '赛事编辑',
                'race_viewer': '赛事查看者'
            };
            console.log(`  ${roleMap[user.role] || user.role}: ${user.username} / ${user.email}`);
        }
        console.log('-------------------------------------------\n');
        
        console.log('💡 提示:');
        console.log('  - 所有测试数据都带有 __TEST_DATA__ 标记');
        console.log('  - 重新运行脚本会自动清理旧测试数据');
        console.log('  - 手动清理: DELETE FROM ... WHERE ... LIKE \'%__TEST_DATA__%\'\n');

    } catch (err) {
        console.error('❌ 创建测试数据失败:', err);
        throw err;
    }
}

// ============================================================================
// 执行
// ============================================================================

seed()
    .then(() => {
        console.log('🎉 测试数据种子完成！');
        process.exit(0);
    })
    .catch((err) => {
        console.error('💥 脚本执行失败:', err);
        process.exit(1);
    })
    .finally(async () => {
        await knex.destroy();
    });