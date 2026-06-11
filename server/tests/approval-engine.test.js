import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door_test';
process.env.DATABASE_URL = DATABASE_URL;
process.env.NODE_ENV = 'test';

const { default: knex } = await import('../src/db/knex.js');
const {
    startApproval,
    actOnTask,
    getCurrentApprovalForBusiness,
    listMyApprovalTasks,
} = await import('../src/modules/approvals/approval.service.js');

let orgId;
let raceId;
let requester;
let departmentOwner;
let raceDirector;
let designLead;
let designer;

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

async function seedBaseData({ requesterIsDepartmentOwner = false, includeRaceDirector = true } = {}) {
    const [org] = await knex('organizations')
        .insert({ name: `Approval Engine Org ${Date.now()}`, slug: `approval-engine-${Date.now()}` })
        .returning('*');
    orgId = org.id;

    const [race] = await knex('races')
        .insert({
            org_id: orgId,
            name: 'Approval Engine Race',
            date: '2026-07-12',
            location: 'Chengdu',
        })
        .returning('*');
    raceId = Number(race.id);

    requester = await createTeamAccount({
        employeeCode: 'REQ-001',
        employeeName: '提报人',
        department: '竞赛部',
        position: '执行',
        username: `approval_requester_${Date.now()}`,
    });
    departmentOwner = requesterIsDepartmentOwner
        ? requester
        : await createTeamAccount({
            employeeCode: 'OWN-001',
            employeeName: '竞赛部负责人',
            department: '竞赛部',
            position: '部门负责人',
            username: `approval_owner_${Date.now()}`,
        });
    raceDirector = await createTeamAccount({
        employeeCode: 'DIR-001',
        employeeName: '赛事总监',
        department: '赛事管理',
        position: '赛事总监',
        username: `approval_director_${Date.now()}`,
    });
    designLead = await createTeamAccount({
        employeeCode: 'LEAD-001',
        employeeName: '设计负责人',
        department: '设计部',
        position: '设计负责人',
        username: `approval_design_lead_${Date.now()}`,
    });
    designer = await createTeamAccount({
        employeeCode: 'DES-001',
        employeeName: '设计师',
        department: '设计部',
        position: '设计师',
        username: `approval_designer_${Date.now()}`,
    });

    await assignStaff({
        account: departmentOwner,
        roleKey: 'department_owner',
        roleName: '部门负责人',
        departmentScope: '竞赛部',
    });
    if (includeRaceDirector) {
        await assignStaff({
            account: raceDirector,
            roleKey: 'race_director',
            roleName: '赛事总监',
        });
    }
    await assignStaff({
        account: designLead,
        roleKey: 'design_lead',
        roleName: '设计负责人',
    });
    await assignStaff({
        account: designer,
        roleKey: 'design_designer',
        roleName: '设计师',
    });
    await assignScopeRole({
        account: departmentOwner,
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
}

function businessRecord() {
    return {
        org_id: orgId,
        race_id: raceId,
        requester_department: '竞赛部',
        title: '奖牌主视觉',
    };
}

describe('approval engine service', () => {
    beforeEach(async () => {
        await knex.migrate.latest();
        await resetDatabase();
    });

    after(async () => {
        await resetDatabase();
        await knex.destroy();
    });

    it('runs design request approval through department owner, race director, and design lead assignment', async () => {
        await seedBaseData();

        const started = await startApproval({
            orgId,
            raceId,
            userId: requester.user.id,
            requesterUserId: requester.user.id,
        }, {
            businessType: 'design_request',
            businessId: 'REQ-1001',
            actionKey: 'submit',
            raceId,
            requesterUserId: requester.user.id,
            businessRecord: businessRecord(),
        });

        assert.equal(started.status, 'pending');
        assert.equal(started.currentStep.stepKey, 'department_owner_review');
        assert.equal(started.pendingTasks.length, 1);
        assert.equal(String(started.pendingTasks[0].assignedUserId), String(departmentOwner.user.id));

        const ownerTasks = await listMyApprovalTasks({ orgId, userId: departmentOwner.user.id }, { status: 'pending' });
        assert.equal(ownerTasks.items.length, 1);

        const afterOwner = await actOnTask(
            { orgId, userId: departmentOwner.user.id },
            started.pendingTasks[0].id,
            { action: 'approve', comment: '需求完整' },
        );
        assert.equal(afterOwner.status, 'pending');
        assert.equal(afterOwner.currentStep.stepKey, 'race_director_review');
        assert.equal(String(afterOwner.pendingTasks[0].assignedUserId), String(raceDirector.user.id));

        const afterDirector = await actOnTask(
            { orgId, userId: raceDirector.user.id },
            afterOwner.pendingTasks[0].id,
            { action: 'approve', comment: '同意执行' },
        );
        assert.equal(afterDirector.status, 'pending');
        assert.equal(afterDirector.currentStep.stepKey, 'design_lead_assignment');
        assert.equal(String(afterDirector.pendingTasks[0].assignedUserId), String(designLead.user.id));

        await assert.rejects(
            () => actOnTask(
                { orgId, userId: designLead.user.id },
                afterDirector.pendingTasks[0].id,
                { action: 'assign', comment: '缺少设计师' },
            ),
            /分派任务必须指定设计师/,
        );

        const completed = await actOnTask(
            { orgId, userId: designLead.user.id },
            afterDirector.pendingTasks[0].id,
            {
                action: 'assign',
                comment: '分派给设计师',
                assignedDesignerId: designer.user.id,
            },
        );
        assert.equal(completed.status, 'approved');
        assert.equal(completed.result.assignedDesignerId, designer.user.id);
        assert.equal(completed.pendingTasks.length, 0);

        const current = await getCurrentApprovalForBusiness(
            { orgId, userId: requester.user.id },
            { businessType: 'design_request', businessId: 'REQ-1001' },
        );
        assert.equal(current.status, 'approved');

        const events = await knex('approval_events')
            .where({ instance_id: completed.id })
            .orderBy('created_at', 'asc')
            .pluck('event_type');
        assert.ok(events.includes('started'));
        assert.ok(events.includes('task_created'));
        assert.ok(events.includes('approved'));
        assert.ok(events.includes('assigned'));
        assert.ok(events.includes('completed'));
    });

    it('blocks the instance when a required race post is missing', async () => {
        await seedBaseData({ includeRaceDirector: false });

        const started = await startApproval({
            orgId,
            raceId,
            userId: requester.user.id,
            requesterUserId: requester.user.id,
        }, {
            businessType: 'design_request',
            businessId: 'REQ-1002',
            actionKey: 'submit',
            raceId,
            requesterUserId: requester.user.id,
            businessRecord: businessRecord(),
        });

        const afterOwner = await actOnTask(
            { orgId, userId: departmentOwner.user.id },
            started.pendingTasks[0].id,
            { action: 'approve' },
        );

        assert.equal(afterOwner.status, 'blocked');
        assert.match(afterOwner.blockedReason, /race_director/);
    });

    it('prevents requester from approving their own excluded step', async () => {
        await seedBaseData({ requesterIsDepartmentOwner: true });

        const started = await startApproval({
            orgId,
            raceId,
            userId: requester.user.id,
            requesterUserId: requester.user.id,
        }, {
            businessType: 'design_request',
            businessId: 'REQ-1003',
            actionKey: 'submit',
            raceId,
            requesterUserId: requester.user.id,
            businessRecord: businessRecord(),
        });

        assert.equal(started.status, 'blocked');
        assert.match(started.blockedReason, /department_owner/);
    });

    it('rejects and requests changes from approval tasks', async () => {
        await seedBaseData();

        const rejected = await startApproval({
            orgId,
            raceId,
            userId: requester.user.id,
            requesterUserId: requester.user.id,
        }, {
            businessType: 'design_request',
            businessId: 'REQ-1004',
            actionKey: 'submit',
            raceId,
            requesterUserId: requester.user.id,
            businessRecord: businessRecord(),
        });
        const afterReject = await actOnTask(
            { orgId, userId: departmentOwner.user.id },
            rejected.pendingTasks[0].id,
            { action: 'reject', comment: '需求不成立' },
        );
        assert.equal(afterReject.status, 'rejected');

        const changes = await startApproval({
            orgId,
            raceId,
            userId: requester.user.id,
            requesterUserId: requester.user.id,
        }, {
            businessType: 'design_request',
            businessId: 'REQ-1005',
            actionKey: 'submit',
            raceId,
            requesterUserId: requester.user.id,
            businessRecord: businessRecord(),
        });
        const afterChanges = await actOnTask(
            { orgId, userId: departmentOwner.user.id },
            changes.pendingTasks[0].id,
            { action: 'request_changes', comment: '补充参考图' },
        );
        assert.equal(afterChanges.status, 'needs_info');
    });

    it('runs organization-level design approval without requiring a race director', async () => {
        await seedBaseData({ includeRaceDirector: false });

        const started = await startApproval({
            orgId,
            userId: requester.user.id,
            requesterUserId: requester.user.id,
        }, {
            businessType: 'design_request',
            businessId: 'REQ-ORG-1001',
            actionKey: 'submit',
            requesterUserId: requester.user.id,
            businessRecord: {
                org_id: orgId,
                requester_department: '竞赛部',
                title: '组织级品牌模板',
            },
        });

        assert.equal(started.status, 'pending');
        assert.equal(started.raceId, null);
        assert.equal(started.currentStep.stepKey, 'department_owner_review');
        assert.equal(String(started.pendingTasks[0].assignedUserId), String(departmentOwner.user.id));

        const afterOwner = await actOnTask(
            { orgId, userId: departmentOwner.user.id },
            started.pendingTasks[0].id,
            { action: 'approve', comment: '组织级需求完整' },
        );
        assert.equal(afterOwner.status, 'pending');
        assert.equal(afterOwner.currentStep.stepKey, 'design_lead_assignment');
        assert.equal(String(afterOwner.pendingTasks[0].assignedUserId), String(designLead.user.id));

        const completed = await actOnTask(
            { orgId, userId: designLead.user.id },
            afterOwner.pendingTasks[0].id,
            {
                action: 'assign',
                comment: '分派给设计师',
                assignedDesignerId: designer.user.id,
            },
        );
        assert.equal(completed.status, 'approved');
        assert.equal(completed.raceId, null);
        assert.equal(completed.result.assignedDesignerId, designer.user.id);
    });
});
