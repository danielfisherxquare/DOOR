#!/usr/bin/env node
/**
 * Diagnose Auth / Super Admin
 *
 * 用法:
 *   node --env-file=.env scripts/diagnose-auth.js
 */
import knex from '../src/db/knex.js';

const SUPER_ADMIN_USERNAME = process.env.SUPER_ADMIN_USERNAME || 'superadmin';
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'admin@platform.local';

function printSection(title) {
    console.log(`\n== ${title} ==`);
}

async function main() {
    printSection('Database');
    console.log(`DATABASE_URL: ${process.env.DATABASE_URL ? '[set]' : '[not set]'}`);

    printSection('Migrations (latest 10)');
    const migrations = await knex('knex_migrations')
        .select(['name', 'migration_time'])
        .orderBy('migration_time', 'desc')
        .limit(10);
    for (const m of migrations) {
        console.log(`- ${m.name} @ ${m.migration_time}`);
    }
    const hasAuthOverhaul = migrations.some(m => m.name === '20260304000001_auth_permission_overhaul.js')
        || (await knex('knex_migrations').where({ name: '20260304000001_auth_permission_overhaul.js' }).first());
    console.log(`auth_permission_overhaul applied: ${!!hasAuthOverhaul}`);

    printSection('users columns');
    const cols = await knex('information_schema.columns')
        .select(['column_name'])
        .where({ table_schema: 'public', table_name: 'users' })
        .orderBy('ordinal_position', 'asc');
    const colSet = new Set(cols.map(c => c.column_name));
    const requiredCols = [
        'id',
        'org_id',
        'username',
        'email',
        'password_hash',
        'role',
        'status',
        'must_change_password',
        'failed_login_attempts',
        'locked_until',
        'created_at',
        'updated_at',
    ];
    for (const c of requiredCols) {
        console.log(`- ${c}: ${colSet.has(c) ? 'OK' : 'MISSING'}`);
    }

    printSection('Platform user (org_id IS NULL)');
    console.log(`match username=${SUPER_ADMIN_USERNAME} email=${SUPER_ADMIN_EMAIL}`);
    const candidates = await knex('users')
        .whereNull('org_id')
        .andWhere((qb) => qb.where({ username: SUPER_ADMIN_USERNAME }).orWhere({ email: SUPER_ADMIN_EMAIL }))
        .select([
            'id',
            'username',
            'email',
            'role',
            'status',
            'must_change_password',
            'failed_login_attempts',
            'locked_until',
            'created_at',
            'updated_at',
        ]);

    if (candidates.length === 0) {
        console.log('No matching platform user found.');
        return;
    }
    for (const u of candidates) {
        console.log(
            `- id=${u.id} username=${u.username} email=${u.email} role=${u.role} status=${u.status}`
            + ` must_change_password=${u.must_change_password} failed_login_attempts=${u.failed_login_attempts}`
            + ` locked_until=${u.locked_until} updated_at=${u.updated_at}`,
        );
    }
    if (candidates.length > 1) {
        console.log('WARNING: multiple platform users match; login selection may be unstable.');
    }
}

try {
    await main();
} catch (err) {
    console.error('❌ diagnose-auth failed:', err?.message || err);
    process.exitCode = 1;
} finally {
    await knex.destroy();
}

