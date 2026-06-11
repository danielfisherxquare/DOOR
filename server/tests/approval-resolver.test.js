import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door_test';
process.env.DATABASE_URL = DATABASE_URL;
process.env.NODE_ENV = 'test';

const { default: knex } = await import('../src/db/knex.js');
const { resolveApprovers } = await import('../src/modules/approvals/approval-resolver.service.js');

let orgId;
let raceId;
let requesterId;
let departmentOwnerUserId;
let raceDirectorUserId;

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

async function createAssignment({ member, user, roleKey, roleName, departmentScope = null, status = 'active' }) {
    const [assignment] = await knex('race_staff_assignments')
        .insert({
            org_id: orgId,
            race_id: raceId,
            team_member_id: member.id,
            user_id: user.id,
            role_key: roleKey,
            role_name: roleName,
            department_scope: departmentScope,
            status,
        })
        .returning('*');
    return assignment;
}

async function createScopeAssignment({
    member,
    user,
    roleKey,
    roleName,
    scopeType = 'org',
    scopeId = null,
    departmentScope = null,
    moduleKey = null,
    status = 'active',
}) {
    const [assignment] = await knex('scope_role_assignments')
        .insert({
            org_id: orgId,
            scope_type: scopeType,
            scope_id: scopeId,
            team_member_id: member.id,
            user_id: user.id,
            role_key: roleKey,
            role_name: roleName,
            department_scope: departmentScope,
            module_key: moduleKey,
            status,
        })
        .returning('*');
    return assignment;
}

describe('approval resolver', () => {
    before(async () => {
        await knex.migrate.latest();
        await resetDatabase();

        const [org] = await knex('organizations')
            .insert({ name: 'Approval Resolver Org', slug: 'approval-resolver-org' })
            .returning('*');
        orgId = org.id;

        const [race] = await knex('races')
            .insert({
                org_id: orgId,
                name: 'Approval Resolver Race',
                date: '2026-07-11',
                location: 'Chengdu',
            })
            .returning('*');
        raceId = Number(race.id);

        const requester = await createTeamAccount({
            employeeCode: 'REQ-001',
            employeeName: '提报人',
            department: '竞赛部',
            position: '执行',
            username: 'approval_requester',
        });
        requesterId = requester.user.id;

        const departmentOwner = await createTeamAccount({
            employeeCode: 'OWN-001',
            employeeName: '竞赛部负责人',
            department: '竞赛部',
            position: '部门负责人',
            username: 'approval_department_owner',
        });
        departmentOwnerUserId = departmentOwner.user.id;

        const raceDirector = await createTeamAccount({
            employeeCode: 'DIR-001',
            employeeName: '赛事总监',
            department: '赛事管理',
            position: '赛事总监',
            username: 'approval_race_director',
        });
        raceDirectorUserId = raceDirector.user.id;

        await createAssignment({
            member: departmentOwner.member,
            user: departmentOwner.user,
            roleKey: 'department_owner',
            roleName: '部门负责人',
            departmentScope: '竞赛部',
        });
        await createAssignment({
            member: requester.member,
            user: requester.user,
            roleKey: 'department_owner',
            roleName: '部门负责人',
            departmentScope: '竞赛部',
        });
        await createAssignment({
            member: raceDirector.member,
            user: raceDirector.user,
            roleKey: 'race_director',
            roleName: '赛事总监',
        });
        await createScopeAssignment({
            member: departmentOwner.member,
            user: departmentOwner.user,
            roleKey: 'department_owner',
            roleName: '部门负责人',
            scopeType: 'department',
            departmentScope: '竞赛部',
        });
        await createScopeAssignment({
            member: raceDirector.member,
            user: raceDirector.user,
            roleKey: 'race_director',
            roleName: '赛事总监',
            scopeType: 'org',
        });
    });

    after(async () => {
        await resetDatabase();
        await knex.destroy();
    });

    it('resolves department owners by race role and requester department while excluding requester', async () => {
        const result = await resolveApprovers(
            { orgId, raceId, requesterUserId: requesterId },
            {
                resolverType: 'race_staff_department_role',
                resolverConfig: {
                    roleKey: 'department_owner',
                    departmentField: 'requester_department',
                },
                excludeRequester: true,
            },
            {
                requester_department: '竞赛部',
            },
        );

        assert.equal(result.status, 'ready');
        assert.equal(result.approvers.length, 1);
        assert.equal(String(result.approvers[0].userId), String(departmentOwnerUserId));
        assert.equal(result.approvers[0].roleKey, 'department_owner');
        assert.equal(result.approvers[0].departmentScope, '竞赛部');
    });

    it('resolves race director approvers by race role', async () => {
        const result = await resolveApprovers(
            { orgId, raceId, requesterUserId: requesterId },
            {
                resolverType: 'race_staff_role',
                resolverConfig: {
                    roleKey: 'race_director',
                },
                excludeRequester: true,
            },
            {
                requester_department: '竞赛部',
            },
        );

        assert.equal(result.status, 'ready');
        assert.equal(result.approvers.length, 1);
        assert.equal(String(result.approvers[0].userId), String(raceDirectorUserId));
    });

    it('blocks approval resolution when the required race post is missing', async () => {
        await knex('race_staff_assignments')
            .where({ race_id: raceId, role_key: 'race_director' })
            .update({ status: 'inactive' });

        const result = await resolveApprovers(
            { orgId, raceId, requesterUserId: requesterId },
            {
                resolverType: 'race_staff_role',
                resolverConfig: {
                    roleKey: 'race_director',
                },
                excludeRequester: true,
            },
            {
                requester_department: '竞赛部',
            },
        );

        assert.equal(result.status, 'blocked');
        assert.equal(result.missingRoleKey, 'race_director');
        assert.match(result.reason, /race_director/);
    });

    it('resolves department owners from organization scope when no race is selected', async () => {
        const result = await resolveApprovers(
            { orgId, requesterUserId: requesterId },
            {
                resolverType: 'race_staff_department_role',
                resolverConfig: {
                    roleKey: 'department_owner',
                    departmentField: 'requester_department',
                },
                excludeRequester: true,
            },
            {
                requester_department: '竞赛部',
            },
        );

        assert.equal(result.status, 'ready');
        assert.equal(result.approvers.length, 1);
        assert.equal(String(result.approvers[0].userId), String(departmentOwnerUserId));
        assert.equal(result.approvers[0].scopeType, 'department');
        assert.equal(result.approvers[0].departmentScope, '竞赛部');
    });

    it('falls back to organization role assignments when a race role is not required', async () => {
        const result = await resolveApprovers(
            { orgId, requesterUserId: requesterId },
            {
                resolverType: 'race_staff_role',
                resolverConfig: {
                    roleKey: 'race_director',
                },
                excludeRequester: true,
            },
            {
                requester_department: '竞赛部',
            },
        );

        assert.equal(result.status, 'ready');
        assert.equal(result.approvers.length, 1);
        assert.equal(String(result.approvers[0].userId), String(raceDirectorUserId));
        assert.equal(result.approvers[0].scopeType, 'org');
    });
});
