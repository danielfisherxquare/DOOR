import knex from '../../db/knex.js';

function normalizeString(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
}

function getConfigValue(step, key) {
    return step?.resolverConfig?.[key] ?? step?.resolver_config_json?.[key] ?? null;
}

function getDepartmentValue(step, businessRecord) {
    const field = getConfigValue(step, 'departmentField') || 'requester_department';
    return normalizeString(businessRecord?.[field]);
}

function buildBlocked(roleKey, departmentScope = '') {
    const scoped = departmentScope ? ` department=${departmentScope}` : '';
    return {
        status: 'blocked',
        approvers: [],
        missingRoleKey: roleKey,
        reason: `缺少赛事岗位: ${roleKey}${scoped}`,
    };
}

function mapApprover(row) {
    return {
        assignmentId: row.assignment_id,
        userId: row.user_id,
        teamMemberId: row.team_member_id,
        roleKey: row.role_key,
        roleName: row.role_name,
        departmentScope: row.department_scope || null,
        moduleScope: row.module_scope || null,
        employeeName: row.employee_name,
        employeeCode: row.employee_code,
        department: row.department,
        position: row.position,
        username: row.username,
    };
}

export async function resolveApprovers(context = {}, step = {}, businessRecord = {}, trx = knex) {
    const orgId = context.orgId || businessRecord.org_id || businessRecord.orgId;
    const raceId = Number(context.raceId || businessRecord.race_id || businessRecord.raceId);
    const roleKey = normalizeString(getConfigValue(step, 'roleKey'));

    if (!orgId || !raceId || !roleKey) {
        return buildBlocked(roleKey || 'unknown');
    }

    const query = trx('race_staff_assignments as rsa')
        .join('team_members as tm', 'tm.id', 'rsa.team_member_id')
        .join('users as u', 'u.id', 'rsa.user_id')
        .where('rsa.org_id', orgId)
        .where('rsa.race_id', raceId)
        .where('rsa.role_key', roleKey)
        .where('rsa.status', 'active')
        .where('tm.status', 'active')
        .where('u.status', 'active')
        .whereNotNull('rsa.user_id')
        .select(
            'rsa.id as assignment_id',
            'rsa.user_id',
            'rsa.team_member_id',
            'rsa.role_key',
            'rsa.role_name',
            'rsa.department_scope',
            'rsa.module_scope',
            'rsa.is_primary',
            'tm.employee_name',
            'tm.employee_code',
            'tm.department',
            'tm.position',
            'u.username',
        )
        .orderBy([{ column: 'rsa.is_primary', order: 'desc' }, { column: 'rsa.created_at', order: 'asc' }]);

    let departmentScope = '';
    if (step.resolverType === 'race_staff_department_role' || step.resolver_type === 'race_staff_department_role') {
        departmentScope = getDepartmentValue(step, businessRecord);
        if (!departmentScope) {
            return buildBlocked(roleKey);
        }
        query.where('rsa.department_scope', departmentScope);
    }

    if (step.resolverType !== 'race_staff_role'
        && step.resolverType !== 'race_staff_department_role'
        && step.resolver_type !== 'race_staff_role'
        && step.resolver_type !== 'race_staff_department_role') {
        return buildBlocked(roleKey);
    }

    const rows = await query;
    const requesterUserId = context.requesterUserId || businessRecord.created_by || businessRecord.createdBy;
    const approvers = rows
        .filter((row) => !(step.excludeRequester || step.exclude_requester)
            || String(row.user_id) !== String(requesterUserId || ''))
        .map(mapApprover);

    if (approvers.length === 0) {
        return buildBlocked(roleKey, departmentScope);
    }

    return {
        status: 'ready',
        approvers,
    };
}
