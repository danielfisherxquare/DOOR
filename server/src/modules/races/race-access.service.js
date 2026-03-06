import knex from '../../db/knex.js';

const READ_ONLY_METHODS = new Set(['GET', 'OPTIONS', 'HEAD']);
const ACCESS_LEVEL_WEIGHT = {
    viewer: 1,
    editor: 2,
};

function badRequest(message) {
    return Object.assign(new Error(message), { status: 400, expose: true });
}

function forbidden(message) {
    return Object.assign(new Error(message), { status: 403, expose: true });
}

function notFound(message) {
    return Object.assign(new Error(message), { status: 404, expose: true });
}

function normalizeAccessLevel(accessLevel) {
    if (accessLevel === 'editor') return 'editor';
    if (accessLevel === 'viewer') return 'viewer';
    return null;
}

function capAccessLevelByRole(role, accessLevel) {
    const normalized = normalizeAccessLevel(accessLevel);
    if (!normalized) return null;
    if (role === 'race_viewer') return 'viewer';
    return normalized;
}

function pickStricterAccessLevel(left, right) {
    const normalizedLeft = normalizeAccessLevel(left);
    const normalizedRight = normalizeAccessLevel(right);
    const leftWeight = normalizedLeft ? ACCESS_LEVEL_WEIGHT[normalizedLeft] : 0;
    const rightWeight = normalizedRight ? ACCESS_LEVEL_WEIGHT[normalizedRight] : 0;

    if (!leftWeight) return normalizedRight;
    if (!rightWeight) return normalizedLeft;
    return leftWeight <= rightWeight ? normalizedLeft : normalizedRight;
}

export function normalizeRaceId(rawRaceId) {
    const raceId = Number(rawRaceId);
    if (!Number.isFinite(raceId) || raceId <= 0) {
        throw badRequest('Invalid raceId');
    }
    return raceId;
}

export async function getRaceOwnerOrgId(raceId) {
    const race = await knex('races').where({ id: raceId }).first('id', 'org_id');
    if (!race) throw notFound('Target race not found');
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

async function getOrgRaceAccess(orgId, raceId, ownerOrgId = null) {
    if (!orgId) {
        return { accessLevel: null, source: 'none' };
    }

    const resolvedOwnerOrgId = ownerOrgId ?? await getRaceOwnerOrgId(raceId);
    if (resolvedOwnerOrgId === orgId) {
        return { accessLevel: 'editor', source: 'own_org' };
    }

    const row = await knex('org_race_permissions')
        .where({ org_id: orgId, race_id: raceId })
        .first('access_level');

    return {
        accessLevel: normalizeAccessLevel(row?.access_level),
        source: row ? 'org_grant' : 'none',
    };
}

async function getExplicitUserRaceAccess(userId, orgId, raceId) {
    if (!userId || !orgId) return null;

    const row = await knex('user_race_permissions')
        .where({ user_id: userId, org_id: orgId, race_id: raceId })
        .first('access_level');

    return normalizeAccessLevel(row?.access_level);
}

export async function listEffectiveRacePermissionsForUser(authContext) {
    const { userId, role, orgId } = authContext || {};
    if (!userId || !role) return [];

    if (role === 'super_admin') {
        const rows = await knex('races')
            .select('id')
            .orderBy('created_at', 'desc');

        return rows.map((row) => ({
            raceId: row.id,
            accessLevel: 'editor',
            source: 'super_admin',
        }));
    }

    if (!orgId) return [];

    const visibleRaces = await listVisibleRacesForOrg(orgId);
    if (visibleRaces.length === 0) return [];

    if (role === 'org_admin') {
        return visibleRaces.map((race) => ({
            raceId: race.id,
            accessLevel: race.orgAccessLevel,
            source: race.source,
        }));
    }

    const explicitRows = await knex('user_race_permissions')
        .where({ user_id: userId, org_id: orgId })
        .whereIn('race_id', visibleRaces.map((race) => race.id))
        .select('race_id', 'access_level');
    const explicitMap = new Map(
        explicitRows.map((row) => [Number(row.race_id), normalizeAccessLevel(row.access_level)]),
    );

    return visibleRaces
        .map((race) => {
            const inheritedAccessLevel = capAccessLevelByRole(role, race.orgAccessLevel);
            const explicitAccessLevel = capAccessLevelByRole(role, explicitMap.get(Number(race.id)) || null);
            const effectiveAccessLevel = explicitAccessLevel
                ? pickStricterAccessLevel(explicitAccessLevel, inheritedAccessLevel)
                : inheritedAccessLevel;

            if (!effectiveAccessLevel) {
                return null;
            }

            return {
                raceId: race.id,
                accessLevel: effectiveAccessLevel,
                source: explicitAccessLevel ? 'user_assignment' : race.source,
                inheritedAccessLevel,
                explicitAccessLevel,
            };
        })
        .filter(Boolean);
}

export async function resolveRaceAccess(authContext, rawRaceId, method) {
    const { userId, role, orgId: userOrgId } = authContext || {};
    if (!userId || !role) {
        throw Object.assign(new Error('Unauthorized'), { status: 401, expose: true });
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
        throw forbidden('Current account is not bound to an organization');
    }

    const orgRaceAccess = await getOrgRaceAccess(userOrgId, raceId, operatorOrgId);

    if (role === 'org_admin') {
        if (!orgRaceAccess.accessLevel) {
            throw forbidden('No access to this race');
        }

        if (orgRaceAccess.accessLevel === 'viewer' && !READ_ONLY_METHODS.has(method)) {
            throw forbidden('Organization race access is read-only');
        }

        return {
            raceId,
            operatorOrgId,
            effectiveAccessLevel: orgRaceAccess.accessLevel,
            source: orgRaceAccess.source,
        };
    }

    if (!orgRaceAccess.accessLevel) {
        throw forbidden('No access to this race');
    }

    const inheritedAccessLevel = capAccessLevelByRole(role, orgRaceAccess.accessLevel);
    const explicitUserAccessLevel = capAccessLevelByRole(
        role,
        await getExplicitUserRaceAccess(userId, userOrgId, raceId),
    );
    const effectiveAccessLevel = explicitUserAccessLevel
        ? pickStricterAccessLevel(explicitUserAccessLevel, inheritedAccessLevel)
        : inheritedAccessLevel;

    if (!effectiveAccessLevel) {
        throw forbidden('No access to this race');
    }

    if (effectiveAccessLevel === 'viewer' && !READ_ONLY_METHODS.has(method)) {
        throw forbidden('Read-only race access cannot perform write operations');
    }

    return {
        raceId,
        operatorOrgId,
        effectiveAccessLevel,
        source: explicitUserAccessLevel ? 'user_assignment' : orgRaceAccess.source,
    };
}
