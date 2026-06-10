import knex from '../../db/knex.js';

const ROLE_LABELS = {
    department_owner: '部门负责人',
    race_director: '赛事总监',
    design_lead: '设计负责人',
    design_designer: '设计师',
};

function httpError(status, message) {
    return Object.assign(new Error(message), { status, expose: true });
}

function normalizeString(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
}

function ensureEditor(context) {
    if (context.role === 'super_admin' || context.role === 'org_admin') return;
    if (context.raceAccess?.effectiveAccessLevel === 'editor') return;
    throw httpError(403, '当前用户无权维护赛事岗位');
}

function mapAssignment(row) {
    return {
        id: row.id,
        orgId: row.org_id,
        raceId: Number(row.race_id),
        teamMemberId: row.team_member_id,
        userId: row.user_id,
        roleKey: row.role_key,
        roleName: row.role_name,
        departmentScope: row.department_scope || null,
        moduleScope: row.module_scope || null,
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

function baseQuery() {
    return knex('race_staff_assignments as rsa')
        .leftJoin('team_members as tm', 'tm.id', 'rsa.team_member_id')
        .leftJoin('users as u', 'u.id', 'rsa.user_id')
        .select(
            'rsa.*',
            'tm.employee_code',
            'tm.employee_name',
            'tm.department as employee_department',
            'tm.position as employee_position',
            'u.username as account_username',
            'u.status as account_status',
        );
}

async function getRace(context, raceId) {
    const targetRaceId = Number(raceId);
    if (!Number.isFinite(targetRaceId) || targetRaceId <= 0) {
        throw httpError(400, 'Invalid raceId');
    }
    const orgId = context.raceAccess?.operatorOrgId || context.orgId;
    const race = await knex('races').where({ id: targetRaceId }).first('id', 'org_id');
    if (!race) throw httpError(404, '赛事不存在');
    if (context.role !== 'super_admin' && String(race.org_id) !== String(orgId)) {
        throw httpError(403, '无权访问该赛事');
    }
    return race;
}

export async function listStaffAssignments(context, raceId, filters = {}) {
    const race = await getRace(context, raceId);
    const query = baseQuery()
        .where('rsa.org_id', race.org_id)
        .where('rsa.race_id', race.id)
        .orderBy([{ column: 'rsa.role_key', order: 'asc' }, { column: 'rsa.created_at', order: 'asc' }]);

    if (filters.roleKey) query.where('rsa.role_key', filters.roleKey);
    if (filters.status) query.where('rsa.status', filters.status);

    const rows = await query;
    return {
        items: rows.map(mapAssignment),
        total: rows.length,
    };
}

export async function createStaffAssignment(context, raceId, payload = {}) {
    ensureEditor(context);
    const race = await getRace(context, raceId);
    const teamMemberId = normalizeString(payload.teamMemberId);
    const roleKey = normalizeString(payload.roleKey);
    const roleName = normalizeString(payload.roleName) || ROLE_LABELS[roleKey] || roleKey;
    if (!teamMemberId) throw httpError(400, '请选择人员');
    if (!roleKey) throw httpError(400, '请选择赛事岗位');

    const member = await knex('team_members')
        .where({ id: teamMemberId, org_id: race.org_id })
        .first('id', 'account_user_id', 'employee_name', 'status');
    if (!member) throw httpError(400, '人员不存在或不属于当前组织');
    if (member.status === 'archived') throw httpError(400, '已归档人员不能任命赛事岗位');

    const [row] = await knex('race_staff_assignments')
        .insert({
            org_id: race.org_id,
            race_id: race.id,
            team_member_id: member.id,
            user_id: member.account_user_id || null,
            role_key: roleKey,
            role_name: roleName,
            department_scope: normalizeString(payload.departmentScope) || null,
            module_scope: normalizeString(payload.moduleScope) || null,
            is_primary: payload.isPrimary === true,
            status: normalizeString(payload.status) || 'active',
            created_by: context.userId || null,
        })
        .returning('*');

    return mapAssignment(await baseQuery().where('rsa.id', row.id).first());
}

export async function updateStaffAssignment(context, raceId, assignmentId, payload = {}) {
    ensureEditor(context);
    const race = await getRace(context, raceId);
    const updatePayload = {};

    if (payload.roleKey !== undefined) updatePayload.role_key = normalizeString(payload.roleKey);
    if (payload.roleName !== undefined) updatePayload.role_name = normalizeString(payload.roleName);
    if (payload.departmentScope !== undefined) updatePayload.department_scope = normalizeString(payload.departmentScope) || null;
    if (payload.moduleScope !== undefined) updatePayload.module_scope = normalizeString(payload.moduleScope) || null;
    if (payload.isPrimary !== undefined) updatePayload.is_primary = payload.isPrimary === true;
    if (payload.status !== undefined) updatePayload.status = normalizeString(payload.status) || 'active';
    updatePayload.updated_at = knex.fn.now();

    const [row] = await knex('race_staff_assignments')
        .where({ id: assignmentId, race_id: race.id, org_id: race.org_id })
        .update(updatePayload)
        .returning('*');
    if (!row) throw httpError(404, '赛事岗位任命不存在');

    return mapAssignment(await baseQuery().where('rsa.id', row.id).first());
}

export async function archiveStaffAssignment(context, raceId, assignmentId) {
    return updateStaffAssignment(context, raceId, assignmentId, { status: 'archived' });
}
