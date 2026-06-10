import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door_test';
process.env.DATABASE_URL = DATABASE_URL;
process.env.NODE_ENV = 'test';

const { default: knex } = await import('../src/db/knex.js');
const { default: app } = await import('../src/app.js');
const { startApproval } = await import('../src/modules/approvals/approval.service.js');

let server;
let baseUrl;
let orgId;
let raceId;
let requester;
let departmentOwner;
let raceDirector;
let designLead;
const tokens = {};

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

function authHeader(key) {
    return { Authorization: `Bearer ${tokens[key]}` };
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

    const [user] = await knex('users')
        .insert({
            org_id: orgId,
            username,
            email: `${username}@test.com`,
            password_hash: await bcrypt.hash('pass123', 10),
            role,
            status: 'active',
            must_change_password: false,
            team_member_id: member.id,
            account_source: 'team_member_manual_enable',
        })
        .returning('*');

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

describe('approval and race staff routes', () => {
    before(async () => {
        await knex.migrate.latest();
        await resetDatabase();

        const [org] = await knex('organizations')
            .insert({ name: 'Approval Routes Org', slug: 'approval-routes-org' })
            .returning('*');
        orgId = org.id;

        const [race] = await knex('races')
            .insert({
                org_id: orgId,
                name: 'Approval Routes Race',
                date: '2026-07-13',
                location: 'Chengdu',
            })
            .returning('*');
        raceId = Number(race.id);

        const admin = await createTeamAccount({
            employeeCode: 'ADM-001',
            employeeName: '管理员',
            department: '管理部',
            position: '组织管理员',
            username: 'approval_routes_admin',
            role: 'org_admin',
        });
        requester = await createTeamAccount({
            employeeCode: 'REQ-001',
            employeeName: '提报人',
            department: '竞赛部',
            position: '执行',
            username: 'approval_routes_requester',
        });
        departmentOwner = await createTeamAccount({
            employeeCode: 'OWN-001',
            employeeName: '竞赛部负责人',
            department: '竞赛部',
            position: '部门负责人',
            username: 'approval_routes_owner',
        });
        raceDirector = await createTeamAccount({
            employeeCode: 'DIR-001',
            employeeName: '赛事总监',
            department: '赛事管理',
            position: '赛事总监',
            username: 'approval_routes_director',
        });
        designLead = await createTeamAccount({
            employeeCode: 'LEAD-001',
            employeeName: '设计负责人',
            department: '设计部',
            position: '设计负责人',
            username: 'approval_routes_design_lead',
        });

        await assignStaff({
            account: departmentOwner,
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

        server = app.listen(0);
        baseUrl = `http://localhost:${server.address().port}`;

        for (const [key, login] of [
            ['admin', admin.user.username],
            ['requester', requester.user.username],
            ['owner', departmentOwner.user.username],
            ['director', raceDirector.user.username],
        ]) {
            const response = await api('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({ login, password: 'pass123' }),
            });
            assert.equal(response.status, 200);
            tokens[key] = response.body.data.accessToken;
        }
    });

    after(async () => {
        await resetDatabase();
        server?.close();
        await knex.destroy();
    });

    it('lists and acts on current user approval tasks through app routes', async () => {
        const started = await startApproval({
            orgId,
            raceId,
            userId: requester.user.id,
            requesterUserId: requester.user.id,
        }, {
            businessType: 'design_request',
            businessId: 'ROUTE-REQ-1',
            actionKey: 'submit',
            raceId,
            requesterUserId: requester.user.id,
            businessRecord: {
                org_id: orgId,
                race_id: raceId,
                requester_department: '竞赛部',
                title: '路线图主视觉',
            },
        });
        assert.equal(started.currentStep.stepKey, 'department_owner_review');

        const list = await api('/api/app/approvals/tasks?status=pending', {
            headers: authHeader('owner'),
        });
        assert.equal(list.status, 200);
        assert.equal(list.body.data.items.length, 1);
        assert.equal(list.body.data.items[0].step.stepKey, 'department_owner_review');

        const approve = await api(`/api/app/approvals/tasks/${list.body.data.items[0].id}/approve`, {
            method: 'POST',
            headers: authHeader('owner'),
            body: JSON.stringify({ comment: '可以设计' }),
        });
        assert.equal(approve.status, 200);
        assert.equal(approve.body.data.currentStep.stepKey, 'race_director_review');
    });

    it('manages race staff assignments through admin race routes', async () => {
        const [member] = await knex('team_members')
            .insert({
                org_id: orgId,
                employee_code: 'NEW-001',
                employee_name: '新增设计负责人',
                position: '设计负责人',
                department: '设计部',
                member_type: 'employee',
                id_number_ciphertext: Buffer.from('new-id'),
                id_number_iv: 'iv',
                id_number_auth_tag: 'tag',
                id_number_last4: '1234',
                contact_ciphertext: Buffer.from('new-contact'),
                contact_iv: 'iv',
                contact_auth_tag: 'tag',
                contact_last4: '5678',
                status: 'active',
            })
            .returning('*');

        const create = await api(`/api/admin/races/${raceId}/staff-assignments`, {
            method: 'POST',
            headers: authHeader('admin'),
            body: JSON.stringify({
                teamMemberId: member.id,
                roleKey: 'design_lead',
                roleName: '设计负责人',
                departmentScope: '设计部',
            }),
        });
        assert.equal(create.status, 201);
        assert.equal(create.body.data.roleKey, 'design_lead');
        assert.equal(create.body.data.employeeName, '新增设计负责人');

        const list = await api(`/api/admin/races/${raceId}/staff-assignments`, {
            headers: authHeader('admin'),
        });
        assert.equal(list.status, 200);
        assert.ok(list.body.data.items.some((item) => item.id === create.body.data.id));

        const forbidden = await api(`/api/admin/races/${raceId}/staff-assignments`, {
            method: 'POST',
            headers: authHeader('requester'),
            body: JSON.stringify({
                teamMemberId: member.id,
                roleKey: 'race_director',
                roleName: '赛事总监',
            }),
        });
        assert.equal(forbidden.status, 403);
    });
});
