import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door_test';
process.env.DATABASE_URL = DATABASE_URL;

const { default: knex } = await import('../src/db/knex.js');
const { default: app } = await import('../src/app.js');

let server;
let baseUrl;
let token;
let orgId;
let raceId;
let skippedDirectId;
let skippedLoserId;

const STATUS_WIN = '\u4e2d\u7b7e';
const STATUS_WON = '\u5df2\u4e2d\u7b7e';
const STATUS_DIRECT = '\u76f4\u901a\u540d\u989d';
const STATUS_PENDING = '\u53c2\u4e0e\u62bd\u7b7e';
const STATUS_LOSE = '\u672a\u4e2d\u7b7e';
const EVENT_FULL = '\u5168\u9a6c';
const EVENT_HALF = '\u534a\u9a6c';
const EVENT_UNSPECIFIED = '\u672a\u5206\u9879\u76ee';

async function api(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
    });
    const body = await response.json().catch(() => null);
    return { status: response.status, body };
}

async function createUser({ username, email, password, role, userOrgId }) {
    const [user] = await knex('users')
        .insert({
            username,
            email,
            password_hash: await bcrypt.hash(password, 10),
            role,
            org_id: userOrgId,
            status: 'active',
            must_change_password: false,
        })
        .returning('*');
    return user;
}

describe('bib routes', () => {
    before(async () => {
        await knex.migrate.latest();

        await knex('pipeline_executions').del();
        await knex('bib_assignments').del();
        await knex('user_race_permissions').del();
        await knex('org_race_permissions').del();
        await knex('refresh_tokens').del();
        await knex('records').del();
        await knex('users').del();
        await knex('races').del();
        await knex('organizations').del();

        const [org] = await knex('organizations').insert({ name: 'Bib Route Org', slug: 'bib-route-org' }).returning('*');
        orgId = org.id;

        const [race] = await knex('races').insert({ name: 'Bib Route Race', org_id: orgId }).returning('*');
        raceId = Number(race.id);

        const editor = await createUser({
            username: 'bib_route_editor',
            email: 'bib_route_editor@test.com',
            password: 'editor123',
            role: 'race_editor',
            userOrgId: orgId,
        });

        await knex('user_race_permissions').insert({
            user_id: editor.id,
            org_id: orgId,
            race_id: raceId,
            access_level: 'editor',
        });

        await knex('records').insert([
            {
                org_id: orgId,
                race_id: raceId,
                name: 'Winner Full',
                event: EVENT_FULL,
                gender: 'M',
                lottery_status: STATUS_WIN,
                lottery_zone: 'A',
                bib_number: 'A1001',
                id_number: 'ID001',
            },
            {
                org_id: orgId,
                race_id: raceId,
                name: 'Winner Half',
                event: EVENT_HALF,
                gender: 'F',
                lottery_status: STATUS_WON,
                lottery_zone: 'B',
                id_number: 'ID002',
            },
            {
                org_id: orgId,
                race_id: raceId,
                name: 'Direct S',
                event: EVENT_HALF,
                gender: 'M',
                lottery_status: STATUS_DIRECT,
                lottery_zone: 'S',
                id_number: 'ID003',
            },
            {
                org_id: orgId,
                race_id: raceId,
                name: 'Locked Runner',
                event: '',
                gender: 'F',
                lottery_status: STATUS_PENDING,
                lottery_zone: '',
                is_locked: 1,
                id_number: 'ID004',
            },
            {
                org_id: orgId,
                race_id: raceId,
                name: 'Loser',
                event: '\u8ff7\u4f60\u8dd1',
                gender: 'M',
                lottery_status: STATUS_LOSE,
                lottery_zone: 'C',
                bib_number: 'C9999',
                id_number: 'ID005',
            },
        ]);

        const directRow = await knex('records').where({ org_id: orgId, race_id: raceId, name: 'Direct S' }).first('id');
        const loserRow = await knex('records').where({ org_id: orgId, race_id: raceId, name: 'Loser' }).first('id');
        skippedDirectId = Number(directRow.id);
        skippedLoserId = Number(loserRow.id);

        server = app.listen(0);
        baseUrl = `http://localhost:${server.address().port}`;

        const login = await api('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ login: 'bib_route_editor', password: 'editor123' }),
        });
        assert.equal(login.status, 200);
        token = login.body.data.accessToken;
    });

    after(async () => {
        await knex('pipeline_executions').del();
        await knex('bib_assignments').del();
        await knex('user_race_permissions').del();
        await knex('org_race_permissions').del();
        await knex('refresh_tokens').del();
        await knex('records').del();
        await knex('users').del();
        await knex('races').del();
        await knex('organizations').del();
        server?.close();
        await knex.destroy();
    });

    it('returns planner-ready overview fields', async () => {
        const response = await api(`/api/bib/overview/${raceId}`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        assert.equal(response.status, 200);
        assert.equal(response.body.data.total, 5);
        assert.equal(response.body.data.eligible, 4);
        assert.equal(response.body.data.assigned, 2);
        assert.deepEqual(response.body.data.eligibleByEvent, [
            { event: EVENT_HALF, count: 2 },
            { event: EVENT_FULL, count: 1 },
            { event: EVENT_UNSPECIFIED, count: 1 },
        ]);
        assert.deepEqual(response.body.data.eligibleByEventExcludingS, [
            { event: EVENT_FULL, count: 1 },
            { event: EVENT_HALF, count: 1 },
            { event: EVENT_UNSPECIFIED, count: 1 },
        ]);
        assert.equal(response.body.data.latestAssigned.length, 2);
        assert.equal(response.body.data.latestAssigned[0].bibNumber, 'C9999');
        assert.equal(response.body.data.latestAssigned[1].bibNumber, 'A1001');
    });

    it('returns execution dataset without S zone runners and marks skipped ids', async () => {
        const response = await api(`/api/bib/execution-dataset/${raceId}`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        assert.equal(response.status, 200);
        assert.equal(response.body.data.eligibleCount, 3);
        assert.deepEqual(
            response.body.data.eligibleRecords.map(row => row.name),
            ['Winner Full', 'Winner Half', 'Locked Runner'],
        );

        const skippedIds = new Set(response.body.data.skippedIds.map(Number));
        assert.equal(skippedIds.has(skippedDirectId), true);
        assert.equal(skippedIds.has(skippedLoserId), true);

        const statusMap = new Map(response.body.data.statusSummary.map(item => [item.status, Number(item.count)]));
        assert.equal(statusMap.get(STATUS_WIN), 1);
        assert.equal(statusMap.get(STATUS_WON), 1);
        assert.equal(statusMap.get(STATUS_DIRECT), 1);
        assert.equal(statusMap.get(STATUS_PENDING), 1);
        assert.equal(statusMap.get(STATUS_LOSE), 1);
    });

    it('creates and queries bib snapshot independently from lottery snapshot', async () => {
        const beforeResponse = await api(`/api/bib/has-snapshot/${raceId}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        assert.equal(beforeResponse.status, 200);
        assert.equal(beforeResponse.body.data.hasSnapshot, false);

        const createResponse = await api(`/api/bib/snapshot/${raceId}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
        });
        assert.equal(createResponse.status, 200);

        const afterResponse = await api(`/api/bib/has-snapshot/${raceId}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        assert.equal(afterResponse.status, 200);
        assert.equal(afterResponse.body.data.hasSnapshot, true);

        const lotterySnapshotResponse = await api(`/api/lottery/has-snapshot/${raceId}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        assert.equal(lotterySnapshotResponse.status, 200);
        assert.equal(lotterySnapshotResponse.body.data.hasSnapshot, false);
    });
});
