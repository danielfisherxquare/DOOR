/**
 * Race Repository - race data access layer (tenant isolated)
 */
import knex from '../../db/knex.js';
import { raceMapper } from '../../db/mappers/races.js';

export async function create(orgId, data) {
    const row = raceMapper.toDbInsert({ ...data, orgId });
    const [inserted] = await knex('races').insert(row).returning('*');
    return raceMapper.fromDbRow(inserted);
}

export async function findAllAllowed(orgId, userId, role, options = {}) {
    let query = knex('races').orderBy('created_at', 'desc');
    const filterOrgId = options.orgId ?? null;

    if (role === 'super_admin') {
        // super_admin can see all races, optionally filter by org
        if (filterOrgId) {
            query = query.where({ org_id: filterOrgId });
        }
    } else if (role === 'org_admin') {
        // org_admin sees own races + org granted races
        query = query
            .leftJoin('org_race_permissions as grp', function joinOrgRacePermissions() {
                this.on('races.id', '=', 'grp.race_id').andOnVal('grp.org_id', '=', orgId);
            })
            .where(function whereVisible() {
                this.where('races.org_id', orgId).orWhereNotNull('grp.org_id');
            });
    } else if (orgId) {
        // race-level users inherit the races visible to their organization
        query = query
            .leftJoin('org_race_permissions as grp', function joinOrgRacePermissions() {
                this.on('races.id', '=', 'grp.race_id').andOnVal('grp.org_id', '=', orgId);
            })
            .where(function whereVisible() {
                this.where('races.org_id', orgId).orWhereNotNull('grp.org_id');
            });
    } else {
        query = query.whereRaw('1 = 0');
    }

    const rows = await query.distinct('races.*');
    return rows.map(raceMapper.fromDbRow);
}

// kept for internal calls
export async function findAll(orgId) {
    const rows = await knex('races')
        .where({ org_id: orgId })
        .orderBy('created_at', 'desc');
    return rows.map(raceMapper.fromDbRow);
}

export async function findById(orgId, raceId) {
    const query = knex('races').where({ id: raceId });
    if (orgId) query.andWhere({ org_id: orgId });
    const row = await query.first();
    return raceMapper.fromDbRow(row);
}

export async function update(orgId, raceId, data) {
    const row = raceMapper.toDbUpdate(data);
    const query = knex('races').where({ id: raceId });
    if (orgId) query.andWhere({ org_id: orgId });
    const [updated] = await query.update(row).returning('*');
    return raceMapper.fromDbRow(updated);
}

export async function remove(orgId, raceId) {
    const recordQuery = knex('records').where({ race_id: raceId });
    if (orgId) recordQuery.andWhere({ org_id: orgId });
    await recordQuery.delete();

    const raceQuery = knex('races').where({ id: raceId });
    if (orgId) raceQuery.andWhere({ org_id: orgId });
    const deleted = await raceQuery.delete();
    return deleted > 0;
}
