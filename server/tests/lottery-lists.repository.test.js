import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door_test';
process.env.DATABASE_URL = DATABASE_URL;

const { default: knex } = await import('../src/db/knex.js');
const lotteryRepo = await import('../src/modules/lottery/lottery.repository.js');

describe('lottery list repository fallback upsert', () => {
    let orgId;
    let raceId;

    before(async () => {
        await knex.migrate.latest();

        await knex('lottery_lists').del();
        await knex('org_race_permissions').del().catch(() => {});
        await knex('refresh_tokens').del().catch(() => {});
        await knex('users').del().catch(() => {});
        await knex('races').del();
        await knex('organizations').del();

        const [org] = await knex('organizations')
            .insert({ name: 'Lottery Repo Org', slug: 'lottery-repo-org' })
            .returning('*');
        orgId = org.id;

        const [race] = await knex('races')
            .insert({
                org_id: orgId,
                name: 'Lottery Repo Race',
                date: '2026-10-01',
                location: 'Shanghai',
            })
            .returning('*');
        raceId = Number(race.id);
    });

    after(async () => {
        await knex.raw(`
            CREATE UNIQUE INDEX IF NOT EXISTS lottery_lists_org_race_type_hash_unique
            ON lottery_lists (org_id, race_id, list_type, id_number_hash)
            WHERE id_number_hash IS NOT NULL;
        `);
        await knex('lottery_lists').del();
        await knex('org_race_permissions').del().catch(() => {});
        await knex('refresh_tokens').del().catch(() => {});
        await knex('users').del().catch(() => {});
        await knex('races').del();
        await knex('organizations').del();
        await knex.destroy();
    });

    it('falls back to manual upsert when the hash unique index is missing', async () => {
        await knex.raw('DROP INDEX IF EXISTS lottery_lists_org_race_type_hash_unique');

        try {
            const first = await lotteryRepo.bulkPutLists(orgId, [{
                raceId,
                listType: 'blacklist',
                name: 'Runner A',
                idNumber: '110101199001011234',
                phone: '13800138000',
                matchedRecordId: null,
                matchType: null,
            }]);
            assert.equal(first.upserted, 1);

            const second = await lotteryRepo.bulkPutLists(orgId, [{
                raceId,
                listType: 'blacklist',
                name: 'Runner A Updated',
                idNumber: '110101199001011234',
                phone: '13800138001',
                matchedRecordId: 123,
                matchType: 'exact',
            }]);
            assert.equal(second.upserted, 1);

            const entries = await lotteryRepo.getLists(orgId, raceId, 'blacklist');
            assert.equal(entries.length, 1);
            assert.equal(entries[0].name, 'Runner A Updated');
            assert.equal(entries[0].idNumber, '110101199001011234');
            assert.equal(entries[0].phone, '13800138001');
            assert.equal(entries[0].matchedRecordId, 123);
            assert.equal(entries[0].matchType, 'exact');
        } finally {
            await knex.raw(`
                CREATE UNIQUE INDEX IF NOT EXISTS lottery_lists_org_race_type_hash_unique
                ON lottery_lists (org_id, race_id, list_type, id_number_hash)
                WHERE id_number_hash IS NOT NULL;
            `);
        }
    });
});
