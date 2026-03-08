import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door_test';
process.env.DATABASE_URL = DATABASE_URL;

const { default: knex } = await import('../src/db/knex.js');
const { default: app } = await import('../src/app.js');

let server;
let baseUrl;
const tokens = {};
let orgId;
let otherOrgId;
let raceId;
let otherRaceId;
let editorUserId;
let recordOne;
let recordTwo;

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

function authHeader(role) {
    return { Authorization: `Bearer ${tokens[role]}` };
}

async function createUser({ username, email, password, role, userOrgId = null }) {
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

describe('bib tracking routes', () => {
    before(async () => {
        await knex.migrate.latest();

        await knex('bib_tracking_events').del();
        await knex('bib_tracking_items').del();
        await knex('user_race_permissions').del();
        await knex('org_race_permissions').del();
        await knex('refresh_tokens').del();
        await knex('records').del();
        await knex('users').del();
        await knex('races').del();
        await knex('organizations').del();

        const [org] = await knex('organizations').insert({ name: 'Bib Org', slug: 'bib-org' }).returning('*');
        const [org2] = await knex('organizations').insert({ name: 'Bib Org Other', slug: 'bib-org-other' }).returning('*');
        orgId = org.id;
        otherOrgId = org2.id;

        const [race] = await knex('races').insert({ name: 'Bib Race', org_id: orgId }).returning('*');
        const [race2] = await knex('races').insert({ name: 'Other Race', org_id: otherOrgId }).returning('*');
        raceId = Number(race.id);
        otherRaceId = Number(race2.id);

        recordOne = await knex('records')
            .insert({
                org_id: orgId,
                race_id: raceId,
                name: 'Alice Runner',
                id_number: 'ID001',
                bib_number: 'A1001',
            })
            .returning('*')
            .then((rows) => rows[0]);
        recordTwo = await knex('records')
            .insert({
                org_id: orgId,
                race_id: raceId,
                name: 'Bob Runner',
                id_number: 'ID002',
                bib_number: 'A1002',
            })
            .returning('*')
            .then((rows) => rows[0]);

        const editor = await createUser({
            username: 'bib_editor',
            email: 'bib_editor@test.com',
            password: 'editor123',
            role: 'race_editor',
            userOrgId: orgId,
        });
        editorUserId = editor.id;
        await createUser({
            username: 'bib_viewer',
            email: 'bib_viewer@test.com',
            password: 'viewer123',
            role: 'race_viewer',
            userOrgId: orgId,
        });
        const outsider = await createUser({
            username: 'bib_other_editor',
            email: 'bib_other_editor@test.com',
            password: 'other123',
            role: 'race_editor',
            userOrgId: otherOrgId,
        });

        await knex('user_race_permissions').insert([
            { user_id: editor.id, org_id: orgId, race_id: raceId, access_level: 'editor' },
            { user_id: outsider.id, org_id: otherOrgId, race_id: otherRaceId, access_level: 'editor' },
        ]);

        server = app.listen(0);
        baseUrl = `http://localhost:${server.address().port}`;

        const credentials = [
            ['editor', { login: 'bib_editor', password: 'editor123' }],
            ['viewer', { login: 'bib_viewer', password: 'viewer123' }],
            ['outsider', { login: 'bib_other_editor', password: 'other123' }],
        ];

        for (const [key, credential] of credentials) {
            const response = await api('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify(credential),
            });
            assert.equal(response.status, 200);
            tokens[key] = response.body.data.accessToken;
        }
    });

    after(async () => {
        await knex('bib_tracking_events').del();
        await knex('bib_tracking_items').del();
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

    it('registers tracking items idempotently', async () => {
        const payload = {
            records: [{ recordId: Number(recordOne.id), bibNumber: 'A1001' }],
        };

        const first = await api(`/api/bib-tracking/register/${raceId}`, {
            method: 'POST',
            headers: authHeader('editor'),
            body: JSON.stringify(payload),
        });
        assert.equal(first.status, 200);
        assert.equal(first.body.data.items[0].status, 'receipt_printed');
        assert.ok(first.body.data.items[0].qrToken);

        const second = await api(`/api/bib-tracking/register/${raceId}`, {
            method: 'POST',
            headers: authHeader('editor'),
            body: JSON.stringify(payload),
        });
        assert.equal(second.status, 200);
        assert.equal(second.body.data.items[0].qrToken, first.body.data.items[0].qrToken);

        const events = await knex('bib_tracking_events').where({ record_id: recordOne.id, event_type: 'registered_for_export' });
        assert.equal(events.length, 2);
    });

    it('updates active tracking item bib number on re-register', async () => {
        const before = await knex('bib_tracking_items').where({ record_id: recordOne.id }).first();
        await knex('records').where({ id: recordOne.id }).update({ bib_number: 'A1999' });

        const response = await api(`/api/bib-tracking/register/${raceId}`, {
            method: 'POST',
            headers: authHeader('editor'),
            body: JSON.stringify({
                records: [{ recordId: Number(recordOne.id), bibNumber: 'A1999' }],
            }),
        });
        assert.equal(response.status, 200);
        assert.equal(response.body.data.items[0].qrToken, before.qr_token);
        assert.equal(response.body.data.items[0].bibNumber, 'A1999');

        const after = await knex('bib_tracking_items').where({ record_id: recordOne.id }).first();
        assert.equal(after.bib_number, 'A1999');
        assert.equal(after.qr_token, before.qr_token);
        assert.equal(Number(after.qr_version), Number(before.qr_version));
    });

    it('re-registers invalidated item by rotating qr token and version', async () => {
        const before = await knex('bib_tracking_items').where({ record_id: recordOne.id }).first();
        await knex('bib_tracking_items')
            .where({ id: before.id })
            .update({ invalidated_at: knex.fn.now() });

        const response = await api(`/api/bib-tracking/register/${raceId}`, {
            method: 'POST',
            headers: authHeader('editor'),
            body: JSON.stringify({
                records: [{ recordId: Number(recordOne.id), bibNumber: 'A1999' }],
            }),
        });
        assert.equal(response.status, 200);

        const after = await knex('bib_tracking_items').where({ record_id: recordOne.id }).first();
        assert.equal(after.invalidated_at, null);
        assert.equal(after.bib_number, 'A1999');
        assert.notEqual(after.qr_token, before.qr_token);
        assert.equal(Number(after.qr_version), Number(before.qr_version) + 1);
        assert.equal(response.body.data.items[0].qrToken, after.qr_token);
    });

    it('rejects bib reuse when occupied by another invalidated item', async () => {
        const register = await api(`/api/bib-tracking/register/${raceId}`, {
            method: 'POST',
            headers: authHeader('editor'),
            body: JSON.stringify({
                records: [{ recordId: Number(recordTwo.id), bibNumber: 'A1002' }],
            }),
        });
        assert.equal(register.status, 200);

        const recordTwoItem = await knex('bib_tracking_items').where({ record_id: recordTwo.id }).first();
        await knex('bib_tracking_items')
            .where({ id: recordTwoItem.id })
            .update({ invalidated_at: knex.fn.now() });
        await knex('records').where({ id: recordOne.id }).update({ bib_number: 'A1002' });

        const response = await api(`/api/bib-tracking/register/${raceId}`, {
            method: 'POST',
            headers: authHeader('editor'),
            body: JSON.stringify({
                records: [{ recordId: Number(recordOne.id), bibNumber: 'A1002' }],
            }),
        });
        assert.equal(response.status, 400);
        assert.match(response.body.error?.message || '', /already registered/);

        const recordOneItem = await knex('bib_tracking_items').where({ record_id: recordOne.id }).first();
        assert.equal(recordOneItem.bib_number, 'A1999');

        await knex('records').where({ id: recordOne.id }).update({ bib_number: 'A1999' });
        await knex('bib_tracking_items')
            .where({ id: recordTwoItem.id })
            .update({ invalidated_at: null });
    });

    it('resolves a valid active token', async () => {
        const item = await knex('bib_tracking_items').where({ record_id: recordOne.id }).first();
        const response = await api('/api/bib-tracking/scan/resolve', {
            method: 'POST',
            headers: authHeader('viewer'),
            body: JSON.stringify({ qrToken: item.qr_token }),
        });
        assert.equal(response.status, 200);
        assert.equal(response.body.data.name, 'Alice Runner');
        assert.equal(response.body.data.allowedAction, 'pickup');
    });

    it('returns 404 for invalidated token', async () => {
        await knex('bib_tracking_items')
            .where({ record_id: recordOne.id })
            .update({ invalidated_at: knex.fn.now() });

        const item = await knex('bib_tracking_items').where({ record_id: recordOne.id }).first();
        const response = await api('/api/bib-tracking/scan/resolve', {
            method: 'POST',
            headers: authHeader('viewer'),
            body: JSON.stringify({ qrToken: item.qr_token }),
        });
        assert.equal(response.status, 404);

        await knex('bib_tracking_items')
            .where({ record_id: recordOne.id })
            .update({ invalidated_at: null });
    });

    it('moves receipt_printed to picked_up and stays idempotent on repeat pickup', async () => {
        const item = await knex('bib_tracking_items').where({ record_id: recordOne.id }).first();

        const first = await api('/api/bib-tracking/scan/pickup', {
            method: 'POST',
            headers: authHeader('editor'),
            body: JSON.stringify({ qrToken: item.qr_token }),
        });
        assert.equal(first.status, 200);
        assert.equal(first.body.data.status, 'picked_up');
        assert.equal(first.body.data.lastScanBy, editorUserId);

        const second = await api('/api/bib-tracking/scan/pickup', {
            method: 'POST',
            headers: authHeader('editor'),
            body: JSON.stringify({ qrToken: item.qr_token }),
        });
        assert.equal(second.status, 200);
        assert.equal(second.body.data.status, 'picked_up');

        const events = await knex('bib_tracking_events').where({ record_id: recordOne.id, event_type: 'picked_up_by_scan' });
        assert.equal(events.length, 1);
    });

    it('rejects pickup for viewer access', async () => {
        const register = await api(`/api/bib-tracking/register/${raceId}`, {
            method: 'POST',
            headers: authHeader('editor'),
            body: JSON.stringify({
                records: [{ recordId: Number(recordTwo.id), bibNumber: 'A1002' }],
            }),
        });
        assert.equal(register.status, 200);
        const qrToken = register.body.data.items[0].qrToken;

        const response = await api('/api/bib-tracking/scan/pickup', {
            method: 'POST',
            headers: authHeader('viewer'),
            body: JSON.stringify({ qrToken }),
        });
        assert.equal(response.status, 403);
    });

    it('rejects pickup for user without race access', async () => {
        const item = await knex('bib_tracking_items').where({ record_id: recordTwo.id }).first();
        const response = await api('/api/bib-tracking/scan/pickup', {
            method: 'POST',
            headers: authHeader('outsider'),
            body: JSON.stringify({ qrToken: item.qr_token }),
        });
        assert.equal(response.status, 403);
    });

    it('syncs checked_in and finished without allowing rollback', async () => {
        const pickup = await api('/api/bib-tracking/scan/pickup', {
            method: 'POST',
            headers: authHeader('editor'),
            body: JSON.stringify({
                qrToken: (await knex('bib_tracking_items').where({ record_id: recordTwo.id }).first()).qr_token,
            }),
        });
        assert.equal(pickup.status, 200);

        const checkedIn = await api(`/api/bib-tracking/sync/${raceId}`, {
            method: 'POST',
            headers: authHeader('editor'),
            body: JSON.stringify({
                source: 'timing-company',
                events: [{ bibNumber: 'A1002', type: 'checked_in' }],
            }),
        });
        assert.equal(checkedIn.status, 200);
        assert.equal(checkedIn.body.data.updated, 1);

        const finished = await api(`/api/bib-tracking/sync/${raceId}`, {
            method: 'POST',
            headers: authHeader('editor'),
            body: JSON.stringify({
                source: 'timing-company',
                events: [{ bibNumber: 'A1002', type: 'finished' }],
            }),
        });
        assert.equal(finished.status, 200);
        assert.equal(finished.body.data.updated, 1);

        const rollback = await api(`/api/bib-tracking/sync/${raceId}`, {
            method: 'POST',
            headers: authHeader('editor'),
            body: JSON.stringify({
                source: 'timing-company',
                events: [{ bibNumber: 'A1002', type: 'checked_in' }],
            }),
        });
        assert.equal(rollback.status, 200);
        assert.equal(rollback.body.data.updated, 0);
        assert.equal(rollback.body.data.ignored, 1);

        const item = await knex('bib_tracking_items').where({ record_id: recordTwo.id }).first();
        assert.equal(item.status, 'finished');
    });

    it('returns tracking stats and item list', async () => {
        const stats = await api(`/api/bib-tracking/stats/${raceId}`, {
            headers: authHeader('viewer'),
        });
        assert.equal(stats.status, 200);
        assert.equal(stats.body.data.pickedUp, 1);
        assert.equal(stats.body.data.finished, 1);

        const list = await api(`/api/bib-tracking/items/${raceId}?status=finished`, {
            headers: authHeader('viewer'),
        });
        assert.equal(list.status, 200);
        assert.equal(list.body.data.items.length, 1);
        assert.equal(list.body.data.items[0].bibNumber, 'A1002');
    });
});
