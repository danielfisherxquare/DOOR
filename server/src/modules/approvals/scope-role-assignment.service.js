import knex from '../../db/knex.js';

const ROLE_LABELS = {
    department_owner: '部门负责人',
    race_director: '赛事总监',
    design_lead: '设计负责人',
    design_designer: '设计师',
};

const SCOPE_TYPES = new Set(['org', 'department', 'module', 'race', 'project']);

function httpError(status, message) {
    return Object.assign(new Error(message), { status, expose: true });
}

function normalizeString(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
}

function ensureEditor(context) {
    if (context.role === 'super_admin' || context.role === 'org_admin') return;
    throw httpError(403, '当前用户无权维护审批岗位');
}

function resolveOrgId(context, input = {}) {
    const orgId = context.orgId || input.orgId || input.org_id || null;
    if (!orgId) throw httpError(400, '缺少组织上下文');
    return orgId;
}

function mapAssignment(row) {
    return {
        id: row.id,
        orgId: row.org_id,
        scopeType: row.scope_type,
        scopeId: row.scope_id || null,
        moduleKey: row.module_key || null,
        departmentScope: row.department_scope || null,
        teamMemberId: row.team_member_id,
        userId: row.user_id || null,
        roleKey: row.role_key,
        roleName: row.role_name,
        isPrimary: row.is_primary === true,
        status: row.status,
        employeeCode: row.employee_code,
        employeeName: row.employee_name,
        employeeDepartment: row.employee_department,
        employeePosition: row.employee_position,
        accountUsername: row.account_username || null,
        accountStatus: row.account_status || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function baseQuery(trx = knex) {
    return trx('scope_role_assignments as sra')
        .leftJoin('team_members as tm', 'tm.id', 'sra.team_member_id')
        .leftJoin('users as u', 'u.id', 'sra.user_id')
        .select(
            'sra.*',
            'tm.employee_code',
            'tm.employee_name',
            'tm.department as employee_department',
            'tm.position as employee_position',
            'u.username as account_username',
            'u.status as account_status',
        );
}

async function validateRaceScope(trx, orgId, scopeType, scopeId) {
    if (scopeType !== 'race') return;
    const raceId = Number(scopeId);
    if (!raceId) throw httpError(400, '赛事岗位必须填写赛事 ID');
    const race = await trx('races').where({ id: raceId }).first('id', 'org_id');
    if (!race) throw httpError(404, '赛事不存在');
    if (String(race.org_id) !== String(orgId)) throw httpError(403, '赛事不属于当前组织');
}

function normalizeScopePayload(payload = {}) {
    const scopeType = normalizeString(payload.scopeType || payload.scope_type) || 'org';
    if (!SCOPE_TYPES.has(scopeType)) throw httpError(400, '审批岗位作用域不正确');
    const raceId = payload.raceId || payload.race_id || null;
    const scopeId = scopeType === 'race'
        ? normalizeString(payload.scopeId || payload.scope_id || raceId)
        : normalizeString(payload.scopeId || payload.scope_id) || null;
    return {
        scopeType,
        scopeId,
        moduleKey: normalizeString(payload.moduleKey || payload.module_key) || (scopeType === 'module' ? 'design_requests' : null),
        departmentScope: normalizeString(payload.departmentScope || payload.department_scope) || null,
    };
}

export async function listScopeRoleAssignments(context = {}, filters = {}) {
    const orgId = context.orgId || filters.orgId || filters.org_id || null;
    const query = baseQuery()
        .orderBy([
            { column: 'sra.scope_type', order: 'asc' },
            { column: 'sra.role_key', order: 'asc' },
            { column: 'sra.created_at', order: 'asc' },
        ]);
    if (orgId) {
        query.where('sra.org_id', orgId);
    } else if (context.role !== 'super_admin') {
        query.whereRaw('1 = 0');
    }

    if (filters.status) query.where('sra.status', filters.status);
    if (filters.roleKey) query.where('sra.role_key', filters.roleKey);
    if (filters.scopeType) query.where('sra.scope_type', filters.scopeType);
    if (filters.scopeId) query.where('sra.scope_id', String(filters.scopeId));
    if (filters.raceId) query.where('sra.scope_type', 'race').where('sra.scope_id', String(Number(filters.raceId)));
    if (filters.moduleKey) query.where('sra.module_key', filters.moduleKey);
    if (filters.departmentScope) query.where('sra.department_scope', filters.departmentScope);

    const rows = await query;
    return { items: rows.map(mapAssignment), total: rows.length };
}

export async function createScopeRoleAssignment(context = {}, payload = {}) {
    ensureEditor(context);
    const orgId = resolveOrgId(context, payload);
    const teamMemberId = normalizeString(payload.teamMemberId || payload.team_member_id);
    const roleKey = normalizeString(payload.roleKey || payload.role_key);
    const roleName = normalizeString(payload.roleName || payload.role_name) || ROLE_LABELS[roleKey] || roleKey;
    if (!teamMemberId) throw httpError(400, '请选择人员');
    if (!roleKey) throw httpError(400, '请选择审批岗位');

    return knex.transaction(async (trx) => {
        const scope = normalizeScopePayload(payload);
        await validateRaceScope(trx, orgId, scope.scopeType, scope.scopeId);
        const member = await trx('team_members')
            .where({ id: teamMemberId, org_id: orgId })
            .first('id', 'account_user_id', 'status');
        if (!member) throw httpError(400, '人员不存在或不属于当前组织');
        if (member.status === 'archived') throw httpError(400, '已归档人员不能任命审批岗位');

        const [row] = await trx('scope_role_assignments')
            .insert({
                org_id: orgId,
                scope_type: scope.scopeType,
                scope_id: scope.scopeId,
                module_key: scope.moduleKey,
                department_scope: scope.departmentScope,
                team_member_id: member.id,
                user_id: member.account_user_id || null,
                role_key: roleKey,
                role_name: roleName,
                is_primary: payload.isPrimary === true,
                status: normalizeString(payload.status) || 'active',
                created_by: context.userId || null,
            })
            .returning('*');

        return mapAssignment(await baseQuery(trx).where('sra.id', row.id).first());
    });
}

export async function updateScopeRoleAssignment(context = {}, assignmentId, payload = {}) {
    ensureEditor(context);
    const orgId = resolveOrgId(context, payload);
    return knex.transaction(async (trx) => {
        const existing = await trx('scope_role_assignments').where({ id: assignmentId, org_id: orgId }).first();
        if (!existing) throw httpError(404, '审批岗位不存在');
        const scope = normalizeScopePayload({
            scopeType: payload.scopeType ?? existing.scope_type,
            scopeId: payload.scopeId ?? existing.scope_id,
            moduleKey: payload.moduleKey ?? existing.module_key,
            departmentScope: payload.departmentScope ?? existing.department_scope,
        });
        await validateRaceScope(trx, orgId, scope.scopeType, scope.scopeId);

        const updatePayload = {
            scope_type: scope.scopeType,
            scope_id: scope.scopeId,
            module_key: scope.moduleKey,
            department_scope: scope.departmentScope,
            updated_at: trx.fn.now(),
        };
        if (payload.roleKey !== undefined) updatePayload.role_key = normalizeString(payload.roleKey);
        if (payload.roleName !== undefined) updatePayload.role_name = normalizeString(payload.roleName);
        if (payload.isPrimary !== undefined) updatePayload.is_primary = payload.isPrimary === true;
        if (payload.status !== undefined) updatePayload.status = normalizeString(payload.status) || 'active';

        const [row] = await trx('scope_role_assignments')
            .where({ id: assignmentId, org_id: orgId })
            .update(updatePayload)
            .returning('*');
        return mapAssignment(await baseQuery(trx).where('sra.id', row.id).first());
    });
}

export async function archiveScopeRoleAssignment(context = {}, assignmentId, payload = {}) {
    return updateScopeRoleAssignment(context, assignmentId, { ...payload, status: 'archived' });
}
