import knex from '../../db/knex.js';

export async function listTeamMembers(orgId, {
    page = 1,
    limit = 20,
    keyword = '',
    department = '',
    memberType = '',
    externalEngagementType = '',
    status = '',
    hasAccount = '',
}) {
    const query = knex('team_members as tm')
        .leftJoin('users as u', 'u.id', 'tm.account_user_id')
        .where('tm.org_id', orgId);

    if (keyword) {
        query.andWhere(function () {
            this.where('tm.employee_code', 'ilike', `%${keyword}%`)
                .orWhere('tm.employee_name', 'ilike', `%${keyword}%`)
                .orWhere('tm.position', 'ilike', `%${keyword}%`)
                .orWhere('tm.department', 'ilike', `%${keyword}%`);
        });
    }
    if (department) query.andWhere('tm.department', department);
    if (memberType) query.andWhere('tm.member_type', memberType);
    if (externalEngagementType) query.andWhere('tm.external_engagement_type', externalEngagementType);
    if (status) query.andWhere('tm.status', status);
    if (hasAccount === 'true') query.andWhereNotNull('tm.account_user_id');
    if (hasAccount === 'false') query.andWhereNull('tm.account_user_id');

    const total = await query.clone().clearSelect().count('tm.id as count').first().then((row) => Number(row?.count || 0));
    const items = await query
        .select(
            'tm.*',
            'u.username as account_username',
            'u.role as account_role',
            'u.status as account_status',
            'u.account_source',
            'u.must_change_password',
        )
        .orderBy('tm.created_at', 'desc')
        .offset((page - 1) * limit)
        .limit(limit);

    return { items, total, page, limit };
}

export async function listSelectableTeamMembers(orgId, keyword = '') {
    const query = knex('team_members')
        .where({ org_id: orgId })
        .whereIn('status', ['active', 'inactive']);

    if (keyword) {
        query.andWhere(function () {
            this.where('employee_code', 'ilike', `%${keyword}%`)
                .orWhere('employee_name', 'ilike', `%${keyword}%`)
                .orWhere('position', 'ilike', `%${keyword}%`)
                .orWhere('department', 'ilike', `%${keyword}%`);
        });
    }

    return query.orderBy([{ column: 'employee_code', order: 'asc' }, { column: 'employee_name', order: 'asc' }]);
}

export async function findTeamMemberById(orgId, teamMemberId, trx = knex) {
    return trx('team_members as tm')
        .leftJoin('users as u', 'u.id', 'tm.account_user_id')
        .where('tm.org_id', orgId)
        .andWhere('tm.id', teamMemberId)
        .select(
            'tm.*',
            'u.username as account_username',
            'u.role as account_role',
            'u.status as account_status',
            'u.account_source',
            'u.must_change_password',
        )
        .first();
}

export async function findTeamMemberByEmployeeCode(orgId, employeeCode, trx = knex) {
    return trx('team_members').where({ org_id: orgId, employee_code: employeeCode }).first();
}

export async function createTeamMember(data, trx = knex) {
    const [row] = await trx('team_members').insert(data).returning('*');
    return row;
}

const TEAM_MEMBER_UPDATABLE_FIELDS = [
    'employee_name', 'employee_code', 'department', 'position',
    'member_type', 'external_engagement_type', 'phone', 'email',
    'id_card', 'bank_account', 'bank_name', 'status', 'notes',
];

export async function updateTeamMember(orgId, teamMemberId, data, trx = knex) {
    const updateData = {};
    for (const key of TEAM_MEMBER_UPDATABLE_FIELDS) {
        if (data[key] !== undefined) updateData[key] = data[key];
    }
    // account_user_id 仅允许通过专门的关联函数设置
    if (data.account_user_id !== undefined) updateData.account_user_id = data.account_user_id;

    const [row] = await trx('team_members')
        .where({ id: teamMemberId, org_id: orgId })
        .update({ ...updateData, updated_at: trx.fn.now() })
        .returning('*');
    return row;
}

export async function createUserForTeamMember(data, trx = knex) {
    const [row] = await trx('users').insert(data).returning('*');
    return row;
}

const USER_UPDATABLE_FIELDS = [
    'username', 'email', 'password_hash', 'role', 'status',
    'must_change_password', 'account_source',
];

export async function updateUser(userId, data, trx = knex) {
    const updateData = {};
    for (const key of USER_UPDATABLE_FIELDS) {
        if (data[key] !== undefined) updateData[key] = data[key];
    }

    const [row] = await trx('users')
        .where({ id: userId })
        .update({ ...updateData, updated_at: trx.fn.now() })
        .returning('*');
    return row;
}

export async function listOrgSummary(orgId) {
    const [teamCount, employeeCount, externalCount, accountCount] = await Promise.all([
        knex('team_members').where({ org_id: orgId }).count('* as count').first(),
        knex('team_members').where({ org_id: orgId, member_type: 'employee' }).count('* as count').first(),
        knex('team_members').where({ org_id: orgId, member_type: 'external_support' }).count('* as count').first(),
        knex('team_members').where({ org_id: orgId }).whereNotNull('account_user_id').count('* as count').first(),
    ]);

    return {
        teamMemberCount: Number(teamCount?.count || 0),
        employeeCount: Number(employeeCount?.count || 0),
        externalSupportCount: Number(externalCount?.count || 0),
        loginAccountCount: Number(accountCount?.count || 0),
    };
}
