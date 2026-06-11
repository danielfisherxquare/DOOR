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
        reason: `缺少审批岗位: ${roleKey}${scoped}`,
    };
}

function mapApprover(row) {
    return {
        assignmentId: row.assignment_id,
        userId: row.user_id,
        teamMemberId: row.team_member_id,
        scopeType: row.scope_type || null,
        scopeId: row.scope_id || null,
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

function resolverKind(step) {
    return step.resolverType || step.resolver_type || '';
}

function moduleKeyFor(step, businessRecord, roleKey) {
    return normalizeString(getConfigValue(step, 'moduleKey'))
        || normalizeString(businessRecord?.module_key)
        || normalizeString(businessRecord?.moduleKey)
        || (String(roleKey || '').startsWith('design_') ? 'design_requests' : '');
}

function applyRequesterExclusion(rows, step, requesterUserId) {
    return rows
        .filter((row) => !(step.excludeRequester || step.exclude_requester)
            || String(row.user_id) !== String(requesterUserId || ''))
        .map(mapApprover);
}

function baseScopeQuery(trx, orgId, roleKey) {
    return trx('scope_role_assignments as sra')
        .join('team_members as tm', 'tm.id', 'sra.team_member_id')
        .join('users as u', 'u.id', 'sra.user_id')
        .where('sra.org_id', orgId)
        .where('sra.role_key', roleKey)
        .where('sra.status', 'active')
        .where('tm.status', 'active')
        .where('u.status', 'active')
        .whereNotNull('sra.user_id')
        .select(
            'sra.id as assignment_id',
            'sra.user_id',
            'sra.team_member_id',
            'sra.scope_type',
            'sra.scope_id',
            'sra.role_key',
            'sra.role_name',
            'sra.department_scope',
            'sra.module_key as module_scope',
            'sra.is_primary',
            'tm.employee_name',
            'tm.employee_code',
            'tm.department',
            'tm.position',
            'u.username',
        )
        .orderBy([{ column: 'sra.is_primary', order: 'desc' }, { column: 'sra.created_at', order: 'asc' }]);
}

async function resolveScopeApprovers({ trx, orgId, raceId, roleKey, departmentScope, moduleKey, requesterUserId, step }) {
    const candidates = [];
    if (raceId) {
        candidates.push((query) => query.where('sra.scope_type', 'race').where('sra.scope_id', String(raceId)));
    }
    if (departmentScope) {
        candidates.push((query) => query.where('sra.scope_type', 'department').where('sra.department_scope', departmentScope));
    }
    if (moduleKey) {
        candidates.push((query) => query.where('sra.scope_type', 'module').where('sra.module_key', moduleKey));
    }
    candidates.push((query) => query.where('sra.scope_type', 'org'));

    for (const applyCandidate of candidates) {
        const query = baseScopeQuery(trx, orgId, roleKey);
        applyCandidate(query);
        const rows = await query;
        const approvers = applyRequesterExclusion(rows, step, requesterUserId);
        if (approvers.length > 0) return approvers;
        if (raceId && roleKey === 'race_director') return [];
    }
    return [];
}

async function resolveLegacyRaceStaff({ trx, orgId, raceId, roleKey, departmentScope, requesterUserId, step }) {
    if (!raceId) return [];
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
            trx.raw("'race' as scope_type"),
            trx.raw('rsa.race_id::text as scope_id'),
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
    if (departmentScope) query.where('rsa.department_scope', departmentScope);
    const rows = await query;
    return applyRequesterExclusion(rows, step, requesterUserId);
}

export async function resolveApprovers(context = {}, step = {}, businessRecord = {}, trx = knex) {
    const orgId = context.orgId || businessRecord.org_id || businessRecord.orgId;
    const rawRaceId = context.raceId || businessRecord.primary_race_id || businessRecord.primaryRaceId || businessRecord.race_id || businessRecord.raceId;
    const raceId = rawRaceId ? Number(rawRaceId) : null;
    const roleKey = normalizeString(getConfigValue(step, 'roleKey'));

    if (!orgId || !roleKey) {
        return buildBlocked(roleKey || 'unknown');
    }

    let departmentScope = '';
    if (resolverKind(step) === 'race_staff_department_role') {
        departmentScope = getDepartmentValue(step, businessRecord);
        if (!departmentScope) {
            return buildBlocked(roleKey);
        }
    }

    if (resolverKind(step) !== 'race_staff_role'
        && resolverKind(step) !== 'race_staff_department_role') {
        return buildBlocked(roleKey);
    }

    const requesterUserId = context.requesterUserId || businessRecord.created_by || businessRecord.createdBy;
    const moduleKey = moduleKeyFor(step, businessRecord, roleKey);
    let approvers = await resolveScopeApprovers({
        trx,
        orgId,
        raceId,
        roleKey,
        departmentScope,
        moduleKey,
        requesterUserId,
        step,
    });

    if (approvers.length === 0) {
        approvers = await resolveLegacyRaceStaff({
            trx,
            orgId,
            raceId,
            roleKey,
            departmentScope,
            requesterUserId,
            step,
        });
    }

    if (approvers.length === 0) {
        return buildBlocked(roleKey, departmentScope);
    }

    return {
        status: 'ready',
        approvers,
    };
}
