import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import { tenantContext } from '../src/middleware/tenant-context.js';
import { errorHandler } from '../src/middleware/error-handler.js';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door_test';
process.env.DATABASE_URL = DATABASE_URL;

const { default: knex } = await import('../src/db/knex.js');
const { default: authRoutes } = await import('../src/modules/auth/auth.routes.js');
const { default: raceRoutes } = await import('../src/modules/races/race.routes.js');
const { default: recordRoutes } = await import('../src/modules/records/record.routes.js');
const { default: pipelineRoutes } = await import('../src/modules/pipeline/pipeline-config.routes.js');

let app;
let server;
let baseUrl;

async function api(path, options = {}) {
    const { headers: optionHeaders, ...rest } = options;
    const response = await fetch(`${baseUrl}${path}`, {
        headers: {
            'Content-Type': 'application/json',
            ...optionHeaders,
        },
        ...rest,
    });
    const body = await response.json().catch(() => null);
    return { status: response.status, body };
}

function authed(token) {
    return {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    };
}

describe('Phase 7 Routes', () => {
    let tokenA;
    let tokenB;
    let orgIdA;
    let orgIdB;
    let raceIdA;
    let raceIdB;
    let recordIdA;
    let recordIdB;

    before(async () => {
        await knex.migrate.latest();

        await knex('pipeline_executions').del();
        await knex('bib_assignments').del();
        await knex('pipeline_snapshot_items').del();
        await knex('pipeline_snapshots').del();
        await knex('lottery_results').del();
        await knex('performance_rules').del();
        await knex('start_zones').del();
        await knex('clothing_limits').del();
        await knex('audit_results').del();
        await knex('audit_runs').del();
        await knex('lottery_weights').del();
        await knex('lottery_rules').del();
        await knex('lottery_lists').del();
        await knex('lottery_configs').del();
        await knex('race_capacity').del();
        await knex('records').del();
        await knex('races').del();
        await knex('refresh_tokens').del();
        await knex('users').del();
        await knex('organizations').del();

        app = express();
        app.use(express.json());
        app.use('/api/auth', authRoutes);
        app.use('/api/races', raceRoutes);
        app.use('/api/records', recordRoutes);
        app.use('/api/pipeline', tenantContext, pipelineRoutes);
        app.use(errorHandler);

        server = app.listen(0);
        baseUrl = `http://localhost:${server.address().port}`;

        const registerA = await api('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({
                username: 'phase7_admin_a',
                email: 'phase7_a@test.com',
                password: 'pass123',
                orgName: 'Phase7 Org A',
            }),
        });
        tokenA = registerA.body.data.accessToken;
        orgIdA = registerA.body.data.user.orgId;

        const registerB = await api('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({
                username: 'phase7_admin_b',
                email: 'phase7_b@test.com',
                password: 'pass123',
                orgName: 'Phase7 Org B',
            }),
        });
        tokenB = registerB.body.data.accessToken;
        orgIdB = registerB.body.data.user.orgId;

        const raceA = await api('/api/races', {
            method: 'POST',
            body: JSON.stringify({
                name: 'Phase 7 Race A',
                date: '2026-10-01',
                location: 'Shanghai',
                createAt: '2026-03-03T00:00:00.000Z',
                events: [{ name: 'Full', targetCount: 200 }, { name: 'Half', targetCount: 100 }],
            }),
            ...authed(tokenA),
        });
        raceIdA = Number(raceA.body.data.id);

        const raceB = await api('/api/races', {
            method: 'POST',
            body: JSON.stringify({
                name: 'Phase 7 Race B',
                date: '2026-11-01',
                location: 'Beijing',
                createAt: '2026-03-03T00:00:00.000Z',
                events: [{ name: 'Full', targetCount: 50 }],
            }),
            ...authed(tokenB),
        });
        raceIdB = Number(raceB.body.data.id);

        const [recordA] = await knex('records')
            .insert({
                org_id: orgIdA,
                race_id: raceIdA,
                name: 'Runner A',
                id_number: 'A-001',
                phone: '13800000001',
                gender: 'M',
                event: 'Full',
                audit_status: 'pass',
                lottery_status: '待更新',
                is_locked: 0,
                clothing_size: 'L',
                runner_category: 'Mass',
                _source: 'seed',
            })
            .returning(['id']);
        recordIdA = Number(recordA.id);

        const [recordB] = await knex('records')
            .insert({
                org_id: orgIdB,
                race_id: raceIdB,
                name: 'Runner B',
                id_number: 'B-001',
                phone: '13800000002',
                gender: 'F',
                event: 'Full',
                audit_status: 'pending',
                lottery_status: '原样保留',
                is_locked: 0,
                clothing_size: 'M',
                runner_category: 'Mass',
                _source: 'seed',
            })
            .returning(['id']);
        recordIdB = Number(recordB.id);

        await knex('race_capacity').insert([
            { org_id: orgIdA, race_id: raceIdA, event: 'Full', target_count: 200, draw_ratio: 0.8, reserved_ratio: 0.2 },
            { org_id: orgIdA, race_id: raceIdA, event: 'Half', target_count: 100, draw_ratio: 0.9, reserved_ratio: 0.1 },
        ]);

        await knex('start_zones').insert([
            {
                org_id: orgIdA,
                race_id: raceIdA,
                zone_name: 'A',
                width: 10,
                length: 20,
                density: 2.5,
                calculated_capacity: 150,
                color: '#3B82F6',
                sort_order: 1,
                gap_distance: 0,
                event: 'Full',
                capacity_ratio: 1,
                score_upper_seconds: 10800,
            },
            {
                org_id: orgIdA,
                race_id: raceIdA,
                zone_name: 'S',
                width: 5,
                length: 10,
                density: 2,
                calculated_capacity: 20,
                color: '#F59E0B',
                sort_order: 0,
                gap_distance: 0,
                event: 'Full',
                capacity_ratio: 1,
                score_upper_seconds: 9000,
            },
        ]);

        await knex('performance_rules').insert([
            {
                org_id: orgIdA,
                race_id: raceIdA,
                event: 'Full',
                min_time: '02:30:00',
                max_time: '03:30:00',
                priority_ratio: 0.6,
            },
        ]);

        await knex('clothing_limits').insert([
            { org_id: orgIdA, race_id: raceIdA, event: 'Full', gender: 'M', size: 'L', total_inventory: 10, used_count: 3 },
            { org_id: orgIdA, race_id: raceIdA, event: 'Half', gender: 'F', size: 'M', total_inventory: 5, used_count: 1 },
        ]);

        await knex('records').insert([
            {
                org_id: orgIdA,
                race_id: raceIdA,
                name: 'Qualified Winner',
                id_number: 'A-002',
                phone: '13800000003',
                gender: 'M',
                event: 'Full',
                audit_status: 'qualified_time',
                lottery_status: '中签',
                is_locked: 1,
                clothing_size: 'L',
                runner_category: 'Elite',
                _source: 'seed',
            },
            {
                org_id: orgIdA,
                race_id: raceIdA,
                name: 'Passed Loser',
                id_number: 'A-003',
                phone: '13800000004',
                gender: 'F',
                event: 'Half',
                audit_status: 'pass',
                lottery_status: '未中签',
                is_locked: 0,
                clothing_size: 'M',
                runner_category: 'Mass',
                _source: 'seed',
            },
        ]);
    });

    after(async () => {
        await knex('pipeline_executions').del();
        await knex('bib_assignments').del();
        await knex('pipeline_snapshot_items').del();
        await knex('pipeline_snapshots').del();
        await knex('lottery_results').del();
        await knex('performance_rules').del();
        await knex('start_zones').del();
        await knex('clothing_limits').del();
        await knex('audit_results').del();
        await knex('audit_runs').del();
        await knex('lottery_weights').del();
        await knex('lottery_rules').del();
        await knex('lottery_lists').del();
        await knex('lottery_configs').del();
        await knex('race_capacity').del();
        await knex('records').del();
        await knex('races').del();
        await knex('refresh_tokens').del();
        await knex('users').del();
        await knex('organizations').del();
        server.close();
        await knex.destroy();
    });

    it('POST /api/records/bulk-update only updates records inside current org', async () => {
        const response = await api('/api/records/bulk-update', {
            method: 'POST',
            body: JSON.stringify({
                updates: [
                    { id: recordIdA, data: { lotteryStatus: '中签', auditStatus: 'qualified_time' } },
                    { id: recordIdB, data: { lotteryStatus: '不应更新' } },
                ],
            }),
            ...authed(tokenA),
        });

        assert.equal(response.status, 200);
        assert.equal(response.body.data.updated, 1);

        const updatedA = await knex('records').where({ id: recordIdA }).first();
        const untouchedB = await knex('records').where({ id: recordIdB }).first();

        assert.equal(updatedA.lottery_status, '中签');
        assert.equal(updatedA.audit_status, 'qualified_time');
        assert.equal(untouchedB.lottery_status, '原样保留');
    });

    it('GET /api/pipeline/preview/:raceId returns SQLite-compatible preview shape', async () => {
        const response = await api(`/api/pipeline/preview/${raceIdA}`, {
            ...authed(tokenA),
        });

        assert.equal(response.status, 200);
        assert.equal(response.body.success, true);

        const preview = response.body.data;
        assert.equal(preview.step1.totalTarget, 300);
        assert.equal(preview.step1.caps.length, 2);
        assert.equal(preview.step2.totalZoneCap, 150);
        assert.equal(preview.step2.gap, 150);
        assert.equal(preview.step2.zones.length, 2);
        assert.equal(preview.step3.qualifiedCount, 2);
        assert.equal(preview.step3.perfRules.length, 1);
        assert.equal(preview.step4.totalInventory, 15);
        assert.equal(preview.step4.usedInventory, 4);
        assert.equal(preview.step4.remainingInventory, 11);
        assert.equal(preview.records.total, 3);
        assert.equal(preview.records.passed, 3);
        assert.equal(preview.records.qualified, 2);
        assert.equal(preview.records.locked, 1);
        assert.equal(preview.records.won, 1);
        assert.equal(preview.records.lost, 1);
    });
});
