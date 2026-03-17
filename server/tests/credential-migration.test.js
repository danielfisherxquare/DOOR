import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door_test';
process.env.DATABASE_URL = DATABASE_URL;

const { default: knex } = await import('../src/db/knex.js');
const migration = await import('../src/db/migrations/20260317000007_migrate_legacy_credential_data.js');

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

test('legacy credential data migrates into categories, access areas, requests, and credential snapshots', async (t) => {
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

    const [org] = await knex('organizations').insert({ name: 'Credential Org', slug: 'credential-org' }).returning('*');
    const [race] = await knex('races').insert({
        org_id: org.id,
        name: 'Credential Race',
        date: '2026-03-17',
        location: 'Shanghai',
    }).returning('*');
    const admin = await createUser({
        username: 'credential_admin',
        email: 'credential_admin@test.com',
        password: 'admin123',
        role: 'org_admin',
        orgId: org.id,
    });
    const applicant = await createUser({
        username: 'credential_applicant',
        email: 'credential_applicant@test.com',
        password: 'applicant123',
        role: 'race_editor',
        orgId: org.id,
    });

    const [style] = await knex('credential_style_templates').insert({
        org_id: org.id,
        race_id: race.id,
        template_name: 'Legacy Style',
        template_code: 'STYLE-1',
        front_layout_json: JSON.stringify({ a: 1 }),
        page_width: 567,
        page_height: 567,
        version: 1,
        status: 'active',
        created_by: admin.id,
    }).returning('*');

    await knex('credential_zones').insert([
        {
            org_id: org.id,
            race_id: race.id,
            zone_code: 'A',
            zone_name: 'Alpha',
            zone_color: '#ff0000',
            sort_order: 10,
            geometry: JSON.stringify({ type: 'Polygon', coordinates: [] }),
            description: 'Alpha zone',
        },
        {
            org_id: org.id,
            race_id: race.id,
            zone_code: '12',
            zone_name: 'Numeric',
            zone_color: '#00ff00',
            sort_order: 20,
            geometry: JSON.stringify({ type: 'Polygon', coordinates: [] }),
            description: 'Numeric zone',
        },
    ]);

    const [template] = await knex('credential_role_templates').insert({
        org_id: org.id,
        race_id: race.id,
        role_name: 'Media',
        role_code: 'MEDIA',
        default_color: '#112233',
        requires_review: true,
        default_style_template_id: style.id,
    }).returning('*');

    await knex('credential_role_template_zones').insert([
        { role_template_id: template.id, org_id: org.id, race_id: race.id, zone_code: 'A' },
        { role_template_id: template.id, org_id: org.id, race_id: race.id, zone_code: '12' },
    ]);

    const [application] = await knex('credential_applications').insert({
        org_id: org.id,
        race_id: race.id,
        applicant_user_id: applicant.id,
        person_name: 'Taylor Applicant',
        org_name: 'Press Org',
        role_template_id: template.id,
        role_name: 'Media',
        default_zone_code: 'A',
        status: 'approved',
        reviewer_user_id: admin.id,
        reviewed_at: knex.fn.now(),
        review_remark: 'ok',
        remark: 'legacy remark',
    }).returning('*');

    await knex('credential_application_zone_overrides').insert([
        {
            application_id: application.id,
            org_id: org.id,
            race_id: race.id,
            zone_code: 'A',
            override_type: 'remove',
            operator_user_id: admin.id,
        },
        {
            application_id: application.id,
            org_id: org.id,
            race_id: race.id,
            zone_code: '12',
            override_type: 'add',
            operator_user_id: admin.id,
        },
    ]);

    const [credential] = await knex('credential_credentials').insert({
        org_id: org.id,
        race_id: race.id,
        application_id: application.id,
        credential_no: 'CRED-000001',
        role_name: 'Media',
        person_name: 'Taylor Applicant',
        org_name: 'Press Org',
        default_zone_code: 'A',
        template_snapshot_json: { version: 1 },
        map_snapshot_json: { legacy: true },
        qr_payload: '{"credentialId":1}',
        qr_version: 1,
        status: 'generated',
        created_by: admin.id,
    }).returning('*');

    await knex('credential_credential_zones').insert({
        credential_id: credential.id,
        org_id: org.id,
        race_id: race.id,
        zone_code: 'A',
        zone_name: 'Alpha',
        zone_color: '#ff0000',
        geometry: { type: 'Polygon', coordinates: [] },
        zone_description: 'Alpha zone',
    });

    await migration.up(knex);

    const accessAreas = await knex('credential_access_areas')
        .where({ org_id: org.id, race_id: race.id })
        .orderBy('access_code', 'asc');
    assert.equal(accessAreas.length, 2);
    assert.deepEqual(accessAreas.map((row) => row.access_code), ['12', '13']);

    const category = await knex('credential_categories')
        .where({ org_id: org.id, race_id: race.id, category_code: 'MEDIA' })
        .first();
    assert.ok(category);
    assert.equal(category.category_name, 'Media');
    assert.equal(category.card_color, '#112233');
    assert.equal(category.default_style_template_id, style.id);

    const request = await knex('credential_requests')
        .where({ org_id: org.id, race_id: race.id, person_name: 'Taylor Applicant' })
        .first();
    assert.ok(request);
    assert.equal(request.category_id, category.id);
    assert.equal(request.job_title, 'Media');
    assert.equal(request.source_mode, 'self_service');

    const requestAccessCodes = await knex('credential_request_access_areas')
        .where({ request_id: request.id })
        .orderBy('access_code', 'asc')
        .pluck('access_code');
    assert.deepEqual(requestAccessCodes, ['12']);

    const credentialAccessCodes = await knex('credential_credential_access_areas')
        .where({ credential_id: credential.id })
        .orderBy('access_code', 'asc')
        .pluck('access_code');
    assert.deepEqual(credentialAccessCodes, ['13']);

    const migratedCredential = await knex('credential_credentials').where({ id: credential.id }).first();
    assert.equal(Number(migratedCredential.request_id), Number(request.id));
    assert.equal(migratedCredential.category_name, 'Media');
    assert.equal(migratedCredential.category_color, '#112233');
    assert.equal(migratedCredential.job_title, 'Media');

    t.after(async () => {
        await knex.destroy();
    });
});
