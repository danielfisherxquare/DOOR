/**
 * Race Repository — 赛事数据访问层（多租户隔离）
 */
import knex from '../../db/knex.js';
import { raceMapper } from '../../db/mappers/races.js';

export async function create(orgId, data) {
    const row = raceMapper.toDbInsert({ ...data, orgId });
    const [inserted] = await knex('races').insert(row).returning('*');
    return raceMapper.fromDbRow(inserted);
}

export async function findAll(orgId) {
    const rows = await knex('races')
        .where({ org_id: orgId })
        .orderBy('created_at', 'desc');
    return rows.map(raceMapper.fromDbRow);
}

export async function findById(orgId, raceId) {
    const row = await knex('races')
        .where({ org_id: orgId, id: raceId })
        .first();
    return raceMapper.fromDbRow(row);
}

export async function update(orgId, raceId, data) {
    const row = raceMapper.toDbUpdate(data);
    const [updated] = await knex('races')
        .where({ org_id: orgId, id: raceId })
        .update(row)
        .returning('*');
    return raceMapper.fromDbRow(updated);
}

export async function remove(orgId, raceId) {
    // 先删关联 records
    await knex('records').where({ org_id: orgId, race_id: raceId }).delete();
    const deleted = await knex('races')
        .where({ org_id: orgId, id: raceId })
        .delete();
    return deleted > 0;
}
