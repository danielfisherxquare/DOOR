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

export async function findAllAllowed(orgId, userId, role) {
    let query = knex('races').orderBy('created_at', 'desc');

    if (role === 'super_admin') {
        // 超管看全部
    } else if (role === 'org_admin') {
        // 机构超管看本机构全部
        query = query.where({ org_id: orgId });
    } else {
        // 普通角色：INNER JOIN user_race_permissions
        query = query
            .innerJoin('user_race_permissions', 'races.id', 'user_race_permissions.race_id')
            .where('user_race_permissions.user_id', userId)
            // 防止跨机构数据残留，加倍保险
            .andWhere('races.org_id', orgId);
    }

    const rows = await query.select('races.*'); // 防止 select 到 join 表字段冲突
    return rows.map(raceMapper.fromDbRow);
}

// 保留原内部调用的 findAll (供其他服务使用)
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
