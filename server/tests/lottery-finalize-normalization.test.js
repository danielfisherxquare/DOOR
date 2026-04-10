import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door_test';
process.env.DATABASE_URL = DATABASE_URL;

const { default: knex } = await import('../src/db/knex.js');
await import('../src/modules/lottery/lottery-finalize.job-handler.js');
const { getHandler } = await import('../src/modules/jobs/job.handlers.js');

describe('lottery finalize event normalization', () => {
    const handler = getHandler('lottery:finalize');
    let orgId;
    let raceId;

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
            .insert({ name: 'Finalize Normalize Org', slug: 'finalize-normalize-org' })
            .returning('*');
        orgId = org.id;

        const [race] = await knex('races')
            .insert({
                org_id: orgId,
                name: 'Finalize Normalize Race',
                date: '2026-10-01',
                location: 'Shanghai',
            })
            .returning('*');
        raceId = Number(race.id);

        await knex('race_capacity').insert({
            org_id: orgId,
            race_id: raceId,
            event: 'Half',
            target_count: 1,
            draw_ratio: 1,
            reserved_ratio: 0,
        });

        await knex('records').insert([
            {
                org_id: orgId,
                race_id: raceId,
                name: 'Half Alias Runner A',
                gender: 'M',
                event: 'Half',
                audit_status: 'pass',
                lottery_status: '\u53c2\u4e0e\u62bd\u7b7e',
                is_locked: 0,
                id_number: 'FINALIZE-NORM-001',
                _source: 'seed',
            },
            {
                org_id: orgId,
                race_id: raceId,
                name: 'Half Alias Runner B',
                gender: 'F',
                event: 'Half Marathon',
                audit_status: 'pass',
                lottery_status: '\u53c2\u4e0e\u62bd\u7b7e',
                is_locked: 0,
                id_number: 'FINALIZE-NORM-002',
                _source: 'seed',
            },
        ]);
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

    it('applies one shared capacity bucket across event aliases', async () => {
        const summary = await handler(
            { payload: { raceId }, orgId },
            { knex, heartbeat: async () => {} },
        );

        assert.equal(summary.winners, 1);
        assert.equal(summary.losers, 1);

        const resultRows = await knex('lottery_results')
            .where({ org_id: orgId, race_id: raceId })
            .orderBy('record_id');

        assert.equal(resultRows.length, 2);
        assert.equal(resultRows.filter(row => row.result_status === 'winner').length, 1);
        assert.equal(new Set(resultRows.map(row => row.bucket_name)).size, 1);
    });
});
