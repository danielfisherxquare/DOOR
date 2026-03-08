import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door_test';
process.env.DATABASE_URL = DATABASE_URL;

const { default: knex } = await import('../src/db/knex.js');
await import('../src/modules/lottery/lottery-finalize.job-handler.js');
const { getHandler } = await import('../src/modules/jobs/job.handlers.js');
const { hasSnapshot } = await import('../src/modules/pipeline/snapshot.repository.js');

describe('lottery finalize job handler', () => {
    const handler = getHandler('lottery:finalize');
    let orgId;
    let raceId;
    let recordId;

    before(async () => {
        await knex.migrate.latest();

        await knex('pipeline_executions').del();
        await knex('pipeline_snapshot_items').del();
        await knex('pipeline_snapshots').del();
        await knex('lottery_results').del();
        await knex('clothing_limits').del();
        await knex('race_capacity').del();
        await knex('records').del();
        await knex('races').del();
        await knex('organizations').del();

        const [org] = await knex('organizations')
            .insert({ name: 'Finalize Org', slug: 'finalize-org' })
            .returning('*');
        orgId = org.id;

        const [race] = await knex('races')
            .insert({
                org_id: orgId,
                name: 'Finalize Race',
                date: '2026-10-01',
                location: 'Shanghai',
            })
            .returning('*');
        raceId = Number(race.id);

        await knex('race_capacity').insert({
            org_id: orgId,
            race_id: raceId,
            event: 'Full',
            target_count: 1,
            draw_ratio: 1,
            reserved_ratio: 0,
        });

        await knex('clothing_limits').insert({
            org_id: orgId,
            race_id: raceId,
            event: 'Full',
            gender: 'M',
            size: 'L',
            total_inventory: 10,
            used_count: 0,
        });

        const [record] = await knex('records')
            .insert({
                org_id: orgId,
                race_id: raceId,
                name: 'Finalize Runner',
                gender: 'M',
                event: 'Full',
                audit_status: 'pass',
                lottery_status: '参与抽签',
                is_locked: 0,
                clothing_size: 'L',
                id_number: 'FINALIZE-001',
                _source: 'seed',
            })
            .returning('*');
        recordId = Number(record.id);
    });

    after(async () => {
        await knex('pipeline_executions').del();
        await knex('pipeline_snapshot_items').del();
        await knex('pipeline_snapshots').del();
        await knex('lottery_results').del();
        await knex('clothing_limits').del();
        await knex('race_capacity').del();
        await knex('records').del();
        await knex('races').del();
        await knex('organizations').del();
        await knex.destroy();
    });

    it('blocks rerun while a pre_lottery snapshot still exists', async () => {
        const first = await handler(
            { payload: { raceId }, orgId },
            { knex, heartbeat: async () => {} },
        );
        assert.equal(first.winners, 1);
        assert.equal(first.losers, 0);
        assert.equal(await hasSnapshot(orgId, raceId, 'pre_lottery'), true);

        const record = await knex('records').where({ id: recordId }).first('lottery_status');
        assert.equal(record.lottery_status, '中签');

        const inventory = await knex('clothing_limits')
            .where({ org_id: orgId, race_id: raceId, event: 'Full', gender: 'M', size: 'L' })
            .first('used_count');
        assert.equal(Number(inventory.used_count), 1);

        await assert.rejects(
            () => handler(
                { payload: { raceId }, orgId },
                { knex, heartbeat: async () => {} },
            ),
            (error) => {
                assert.equal(error.code, 'SNAPSHOT_EXISTS');
                assert.equal(error.status, 409);
                return true;
            },
        );

        const resultRows = await knex('lottery_results')
            .where({ org_id: orgId, race_id: raceId });
        assert.equal(resultRows.length, 1);

        const inventoryAfter = await knex('clothing_limits')
            .where({ org_id: orgId, race_id: raceId, event: 'Full', gender: 'M', size: 'L' })
            .first('used_count');
        assert.equal(Number(inventoryAfter.used_count), 1);
    });
});
