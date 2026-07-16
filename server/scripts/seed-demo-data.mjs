import bcrypt from 'bcryptjs';
import knex from '../src/db/knex.js';
import { ensureSuperAdmin } from '../src/bootstrap/ensure-super-admin.js';
import { encryptField } from '../src/modules/team/team-crypto.js';

const DEMO_PASSWORD = 'ArcSproDemo@123';

const orgSeeds = [
    {
        key: 'east',
        name: '华东悦跑体育运营中心',
        slug: 'demo-east-run',
        races: [
            {
                key: 'shanghai-full',
                name: '上海国际马拉松',
                date: '2026-04-12',
                location: '上海 · 外滩起点',
                locationLat: 31.2304,
                locationLng: 121.4737,
                events: [
                    { name: '全程马拉松', distance: '42.195km', startTime: '07:00' },
                    { name: '半程马拉松', distance: '21.0975km', startTime: '07:30' },
                ],
            },
            {
                key: 'shanghai-half',
                name: '上海滨江半程马拉松',
                date: '2026-05-17',
                location: '上海 · 浦东滨江大道',
                locationLat: 31.2397,
                locationLng: 121.4998,
                events: [
                    { name: '半程马拉松', distance: '21.0975km', startTime: '07:00' },
                    { name: '亲子跑', distance: '3km', startTime: '09:30' },
                ],
            },
            {
                key: 'suzhou-10k',
                name: '苏州古城10K',
                date: '2026-06-06',
                location: '苏州 · 平江历史街区',
                locationLat: 31.3137,
                locationLng: 120.6293,
                events: [
                    { name: '10公里竞速', distance: '10km', startTime: '07:30' },
                    { name: '城市定向体验', distance: '5km', startTime: '08:30' },
                ],
            },
        ],
        members: [
            { code: 'EAST-001', username: 'east.admin', name: '林子昂', role: 'org_admin', title: '部门经理', position: '赛事总监', department: '赛事运营部', type: 'employee', idNo: '310101199001011234', phone: '13800010001', modules: ['admin:races', 'admin:members', 'admin:bib-tracking', 'admin:credentials', 'admin:finance', 'admin:inventory'] },
            { code: 'EAST-014', username: 'east.ops', name: '顾清禾', role: 'race_admin', title: '高级员工', position: '现场执行经理', department: '执行交付组', type: 'employee', idNo: '310101199204141235', phone: '13800010014', modules: ['ops:home', 'ops:scan', 'ops:bib-pickup', 'ops:credentials', 'ops:warehouse', 'app:events', 'app:reimbursements', 'app:map', 'app:3d-studio', 'app:credentials', 'app:inventory', 'app:assets'] },
            { code: 'EAST-032', username: 'east.storeroom', name: '沈知夏', role: 'user', title: '普通员工', position: '物资管理员', department: '物资保障组', type: 'employee', idNo: '310101199605321236', phone: '13800010032', modules: ['app:map', 'app:inventory', 'app:assets'] },
            { code: 'EAST-EXT-07', name: '马博文', role: null, title: '长期外援', position: '摄影统筹', department: '品牌传播组', type: 'external_support', externalType: 'long_term', idNo: '310101199708071237', phone: '13800010077' },
        ],
    },
    {
        key: 'mountain',
        name: '山城赛事执行有限公司',
        slug: 'demo-mountain-ops',
        races: [
            {
                key: 'chongqing-full',
                name: '重庆长江全程马拉松',
                date: '2026-03-22',
                location: '重庆 · 南滨路起点',
                locationLat: 29.5591,
                locationLng: 106.5777,
                events: [
                    { name: '全程马拉松', distance: '42.195km', startTime: '07:30' },
                    { name: '半程马拉松', distance: '21.0975km', startTime: '08:00' },
                    { name: '迷你马拉松', distance: '5km', startTime: '09:00' },
                ],
            },
            {
                key: 'chongqing-trail',
                name: '重庆南山越野挑战赛',
                date: '2026-05-30',
                location: '重庆 · 南山步道',
                locationLat: 29.5482,
                locationLng: 106.5910,
                events: [
                    { name: '越野30K', distance: '30km', startTime: '06:30' },
                    { name: '山径体验12K', distance: '12km', startTime: '08:00' },
                ],
            },
            {
                key: 'chengdu-greenway',
                name: '成都天府绿道半程马拉松',
                date: '2026-07-12',
                location: '成都 · 锦城湖公园',
                locationLat: 30.5594,
                locationLng: 104.0648,
                events: [
                    { name: '半程马拉松', distance: '21.0975km', startTime: '07:10' },
                    { name: '欢乐跑', distance: '5km', startTime: '09:00' },
                ],
            },
        ],
        members: [
            { code: 'MTN-001', username: 'mountain.admin', name: '周景澄', role: 'org_admin', title: '部门经理', position: '总协调', department: '项目管理部', type: 'employee', idNo: '500101198812011234', phone: '13900020001', modules: ['admin:races', 'admin:members', 'admin:inventory'] },
            { code: 'MTN-021', username: 'mountain.track', name: '唐雨桐', role: 'race_admin', title: '高级员工', position: '赛道主管', department: '赛道安全组', type: 'employee', idNo: '500101199303211235', phone: '13900020021', modules: ['ops:home', 'ops:scan', 'ops:warehouse', 'app:map'] },
            { code: 'MTN-044', username: 'mountain.checkin', name: '廖晨', role: 'user', title: '普通员工', position: '检录志愿者', department: '志愿者组', type: 'employee', idNo: '500101199804441236', phone: '13900020044', modules: ['app:map', 'app:events'] },
            { code: 'MTN-EXT-03', name: '贺兰', role: null, title: '外援', position: '医疗支持', department: '医疗保障组', type: 'external_support', externalType: 'temporary', idNo: '500101199902031237', phone: '13900020003' },
        ],
    },
    {
        key: 'bay',
        name: '海湾志愿者联合会',
        slug: 'demo-bay-volunteers',
        races: [
            {
                key: 'shenzhen-full',
                name: '深圳全程马拉松',
                date: '2026-03-15',
                location: '深圳 · 市民中心广场',
                locationLat: 22.5456,
                locationLng: 114.0579,
                events: [
                    { name: '全程马拉松', distance: '42.195km', startTime: '07:00' },
                    { name: '半程马拉松', distance: '21.0975km', startTime: '07:30' },
                ],
            },
            {
                key: 'shenzhen-bay-half',
                name: '深圳湾半程马拉松',
                date: '2026-06-21',
                location: '深圳 · 深圳湾公园',
                locationLat: 22.5186,
                locationLng: 113.9438,
                events: [
                    { name: '半程马拉松', distance: '21.0975km', startTime: '07:00' },
                    { name: '无障碍陪跑', distance: '3km', startTime: '09:00' },
                ],
            },
            {
                key: 'shenzhen-bay-night',
                name: '深圳湾夜跑公益赛',
                date: '2026-08-08',
                location: '深圳 · 深圳湾公园',
                locationLat: 22.5186,
                locationLng: 113.9438,
                events: [
                    { name: '公益夜跑', distance: '8km', startTime: '19:30' },
                    { name: '欢乐跑', distance: '3km', startTime: '18:30' },
                ],
            },
        ],
        members: [
            { code: 'BAY-001', username: 'bay.admin', name: '陈予安', role: 'org_admin', title: '部门经理', position: '志愿者负责人', department: '志愿者发展部', type: 'employee', idNo: '440301198905011234', phone: '13700030001', modules: ['admin:members', 'admin:races'] },
            { code: 'BAY-018', username: 'bay.service', name: '叶思源', role: 'race_admin', title: '高级员工', position: '服务点主管', department: '补给服务组', type: 'employee', idNo: '440301199306181235', phone: '13700030018', modules: ['ops:home', 'ops:bib-pickup', 'app:map'] },
            { code: 'BAY-052', username: 'bay.runnercare', name: '许南乔', role: 'user', title: '普通员工', position: '选手服务', department: '选手服务组', type: 'employee', idNo: '440301199707521236', phone: '13700030052', modules: ['app:map', 'app:credentials'] },
        ],
    },
];

function toUsername(orgKey, member) {
    if (member.username) return member.username;
    return `${orgKey}.${member.code.toLowerCase().replace(/[^a-z0-9]+/g, '.')}`.replace(/\.+/g, '.').replace(/\.$/, '');
}

function buildTeamMemberRow(orgId, member) {
    const encryptedId = encryptField(member.idNo);
    const encryptedContact = encryptField(member.phone);

    return {
        org_id: orgId,
        employee_code: member.code,
        employee_name: member.name,
        position: member.position,
        department: member.department,
        member_type: member.type,
        external_engagement_type: member.type === 'external_support' ? member.externalType : null,
        id_number_ciphertext: encryptedId.ciphertext,
        id_number_iv: encryptedId.iv,
        id_number_auth_tag: encryptedId.authTag,
        id_number_last4: encryptedId.last4,
        contact_ciphertext: encryptedContact.ciphertext,
        contact_iv: encryptedContact.iv,
        contact_auth_tag: encryptedContact.authTag,
        contact_last4: encryptedContact.last4,
        status: 'active',
    };
}

async function main() {
    const bootstrapResult = await ensureSuperAdmin();
    const superAdmin = await knex('users').where({ role: 'super_admin' }).orderBy('created_at', 'asc').first('id');
    if (!superAdmin) throw new Error('Missing super_admin after bootstrap');

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const summary = {
        password: DEMO_PASSWORD,
        orgs: [],
        races: [],
        users: [],
        teamMembers: 0,
        orgRaceGrants: 0,
        userRaceGrants: 0,
        moduleGrants: 0,
    };

    await knex.transaction(async (trx) => {
        const orgMap = new Map();
        const raceMap = new Map();
        const userMap = new Map();

        for (const orgSeed of orgSeeds) {
            const [org] = await trx('organizations')
                .insert({ name: orgSeed.name, slug: orgSeed.slug })
                .onConflict('slug')
                .merge({ name: orgSeed.name })
                .returning(['id', 'name', 'slug']);
            orgMap.set(orgSeed.key, org);
            summary.orgs.push(org);

            for (const raceSeed of orgSeed.races) {
                const raceRow = {
                    org_id: org.id,
                    name: raceSeed.name,
                    date: raceSeed.date,
                    location: raceSeed.location,
                    location_lat: raceSeed.locationLat,
                    location_lng: raceSeed.locationLng,
                    events: JSON.stringify(raceSeed.events),
                    conflict_rule: 'strict',
                };
                const existingRace = await trx('races')
                    .where({ org_id: org.id, name: raceSeed.name })
                    .first('id');
                const [race] = existingRace
                    ? await trx('races').where({ id: existingRace.id }).update(raceRow).returning(['id', 'name', 'org_id'])
                    : await trx('races').insert(raceRow).returning(['id', 'name', 'org_id']);
                raceMap.set(raceSeed.key, race);
                summary.races.push({ id: Number(race.id), name: race.name, orgName: org.name });
            }

            for (const memberSeed of orgSeed.members) {
                const [teamMember] = await trx('team_members')
                    .insert(buildTeamMemberRow(org.id, memberSeed))
                    .onConflict(['org_id', 'employee_code'])
                    .merge(buildTeamMemberRow(org.id, memberSeed))
                    .returning(['id', 'employee_code', 'employee_name']);
                summary.teamMembers += 1;

                if (!memberSeed.role) continue;

                const username = toUsername(orgSeed.key, memberSeed);
                const [user] = await trx('users')
                    .insert({
                        org_id: org.id,
                        username,
                        email: `${username}@demo.door.local`,
                        password_hash: passwordHash,
                        role: memberSeed.role,
                        status: 'active',
                        must_change_password: false,
                        created_by: superAdmin.id,
                        team_member_id: teamMember.id,
                        account_source: memberSeed.role === 'org_admin' ? 'manual' : 'team_member_auto',
                        job_title: memberSeed.title,
                        department: memberSeed.department,
                    })
                    .onConflict(['org_id', 'username'])
                    .merge({
                        org_id: org.id,
                        email: `${username}@demo.door.local`,
                        password_hash: passwordHash,
                        role: memberSeed.role,
                        status: 'active',
                        must_change_password: false,
                        team_member_id: teamMember.id,
                        account_source: memberSeed.role === 'org_admin' ? 'manual' : 'team_member_auto',
                        job_title: memberSeed.title,
                        department: memberSeed.department,
                    })
                    .returning(['id', 'username', 'role', 'org_id']);

                await trx('team_members')
                    .where({ id: teamMember.id })
                    .update({ account_user_id: user.id });

                userMap.set(username, user);
                summary.users.push({
                    username,
                    role: user.role,
                    orgName: org.name,
                    memberName: memberSeed.name,
                });

                for (const moduleId of memberSeed.modules || []) {
                    await trx('user_module_access')
                        .insert({
                            user_id: user.id,
                            org_id: org.id,
                            module_id: moduleId,
                            granted_by: superAdmin.id,
                            expires_at: null,
                        })
                        .onConflict(['user_id', 'module_id'])
                        .merge({
                            org_id: org.id,
                            granted_by: superAdmin.id,
                            expires_at: null,
                        });
                    summary.moduleGrants += 1;
                }
            }
        }

        const eastOrg = orgMap.get('east');
        const mountainOrg = orgMap.get('mountain');
        const bayOrg = orgMap.get('bay');
        const shanghaiFull = raceMap.get('shanghai-full');
        const chongqingTrail = raceMap.get('chongqing-trail');
        const shanghaiHalf = raceMap.get('shanghai-half');
        const suzhou10k = raceMap.get('suzhou-10k');
        const shenzhenNight = raceMap.get('shenzhen-bay-night');

        await trx('race_capacity').insert({
            org_id: eastOrg.id,
            race_id: Number(shanghaiFull.id),
            event: '全程马拉松',
            target_count: 2,
            draw_ratio: 0.85,
            reserved_ratio: 0.15,
            lottery_mode_override: 'lottery',
        }).onConflict(['org_id', 'race_id', 'event']).merge({
            target_count: 2,
            draw_ratio: 0.85,
            reserved_ratio: 0.15,
            lottery_mode_override: 'lottery',
        });

        const clothingRows = [
            { org_id: eastOrg.id, race_id: Number(shanghaiFull.id), event: 'ALL', gender: 'M', size: 'M', total_inventory: 2, used_count: 0 },
            { org_id: eastOrg.id, race_id: Number(shanghaiFull.id), event: 'ALL', gender: 'F', size: 'S', total_inventory: 2, used_count: 0 },
            { org_id: eastOrg.id, race_id: Number(shanghaiFull.id), event: 'ALL', gender: 'M', size: 'L', total_inventory: 2, used_count: 0 },
        ];
        for (const clothingRow of clothingRows) {
            await trx('clothing_limits')
                .insert(clothingRow)
                .onConflict(['org_id', 'race_id', 'event', 'gender', 'size'])
                .merge({ total_inventory: clothingRow.total_inventory, used_count: clothingRow.used_count });
        }

        await trx('start_zones').insert({
            org_id: eastOrg.id,
            race_id: Number(shanghaiFull.id),
            zone_name: 'A',
            width: 20,
            length: 20,
            density: 2.5,
            calculated_capacity: 1000,
            color: '#3B82F6',
            sort_order: 1,
            gap_distance: 0,
            event: '全程马拉松',
            capacity_ratio: 1,
            score_upper_seconds: null,
        }).onConflict(['org_id', 'race_id', 'zone_name']).merge({
            width: 20,
            length: 20,
            density: 2.5,
            calculated_capacity: 1000,
            color: '#3B82F6',
            sort_order: 1,
            gap_distance: 0,
            event: '全程马拉松',
            capacity_ratio: 1,
            score_upper_seconds: null,
        });

        const [credentialAccessArea] = await trx('credential_access_areas')
            .insert({
                org_id: eastOrg.id,
                race_id: Number(shanghaiFull.id),
                access_code: '101',
                access_name: '终点核心区',
                access_color: '#DC2626',
                sort_order: 1,
                description: '终点拱门、混合采访区和完赛物资交接区域',
                is_active: true,
            })
            .onConflict(['org_id', 'race_id', 'access_code'])
            .merge({
                access_name: '终点核心区',
                access_color: '#DC2626',
                sort_order: 1,
                description: '终点拱门、混合采访区和完赛物资交接区域',
                is_active: true,
            })
            .returning(['id']);
        const [credentialCategory] = await trx('credential_categories')
            .insert({
                org_id: eastOrg.id,
                race_id: Number(shanghaiFull.id),
                category_name: '赛事执行',
                category_code: 'OPS',
                card_color: '#1D4ED8',
                requires_review: true,
                is_active: true,
                description: '赛事现场执行人员验收类别',
                sort_order: 1,
            })
            .onConflict(['org_id', 'race_id', 'category_code'])
            .merge({
                category_name: '赛事执行',
                card_color: '#1D4ED8',
                requires_review: true,
                is_active: true,
                description: '赛事现场执行人员验收类别',
                sort_order: 1,
            })
            .returning(['id']);
        await trx('credential_category_access_areas').insert({
            category_id: credentialCategory.id,
            access_area_id: credentialAccessArea.id,
            sort_order: 1,
        }).onConflict(['category_id', 'access_area_id']).merge({ sort_order: 1 });

        const orgGrants = [
            { org_id: eastOrg.id, race_id: Number(chongqingTrail.id), access_level: 'viewer' },
            { org_id: mountainOrg.id, race_id: Number(shanghaiHalf.id), access_level: 'editor' },
            { org_id: bayOrg.id, race_id: Number(shanghaiHalf.id), access_level: 'viewer' },
            { org_id: bayOrg.id, race_id: Number(suzhou10k.id), access_level: 'viewer' },
        ];
        await trx('org_race_permissions').insert(
            orgGrants.map((grant) => ({
                ...grant,
                granted_by: superAdmin.id,
            })),
        ).onConflict(['org_id', 'race_id']).merge(['access_level', 'granted_by']);
        summary.orgRaceGrants = orgGrants.length;

        const userGrants = [
            { user: userMap.get('east.ops'), org_id: eastOrg.id, race_id: Number(shanghaiHalf.id), access_level: 'editor' },
            { user: userMap.get('east.storeroom'), org_id: eastOrg.id, race_id: Number(suzhou10k.id), access_level: 'viewer' },
            { user: userMap.get('mountain.track'), org_id: mountainOrg.id, race_id: Number(chongqingTrail.id), access_level: 'editor' },
            { user: userMap.get('mountain.checkin'), org_id: mountainOrg.id, race_id: Number(shanghaiHalf.id), access_level: 'viewer' },
            { user: userMap.get('bay.service'), org_id: bayOrg.id, race_id: Number(shenzhenNight.id), access_level: 'editor' },
            { user: userMap.get('bay.runnercare'), org_id: bayOrg.id, race_id: Number(shanghaiHalf.id), access_level: 'viewer' },
        ].filter((grant) => grant.user);

        await trx('user_race_permissions').insert(
            userGrants.map((grant) => ({
                user_id: grant.user.id,
                org_id: grant.org_id,
                race_id: grant.race_id,
                access_level: grant.access_level,
                created_by: superAdmin.id,
            })),
        ).onConflict(['user_id', 'race_id']).merge(['org_id', 'access_level', 'created_by']);
        summary.userRaceGrants = userGrants.length;
    });

    console.log(JSON.stringify({
        ok: true,
        superAdminBootstrap: bootstrapResult,
        summary,
    }, null, 2));
}

try {
    await main();
} finally {
    await knex.destroy();
}
