import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { after, before, test } from 'node:test';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door_test';
process.env.DATABASE_URL = DATABASE_URL;

const { default: knex } = await import('../src/db/knex.js');

const DEMO_SLUGS = ['demo-east-run', 'demo-mountain-ops', 'demo-bay-volunteers'];
const ACCEPTANCE_OPERATOR_MODULES = [
  'app:events',
  'app:reimbursements',
  'app:credentials',
  'app:inventory',
  'app:map',
  'app:3d-studio',
  'ops:home',
  'ops:scan',
  'ops:bib-pickup',
  'ops:credentials',
  'ops:warehouse',
];
const ACCEPTANCE_ADMIN_MODULES = [
  'admin:races',
  'admin:bib-tracking',
  'admin:credentials',
  'admin:finance',
  'admin:inventory',
];

function runDemoSeed() {
  return spawnSync(process.execPath, ['scripts/seed-demo-data.mjs'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL,
      SUPER_ADMIN_USERNAME: 'demo_seed_superadmin',
      SUPER_ADMIN_EMAIL: 'demo-seed-superadmin@test.local',
      SUPER_ADMIN_PASSWORD: 'DemoSeedSuperAdmin@123',
    },
  });
}

async function listModules(username) {
  return knex('user_module_access as access')
    .join('users', 'users.id', 'access.user_id')
    .where('users.username', username)
    .pluck('access.module_id');
}

before(async () => {
  await knex.migrate.latest();
  await knex('organizations').insert({
    name: '非 Demo 数据保留哨兵',
    slug: 'acceptance-seed-sentinel',
  });
});

after(async () => {
  await knex.destroy();
});

test('demo seed is idempotent, isolated, and grants the acceptance surfaces', async () => {
  for (let run = 1; run <= 2; run += 1) {
    const result = runDemoSeed();
    assert.equal(result.status, 0, `seed run ${run} failed: ${result.stderr || result.stdout}`);
  }

  const demoOrganizations = await knex('organizations').whereIn('slug', DEMO_SLUGS).select('id');
  const demoOrgIds = demoOrganizations.map((row) => row.id);

  assert.equal(demoOrganizations.length, 3);
  assert.equal(await knex('races').whereIn('org_id', demoOrgIds).count('* as count').first().then((row) => Number(row.count)), 9);
  assert.equal(await knex('users').whereIn('org_id', demoOrgIds).count('* as count').first().then((row) => Number(row.count)), 9);
  assert.equal(await knex('team_members').whereIn('org_id', demoOrgIds).count('* as count').first().then((row) => Number(row.count)), 11);
  assert.equal(await knex('organizations').where({ slug: 'acceptance-seed-sentinel' }).count('* as count').first().then((row) => Number(row.count)), 1);

  const operatorModules = new Set(await listModules('east.ops'));
  for (const moduleId of ACCEPTANCE_OPERATOR_MODULES) {
    assert.equal(operatorModules.has(moduleId), true, `east.ops missing ${moduleId}`);
  }

  const adminModules = new Set(await listModules('east.admin'));
  for (const moduleId of ACCEPTANCE_ADMIN_MODULES) {
    assert.equal(adminModules.has(moduleId), true, `east.admin missing ${moduleId}`);
  }
});
