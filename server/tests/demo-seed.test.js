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
  const firstRun = runDemoSeed();
  assert.equal(firstRun.status, 0, `seed run 1 failed: ${firstRun.stderr || firstRun.stdout}`);

  const preservedRace = await knex('races as race')
    .join('organizations as org', 'org.id', 'race.org_id')
    .where({ 'org.slug': 'demo-east-run', 'race.name': '上海国际马拉松' })
    .first('race.id', 'race.org_id');
  assert.ok(preservedRace);
  await knex('records').insert({
    org_id: preservedRace.org_id,
    race_id: preservedRace.id,
    name: '种子重跑保留哨兵',
    id_number: 'SEED-PRESERVE-001',
    phone: '13800009999',
    gender: 'M',
    event: '全程马拉松',
    _source: 'acceptance_seed_preserved',
  });

  const secondRun = runDemoSeed();
  assert.equal(secondRun.status, 0, `seed run 2 failed: ${secondRun.stderr || secondRun.stdout}`);

  const demoOrganizations = await knex('organizations').whereIn('slug', DEMO_SLUGS).select('id');
  const demoOrgIds = demoOrganizations.map((row) => row.id);

  assert.equal(demoOrganizations.length, 3);
  assert.equal(await knex('races').whereIn('org_id', demoOrgIds).count('* as count').first().then((row) => Number(row.count)), 9);
  assert.equal(await knex('users').whereIn('org_id', demoOrgIds).count('* as count').first().then((row) => Number(row.count)), 9);
  assert.equal(await knex('team_members').whereIn('org_id', demoOrgIds).count('* as count').first().then((row) => Number(row.count)), 11);
  assert.equal(await knex('organizations').where({ slug: 'acceptance-seed-sentinel' }).count('* as count').first().then((row) => Number(row.count)), 1);
  assert.equal(await knex('records').where({ _source: 'acceptance_seed_preserved' }).count('* as count').first().then((row) => Number(row.count)), 1);

  const operatorModules = new Set(await listModules('east.ops'));
  for (const moduleId of ACCEPTANCE_OPERATOR_MODULES) {
    assert.equal(operatorModules.has(moduleId), true, `east.ops missing ${moduleId}`);
  }

  const adminModules = new Set(await listModules('east.admin'));
  for (const moduleId of ACCEPTANCE_ADMIN_MODULES) {
    assert.equal(adminModules.has(moduleId), true, `east.admin missing ${moduleId}`);
  }

  const shanghaiRace = await knex('races as race')
    .join('organizations as org', 'org.id', 'race.org_id')
    .where({ 'org.slug': 'demo-east-run', 'race.name': '上海国际马拉松' })
    .first('race.id', 'race.org_id');
  assert.ok(shanghaiRace);

  const capacities = await knex('race_capacity')
    .where({ org_id: shanghaiRace.org_id, race_id: shanghaiRace.id })
    .select('event', 'target_count', 'lottery_mode_override');
  assert.deepEqual(capacities.map((row) => ({
    event: row.event,
    targetCount: Number(row.target_count),
    lotteryModeOverride: row.lottery_mode_override,
  })), [{ event: '全程马拉松', targetCount: 2, lotteryModeOverride: 'lottery' }]);

  const clothing = await knex('clothing_limits')
    .where({ org_id: shanghaiRace.org_id, race_id: shanghaiRace.id })
    .orderBy(['gender', 'size'])
    .select('event', 'gender', 'size', 'total_inventory', 'used_count');
  assert.deepEqual(clothing.map((row) => ({
    event: row.event,
    gender: row.gender,
    size: row.size,
    totalInventory: Number(row.total_inventory),
    usedCount: Number(row.used_count),
  })), [
    { event: 'ALL', gender: 'F', size: 'S', totalInventory: 2, usedCount: 0 },
    { event: 'ALL', gender: 'M', size: 'L', totalInventory: 2, usedCount: 0 },
    { event: 'ALL', gender: 'M', size: 'M', totalInventory: 2, usedCount: 0 },
  ]);

  const startZones = await knex('start_zones')
    .where({ org_id: shanghaiRace.org_id, race_id: shanghaiRace.id })
    .select('zone_name', 'event', 'calculated_capacity', 'sort_order');
  assert.deepEqual(startZones.map((row) => ({
    zoneName: row.zone_name,
    event: row.event,
    calculatedCapacity: Number(row.calculated_capacity),
    sortOrder: Number(row.sort_order),
  })), [{
    zoneName: 'A',
    event: '全程马拉松',
    calculatedCapacity: 1000,
    sortOrder: 1,
  }]);

  const accessAreas = await knex('credential_access_areas')
    .where({ org_id: shanghaiRace.org_id, race_id: shanghaiRace.id })
    .select('id', 'access_code', 'access_name', 'is_active');
  assert.deepEqual(accessAreas.map((row) => ({
    accessCode: row.access_code,
    accessName: row.access_name,
    isActive: row.is_active,
  })), [{
    accessCode: '101',
    accessName: '终点核心区',
    isActive: true,
  }]);

  const categories = await knex('credential_categories')
    .where({ org_id: shanghaiRace.org_id, race_id: shanghaiRace.id })
    .select('id', 'category_code', 'category_name', 'requires_review');
  assert.deepEqual(categories.map((row) => ({
    categoryCode: row.category_code,
    categoryName: row.category_name,
    requiresReview: row.requires_review,
  })), [{
    categoryCode: 'OPS',
    categoryName: '赛事执行',
    requiresReview: true,
  }]);

  const categoryAreaLinks = await knex('credential_category_access_areas')
    .where({ category_id: categories[0].id, access_area_id: accessAreas[0].id })
    .count('* as count')
    .first();
  assert.equal(Number(categoryAreaLinks.count), 1);
});
