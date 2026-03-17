import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door_test';
process.env.DATABASE_URL = DATABASE_URL;

const { default: knex } = await import('../src/db/knex.js');
const { default: app } = await import('../src/app.js');

let server;
let baseUrl;
let token;
let raceId;

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

async function createUser({ username, email, password, role, orgId }) {
    const [user] = await knex('users')
        .insert({
            username,
            email,
            password_hash: await bcrypt.hash(password, 10),
            role,
            org_id: orgId,
            status: 'active',
            must_change_password: false,
        })
        .returning('*');
    return user;
}

before(async () => {
    await knex.migrate.rollback(undefined, true);
    await knex.migrate.latest();

    await knex('credential_credential_access_areas').del();
    await knex('credential_request_access_areas').del();
    await knex('credential_requests').del();
    await knex('credential_category_access_areas').del();
    await knex('credential_categories').del();
    await knex('credential_access_areas').del();
    await knex('credential_credential_zones').del();
    await knex('credential_credentials').del();
    await knex('credential_application_zone_overrides').del();
    await knex('credential_applications').del();
    await knex('credential_role_template_zones').del();
    await knex('credential_role_templates').del();
    await knex('credential_style_templates').del();
    await knex('credential_zones').del();
    await knex('user_race_permissions').del();
    await knex('org_race_permissions').del();
    await knex('refresh_tokens').del();
    await knex('users').del();
    await knex('races').del();
    await knex('organizations').del();

    const [org] = await knex('organizations').insert({ name: 'Credential Route Org', slug: 'credential-route-org' }).returning('*');
    const [race] = await knex('races').insert({
        org_id: org.id,
        name: 'Credential Route Race',
        date: '2026-03-17',
        location: 'Shanghai',
    }).returning('*');
    raceId = Number(race.id);

    await createUser({
        username: 'credential_route_admin',
        email: 'credential_route_admin@test.com',
        password: 'admin123',
        role: 'org_admin',
        orgId: org.id,
    });

    server = app.listen(0);
    baseUrl = `http://localhost:${server.address().port}`;

    const login = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ login: 'credential_route_admin', password: 'admin123' }),
    });
    assert.equal(login.status, 200);
    token = login.body.data.accessToken;
});

after(async () => {
    await knex('credential_credential_access_areas').del();
    await knex('credential_request_access_areas').del();
    await knex('credential_requests').del();
    await knex('credential_category_access_areas').del();
    await knex('credential_categories').del();
    await knex('credential_access_areas').del();
    await knex('credential_credential_zones').del();
    await knex('credential_credentials').del();
    await knex('credential_application_zone_overrides').del();
    await knex('credential_applications').del();
    await knex('credential_role_template_zones').del();
    await knex('credential_role_templates').del();
    await knex('credential_style_templates').del();
    await knex('credential_zones').del();
    await knex('user_race_permissions').del();
    await knex('org_race_permissions').del();
    await knex('refresh_tokens').del();
    await knex('users').del();
    await knex('races').del();
    await knex('organizations').del();
    server?.close();
    await knex.destroy();
});

test('access areas reject non-numeric access codes and categories return card colors', async () => {
    const invalidArea = await api(`/api/credential/access-areas/${raceId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
            accessCode: 'A1',
            accessName: 'Invalid',
        }),
    });

    assert.equal(invalidArea.status, 400);

    const createdArea = await api(`/api/credential/access-areas/${raceId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
            accessCode: '101',
            accessName: 'Finish Line',
            accessColor: '#123456',
        }),
    });
    assert.equal(createdArea.status, 201);

    const createdCategory = await api(`/api/credential/categories/${raceId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
            categoryName: 'Media',
            categoryCode: 'MEDIA',
            cardColor: '#abcdef',
            accessAreaIds: [createdArea.body.data.id],
        }),
    });
    assert.equal(createdCategory.status, 201);
    assert.equal(createdCategory.body.data.cardColor, '#abcdef');
    assert.deepEqual(createdCategory.body.data.accessAreas.map((item) => item.accessCode), ['101']);

    const listCategories = await api(`/api/credential/categories/${raceId}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(listCategories.status, 200);
    assert.equal(listCategories.body.data[0].cardColor, '#abcdef');

    const requestCreate = await api(`/api/credential/requests/${raceId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
            sourceMode: 'admin_direct',
            categoryId: createdCategory.body.data.id,
            personName: 'Jordan Lane',
            orgName: 'Media Org',
            jobTitle: 'Photographer',
            accessCodes: ['101'],
            remark: 'Direct create',
        }),
    });
    assert.equal(requestCreate.status, 201);
    assert.equal(requestCreate.body.data.categoryColor, '#abcdef');
    assert.deepEqual(requestCreate.body.data.accessAreas.map((item) => item.accessCode), ['101']);

    const reviewResponse = await api(`/api/credential/requests/${raceId}/${requestCreate.body.data.id}/review`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
            approved: true,
            categoryId: createdCategory.body.data.id,
            jobTitle: 'Lead Photographer',
            accessCodes: ['101'],
            remark: 'Approved',
        }),
    });
    assert.equal(reviewResponse.status, 200);
    assert.equal(reviewResponse.body.data.status, 'approved');

    const requestDetail = await api(`/api/credential/requests/${raceId}/${requestCreate.body.data.id}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(requestDetail.status, 200);
    assert.equal(requestDetail.body.data.categoryName, 'Media');
    assert.equal(requestDetail.body.data.categoryColor, '#abcdef');
    assert.equal(requestDetail.body.data.jobTitle, 'Lead Photographer');
});
