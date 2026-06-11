import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import request from 'supertest';

function resolveSafeTestDatabaseUrl() {
    const databaseUrl = process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door_test';
    const parsed = new URL(databaseUrl);
    const dbName = parsed.pathname.replace(/^\//, '');

    if (!/(^test$|_test$|test_)/i.test(dbName)) {
        throw new Error(`Refusing to run destructive tests against non-test database "${dbName}"`);
    }

    process.env.DATABASE_URL = databaseUrl;
    process.env.NODE_ENV = 'test';
    return databaseUrl;
}

resolveSafeTestDatabaseUrl();

const { default: knex } = await import('../src/db/knex.js');
const { default: app } = await import('../src/app.js');

let server;
let baseUrl;
let token;
let orgId;
let raceId;
let secondRaceId;
let designerId;
const staffTokens = {};

async function api(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
    });
    const body = await response.json().catch(() => null);
    return { status: response.status, body };
}

function authHeader() {
    return { Authorization: `Bearer ${token}` };
}

function authHeaderFor(key) {
    return { Authorization: `Bearer ${staffTokens[key]}` };
}

async function createApprovedDesignRequest(overrides = {}) {
    const createResponse = await api('/api/ops/design-requests/requests', {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({
            raceId,
            eventType: 'marathon',
            requesterDepartment: '招商部',
            requesterName: '李华',
            title: '进度跟踪验证主视觉',
            requirementText: '需要用于主会场、检录区和物料下单的统一视觉。',
            referenceNotes: '参考赛事主视觉和赞助商规范。',
            sizeSpec: '背景板 6m x 3m，导视 1m x 2m',
            materialSpec: '喷绘布、雪弗板',
            dueAt: '2026-07-05T18:00:00.000Z',
            priority: 'high',
            ...overrides,
        }),
    });
    assert.equal(createResponse.status, 201);
    const requestId = createResponse.body.data.id;

    const ownerTasks = await api('/api/app/approvals/tasks?status=pending', {
        headers: authHeaderFor('departmentOwner'),
    });
    const ownerTask = ownerTasks.body.data.items.find((item) => item.businessId === requestId);
    assert.ok(ownerTask);
    const ownerApprove = await api(`/api/app/approvals/tasks/${ownerTask.id}/approve`, {
        method: 'POST',
        headers: authHeaderFor('departmentOwner'),
        body: JSON.stringify({ comment: '需求完整。' }),
    });
    assert.equal(ownerApprove.status, 200);

    const directorTasks = await api('/api/app/approvals/tasks?status=pending', {
        headers: authHeaderFor('raceDirector'),
    });
    const directorTask = directorTasks.body.data.items.find((item) => item.businessId === requestId);
    assert.ok(directorTask);
    const directorApprove = await api(`/api/app/approvals/tasks/${directorTask.id}/approve`, {
        method: 'POST',
        headers: authHeaderFor('raceDirector'),
        body: JSON.stringify({ comment: '同意排期。' }),
    });
    assert.equal(directorApprove.status, 200);

    const leadTasks = await api('/api/app/approvals/tasks?status=pending', {
        headers: authHeaderFor('designLead'),
    });
    const leadTask = leadTasks.body.data.items.find((item) => item.businessId === requestId);
    assert.ok(leadTask);
    const assignResponse = await api(`/api/app/approvals/tasks/${leadTask.id}/assign`, {
        method: 'POST',
        headers: authHeaderFor('designLead'),
        body: JSON.stringify({
            comment: '分派给设计师。',
            assignment: { assignedDesignerId: designerId },
        }),
    });
    assert.equal(assignResponse.status, 200);
    assert.equal(assignResponse.body.data.status, 'approved');

    return requestId;
}

async function buildCollaborationWorkbook() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('搭建&设计 清单');
    const excelDateSerial = 25569 + (Date.UTC(2026, 6, 5, 18, 0, 0) / (24 * 60 * 60 * 1000));
    sheet.addRow([
        '序号',
        '使用区域',
        '供方',
        '类别',
        '项目',
        '材质',
        '制作工艺',
        '搭建尺寸',
        '数量',
        '单位',
        '单价',
        '总价',
        '搭建备注',
        '设计',
        '需求部门',
        '需求人',
        '交付时间',
        '优先级',
        '材质',
        '设计尺寸',
        '设计备注',
        '设计参考图',
        '设计参考说明',
    ]);
    const ignoredRow = sheet.addRow([
        1,
        '小票打印',
        '搭建',
        '租赁',
        '欧帐',
        null,
        '欧式尖顶帐篷',
        'W5m*L5m',
        2,
        '顶',
        800,
        1600,
        '整组左右围档',
    ]);
    ignoredRow.getCell(19).value = { formula: 'F2' };
    sheet.addRow([
        2,
        '小票打印',
        '搭建',
        '租赁',
        '门楣',
        'KT板',
        'KT板',
        'L5m*H0.3m',
        2,
        '个',
        50,
        100,
        null,
        '✅',
        null,
        null,
        null,
        null,
        'KT板',
        'L5m*H0.3m',
        null,
        null,
        '参考赛事主视觉',
    ]);
    sheet.addRow([
        3,
        '背景墙',
        '搭建',
        '采购',
        '欢迎墙+马拉松旅行',
        null,
        '桁架+黑底布',
        'L5m*H3m*D1.5m',
        1,
        '个',
        2300,
        2300,
        '五面包',
        '✅',
        '竞赛部',
        '李华',
        excelDateSerial,
        '高',
        '黑底布',
        'L5m*H3m*D1.5m',
        '需要包含赛事 logo 和旅行主题',
        null,
        '参考上一届欢迎墙',
    ]);

    return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function buildChangedCollaborationWorkbook(systemKeys = {}) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('搭建&设计 清单');
    sheet.addRow([
        '序号',
        '使用区域',
        '供方',
        '类别',
        '项目',
        '材质',
        '制作工艺',
        '搭建尺寸',
        '数量',
        '单位',
        '单价',
        '总价',
        '搭建备注',
        '设计',
        '需求部门',
        '需求人',
        '交付时间',
        '优先级',
        '材质',
        '设计尺寸',
        '设计备注',
        '设计参考图',
        '设计参考说明',
        '系统行键',
    ]);
    sheet.addRow([
        1,
        '小票打印',
        '搭建',
        '租赁',
        '欧帐',
        null,
        '欧式尖顶帐篷',
        'W5m*L5m',
        2,
        '顶',
        800,
        1600,
        '整组左右围档',
        null,
        null,
        null,
        null,
        null,
        null,
        'W5m*L5m',
        null,
        null,
        null,
        systemKeys['欧帐'],
    ]);
    sheet.addRow([
        2,
        '小票打印',
        '搭建',
        '租赁',
        '门楣',
        'KT板',
        'KT板',
        'L6m*H0.4m',
        2,
        '个',
        60,
        120,
        '第二轮修改门楣尺寸',
        '✅',
        null,
        null,
        null,
        null,
        'KT板',
        'L6m*H0.4m',
        '第二轮需要放大门楣',
        null,
        '参考赛事主视觉',
        systemKeys['门楣'],
    ]);
    sheet.addRow([
        3,
        '背景墙',
        '搭建',
        '采购',
        '欢迎墙+马拉松旅行',
        null,
        '桁架+黑底布',
        'L5m*H3m*D1.5m',
        1,
        '个',
        2300,
        2300,
        '五面包',
        '✅',
        '竞赛部',
        '李华',
        new Date('2026-07-05T18:00:00.000Z'),
        '高',
        '黑底布',
        'L5m*H3m*D1.5m',
        '需要包含赛事 logo 和旅行主题',
        null,
        '参考上一届欢迎墙',
        systemKeys['欢迎墙+马拉松旅行'],
    ]);
    sheet.addRow([
        4,
        '导视区',
        '导视制作',
        '导视',
        '检录导视牌',
        '雪弗板',
        '户外写真覆膜',
        'L1m*H2m',
        6,
        '块',
        180,
        1080,
        '新增导视类目',
        '✅',
        '竞赛部',
        '周敏',
        new Date('2026-07-03T10:00:00.000Z'),
        '普通',
        '雪弗板',
        'L1m*H2m',
        '需要方向箭头和检录区编号',
        null,
        '参考场地图',
        null,
    ]);

    return Buffer.from(await workbook.xlsx.writeBuffer());
}

function parseBinaryResponse(res, callback) {
    const chunks = [];
    res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    res.on('end', () => callback(null, Buffer.concat(chunks)));
}

async function readWorkbookRows(buffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    const header = sheet.getRow(1).values.slice(1);
    const rows = [];
    for (let index = 2; index <= sheet.rowCount; index += 1) {
        const row = sheet.getRow(index);
        if (!row.values.slice(1).some((value) => value !== null && value !== undefined && value !== '')) continue;
        const record = {};
        header.forEach((name, headerIndex) => {
            record[name] = row.getCell(headerIndex + 1).value;
        });
        rows.push(record);
    }
    return { header, rows };
}

async function createUser({ username, email, password, role, orgId: userOrgId = null }) {
    const [user] = await knex('users')
        .insert({
            username,
            email,
            password_hash: await bcrypt.hash(password, 10),
            role,
            org_id: userOrgId,
            status: 'active',
            must_change_password: false,
        })
        .returning('*');
    return user;
}

async function createTeamAccount({
    employeeCode,
    employeeName,
    department,
    position,
    username,
    role = 'user',
}) {
    const [member] = await knex('team_members')
        .insert({
            org_id: orgId,
            employee_code: employeeCode,
            employee_name: employeeName,
            position,
            department,
            member_type: 'employee',
            id_number_ciphertext: Buffer.from(`${employeeCode}-id`),
            id_number_iv: 'iv',
            id_number_auth_tag: 'tag',
            id_number_last4: '1234',
            contact_ciphertext: Buffer.from(`${employeeCode}-contact`),
            contact_iv: 'iv',
            contact_auth_tag: 'tag',
            contact_last4: '5678',
            status: 'active',
        })
        .returning('*');

    const user = await createUser({
        username,
        email: `${username}@test.com`,
        password: 'staff123',
        role,
        orgId,
    });

    await knex('users')
        .where({ id: user.id })
        .update({
            team_member_id: member.id,
            account_source: 'team_member_manual_enable',
        });
    await knex('team_members')
        .where({ id: member.id })
        .update({ account_user_id: user.id });

    return { member, user };
}

async function assignStaff({ account, roleKey, roleName, departmentScope = null }) {
    await knex('race_staff_assignments').insert({
        org_id: orgId,
        race_id: raceId,
        team_member_id: account.member.id,
        user_id: account.user.id,
        role_key: roleKey,
        role_name: roleName,
        department_scope: departmentScope,
        status: 'active',
    });
}

async function assignScopeRole({
    account,
    roleKey,
    roleName,
    scopeType = 'org',
    scopeId = null,
    departmentScope = null,
    moduleKey = null,
}) {
    await knex('scope_role_assignments').insert({
        org_id: orgId,
        scope_type: scopeType,
        scope_id: scopeId,
        team_member_id: account.member.id,
        user_id: account.user.id,
        role_key: roleKey,
        role_name: roleName,
        department_scope: departmentScope,
        module_key: moduleKey,
        status: 'active',
    });
}

async function resetDatabase() {
    const result = await knex.raw(`
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename NOT IN ('knex_migrations', 'knex_migrations_lock')
    `);
    const tableNames = result.rows.map((row) => `"${row.tablename}"`);
    if (tableNames.length > 0) {
        await knex.raw(`TRUNCATE TABLE ${tableNames.join(', ')} RESTART IDENTITY CASCADE`);
    }
}

describe('design request collaboration routes', () => {
    before(async () => {
        await knex.migrate.latest();
        await resetDatabase();

        const [org] = await knex('organizations')
            .insert({ name: 'Design Request Org', slug: 'design-request-org' })
            .returning('*');
        orgId = org.id;

        const [race] = await knex('races')
            .insert({
                org_id: orgId,
                name: 'Design Request Marathon',
                date: '2026-07-05',
                location: 'Chengdu',
            })
            .returning('*');
        raceId = Number(race.id);
        const [secondRace] = await knex('races')
            .insert({
                org_id: orgId,
                name: 'Design Request Trail',
                date: '2026-08-16',
                location: 'Aba',
            })
            .returning('*');
        secondRaceId = Number(secondRace.id);

        await createUser({
            username: 'design_manager',
            email: 'design_manager@test.com',
            password: 'manager123',
            role: 'org_admin',
            orgId,
        });
        const designer = await createUser({
            username: 'design_worker',
            email: 'design_worker@test.com',
            password: 'designer123',
            role: 'user',
            orgId,
        });
        designerId = designer.id;

        const departmentOwner = await createTeamAccount({
            employeeCode: 'DES-OWN-001',
            employeeName: '招商部负责人',
            department: '招商部',
            position: '部门负责人',
            username: 'design_department_owner',
        });
        const competitionOwner = await createTeamAccount({
            employeeCode: 'DES-OWN-002',
            employeeName: '竞赛部负责人',
            department: '竞赛部',
            position: '部门负责人',
            username: 'design_competition_owner',
        });
        const raceDirector = await createTeamAccount({
            employeeCode: 'DES-DIR-001',
            employeeName: '赛事总监',
            department: '赛事管理',
            position: '赛事总监',
            username: 'design_race_director',
        });
        const designLead = await createTeamAccount({
            employeeCode: 'DES-LEAD-001',
            employeeName: '设计负责人',
            department: '设计部',
            position: '设计负责人',
            username: 'design_lead_user',
        });

        await assignStaff({
            account: departmentOwner,
            roleKey: 'department_owner',
            roleName: '部门负责人',
            departmentScope: '招商部',
        });
        await assignStaff({
            account: competitionOwner,
            roleKey: 'department_owner',
            roleName: '部门负责人',
            departmentScope: '竞赛部',
        });
        await assignStaff({
            account: raceDirector,
            roleKey: 'race_director',
            roleName: '赛事总监',
        });
        await assignStaff({
            account: designLead,
            roleKey: 'design_lead',
            roleName: '设计负责人',
        });
        await assignScopeRole({
            account: departmentOwner,
            roleKey: 'department_owner',
            roleName: '部门负责人',
            scopeType: 'department',
            departmentScope: '招商部',
        });
        await assignScopeRole({
            account: competitionOwner,
            roleKey: 'department_owner',
            roleName: '部门负责人',
            scopeType: 'department',
            departmentScope: '竞赛部',
        });
        await assignScopeRole({
            account: designLead,
            roleKey: 'design_lead',
            roleName: '设计负责人',
            scopeType: 'module',
            moduleKey: 'design_requests',
        });

        server = app.listen(0);
        baseUrl = `http://localhost:${server.address().port}`;

        const login = await api('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ login: 'design_manager', password: 'manager123' }),
        });
        assert.equal(login.status, 200);
        token = login.body.data.accessToken;

        for (const [key, loginName] of [
            ['departmentOwner', departmentOwner.user.username],
            ['competitionOwner', competitionOwner.user.username],
            ['raceDirector', raceDirector.user.username],
            ['designLead', designLead.user.username],
        ]) {
            const staffLogin = await api('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({ login: loginName, password: 'staff123' }),
            });
            assert.equal(staffLogin.status, 200);
            staffTokens[key] = staffLogin.body.data.accessToken;
        }
    });

    after(async () => {
        await resetDatabase();
        server?.close();
        await knex.destroy();
    });

    it('returns default templates for the four target event types', async () => {
        for (const eventType of ['marathon', 'trail', 'aquatic', 'orienteering']) {
            const response = await api(`/api/admin/design-requests/templates?eventType=${eventType}&raceId=${raceId}`, {
                headers: authHeader(),
            });

            assert.equal(response.status, 200);
            assert.ok(response.body.data.length > 0, `${eventType} should have at least one default template`);
            assert.equal(response.body.data[0].eventType, eventType);
            assert.ok(response.body.data[0].fields.length >= 5);
        }
    });

    it('gates submitted requests through department owner, race director, and design lead assignment', async () => {
        const createResponse = await api('/api/ops/design-requests/requests', {
            method: 'POST',
            headers: authHeader(),
            body: JSON.stringify({
                raceId,
                eventType: 'marathon',
                requesterDepartment: '招商部',
                requesterName: '李华',
                title: '完赛奖牌主视觉延展',
                requirementText: '需要用于奖牌盒、背景板和社媒海报的统一视觉。',
                referenceNotes: '参考 2025 杭州马拉松蓝金配色。',
                sizeSpec: '海报 1080x1920，背景板 6m x 3m',
                materialSpec: '喷绘布、覆膜贴纸',
                dueAt: '2026-07-05T18:00:00.000Z',
                priority: 'high',
                referenceAssets: [
                    {
                        fileName: 'reference.jpg',
                        fileUrl: 'https://example.com/reference.jpg',
                        mimeType: 'image/jpeg',
                        note: '主色参考',
                    },
                ],
            }),
        });

        assert.equal(createResponse.status, 201);
        assert.equal(createResponse.body.data.status, 'pending_review');
        assert.equal(createResponse.body.data.currentApproval.currentStep.stepKey, 'department_owner_review');
        assert.equal(createResponse.body.data.referenceAssets.length, 1);

        const requestId = createResponse.body.data.id;
        const blockedStart = await api(`/api/app/design-requests/requests/${requestId}/start`, {
            method: 'POST',
            headers: authHeader(),
        });
        assert.equal(blockedStart.status, 409);
        assert.match(blockedStart.body.message, /审批/);

        const ownerTasks = await api('/api/app/approvals/tasks?status=pending', {
            headers: authHeaderFor('departmentOwner'),
        });
        assert.equal(ownerTasks.status, 200);
        const ownerTask = ownerTasks.body.data.items.find((item) => item.businessId === requestId);
        assert.ok(ownerTask);
        assert.equal(ownerTask.step.stepKey, 'department_owner_review');

        const ownerApprove = await api(`/api/app/approvals/tasks/${ownerTask.id}/approve`, {
            method: 'POST',
            headers: authHeaderFor('departmentOwner'),
            body: JSON.stringify({ comment: '需求完整，提交赛事总监终审。' }),
        });
        assert.equal(ownerApprove.status, 200);
        assert.equal(ownerApprove.body.data.currentStep.stepKey, 'race_director_review');

        const directorTasks = await api('/api/app/approvals/tasks?status=pending', {
            headers: authHeaderFor('raceDirector'),
        });
        assert.equal(directorTasks.status, 200);
        const directorTask = directorTasks.body.data.items.find((item) => item.businessId === requestId);
        assert.ok(directorTask);

        const directorApprove = await api(`/api/app/approvals/tasks/${directorTask.id}/approve`, {
            method: 'POST',
            headers: authHeaderFor('raceDirector'),
            body: JSON.stringify({ comment: '同意进入设计排期。' }),
        });
        assert.equal(directorApprove.status, 200);
        assert.equal(directorApprove.body.data.currentStep.stepKey, 'design_lead_assignment');

        const leadTasks = await api('/api/app/approvals/tasks?status=pending', {
            headers: authHeaderFor('designLead'),
        });
        assert.equal(leadTasks.status, 200);
        const leadTask = leadTasks.body.data.items.find((item) => item.businessId === requestId);
        assert.ok(leadTask);

        const assignResponse = await api(`/api/app/approvals/tasks/${leadTask.id}/assign`, {
            method: 'POST',
            headers: authHeaderFor('designLead'),
            body: JSON.stringify({
                comment: '分派设计师。',
                assignment: { assignedDesignerId: designerId },
            }),
        });
        assert.equal(assignResponse.status, 200);
        assert.equal(assignResponse.body.data.status, 'approved');

        const approvedDetail = await api(`/api/admin/design-requests/requests/${requestId}`, {
            headers: authHeader(),
        });
        assert.equal(approvedDetail.status, 200);
        assert.equal(approvedDetail.body.data.status, 'approved');
        assert.equal(String(approvedDetail.body.data.assignedDesignerId), String(designerId));

        const startResponse = await api(`/api/app/design-requests/requests/${requestId}/start`, {
            method: 'POST',
            headers: authHeader(),
        });
        assert.equal(startResponse.status, 200);
        assert.equal(startResponse.body.data.status, 'in_design');

        const assetResponse = await api(`/api/app/design-requests/requests/${requestId}/assets`, {
            method: 'POST',
            headers: authHeader(),
            body: JSON.stringify({
                assetType: 'deliverable',
                fileName: 'medal-visual-v1.png',
                fileUrl: 'data:image/png;base64,iVBORw0KGgo=',
                mimeType: 'image/png',
                note: '第一版主视觉',
            }),
        });
        assert.equal(assetResponse.status, 201);
        assert.equal(assetResponse.body.data.status, 'design_uploaded');
        assert.equal(assetResponse.body.data.deliverables.length, 1);
        assert.equal(assetResponse.body.data.deliverables[0].version, 1);

        const appList = await api(`/api/app/design-requests/requests?raceId=${raceId}`, {
            headers: authHeader(),
        });
        assert.equal(appList.status, 200);
        assert.ok(appList.body.data.items.some((item) => item.status === 'design_uploaded'));

        const stats = await api(`/api/app/design-requests/stats?raceId=${raceId}`, {
            headers: authHeader(),
        });
        assert.equal(stats.status, 200);
        assert.equal(stats.body.data.designUploaded, 1);
    });

    it('creates organization-level requests without race context and keeps them visible in the organization pool', async () => {
        const createResponse = await api('/api/ops/design-requests/requests', {
            method: 'POST',
            headers: authHeader(),
            body: JSON.stringify({
                eventType: 'general',
                requesterDepartment: '招商部',
                requesterName: '李华',
                title: '组织级视觉规范更新',
                requirementText: '更新组织通用招商手册、社媒图和物料模板。',
                referenceNotes: '沿用中奥致远品牌规范。',
                sizeSpec: 'A4、1080x1920、1920x1080',
                materialSpec: '电子文件',
                dueAt: '2026-07-10T18:00:00.000Z',
                priority: 'normal',
            }),
        });

        assert.equal(createResponse.status, 201);
        assert.equal(createResponse.body.data.orgId, orgId);
        assert.equal(createResponse.body.data.raceId, null);
        assert.deepEqual(createResponse.body.data.raceIds, []);
        assert.deepEqual(createResponse.body.data.raceLinks, []);
        assert.equal(createResponse.body.data.currentApproval.currentStep.stepKey, 'department_owner_review');

        const requestId = createResponse.body.data.id;
        const ownerTasks = await api('/api/app/approvals/tasks?status=pending', {
            headers: authHeaderFor('departmentOwner'),
        });
        const ownerTask = ownerTasks.body.data.items.find((item) => item.businessId === requestId);
        assert.ok(ownerTask);
        const ownerApprove = await api('/api/app/approvals/tasks/' + ownerTask.id + '/approve', {
            method: 'POST',
            headers: authHeaderFor('departmentOwner'),
            body: JSON.stringify({ comment: '组织级需求完整。' }),
        });
        assert.equal(ownerApprove.status, 200);
        assert.equal(ownerApprove.body.data.currentStep.stepKey, 'design_lead_assignment');

        const allList = await api('/api/admin/design-requests/requests', {
            headers: authHeader(),
        });
        assert.equal(allList.status, 200);
        assert.ok(allList.body.data.items.some((item) => item.id === requestId));

        const unlinkedList = await api('/api/admin/design-requests/requests?raceScope=unlinked', {
            headers: authHeader(),
        });
        assert.equal(unlinkedList.status, 200);
        assert.ok(unlinkedList.body.data.items.some((item) => item.id === requestId));
    });

    it('creates multi-race design requests and filters them by linked race', async () => {
        const createResponse = await api('/api/ops/design-requests/requests', {
            method: 'POST',
            headers: authHeader(),
            body: JSON.stringify({
                primaryRaceId: raceId,
                raceIds: [raceId, secondRaceId],
                eventType: 'marathon',
                requesterDepartment: '竞赛部',
                requesterName: '周敏',
                title: '系列赛事导视系统',
                requirementText: '同一套导视系统需要覆盖马拉松和越野赛两个项目。',
                referenceNotes: '参考上一届城市马拉松和山地越野视觉。',
                sizeSpec: '导视牌 1m x 2m，背景板 6m x 3m',
                materialSpec: '雪弗板、喷绘布',
                dueAt: '2026-07-20T18:00:00.000Z',
                priority: 'high',
            }),
        });

        assert.equal(createResponse.status, 201);
        assert.equal(createResponse.body.data.raceId, raceId);
        assert.deepEqual(
            createResponse.body.data.raceIds.map(Number).sort((a, b) => a - b),
            [raceId, secondRaceId].sort((a, b) => a - b),
        );
        assert.equal(createResponse.body.data.raceLinks.find((item) => Number(item.raceId) === raceId).relationType, 'primary');
        assert.equal(createResponse.body.data.raceLinks.find((item) => Number(item.raceId) === secondRaceId).relationType, 'related');

        const secondRaceList = await api('/api/admin/design-requests/requests?raceId=' + secondRaceId, {
            headers: authHeader(),
        });
        assert.equal(secondRaceList.status, 200);
        assert.ok(secondRaceList.body.data.items.some((item) => item.id === createResponse.body.data.id));
    });

    it('tracks design revisions through final approval and ordering', async () => {
        const requestId = await createApprovedDesignRequest({
            title: '多轮返工进度跟踪',
            requirementText: '需要先出主视觉，再根据各部门意见返工，最终用于制作下单。',
        });

        const startResponse = await api(`/api/app/design-requests/requests/${requestId}/start`, {
            method: 'POST',
            headers: authHeader(),
        });
        assert.equal(startResponse.status, 200);
        assert.equal(startResponse.body.data.status, 'in_design');
        assert.equal(startResponse.body.data.progress.stage, 'designing');

        const firstUpload = await api(`/api/app/design-requests/requests/${requestId}/assets`, {
            method: 'POST',
            headers: authHeader(),
            body: JSON.stringify({
                assetType: 'deliverable',
                fileName: 'main-visual-v1.png',
                fileUrl: 'data:image/png;base64,iVBORw0KGgo=',
                mimeType: 'image/png',
                note: '第一版，等待部门确认。',
            }),
        });
        assert.equal(firstUpload.status, 201);
        assert.equal(firstUpload.body.data.status, 'design_uploaded');
        assert.equal(firstUpload.body.data.progress.stage, 'internal_review');
        assert.equal(firstUpload.body.data.progress.currentRevisionNo, 1);

        const revisionResponse = await api(`/api/admin/design-requests/requests/${requestId}/progress`, {
            method: 'POST',
            headers: authHeader(),
            body: JSON.stringify({
                action: 'request_revision',
                comment: '赞助商 logo 露出不足，补充补给站方向箭头。',
            }),
        });
        assert.equal(revisionResponse.status, 200);
        assert.equal(revisionResponse.body.data.status, 'in_design');
        assert.equal(revisionResponse.body.data.progress.stage, 'revision_requested');
        assert.equal(revisionResponse.body.data.progress.revisionCount, 1);
        assert.match(revisionResponse.body.data.progress.events.at(-1).comment, /赞助商/);

        const secondUpload = await api(`/api/app/design-requests/requests/${requestId}/assets`, {
            method: 'POST',
            headers: authHeader(),
            body: JSON.stringify({
                assetType: 'deliverable',
                fileName: 'main-visual-v2.png',
                fileUrl: 'data:image/png;base64,iVBORw0KGgo=',
                mimeType: 'image/png',
                note: '第二版，已调整赞助商露出和方向箭头。',
            }),
        });
        assert.equal(secondUpload.status, 201);
        assert.equal(secondUpload.body.data.deliverables.length, 2);
        assert.equal(secondUpload.body.data.deliverables[1].version, 2);
        assert.equal(secondUpload.body.data.progress.currentRevisionNo, 2);

        const finalApprove = await api(`/api/admin/design-requests/requests/${requestId}/progress`, {
            method: 'POST',
            headers: authHeader(),
            body: JSON.stringify({
                action: 'approve_final',
                comment: '第二版确认，可以进入制作下单。',
            }),
        });
        assert.equal(finalApprove.status, 200);
        assert.equal(finalApprove.body.data.status, 'design_uploaded');
        assert.equal(finalApprove.body.data.progress.stage, 'ready_to_order');
        assert.equal(finalApprove.body.data.progress.orderStatus, 'ready');
        assert.ok(finalApprove.body.data.progress.finalApprovedAt);

        const ordered = await api(`/api/admin/design-requests/requests/${requestId}/progress`, {
            method: 'POST',
            headers: authHeader(),
            body: JSON.stringify({
                action: 'mark_ordered',
                orderReference: 'PO-DESIGN-20260705-001',
                orderNote: '已提交制作供应商，按第二版文件下单。',
            }),
        });
        assert.equal(ordered.status, 200);
        assert.equal(ordered.body.data.progress.stage, 'ordered');
        assert.equal(ordered.body.data.progress.orderStatus, 'ordered');
        assert.equal(ordered.body.data.progress.orderReference, 'PO-DESIGN-20260705-001');
        assert.ok(ordered.body.data.progress.orderedAt);

        const detail = await api(`/api/admin/design-requests/requests/${requestId}`, {
            headers: authHeader(),
        });
        assert.equal(detail.status, 200);
        assert.equal(detail.body.data.progress.events.filter((event) => event.eventType === 'revision_uploaded').length, 2);
        assert.ok(detail.body.data.progress.events.some((event) => event.eventType === 'ordered'));

        const stats = await api(`/api/admin/design-requests/stats?raceId=${raceId}`, {
            headers: authHeader(),
        });
        assert.equal(stats.status, 200);
        assert.equal(stats.body.data.ordered, 1);
    });

    it('imports collaboration spreadsheets and syncs ready design rows', async () => {
        const workbookBuffer = await buildCollaborationWorkbook();

        const previewResponse = await request(app)
            .post('/api/ops/design-requests/imports/preview')
            .set(authHeader())
            .field('raceId', String(raceId))
            .field('eventType', 'marathon')
            .attach('file', workbookBuffer, {
                filename: '搭建&设计清单.xlsx',
                contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });

        assert.equal(previewResponse.status, 201);
        assert.equal(previewResponse.body.success, true);
        assert.equal(previewResponse.body.data.rowCount, 3);
        assert.equal(previewResponse.body.data.designCount, 2);
        assert.equal(previewResponse.body.data.readyCount, 1);
        assert.equal(previewResponse.body.data.needsInfoCount, 1);
        assert.equal(previewResponse.body.data.fileName, '搭建&设计清单.xlsx');
        assert.equal(previewResponse.body.data.items.length, 3);

        const missingItem = previewResponse.body.data.items.find((item) => item.syncStatus === 'needs_info');
        const readyItem = previewResponse.body.data.items.find((item) => item.syncStatus === 'ready');
        const ignoredItem = previewResponse.body.data.items.find((item) => item.syncStatus === 'ignored');

        assert.ok(missingItem);
        assert.ok(readyItem);
        assert.ok(ignoredItem);
        assert.notEqual(ignoredItem.designMaterial, '[object Object]');
        assert.deepEqual(missingItem.syncIssues, ['需求部门为空', '需求人为空', '交付时间为空']);
        assert.equal(missingItem.area, '小票打印');
        assert.equal(missingItem.itemName, '门楣');

        const importId = previewResponse.body.data.importId;
        const updateResponse = await api(`/api/ops/design-requests/imports/${importId}/items/${missingItem.id}`, {
            method: 'PATCH',
            headers: authHeader(),
            body: JSON.stringify({
                requesterDepartment: '竞赛部',
                requesterName: '王芳',
                dueAt: '2026-07-04T10:00:00.000Z',
                priority: 'urgent',
                designNote: '门楣需包含赛事 logo 和小票打印字样',
            }),
        });

        assert.equal(updateResponse.status, 200);
        assert.equal(updateResponse.body.data.syncStatus, 'ready');
        assert.deepEqual(updateResponse.body.data.syncIssues, []);

        const commitResponse = await api(`/api/ops/design-requests/imports/${importId}/commit`, {
            method: 'POST',
            headers: authHeader(),
            body: JSON.stringify({ itemIds: [missingItem.id, readyItem.id] }),
        });

        assert.equal(commitResponse.status, 200);
        assert.equal(commitResponse.body.data.syncedCount, 2);
        assert.equal(commitResponse.body.data.skippedItems.length, 0);

        const listResponse = await api(`/api/admin/design-requests/requests?raceId=${raceId}`, {
            headers: authHeader(),
        });
        assert.equal(listResponse.status, 200);

        const importedRequests = listResponse.body.data.items.filter((item) => item.source === 'collaboration_import');
        assert.equal(importedRequests.length, 2);
        assert.ok(importedRequests.every((item) => item.status === 'pending_review'));
        assert.ok(importedRequests.every((item) => item.currentApproval?.status === 'pending'));
        assert.ok(importedRequests.every((item) => item.currentApproval?.currentStep?.stepKey === 'department_owner_review'));
        assert.ok(importedRequests.some((item) => item.title.includes('小票打印')));
        assert.ok(importedRequests.some((item) => item.title.includes('背景墙')));

        const approvalTasks = await api('/api/app/approvals/tasks?status=pending', {
            headers: authHeaderFor('competitionOwner'),
        });
        assert.equal(approvalTasks.status, 200);
        const importedRequestIds = new Set(importedRequests.map((item) => item.id));
        const importedApprovalTasks = approvalTasks.body.data.items
            .filter((item) => importedRequestIds.has(item.businessId));
        assert.equal(importedApprovalTasks.length, 2);
        assert.ok(importedApprovalTasks.every((item) => item.step.stepKey === 'department_owner_review'));
    });

    it('exports collaboration spreadsheet rounds and detects later upload differences', async () => {
        const [exportRace] = await knex('races')
            .insert({
                org_id: orgId,
                name: 'Design Export Round Marathon',
                date: '2026-08-01',
                location: 'Chengdu',
            })
            .returning('*');
        const exportRaceId = Number(exportRace.id);

        const firstPreview = await request(app)
            .post('/api/ops/design-requests/imports/preview')
            .set(authHeader())
            .field('raceId', String(exportRaceId))
            .field('eventType', 'marathon')
            .attach('file', await buildCollaborationWorkbook(), {
                filename: '第一轮搭建&设计清单.xlsx',
                contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });
        assert.equal(firstPreview.status, 201);

        const firstExport = await api('/api/app/design-requests/collaboration-exports', {
            method: 'POST',
            headers: authHeader(),
            body: JSON.stringify({
                raceId: exportRaceId,
                eventType: 'marathon',
                mode: 'full_marked',
            }),
        });

        assert.equal(firstExport.status, 201);
        assert.equal(firstExport.body.data.roundNo, 1);
        assert.equal(firstExport.body.data.rowCount, 3);
        assert.equal(firstExport.body.data.newCount, 3);

        const keys = Object.fromEntries(firstPreview.body.data.items.map((item) => [item.itemName, item.stableKey]));
        const secondPreview = await request(app)
            .post('/api/ops/design-requests/imports/preview')
            .set(authHeader())
            .field('raceId', String(exportRaceId))
            .field('eventType', 'marathon')
            .attach('file', await buildChangedCollaborationWorkbook(keys), {
                filename: '第二轮搭建&设计清单.xlsx',
                contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });

        assert.equal(secondPreview.status, 201);
        assert.equal(secondPreview.body.data.rowCount, 4);
        assert.equal(secondPreview.body.data.changedCount, 1);
        assert.equal(secondPreview.body.data.newCategoryCount, 1);
        assert.equal(secondPreview.body.data.unchangedCount, 2);
        assert.equal(secondPreview.body.data.items.find((item) => item.itemName === '门楣').changeType, 'changed');
        assert.equal(secondPreview.body.data.items.find((item) => item.itemName === '检录导视牌').changeType, 'new_category');

        const incrementalExport = await api('/api/app/design-requests/collaboration-exports', {
            method: 'POST',
            headers: authHeader(),
            body: JSON.stringify({
                raceId: exportRaceId,
                eventType: 'marathon',
                mode: 'incremental',
                baselineExportId: firstExport.body.data.id,
            }),
        });

        assert.equal(incrementalExport.status, 201);
        assert.equal(incrementalExport.body.data.roundNo, 2);
        assert.equal(incrementalExport.body.data.rowCount, 2);
        assert.equal(incrementalExport.body.data.changedCount, 1);
        assert.equal(incrementalExport.body.data.newCategoryCount, 1);

        const download = await request(app)
            .get('/api/app/design-requests/collaboration-exports/' + incrementalExport.body.data.id + '/download')
            .set(authHeader())
            .buffer(true)
            .parse(parseBinaryResponse);

        assert.equal(download.status, 200);
        assert.match(download.headers['content-type'], /spreadsheetml/);
        const exported = await readWorkbookRows(download.body);
        assert.ok(exported.header.includes('变更标记'));
        assert.ok(exported.header.includes('提报时间'));
        assert.ok(exported.header.includes('系统行键'));
        assert.deepEqual(exported.rows.map((row) => row['项目']).sort(), ['检录导视牌', '门楣']);
        assert.deepEqual(exported.rows.map((row) => row['变更标记']).sort(), ['修改', '新类目']);
    });
});
