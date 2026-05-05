import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door_test';
process.env.DATABASE_URL = DATABASE_URL;

const { default: knex } = await import('../src/db/knex.js');
const {
    createPreview,
    finalizeLatestPreview,
    getLatestPreview,
    rollbackLatest,
} = await import('../src/modules/lottery-v2/lottery-v2.service.js');

describe('lottery v2 service', () => {
    let orgId;
    let raceId;
    let directRecordId;
    let massRecordIds;

    async function cleanupRaceData() {
        await knex('apparel_reservations').del();
        await knex('lottery_v2_results').del();
        await knex('lottery_v2_snapshots').del();
        await knex('lottery_v2_configs').del();
        await knex('lottery_results').del();
        await knex('clothing_limits').del();
        await knex('race_capacity').del();
        await knex('lottery_lists').del();
        await knex('records').del();
        await knex('races').del();
        await knex('organizations').del();
    }

    before(async () => {
        await knex.migrate.latest();
    });

    beforeEach(async () => {
        await cleanupRaceData();

        const [org] = await knex('organizations')
            .insert({ name: 'Lottery V2 Org', slug: 'lottery-v2-org' })
            .returning('*');
        orgId = org.id;

        const [race] = await knex('races')
            .insert({
                org_id: orgId,
                name: 'Lottery V2 Race',
                date: '2026-10-01',
                location: 'Shanghai',
            })
            .returning('*');
        raceId = Number(race.id);

        await knex('race_capacity').insert({
            org_id: orgId,
            race_id: raceId,
            event: 'Full',
            target_count: 3,
            draw_ratio: 1,
            reserved_ratio: 0,
        });

        await knex('clothing_limits').insert({
            org_id: orgId,
            race_id: raceId,
            event: 'Full',
            gender: 'M',
            size: 'L',
            total_inventory: 6,
            used_count: 0,
        });

        const inserted = await knex('records')
            .insert([
                {
                    org_id: orgId,
                    race_id: raceId,
                    name: 'V2 Direct Runner',
                    gender: 'M',
                    event: 'Full',
                    audit_status: 'pass',
                    lottery_status: '直通名额',
                    is_locked: 1,
                    clothing_size: 'L',
                    runner_category: 'Elite',
                    id_number: 'LOTTERY-V2-DIRECT-001',
                    _source: 'seed',
                },
                {
                    org_id: orgId,
                    race_id: raceId,
                    name: 'V2 Qualified Runner',
                    gender: 'M',
                    event: 'Full',
                    audit_status: 'qualified_time',
                    lottery_status: '参与抽签',
                    is_locked: 0,
                    clothing_size: 'L',
                    runner_category: 'Mass',
                    id_number: 'LOTTERY-V2-MASS-001',
                    _source: 'seed',
                },
                {
                    org_id: orgId,
                    race_id: raceId,
                    name: 'V2 Mass Runner A',
                    gender: 'M',
                    event: 'Full',
                    audit_status: 'pass',
                    lottery_status: '参与抽签',
                    is_locked: 0,
                    clothing_size: 'L',
                    runner_category: 'Mass',
                    id_number: 'LOTTERY-V2-MASS-002',
                    _source: 'seed',
                },
                {
                    org_id: orgId,
                    race_id: raceId,
                    name: 'V2 Mass Runner B',
                    gender: 'M',
                    event: 'Full',
                    audit_status: 'pass',
                    lottery_status: '参与抽签',
                    is_locked: 0,
                    clothing_size: 'L',
                    runner_category: 'Mass',
                    id_number: 'LOTTERY-V2-MASS-003',
                    _source: 'seed',
                },
            ])
            .returning('id');

        directRecordId = Number(inserted[0].id);
        massRecordIds = inserted.slice(1).map((row) => Number(row.id));
    });

    after(async () => {
        await cleanupRaceData();
        await knex.destroy();
    });

    it('supports preview -> finalize -> rollback lifecycle', async () => {
        const preview = await createPreview(orgId, raceId);
        assert.equal(preview.status, 'ready');
        assert.equal(preview.errors.length, 0);
        assert.equal(Number(preview.resultSummary.directReservations), 1);

        const finalized = await finalizeLatestPreview(orgId, raceId);
        assert.equal(finalized.status, 'finalized');

        const resultRows = await knex('lottery_v2_results')
            .where({ org_id: orgId, race_id: raceId });
        const winnerRows = resultRows.filter((row) => row.result_status === 'winner');
        const loserRows = resultRows.filter((row) => row.result_status === 'loser');
        assert.equal(winnerRows.length, 2);
        assert.equal(loserRows.length, 1);

        const reservationRows = await knex('apparel_reservations')
            .where({ org_id: orgId, race_id: raceId });
        const directReservations = reservationRows.filter((row) => row.reservation_type === 'direct');
        const lotteryReservations = reservationRows.filter((row) => row.reservation_type === 'lottery');
        assert.equal(directReservations.length, 1);
        assert.equal(lotteryReservations.length, 2);

        const directRecord = await knex('records').where({ id: directRecordId }).first('lottery_status');
        assert.equal(directRecord.lottery_status, '直通名额');

        const massStatusesAfterFinalize = await knex('records')
            .whereIn('id', massRecordIds)
            .orderBy('id')
            .select('lottery_status');
        assert.equal(massStatusesAfterFinalize.filter((row) => row.lottery_status === '中签').length, 2);
        assert.equal(massStatusesAfterFinalize.filter((row) => row.lottery_status === '未中签').length, 1);

        const rolledBack = await rollbackLatest(orgId, raceId);
        assert.equal(rolledBack.status, 'rolled_back');

        const massStatusesAfterRollback = await knex('records')
            .whereIn('id', massRecordIds)
            .select('lottery_status');
        assert.equal(massStatusesAfterRollback.every((row) => row.lottery_status === '参与抽签'), true);

        const resultsAfterRollback = await knex('lottery_v2_results')
            .where({ org_id: orgId, race_id: raceId });
        assert.equal(resultsAfterRollback.length, 0);

        const reservationsAfterRollback = await knex('apparel_reservations')
            .where({ org_id: orgId, race_id: raceId });
        assert.equal(reservationsAfterRollback.length, 0);
    });

    it('blocks finalize when preview snapshot becomes stale', async () => {
        const preview = await createPreview(orgId, raceId);
        assert.equal(preview.status, 'ready');

        await knex('records')
            .where({ id: massRecordIds[0] })
            .update({
                lottery_status: '未中签',
                updated_at: knex.fn.now(),
            });

        await assert.rejects(
            () => finalizeLatestPreview(orgId, raceId),
            (error) => {
                assert.equal(error.status, 409);
                assert.match(error.message, /失效/u);
                return true;
            },
        );

        const latest = await getLatestPreview(orgId, raceId);
        assert.equal(latest.status, 'stale');
    });
});
