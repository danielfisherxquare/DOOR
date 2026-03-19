import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door_test';
process.env.DATABASE_URL = DATABASE_URL;

const { default: knex } = await import('../src/db/knex.js');
await import('../src/modules/audit/audit.job-handler.js');
const { getHandler } = await import('../src/modules/jobs/job.handlers.js');

describe('audit underage job handler', () => {
    const handler = getHandler('audit:underage');
    let orgId;
    let raceId;
    let runId;

    before(async () => {
        await knex.migrate.latest();

        await knex('audit_runs').del().catch(() => {});
        await knex('records').del();
        await knex('org_race_permissions').del().catch(() => {});
        await knex('refresh_tokens').del().catch(() => {});
        await knex('users').del().catch(() => {});
        await knex('races').del();
        await knex('organizations').del();

        const [org] = await knex('organizations')
            .insert({ name: 'Audit Underage Org', slug: 'audit-underage-org' })
            .returning('*');
        orgId = org.id;

        const [race] = await knex('races')
            .insert({
                org_id: orgId,
                name: 'Audit Underage Race',
                date: '2026-03-19',
                location: 'Shanghai',
            })
            .returning('*');
        raceId = Number(race.id);

        const [run] = await knex('audit_runs')
            .insert({
                org_id: orgId,
                race_id: raceId,
                step_number: 1,
                step_name: 'underage',
                status: 'running',
                executed_at: knex.fn.now(),
            })
            .returning('*');
        runId = Number(run.id);

        await knex('records').insert([
            {
                org_id: orgId,
                race_id: raceId,
                name: 'Underage By Id',
                id_number: '110101200803201234',
                birthday: '',
                audit_status: 'pending',
                _source: 'seed',
            },
            {
                org_id: orgId,
                race_id: raceId,
                name: 'Adult On Race Day',
                id_number: '110101200803191234',
                birthday: '',
                audit_status: 'pending',
                _source: 'seed',
            },
            {
                org_id: orgId,
                race_id: raceId,
                name: 'Underage By Birthday',
                id_number: '',
                birthday: '2008-03-20',
                audit_status: 'pending',
                _source: 'seed',
            },
        ]);
    });

    after(async () => {
        await knex('audit_runs').del().catch(() => {});
        await knex('records').del();
        await knex('org_race_permissions').del().catch(() => {});
        await knex('refresh_tokens').del().catch(() => {});
        await knex('users').del().catch(() => {});
        await knex('races').del();
        await knex('organizations').del();
        await knex.destroy();
    });

    it('rejects runners who are still under 18 on the race date', async () => {
        const result = await handler(
            { payload: { raceId, runId, raceDate: '2026-03-19' }, orgId },
            { knex, heartbeat: async () => {} },
        );

        assert.equal(result.affected, 2);
        assert.equal(result.remaining, 1);

        const rows = await knex('records')
            .where({ org_id: orgId, race_id: raceId })
            .select('name', 'audit_status', 'reject_reason', 'lottery_status')
            .orderBy('name', 'asc');

        const byName = new Map(rows.map((row) => [row.name, row]));

        assert.equal(byName.get('Underage By Id')?.audit_status, 'reject');
        assert.equal(byName.get('Underage By Id')?.reject_reason, 'underage');
        assert.equal(byName.get('Underage By Id')?.lottery_status, '未成年剔除');

        assert.equal(byName.get('Underage By Birthday')?.audit_status, 'reject');
        assert.equal(byName.get('Underage By Birthday')?.reject_reason, 'underage');
        assert.equal(byName.get('Underage By Birthday')?.lottery_status, '未成年剔除');

        assert.equal(byName.get('Adult On Race Day')?.audit_status, 'pending');
        assert.equal(byName.get('Adult On Race Day')?.reject_reason, null);
    });
});
