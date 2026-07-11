import assert from 'node:assert/strict';
import express from 'express';
import { after, test } from 'node:test';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door_test';
process.env.DATABASE_URL = DATABASE_URL;
process.env.DISABLE_REGISTRATION = 'false';

const { default: knex } = await import('../src/db/knex.js');
const { default: authRoutes } = await import('../src/modules/auth/auth.routes.js');
const { requireAuth } = await import('../src/middleware/require-auth.js');
const { errorHandler } = await import('../src/middleware/error-handler.js');

let server;

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await knex.destroy();
});

test('app race API gives operators scoped read access and restricted workflow updates', async () => {
  await knex.migrate.latest();
  const { default: appRaceRoutes } = await import('../src/modules/races/race-app.routes.js');

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/app/races', requireAuth, appRaceRoutes);
  app.use((req, res) => res.status(404).json({ success: false, message: 'Not found' }));
  app.use(errorHandler);
  server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, options = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    return { status: response.status, body: await response.json() };
  };

  const register = async (username, orgName) => request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username,
      email: `${username}@test.local`,
      password: 'pass123',
      orgName,
    }),
  });

  const registrationA = await register('app_race_operator_a', 'App Race A');
  const registrationB = await register('app_race_operator_b', 'App Race B');
  const userA = await knex('users').where({ username: 'app_race_operator_a' }).first('id', 'org_id');
  const userB = await knex('users').where({ username: 'app_race_operator_b' }).first('id', 'org_id');
  await knex('users').whereIn('id', [userA.id, userB.id]).update({ role: 'race_admin' });

  const [race] = await knex('races').insert({
    org_id: userA.org_id,
    name: 'App 端赛事',
    date: '2026-10-18',
    events: JSON.stringify([{ name: '马拉松', targetCount: 3 }]),
    lottery_mode_default: 'lottery',
  }).returning('*');
  await knex('races').insert({
    org_id: userB.org_id,
    name: '其他机构赛事',
    date: '2026-11-01',
  });

  const authA = { Authorization: `Bearer ${registrationA.body.data.accessToken}` };
  const authB = { Authorization: `Bearer ${registrationB.body.data.accessToken}` };

  const list = await request('/api/app/races', { headers: authA });
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.data.map((item) => item.name), ['App 端赛事']);

  const detail = await request(`/api/app/races/${race.id}`, { headers: authA });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.name, 'App 端赛事');
  assert.equal(detail.body.data.lotteryModeDefault, 'lottery');

  const updated = await request(`/api/app/races/${race.id}/lottery-mode`, {
    method: 'PATCH',
    headers: authA,
    body: JSON.stringify({ lotteryModeDefault: 'direct' }),
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.lotteryModeDefault, 'direct');
  assert.equal(updated.body.data.name, 'App 端赛事');

  const conflictRule = await request(`/api/app/races/${race.id}/conflict-rule`, {
    method: 'PATCH',
    headers: authA,
    body: JSON.stringify({ conflictRule: 'permissive' }),
  });
  assert.equal(conflictRule.status, 200);
  assert.equal(conflictRule.body.data.conflictRule, 'permissive');

  const missingMode = await request(`/api/app/races/${race.id}/lottery-mode`, {
    method: 'PATCH',
    headers: authA,
    body: JSON.stringify({}),
  });
  assert.equal(missingMode.status, 400);

  const forged = await request(`/api/app/races/${race.id}/lottery-mode`, {
    method: 'PATCH',
    headers: authA,
    body: JSON.stringify({ lotteryModeDefault: 'lottery', name: '越权改名' }),
  });
  assert.equal(forged.status, 400);

  const crossOrg = await request(`/api/app/races/${race.id}`, { headers: authB });
  assert.equal(crossOrg.status, 403);
});
