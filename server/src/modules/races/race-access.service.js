import knex from '../../db/knex.js';

const READ_ONLY_METHODS = new Set(['GET', 'OPTIONS', 'HEAD']);

function badRequest(message) {
    return Object.assign(new Error(message), { status: 400, expose: true });
}

function forbidden(message) {
    return Object.assign(new Error(message), { status: 403, expose: true });
}

function notFound(message) {
    return Object.assign(new Error(message), { status: 404, expose: true });
}

export function normalizeRaceId(rawRaceId) {
    const raceId = Number(rawRaceId);
    if (!Number.isFinite(raceId) || raceId <= 0) {
        throw badRequest('无效 raceId');
    }
    return raceId;
}

export async function getRaceOwnerOrgId(raceId) {
    const race = await knex('races').where({ id: raceId }).first('id', 'org_id');
    if (!race) throw notFound('目标赛事不存在');
    return race.org_id;
}

export async function listVisibleRacesForOrg(orgId) {
    if (!orgId) return [];

    const rows = await knex('races as r')
        .leftJoin('org_race_permissions as grp', function joinOrgRacePermissions() {
            this.on('grp.race_id', '=', 'r.id').andOnVal('grp.org_id', '=', orgId);
        })
        .where(function whereVisible() {
            this.where('r.org_id', orgId).orWhereNotNull('grp.org_id');
        })
        .select(
            'r.id',
            'r.name',
            'r.date',
            'r.location',
            'r.org_id',
            'r.created_at',
            'grp.access_level as granted_access_level',
        )
        .orderBy('r.created_at', 'desc');

    return rows.map((row) => ({
        id: row.id,
        name: row.name,
        date: row.date,
        location: row.location,
        orgId: row.org_id,
        orgAccessLevel: row.org_id === orgId ? 'editor' : (row.granted_access_level || 'viewer'),
        source: row.org_id === orgId ? 'owned' : 'granted',
    }));
}

export async function resolveRaceAccess(authContext, rawRaceId, method) {
    const { userId, role, orgId: userOrgId } = authContext || {};
    if (!userId || !role) {
        throw Object.assign(new Error('未授权'), { status: 401, expose: true });
    }

    const raceId = normalizeRaceId(rawRaceId);
    const operatorOrgId = await getRaceOwnerOrgId(raceId);

    if (role === 'super_admin') {
        return {
            raceId,
            operatorOrgId,
            effectiveAccessLevel: 'editor',
            source: 'super_admin',
        };
    }

    if (!userOrgId) {
        throw forbidden('当前账号未绑定机构，无法操作赛事');
    }

    if (role === 'org_admin') {
        let accessLevel = null;
        let source = 'none';

        if (operatorOrgId === userOrgId) {
            accessLevel = 'editor';
            source = 'own_org';
        } else {
            const orgRacePermission = await knex('org_race_permissions')
                .where({ org_id: userOrgId, race_id: raceId })
                .first('access_level');
            accessLevel = orgRacePermission?.access_level || null;
            source = orgRacePermission ? 'org_grant' : 'none';
        }

        if (!accessLevel) {
            throw forbidden('无权操作该赛事');
        }

        if (accessLevel === 'viewer' && !READ_ONLY_METHODS.has(method)) {
            throw forbidden('机构赛事权限为只读，当前操作被拒绝');
        }

        return {
            raceId,
            operatorOrgId,
            effectiveAccessLevel: accessLevel,
            source,
        };
    }

    const query = knex('user_race_permissions')
        .where({ user_id: userId, race_id: raceId });
    if (userOrgId) query.andWhere({ org_id: userOrgId });
    const userRacePermission = await query.first('access_level');
    if (!userRacePermission) {
        throw forbidden('您未被授予该赛事权限');
    }

    let accessLevel = userRacePermission.access_level || 'viewer';
    if (role === 'race_viewer') {
        accessLevel = 'viewer';
    }

    if (accessLevel === 'viewer' && !READ_ONLY_METHODS.has(method)) {
        throw forbidden('只读权限，不可执行写入或删除操作');
    }

    return {
        raceId,
        operatorOrgId,
        effectiveAccessLevel: accessLevel,
        source: 'user_assignment',
    };
}
